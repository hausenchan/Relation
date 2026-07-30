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
  const unauthenticatedProxyList = await request(baseUrl, '/api/product-release-proxies');
  assert.equal(unauthenticatedProxyList.status, 401);
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

  const missingProxyRelease = await request(baseUrl, `/api/product-assets/${asset.payload.id}/releases`, {
    method: 'POST',
    token,
    body: {
      app_id: '2026072700010001',
      template_id: template.payload.id,
    },
  });
  assert.equal(missingProxyRelease.status, 400, JSON.stringify(missingProxyRelease.payload));
  assert.match(missingProxyRelease.payload.error, /IP 代理/);

  const noMenuUsername = `proxy-no-menu-${Date.now()}`;
  const noMenuUser = await request(baseUrl, '/api/users', {
    method: 'POST',
    token,
    body: {
      username: noMenuUsername,
      password: 'readonly-pass-1',
      display_name: '无菜单代理测试用户',
      role: 'member',
    },
  });
  assert.equal(noMenuUser.status, 200, JSON.stringify(noMenuUser.payload));
  const noMenuLogin = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: noMenuUsername, password: 'readonly-pass-1' },
  });
  assert.equal(noMenuLogin.status, 200, JSON.stringify(noMenuLogin.payload));
  const noMenuProxyList = await request(baseUrl, '/api/product-release-proxies', { token: noMenuLogin.payload.token });
  assert.equal(noMenuProxyList.status, 403, JSON.stringify(noMenuProxyList.payload));

  const proxy = await request(baseUrl, '/api/product-release-proxies', {
    method: 'POST',
    token,
    body: {
      name: '提版默认出口',
      protocol: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: 'proxy-user',
      password: 'proxy-password',
      domain_suffixes: ['*'],
      priority: 10,
      status: 'enabled',
      remark: '集成测试代理',
    },
  });
  assert.equal(proxy.status, 200, JSON.stringify(proxy.payload));
  const proxyList = await request(baseUrl, '/api/product-release-proxies', { token });
  assert.equal(proxyList.status, 200, JSON.stringify(proxyList.payload));
  assert.equal(proxyList.payload[0].name, '提版默认出口');
  assert.equal(proxyList.payload[0].password, undefined);
  assert.equal(proxyList.payload[0].username, undefined);
  assert.equal(proxyList.payload[0].has_password, true);
  const proxyDetail = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, { token });
  assert.equal(proxyDetail.status, 200, JSON.stringify(proxyDetail.payload));
  assert.equal(proxyDetail.payload.domain_suffixes[0], '*');
  const proxyUpdate = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, {
    method: 'PUT',
    token,
    body: { remark: '集成测试代理已更新' },
  });
  assert.equal(proxyUpdate.status, 200, JSON.stringify(proxyUpdate.payload));

  const proxyDb = new Database(databasePath, { readonly: true });
  const rawProxy = proxyDb.prepare('SELECT username, password, domain_suffixes_json FROM product_release_proxies WHERE id = ?').get(proxy.payload.id);
  proxyDb.close();
  assert.match(rawProxy.username, /^enc:v1:/);
  assert.match(rawProxy.password, /^enc:v1:/);
  assert.equal(rawProxy.domain_suffixes_json, '["*"]');
  const preservedProxy = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, { token });
  assert.equal(preservedProxy.status, 200, JSON.stringify(preservedProxy.payload));
  assert.equal(preservedProxy.payload.has_password, true);

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
  assert.equal(task.task.proxy_summary.length, 3);
  assert.match(task.task.log_text, /任务级代理已关闭/);
  assert.match(task.task.log_text, /upload\.js stdout: 上传版本: fake-domain-1\.0\.0/);
  assert.doesNotMatch(task.task.log_text, /proxy-password|Proxy-Authorization|127\.0\.0\.1:8080/);
  const rawTaskDb = new Database(databasePath, { readonly: true });
  const rawTask = rawTaskDb.prepare('SELECT proxy_snapshot, proxy_summary FROM product_asset_release_tasks WHERE id = ?').get(release.payload.id);
  const rawRecord = rawTaskDb.prepare('SELECT proxy_summary FROM product_asset_release_records WHERE task_id = ?').get(release.payload.id);
  rawTaskDb.close();
  assert.match(rawTask.proxy_snapshot, /^enc:v1:/);
  assert.doesNotMatch(rawTask.proxy_snapshot, /proxy-password/);
  assert.doesNotMatch(rawRecord.proxy_summary, /proxy-password/);
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
  assert.match(failedTask.task.log_text, /任务级代理已关闭/);

  const readonlyUsername = `proxy-readonly-${Date.now()}`;
  const readonlyUser = await request(baseUrl, '/api/users', {
    method: 'POST',
    token,
    body: {
      username: readonlyUsername,
      password: 'readonly-pass-2',
      display_name: '只读代理测试用户',
      role: 'readonly',
    },
  });
  assert.equal(readonlyUser.status, 200, JSON.stringify(readonlyUser.payload));
  const menuGrant = await request(baseUrl, `/api/admin/menu-perms/${readonlyUser.payload.id}`, {
    method: 'PUT',
    token,
    body: { menuKeys: ['/product-templates'] },
  });
  assert.equal(menuGrant.status, 200, JSON.stringify(menuGrant.payload));
  const readonlyLogin = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: readonlyUsername, password: 'readonly-pass-2' },
  });
  assert.equal(readonlyLogin.status, 200, JSON.stringify(readonlyLogin.payload));
  const readonlyToken = readonlyLogin.payload.token;
  const readonlyList = await request(baseUrl, '/api/product-release-proxies', { token: readonlyToken });
  assert.equal(readonlyList.status, 200, JSON.stringify(readonlyList.payload));
  const readonlyCreate = await request(baseUrl, '/api/product-release-proxies', {
    method: 'POST',
    token: readonlyToken,
    body: { name: 'readonly-create', protocol: 'http', host: '127.0.0.1', port: 8080, domain_suffixes: ['*'] },
  });
  assert.equal(readonlyCreate.status, 403);
  const readonlyUpdate = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, {
    method: 'PUT',
    token: readonlyToken,
    body: { remark: 'readonly should fail' },
  });
  assert.equal(readonlyUpdate.status, 403);
  const readonlyDelete = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, {
    method: 'DELETE',
    token: readonlyToken,
  });
  assert.equal(readonlyDelete.status, 403);

  const clearPassword = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, {
    method: 'PUT',
    token,
    body: { clear_password: true },
  });
  assert.equal(clearPassword.status, 200, JSON.stringify(clearPassword.payload));
  const clearedProxy = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, { token });
  assert.equal(clearedProxy.status, 200, JSON.stringify(clearedProxy.payload));
  assert.equal(clearedProxy.payload.has_password, false);
  const clearedProxyDb = new Database(databasePath, { readonly: true });
  const clearedRawProxy = clearedProxyDb.prepare('SELECT password FROM product_release_proxies WHERE id = ?').get(proxy.payload.id);
  clearedProxyDb.close();
  assert.equal(clearedRawProxy.password, null);

  const deletedProxy = await request(baseUrl, `/api/product-release-proxies/${proxy.payload.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(deletedProxy.status, 200, JSON.stringify(deletedProxy.payload));
});
