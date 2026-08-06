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

async function login(baseUrl, username, password) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload;
}

test('document library views keep recent, shared, and favorite results permission-safe', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-document-library-views-'));
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
  const admin = await login(baseUrl, 'admin', 'admin123');
  const username = `library_member_${Date.now()}`;
  const password = 'library-test-password';
  const createMember = await request(baseUrl, '/api/users', {
    method: 'POST',
    token: admin.token,
    body: {
      username,
      password,
      display_name: '快捷视图测试成员',
      role: 'member',
      department: 'OPS',
    },
  });
  assert.equal(createMember.status, 200, JSON.stringify(createMember.payload));
  const memberId = Number(createMember.payload.id);
  const member = await login(baseUrl, username, password);

  const sharedDocument = await request(baseUrl, '/api/documents', {
    method: 'POST',
    token: admin.token,
    body: { title: '共享给成员的文档' },
  });
  assert.equal(sharedDocument.status, 200, JSON.stringify(sharedDocument.payload));
  const sharedDocumentId = Number(sharedDocument.payload.id);

  const memberDocument = await request(baseUrl, '/api/documents', {
    method: 'POST',
    token: member.token,
    body: { title: '成员自己创建的文档' },
  });
  assert.equal(memberDocument.status, 200, JSON.stringify(memberDocument.payload));
  const memberDocumentId = Number(memberDocument.payload.id);

  const share = await request(baseUrl, `/api/documents/${sharedDocumentId}/shares`, {
    method: 'PUT',
    token: admin.token,
    body: { shares: [{ target_type: 'user', target_id: memberId }] },
  });
  assert.equal(share.status, 200, JSON.stringify(share.payload));

  const initialRecent = await request(baseUrl, '/api/documents?view=recent', { token: member.token });
  assert.equal(initialRecent.status, 200, JSON.stringify(initialRecent.payload));
  assert.deepEqual(initialRecent.payload, []);

  const sharedView = await request(baseUrl, '/api/documents?view=shared', { token: member.token });
  assert.equal(sharedView.status, 200, JSON.stringify(sharedView.payload));
  assert.deepEqual(sharedView.payload.map(document => Number(document.id)), [sharedDocumentId]);
  assert.equal(sharedView.payload.some(document => Number(document.id) === memberDocumentId), false);

  const openSharedDocument = await request(baseUrl, `/api/documents/${sharedDocumentId}`, { token: member.token });
  assert.equal(openSharedDocument.status, 200, JSON.stringify(openSharedDocument.payload));
  const recentAfterOpen = await request(baseUrl, '/api/documents?view=recent', { token: member.token });
  assert.equal(recentAfterOpen.status, 200, JSON.stringify(recentAfterOpen.payload));
  assert.deepEqual(recentAfterOpen.payload.map(document => Number(document.id)), [sharedDocumentId]);
  assert.ok(recentAfterOpen.payload[0].last_accessed_at);

  const favorite = await request(baseUrl, `/api/documents/${sharedDocumentId}/favorite`, {
    method: 'POST',
    token: member.token,
  });
  assert.equal(favorite.status, 200, JSON.stringify(favorite.payload));
  const favoriteView = await request(baseUrl, '/api/documents?favorite=1', { token: member.token });
  assert.equal(favoriteView.status, 200, JSON.stringify(favoriteView.payload));
  assert.equal(favoriteView.payload.some(document => Number(document.id) === sharedDocumentId), true);

  const revoke = await request(baseUrl, `/api/documents/${sharedDocumentId}/shares`, {
    method: 'PUT',
    token: admin.token,
    body: { shares: [] },
  });
  assert.equal(revoke.status, 200, JSON.stringify(revoke.payload));

  const sharedAfterRevoke = await request(baseUrl, '/api/documents?view=shared', { token: member.token });
  const recentAfterRevoke = await request(baseUrl, '/api/documents?view=recent', { token: member.token });
  const favoriteAfterRevoke = await request(baseUrl, '/api/documents?favorite=1', { token: member.token });
  assert.equal(sharedAfterRevoke.status, 200, JSON.stringify(sharedAfterRevoke.payload));
  assert.equal(recentAfterRevoke.status, 200, JSON.stringify(recentAfterRevoke.payload));
  assert.equal(favoriteAfterRevoke.status, 200, JSON.stringify(favoriteAfterRevoke.payload));
  assert.deepEqual(sharedAfterRevoke.payload, []);
  assert.deepEqual(recentAfterRevoke.payload, []);
  assert.equal(favoriteAfterRevoke.payload.some(document => Number(document.id) === sharedDocumentId), false);
});
