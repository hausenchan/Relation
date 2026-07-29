const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server start timeout\n${output}`)), 15000);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('服务器启动在')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}\n${output}`));
    });
  });
}

async function request(baseUrl, route, { method = 'GET', token = '', body, formData } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(formData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: formData || (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Expected JSON for ${method} ${route}, got ${response.status}: ${text.slice(0, 300)}`);
  }
  return { status: response.status, payload };
}

async function waitForTaskStatus(baseUrl, token, taskId, status, timeoutMs = 5000) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await request(baseUrl, `/api/product-asset-release-tasks/${taskId}`, { token });
    if (latest.status === 200 && latest.payload.task?.status === status) return latest.payload;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`task ${taskId} did not reach ${status}: ${JSON.stringify(latest?.payload || latest)}`);
}

test('product release snapshots domains from the linked company subject', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-release-domain-'));
  const databasePath = path.join(tempDir, 'data.db');
  const masterKeyPath = path.join(tempDir, 'master.key');
  const hmacKeyPath = path.join(tempDir, 'hmac.key');
  const uploadArgsPath = path.join(tempDir, 'upload-args.json');
  const uploadScriptPath = path.join(tempDir, 'fake-upload.js');
  fs.writeFileSync(masterKeyPath, crypto.randomBytes(32).toString('hex'));
  fs.writeFileSync(hmacKeyPath, crypto.randomBytes(32).toString('hex'));
  fs.writeFileSync(uploadScriptPath, `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(uploadArgsPath)}, JSON.stringify(process.argv.slice(2), null, 2));
console.log('上传版本: fake-domain-1.0.0');
`, { mode: 0o700 });
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      RELATION_DB_PATH: databasePath,
      RELATION_IDENTITY_KEY_DIR: path.join(tempDir, 'identity-keys'),
      RELATION_MASTER_KEY_PATH: masterKeyPath,
      RELATION_HMAC_KEY_PATH: hmacKeyPath,
      PRODUCT_TEMPLATE_UPLOAD_SCRIPT: uploadScriptPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  const token = login.payload.token;

  const identityKeyForm = new FormData();
  identityKeyForm.append('group_name', '提版域名测试集团');
  identityKeyForm.append('company_entity', '提版域名测试主体');
  identityKeyForm.append('identity_key_file', new Blob(['{"appId":"test"}'], { type: 'application/json' }), 'identity.json');
  identityKeyForm.append('api_domain', 'https://api.subject.example.com');
  identityKeyForm.append('analytics_domain', 'https://analytics.subject.example.com');
  identityKeyForm.append('cdn_domain', 'https://cdn.subject.example.com');
  identityKeyForm.append('short_drama_domain', 'https://drama.subject.example.com');
  const subject = await request(baseUrl, '/api/company-subjects', {
    method: 'POST',
    token,
    formData: identityKeyForm,
  });
  assert.equal(subject.status, 200, JSON.stringify(subject.payload));
  const subjectId = Number(subject.payload.id);

  const subjectDetail = await request(baseUrl, `/api/company-subjects/${subjectId}`, { token });
  assert.equal(subjectDetail.status, 200, JSON.stringify(subjectDetail.payload));
  assert.equal(subjectDetail.payload.api_domain, 'https://api.subject.example.com');
  assert.equal(subjectDetail.payload.cdn_domain, 'https://cdn.subject.example.com');
  assert.equal(subjectDetail.payload.identity_key, undefined);
  assert.equal(subjectDetail.payload.has_identity_key, true);
  assert.equal(subjectDetail.payload.has_identity_key_file, true);

  const cachedIdentityFiles = fs.readdirSync(path.join(tempDir, 'identity-keys'));
  assert.equal(cachedIdentityFiles.length, 1);
  assert.match(cachedIdentityFiles[0], /\.json$/);
  const cachedIdentityPath = path.join(tempDir, 'identity-keys', cachedIdentityFiles[0]);
  assert.equal(fs.readFileSync(cachedIdentityPath, 'utf8'), '{"appId":"test"}');
  assert.equal(fs.statSync(cachedIdentityPath).mode & 0o777, 0o600);

  const replacementForm = new FormData();
  replacementForm.append('group_name', '提版域名测试集团');
  replacementForm.append('company_entity', '提版域名测试主体');
  replacementForm.append('identity_key_file', new Blob(['{"appId":"replacement"}'], { type: 'application/json' }), 'replacement.json');
  replacementForm.append('clear_identity_key', 'false');
  const replacement = await request(baseUrl, `/api/company-subjects/${subjectId}`, {
    method: 'PUT',
    token,
    formData: replacementForm,
  });
  assert.equal(replacement.status, 200, JSON.stringify(replacement.payload));
  assert.equal(fs.existsSync(cachedIdentityPath), false);
  const replacementFiles = fs.readdirSync(path.join(tempDir, 'identity-keys'));
  assert.equal(replacementFiles.length, 1);
  assert.equal(fs.readFileSync(path.join(tempDir, 'identity-keys', replacementFiles[0]), 'utf8'), '{"appId":"replacement"}');

  const rawDb = new Database(databasePath, { readonly: true });
  const rawSubject = rawDb.prepare('SELECT api_domain, identity_key FROM company_subjects WHERE id = ?').get(subjectId);
  rawDb.close();
  assert.match(rawSubject.api_domain, /^enc:v1:/);
  assert.match(rawSubject.identity_key, /^enc:v1:/);
  assert.doesNotMatch(rawSubject.api_domain, /subject\.example\.com/);

  const template = await request(baseUrl, '/api/product-templates', {
    method: 'POST',
    token,
    body: {
      name: '主体域名提版模版',
      template_type: 'mini_program',
      budget_type: 'zhixiao',
      platform: 'mini_program',
      project_path: 'src',
    },
  });
  assert.equal(template.status, 200, JSON.stringify(template.payload));
  const shortDramaTemplate = await request(baseUrl, '/api/product-templates', {
    method: 'POST',
    token,
    body: {
      name: '短剧提版模版',
      code: 'short-drama-template',
      template_type: 'short_drama',
      budget_type: 'zhixiao',
      platform: 'mini_program',
      project_path: 'src',
    },
  });
  assert.equal(shortDramaTemplate.status, 200, JSON.stringify(shortDramaTemplate.payload));

  const incompleteSubjectForm = new FormData();
  incompleteSubjectForm.append('company_entity', '缺少短剧域名主体');
  incompleteSubjectForm.append('identity_key_file', new Blob(['{"appId":"missing-domain"}'], { type: 'application/json' }), 'identity.json');
  incompleteSubjectForm.append('api_domain', 'https://api.missing.example.com');
  incompleteSubjectForm.append('analytics_domain', 'https://analytics.missing.example.com');
  incompleteSubjectForm.append('cdn_domain', 'https://cdn.missing.example.com');
  const incompleteSubject = await request(baseUrl, '/api/company-subjects', {
    method: 'POST',
    token,
    formData: incompleteSubjectForm,
  });
  assert.equal(incompleteSubject.status, 200, JSON.stringify(incompleteSubject.payload));
  const incompleteAsset = await request(baseUrl, '/api/product-assets', {
    method: 'POST',
    token,
    body: {
      app_name: '缺少短剧域名产品',
      budget_type: 'zhixiao',
      company_subject_id: incompleteSubject.payload.id,
      appid: '2026072700010002',
      platform: 'mini_program',
    },
  });
  assert.equal(incompleteAsset.status, 200, JSON.stringify(incompleteAsset.payload));
  const invalidRelease = await request(baseUrl, `/api/product-assets/${incompleteAsset.payload.id}/releases`, {
    method: 'POST',
    token,
    body: {
      app_id: '2026072700010002',
      template_id: shortDramaTemplate.payload.id,
    },
  });
  assert.equal(invalidRelease.status, 400, JSON.stringify(invalidRelease.payload));
  assert.match(invalidRelease.payload.error, /short_drama_domain/);

  const asset = await request(baseUrl, '/api/product-assets', {
    method: 'POST',
    token,
    body: {
      app_name: '主体域名产品',
      budget_type: 'zhixiao',
      company_subject_id: subjectId,
      appid: '2026072700010001',
      platform: 'mini_program',
    },
  });
  assert.equal(asset.status, 200, JSON.stringify(asset.payload));

  const release = await request(baseUrl, `/api/product-assets/${asset.payload.id}/releases`, {
    method: 'POST',
    token,
    body: {
      app_id: '2026072700010001',
      template_id: template.payload.id,
      release_version: '1.0.0',
      release_note: '域名来自主体',
    },
  });
  assert.equal(release.status, 202, JSON.stringify(release.payload));

  const task = await waitForTaskStatus(baseUrl, token, release.payload.id, 'success');
  assert.equal(task.record.api_domain, 'https://api.subject.example.com');
  assert.equal(task.record.analytics_domain, 'https://analytics.subject.example.com');
  assert.equal(task.record.cdn_domain, 'https://cdn.subject.example.com');
  assert.equal(task.record.short_drama_domain, 'https://drama.subject.example.com');
  assert.equal(task.record.uploaded_version, 'fake-domain-1.0.0');
  assert.match(task.task.log_text, /upload\.js stdout: 上传版本: fake-domain-1\.0\.0/);
  const uploadArgs = JSON.parse(fs.readFileSync(uploadArgsPath, 'utf8'));
  assert.equal(uploadArgs[uploadArgs.indexOf('--project') + 1], 'src');
  assert.equal(uploadArgs[uploadArgs.indexOf('--short-drama-template') + 1], '0');

  fs.writeFileSync(uploadScriptPath, `
console.log('build error');
console.error("\\u001b[31mError: cannot resolve module 'crypto-js'\\u001b[39m");
console.error('Error: task was failed');
process.exit(1);
`, { mode: 0o700 });
  const failingAsset = await request(baseUrl, '/api/product-assets', {
    method: 'POST',
    token,
    body: {
      app_name: '提版失败原因产品',
      budget_type: 'zhixiao',
      company_subject_id: subjectId,
      appid: '2026072700010003',
      platform: 'mini_program',
    },
  });
  assert.equal(failingAsset.status, 200, JSON.stringify(failingAsset.payload));
  const failingRelease = await request(baseUrl, `/api/product-assets/${failingAsset.payload.id}/releases`, {
    method: 'POST',
    token,
    body: {
      app_id: '2026072700010003',
      template_id: template.payload.id,
      release_version: '1.0.1',
      release_note: '验证失败原因提炼',
    },
  });
  assert.equal(failingRelease.status, 202, JSON.stringify(failingRelease.payload));
  const failedTask = await waitForTaskStatus(baseUrl, token, failingRelease.payload.id, 'failed');
  assert.match(failedTask.task.error_message, /缺少依赖 crypto-js/);
  assert.doesNotMatch(failedTask.task.error_message, /\u001b|\[31m|task was failed/);
  assert.match(failedTask.task.log_text, /upload\.js stderr: Error: cannot resolve module 'crypto-js'/);
});
