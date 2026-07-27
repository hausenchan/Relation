const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

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
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('服务器启动在')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}\n${output}`));
    });
  });
}

async function request(baseUrl, route, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

test('managed document folders preserve fixed blueprints and isolate identical domestic and overseas paths', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-document-folder-blueprint-'));
  const databasePath = path.join(tempDir, 'data.db');
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      RELATION_DB_PATH: databasePath,
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

  const initialFolders = await request(baseUrl, '/api/document-folders', { token });
  assert.equal(initialFolders.status, 200, JSON.stringify(initialFolders.payload));
  const humanResourcesFolders = initialFolders.payload.filter(folder => (
    folder.domain === 'hr_administration'
  ));
  assert.equal(humanResourcesFolders.length, 10);

  const roots = humanResourcesFolders
    .filter(folder => !folder.parent_id)
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  assert.deepEqual(roots.map(folder => folder.name), ['人力', '行政']);

  const expectedStages = ['规划', '落地', '沉淀', '团队'];
  roots.forEach(root => {
    assert.equal(Number(root.depth), 1);
    assert.equal(Number(root.is_protected), 1);
    assert.equal(Number(root.can_add_child), 0);
    assert.equal(Number(root.can_edit_folder), 0);
    assert.equal(Number(root.can_delete_folder), 0);
    const stages = humanResourcesFolders
      .filter(folder => Number(folder.parent_id) === Number(root.id))
      .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
    assert.deepEqual(stages.map(folder => folder.name), expectedStages);
    stages.forEach(stage => {
      assert.equal(Number(stage.depth), 2);
      assert.equal(Number(stage.is_protected), 1);
      assert.equal(Number(stage.can_add_child), 1);
      assert.equal(Number(stage.can_edit_folder), 0);
      assert.equal(Number(stage.can_delete_folder), 0);
    });
  });

  const humanRoot = roots.find(folder => folder.name === '人力');
  const planningFolder = humanResourcesFolders.find(folder => (
    Number(folder.parent_id) === Number(humanRoot.id) && folder.name === '规划'
  ));
  const createUnderFixedRoot = await request(baseUrl, '/api/document-folders', {
    method: 'POST',
    token,
    body: { name: '不允许的目录', parent_id: humanRoot.id },
  });
  assert.equal(createUnderFixedRoot.status, 400);

  const renamePlanning = await request(baseUrl, `/api/document-folders/${planningFolder.id}`, {
    method: 'PUT',
    token,
    body: { name: '不允许改名', sort_order: planningFolder.sort_order },
  });
  assert.equal(renamePlanning.status, 403);
  const deletePlanning = await request(baseUrl, `/api/document-folders/${planningFolder.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(deletePlanning.status, 403);

  const customFolder = await request(baseUrl, '/api/document-folders', {
    method: 'POST',
    token,
    body: { name: '年度规划', parent_id: planningFolder.id },
  });
  assert.equal(customFolder.status, 200, JSON.stringify(customFolder.payload));
  const customFolderId = Number(customFolder.payload.id);
  const nestedFolder = await request(baseUrl, '/api/document-folders', {
    method: 'POST',
    token,
    body: { name: '招聘规划', parent_id: customFolderId },
  });
  assert.equal(nestedFolder.status, 200, JSON.stringify(nestedFolder.payload));
  const nestedFolderId = Number(nestedFolder.payload.id);

  const foldersAfterCreate = await request(baseUrl, '/api/document-folders', { token });
  const custom = foldersAfterCreate.payload.find(folder => Number(folder.id) === customFolderId);
  const nested = foldersAfterCreate.payload.find(folder => Number(folder.id) === nestedFolderId);
  assert.equal(Number(custom.depth), 3);
  assert.equal(Number(custom.can_add_child), 1);
  assert.equal(Number(custom.can_edit_folder), 1);
  assert.equal(Number(custom.can_delete_folder), 1);
  assert.equal(Number(nested.depth), 4);
  assert.equal(Number(nested.can_add_child), 1);
  assert.equal(Number(nested.can_edit_folder), 1);
  assert.equal(Number(nested.can_delete_folder), 1);

  const document = await request(baseUrl, '/api/documents', {
    method: 'POST',
    token,
    body: { title: '人力规划验证文档', folder_id: nestedFolderId },
  });
  assert.equal(document.status, 200, JSON.stringify(document.payload));
  assert.equal(document.payload.domain, 'hr_administration');
  assert.equal(document.payload.project_code, 'HRADM');
  assert.equal(document.payload.department_key, 'HR');
  assert.equal(document.payload.doc_type, 'PLAN');
  assert.match(document.payload.document_no, /^D\d{6}-HRADM-HR-PLAN-\d{4}$/);

  const beforeTemplateCount = foldersAfterCreate.payload.length;
  const applyTemplate = await request(baseUrl, '/api/document-folders/apply-template', {
    method: 'POST',
    token,
  });
  assert.equal(applyTemplate.status, 200, JSON.stringify(applyTemplate.payload));
  assert.equal(Number(applyTemplate.payload.created), 0);
  const foldersAfterTemplate = await request(baseUrl, '/api/document-folders', { token });
  assert.equal(foldersAfterTemplate.payload.length, beforeTemplateCount);
  assert.equal(foldersAfterTemplate.payload.filter(folder => folder.domain === 'hr_administration').length, 12);

  const findStageFolder = (domain, departmentName, stageName) => {
    const domainFolders = foldersAfterTemplate.payload.filter(folder => folder.domain === domain);
    const department = domainFolders.find(folder => !folder.parent_id && folder.name === departmentName);
    assert.ok(department, `${domain} ${departmentName} directory should exist`);
    const stage = domainFolders.find(folder => (
      Number(folder.parent_id) === Number(department.id) && folder.name === stageName
    ));
    assert.ok(stage, `${domain} ${departmentName}/${stageName} directory should exist`);
    return stage;
  };
  const domesticLegacy = findStageFolder('domestic_project', '商务', '沉淀');
  const overseasLegacy = findStageFolder('overseas_project', '商务', '沉淀');
  const domesticSop = await request(baseUrl, '/api/document-folders', {
    method: 'POST',
    token,
    body: { name: 'SOP', parent_id: domesticLegacy.id },
  });
  const overseasSop = await request(baseUrl, '/api/document-folders', {
    method: 'POST',
    token,
    body: { name: 'SOP', parent_id: overseasLegacy.id },
  });
  assert.equal(domesticSop.status, 200, JSON.stringify(domesticSop.payload));
  assert.equal(overseasSop.status, 200, JSON.stringify(overseasSop.payload));

  const mismatchedDocument = await request(baseUrl, '/api/documents', {
    method: 'POST',
    token,
    body: {
      title: '不应跨域的国内商务 SOP',
      domain: 'domestic_project',
      department_key: 'BD',
      doc_type: 'LEGA',
      folder_id: overseasSop.payload.id,
    },
  });
  assert.equal(mismatchedDocument.status, 400, JSON.stringify(mismatchedDocument.payload));
  assert.match(mismatchedDocument.payload.error, /目标目录与归属域不一致/);

  const domesticDocument = await request(baseUrl, '/api/documents', {
    method: 'POST',
    token,
    body: {
      title: '国内商务沉淀 SOP',
      domain: 'domestic_project',
      department_key: 'BD',
      doc_type: 'LEGA',
      folder_id: domesticSop.payload.id,
    },
  });
  assert.equal(domesticDocument.status, 200, JSON.stringify(domesticDocument.payload));
  assert.equal(domesticDocument.payload.domain, 'domestic_project');
  assert.equal(Number(domesticDocument.payload.folder_id), Number(domesticSop.payload.id));
  assert.equal(domesticDocument.payload.department_key, 'BD');
  assert.equal(domesticDocument.payload.doc_type, 'LEGA');

  const mismatchedUpdate = await request(baseUrl, `/api/documents/${domesticDocument.payload.id}`, {
    method: 'PUT',
    token,
    body: {
      domain: 'domestic_project',
      department_key: 'BD',
      doc_type: 'LEGA',
      folder_id: overseasSop.payload.id,
    },
  });
  assert.equal(mismatchedUpdate.status, 400, JSON.stringify(mismatchedUpdate.payload));
  assert.match(mismatchedUpdate.payload.error, /目标目录与归属域不一致/);

  const documentAfterRejectedMove = await request(
    baseUrl,
    `/api/documents/${domesticDocument.payload.id}`,
    { token },
  );
  assert.equal(documentAfterRejectedMove.status, 200, JSON.stringify(documentAfterRejectedMove.payload));
  assert.equal(documentAfterRejectedMove.payload.domain, 'domestic_project');
  assert.equal(Number(documentAfterRejectedMove.payload.folder_id), Number(domesticSop.payload.id));
});
