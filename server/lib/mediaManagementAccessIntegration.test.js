const test = require('node:test');
const assert = require('node:assert/strict');
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

async function createUser(baseUrl, adminToken, input) {
  const password = 'media-access-test-123';
  const response = await request(baseUrl, '/api/users', {
    method: 'POST',
    token: adminToken,
    body: { password, ...input },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return { id: Number(response.payload.id), username: input.username, password };
}

async function saveMenuPermissions(baseUrl, adminToken, userId, menuKeys) {
  const response = await request(baseUrl, `/api/admin/menu-perms/${userId}`, {
    method: 'PUT',
    token: adminToken,
    body: { menuKeys },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
}

function mediaInput() {
  return {
    cid: '990027',
    media_name: '媒体入口编辑权限集成测试',
    endpoint_description: '安卓-990027/iOS-990028',
    importance: 'key',
    category: 'tool',
    yyz_version: 'sdk_data_ui',
    display_style: 'yyz_aggregate',
    budget_types: ['h5'],
    integration_progress: 'testing',
  };
}

test('media menu access immediately grants existing media and linked documents across server caches', { timeout: 45000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-media-access-'));
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
  const adminToken = admin.token;
  const editor = await createUser(baseUrl, adminToken, {
    username: 'media_menu_editor',
    display_name: '媒体菜单编辑人',
    role: 'member',
  });
  const readonly = await createUser(baseUrl, adminToken, {
    username: 'media_menu_readonly',
    display_name: '媒体菜单只读人',
    role: 'readonly',
  });
  const guest = await createUser(baseUrl, adminToken, {
    username: 'media_menu_guest',
    display_name: '媒体菜单访客',
    role: 'guest',
    modulePerms: [{ module: 'product_assets', can_read: 1, can_write: 0 }],
  });
  const blocked = await createUser(baseUrl, adminToken, {
    username: 'media_no_menu',
    display_name: '无媒体菜单用户',
    role: 'member',
  });
  const createdMedia = await request(baseUrl, '/api/media-management', {
    method: 'POST',
    token: adminToken,
    body: mediaInput(),
  });
  assert.equal(createdMedia.status, 200, JSON.stringify(createdMedia.payload));
  const mediaId = Number(createdMedia.payload.id);
  const documentId = Number(createdMedia.payload.document_id);
  assert.ok(mediaId > 0 && documentId > 0);

  const editorLogin = await login(baseUrl, editor.username, editor.password);
  const readonlyLogin = await login(baseUrl, readonly.username, readonly.password);
  const guestLogin = await login(baseUrl, guest.username, guest.password);
  const blockedLogin = await login(baseUrl, blocked.username, blocked.password);

  const editorBeforeGrant = await request(baseUrl, '/api/media-management', { token: editorLogin.token });
  assert.equal(editorBeforeGrant.status, 403);
  const editorDocumentBeforeGrant = await request(baseUrl, `/api/documents/${documentId}`, {
    token: editorLogin.token,
  });
  assert.equal(editorDocumentBeforeGrant.status, 404);
  const adminDocumentBeforeGrant = await request(baseUrl, `/api/documents/${documentId}`, {
    token: adminToken,
  });
  assert.equal(adminDocumentBeforeGrant.status, 200, JSON.stringify(adminDocumentBeforeGrant.payload));
  assert.equal(
    adminDocumentBeforeGrant.payload.shares.some(share => Number(share.target_id) === editor.id),
    false,
  );

  // Simulate another application process saving menu permissions after this process cached the old result.
  const externalDb = new Database(databasePath);
  try {
    const insertMenuPermission = externalDb.prepare(
      'INSERT INTO user_menu_perms (user_id, menu_key) VALUES (?, ?)',
    );
    [editor.id, readonly.id, guest.id].forEach(userId => {
      insertMenuPermission.run(userId, '/media-management');
    });
  } finally {
    externalDb.close();
  }

  const editorList = await request(baseUrl, '/api/media-management', { token: editorLogin.token });
  assert.equal(editorList.status, 200, JSON.stringify(editorList.payload));
  assert.equal(editorList.payload.find(item => Number(item.id) === mediaId)?.can_edit, 1);
  const editorDetail = await request(baseUrl, `/api/media-management/${mediaId}`, { token: editorLogin.token });
  assert.equal(editorDetail.status, 200, JSON.stringify(editorDetail.payload));
  assert.equal(editorDetail.payload.can_edit, 1);

  const updatedMedia = await request(baseUrl, `/api/media-management/${mediaId}`, {
    method: 'PUT',
    token: editorLogin.token,
    body: { other_notes: '由菜单授权用户编辑' },
  });
  assert.equal(updatedMedia.status, 200, JSON.stringify(updatedMedia.payload));
  assert.equal(updatedMedia.payload.other_notes, '由菜单授权用户编辑');

  const documentDetail = await request(baseUrl, `/api/documents/${documentId}`, { token: editorLogin.token });
  assert.equal(documentDetail.status, 200, JSON.stringify(documentDetail.payload));
  assert.equal(documentDetail.payload.can_edit, 1);
  const systemEditorShare = documentDetail.payload.shares.find(
    share => share.target_type === 'user' && Number(share.target_id) === editor.id,
  );
  assert.equal(systemEditorShare?.is_system, 1);
  assert.equal(systemEditorShare?.share_source, 'media_management_menu');
  assert.equal(systemEditorShare?.can_edit, 1);
  [readonly, guest].forEach(user => {
    const share = documentDetail.payload.shares.find(
      item => item.target_type === 'user' && Number(item.target_id) === user.id,
    );
    assert.equal(share?.is_system, 1);
    assert.equal(share?.can_edit, 0);
  });
  assert.equal(
    documentDetail.payload.shares.some(share => Number(share.target_id) === blocked.id),
    false,
  );
  const editorAccessUser = documentDetail.payload.access_summary.users.find(user => Number(user.id) === editor.id);
  assert.ok(editorAccessUser?.source_types.includes('media_management'));

  const updatedContent = await request(baseUrl, `/api/documents/${documentId}/content`, {
    method: 'PUT',
    token: editorLogin.token,
    body: {
      content: {
        format: 'relation_document_blocks_v1',
        blocks: [{ id: 'media-access-editor', type: 'paragraph', content: '媒体菜单用户可编辑关联文档', meta: {} }],
      },
      content_text: '媒体菜单用户可编辑关联文档',
      base_updated_at: documentDetail.payload.updated_at,
    },
  });
  assert.equal(updatedContent.status, 200, JSON.stringify(updatedContent.payload));

  const systemShares = documentDetail.payload.shares.map(share => ({
    target_type: share.target_type,
    ...(share.target_id ? { target_id: share.target_id } : {}),
    ...(share.target_key ? { target_key: share.target_key } : {}),
  }));
  const savedDynamicShares = await request(baseUrl, `/api/documents/${documentId}/shares`, {
    method: 'PUT',
    token: editorLogin.token,
    body: { shares: systemShares },
  });
  assert.equal(savedDynamicShares.status, 200, JSON.stringify(savedDynamicShares.payload));
  assert.equal(
    savedDynamicShares.payload.shares.find(share => Number(share.target_id) === editor.id)?.is_system,
    1,
  );

  const readonlyList = await request(baseUrl, '/api/media-management', { token: readonlyLogin.token });
  assert.equal(readonlyList.status, 200, JSON.stringify(readonlyList.payload));
  assert.equal(readonlyList.payload.find(item => Number(item.id) === mediaId)?.can_edit, 0);
  const guestList = await request(baseUrl, '/api/media-management', { token: guestLogin.token });
  assert.equal(guestList.status, 200, JSON.stringify(guestList.payload));
  assert.equal(guestList.payload.find(item => Number(item.id) === mediaId)?.can_edit, 0);
  const readonlyUpdate = await request(baseUrl, `/api/media-management/${mediaId}`, {
    method: 'PUT',
    token: readonlyLogin.token,
    body: { other_notes: '只读不应写入' },
  });
  assert.equal(readonlyUpdate.status, 403);
  const guestUpdate = await request(baseUrl, `/api/media-management/${mediaId}`, {
    method: 'PUT',
    token: guestLogin.token,
    body: { other_notes: '访客不应写入' },
  });
  assert.equal(guestUpdate.status, 403);
  const blockedMedia = await request(baseUrl, '/api/media-management', { token: blockedLogin.token });
  assert.equal(blockedMedia.status, 403);
  const blockedDocument = await request(baseUrl, `/api/documents/${documentId}`, { token: blockedLogin.token });
  assert.equal(blockedDocument.status, 404);

  await saveMenuPermissions(baseUrl, adminToken, editor.id, []);
  const revokedMedia = await request(baseUrl, '/api/media-management', { token: editorLogin.token });
  assert.equal(revokedMedia.status, 403);
  const revokedDocument = await request(baseUrl, `/api/documents/${documentId}`, { token: editorLogin.token });
  assert.equal(revokedDocument.status, 404);
  const sharesAfterRevoke = await request(baseUrl, `/api/documents/${documentId}/shares`, { token: adminToken });
  assert.equal(sharesAfterRevoke.status, 200, JSON.stringify(sharesAfterRevoke.payload));
  assert.equal(sharesAfterRevoke.payload.some(share => Number(share.target_id) === editor.id), false);

  const manualShare = await request(baseUrl, `/api/documents/${documentId}/shares`, {
    method: 'PUT',
    token: adminToken,
    body: { shares: [{ target_type: 'user', target_id: editor.id }] },
  });
  assert.equal(manualShare.status, 200, JSON.stringify(manualShare.payload));
  const storedEditorShare = manualShare.payload.shares.find(share => Number(share.target_id) === editor.id);
  assert.ok(storedEditorShare);
  assert.notEqual(storedEditorShare.is_system, 1);

  await saveMenuPermissions(baseUrl, adminToken, editor.id, ['/media-management']);
  await saveMenuPermissions(baseUrl, adminToken, editor.id, []);
  const manuallySharedDocument = await request(baseUrl, `/api/documents/${documentId}`, { token: editorLogin.token });
  assert.equal(manuallySharedDocument.status, 200, JSON.stringify(manuallySharedDocument.payload));
  assert.equal(manuallySharedDocument.payload.can_edit, 1);
  assert.notEqual(
    manuallySharedDocument.payload.shares.find(share => Number(share.target_id) === editor.id)?.is_system,
    1,
  );
});
