const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  canAccessMediaManagement,
  createMediaManagementRouter,
} = require('./mediaManagement');

function createHarness() {
  const db = new Database(':memory:');
  let createdDocumentInput = null;
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      display_name TEXT,
      role TEXT,
      executive_role TEXT,
      account_status TEXT DEFAULT 'active'
    );
    CREATE TABLE teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      leader_id INTEGER
    );
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      content_text TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      is_deleted INTEGER DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE document_shares (
      document_id INTEGER,
      target_type TEXT,
      target_id INTEGER,
      target_key TEXT,
      created_by INTEGER,
      UNIQUE(document_id, target_type, target_id, target_key)
    );
    CREATE TABLE document_edit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      action_type TEXT,
      title_before TEXT,
      title_after TEXT
    );
  `);
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (1, ?, ?, ?)')
    .run('admin', '管理员', 'admin');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (2, ?, ?, ?)')
    .run('editor', '编辑人', 'member');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (3, ?, ?, ?)')
    .run('blocked', '无菜单用户', 'member');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (4, ?, ?, ?)')
    .run('guest_no_module', '无模块访客', 'guest');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (5, ?, ?, ?)')
    .run('guest_reader', '可读访客', 'guest');
  db.prepare('INSERT INTO users (id, username, display_name, role, executive_role) VALUES (6, ?, ?, ?, ?)')
    .run('cxo', 'CXO', 'member', 'cmo');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (7, ?, ?, ?)')
    .run('traffic_leader', '流量商务组长', 'leader');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (8, ?, ?, ?)')
    .run('other_leader', '其他组长', 'leader');
  db.prepare('INSERT INTO users (id, username, display_name, role) VALUES (9, ?, ?, ?)')
    .run('readonly', '只读用户', 'readonly');
  db.prepare('INSERT INTO teams (id, name, department, leader_id) VALUES (1, ?, ?, ?)')
    .run('流量商务小组', 'commercial', 7);
  db.prepare('INSERT INTO teams (id, name, department, leader_id) VALUES (2, ?, ?, ?)')
    .run('流量产品组', 'operation', 8);

  const menuByUser = new Map([
    [2, ['/media-management']],
    [4, ['/media-management']],
    [5, ['/media-management']],
    [7, ['/media-management']],
    [8, ['/media-management']],
    [9, ['/media-management']],
  ]);
  const modulePermsByUser = new Map([
    [5, [{ module: 'product_assets', can_read: 1, can_write: 0 }]],
  ]);
  const isAdmin = role => ['admin', 'ceo', 'coo', 'cto', 'cmo'].includes(role);
  const hasMediaAccess = user => canAccessMediaManagement(user, {
    isAdmin,
    getUserMenuPerms: userId => menuByUser.get(Number(userId)) || [],
    getUserModulePerms: userId => modulePermsByUser.get(Number(userId)) || [],
  });
  const isShared = (documentId, userId) => Boolean(db.prepare(`
    SELECT 1 FROM document_shares
    WHERE document_id = ? AND target_type = 'user' AND target_id = ?
  `).get(documentId, userId));
  const canEditDocument = (user, document) => Boolean(
    user && document && !['readonly', 'guest'].includes(user.role)
      && (
        isAdmin(user.role)
        || Number(document.created_by) === Number(user.id)
        || isShared(document.id, user.id)
        || (hasMediaAccess(user) && Boolean(db.prepare(
          'SELECT 1 FROM media_assets WHERE document_id = ?',
        ).get(document.id)))
      )
  );
  const canManageDocument = (user, document) => Boolean(
    user && document && (isAdmin(user.role) || Number(document.created_by) === Number(user.id))
  );
  const getVisibleDocument = (id, user) => {
    const document = db.prepare('SELECT * FROM documents WHERE id = ? AND COALESCE(is_deleted, 0) = 0').get(id);
    if (!document) return null;
    const isMediaDocument = Boolean(db.prepare(
      'SELECT 1 FROM media_assets WHERE document_id = ?',
    ).get(document.id));
    return isAdmin(user.role)
      || Number(document.created_by) === Number(user.id)
      || isShared(document.id, user.id)
      || (hasMediaAccess(user) && isMediaDocument)
      ? document
      : null;
  };
  const addDocumentShares = (documentId, shares, userId) => {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO document_shares (document_id, target_type, target_id, target_key, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    shares.forEach(share => insert.run(documentId, share.target_type, share.target_id || null, share.target_key || null, userId));
  };
  const router = createMediaManagementRouter({
    db,
    canWrite: (req, res, next) => {
      if (['readonly', 'guest'].includes(req.user.role)) return res.status(403).json({ error: '只读' });
      return next();
    },
    isAdmin,
    getUserMenuPerms: userId => menuByUser.get(Number(userId)) || [],
    getUserModulePerms: userId => modulePermsByUser.get(Number(userId)) || [],
    canAccessMediaManagement: hasMediaAccess,
    getVisibleDocument,
    canEditDocument,
    canManageDocument,
    createDocumentRecord: (input, user) => {
      createdDocumentInput = { ...input };
      const result = db.prepare(`
        INSERT INTO documents (title, content, content_text, created_by, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(input.title, JSON.stringify(input.content || {}), input.content_text || '', user.id, user.id, new Date().toISOString());
      addDocumentShares(result.lastInsertRowid, input.shares || [], user.id);
      return result.lastInsertRowid;
    },
    getDefaultDocumentShares: () => [],
    addDocumentShares,
    insertDocumentEditRecord: (documentId, userId, actionType, before, after) => {
      db.prepare(`
        INSERT INTO document_edit_records (document_id, action_type, title_before, title_after)
        VALUES (?, ?, ?, ?)
      `).run(documentId, actionType, before.title, after.title);
    },
    encryptRow: (table, row) => ({ ...row }),
    decryptRow: (table, row) => ({ ...row }),
    prepareMediaDocumentPlacement: () => ({
      document_defaults: { folder_id: 44 },
      documents_scanned: 0,
      documents_updated: 0,
    }),
  });

  const users = {
    admin: { id: 1, username: 'admin', display_name: '管理员', role: 'admin' },
    editor: { id: 2, username: 'editor', display_name: '编辑人', role: 'member' },
    blocked: { id: 3, username: 'blocked', display_name: '无菜单用户', role: 'member' },
    guestNoModule: { id: 4, username: 'guest_no_module', display_name: '无模块访客', role: 'guest' },
    guestReader: { id: 5, username: 'guest_reader', display_name: '可读访客', role: 'guest' },
    cxo: { id: 6, username: 'cxo', display_name: 'CXO', role: 'member', executive_role: 'cmo' },
    trafficLeader: { id: 7, username: 'traffic_leader', display_name: '流量商务组长', role: 'leader' },
    otherLeader: { id: 8, username: 'other_leader', display_name: '其他组长', role: 'leader' },
    readonly: { id: 9, username: 'readonly', display_name: '只读用户', role: 'readonly' },
  };

  const dispatch = ({ method = 'GET', path = '/', params = {}, query = {}, body = {}, user = users.admin }) => {
    const req = { method, params, query, body, user };
    const res = {
      statusCode: 200,
      payload: undefined,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    const accessLayer = router.stack.find(layer => !layer.route);
    let accessGranted = false;
    accessLayer.handle(req, res, () => { accessGranted = true; });
    if (!accessGranted) return res;
    const routeLayer = router.stack.find(layer => (
      layer.route?.path === path && layer.route.methods[String(method).toLowerCase()]
    ));
    assert.ok(routeLayer, `route ${method} ${path} not found`);
    const handlers = routeLayer.route.stack;
    const run = index => {
      if (!handlers[index] || res.payload !== undefined) return;
      handlers[index].handle(req, res, () => run(index + 1));
    };
    run(0);
    return res;
  };

  return {
    db,
    dispatch,
    users,
    getVisibleDocument,
    isShared,
    setMenuPerms: (userId, menuKeys) => menuByUser.set(Number(userId), [...menuKeys]),
    getCreatedDocumentInput: () => createdDocumentInput,
  };
}

function input(overrides = {}) {
  return {
    cid: '000123',
    media_name: '趣头条',
    endpoint_description: '安卓-000123/iOS-000124',
    importance: 'key',
    category: 'news',
    yyz_version: 'sdk_data_ui',
    display_style: 'yyz_aggregate',
    budget_types: ['h5', 'alipay_mini'],
    integration_progress: 'testing',
    owner_id: 2,
    ...overrides,
  };
}

test('router enforces menu access and supports linked-document CRUD, search, and filters without a network listener', () => {
  const {
    db,
    dispatch,
    users,
    getCreatedDocumentInput,
    getVisibleDocument,
    isShared,
    setMenuPerms,
  } = createHarness();
  try {
    const blocked = dispatch({ user: users.blocked });
    assert.equal(blocked.statusCode, 403);
    const guestWithoutModule = dispatch({ user: users.guestNoModule });
    assert.equal(guestWithoutModule.statusCode, 403);
    const guestWithModule = dispatch({ user: users.guestReader });
    assert.equal(guestWithModule.statusCode, 200);

    const created = dispatch({ method: 'POST', body: input() });
    assert.equal(created.statusCode, 200, JSON.stringify(created.payload));
    assert.equal(created.payload.cid, '000123');
    assert.equal(created.payload.endpoint_description, '安卓-000123/iOS-000124');
    assert.equal(created.payload.can_delete, 0);
    const mediaId = Number(created.payload.id);
    const documentId = Number(created.payload.document_id);
    assert.ok(documentId > 0);
    assert.deepEqual(
      {
        folder_id: getCreatedDocumentInput().folder_id,
        domain: getCreatedDocumentInput().domain,
        project_code: getCreatedDocumentInput().project_code,
        department_key: getCreatedDocumentInput().department_key,
        doc_type: getCreatedDocumentInput().doc_type,
        icon_key: getCreatedDocumentInput().icon_key,
      },
      {
        folder_id: 44,
        domain: 'domestic_project',
        project_code: 'DOMESTIC',
        department_key: 'OPS',
        doc_type: 'IMP',
        icon_key: null,
      },
    );
    assert.ok(db.prepare(`
      SELECT 1 FROM document_shares
      WHERE document_id = ? AND target_type = 'user' AND target_id = 2
    `).get(documentId));
    const shareDocument = db.prepare(`
      INSERT INTO document_shares (document_id, target_type, target_id, target_key, created_by)
      VALUES (?, 'user', ?, NULL, 1)
    `);
    [users.cxo.id, users.trafficLeader.id, users.otherLeader.id]
      .forEach(userId => shareDocument.run(documentId, userId));

    const unshared = dispatch({
      method: 'POST',
      body: input({ cid: '000125', media_name: '未单独共享媒体', owner_id: null }),
      user: users.admin,
    });
    assert.equal(unshared.statusCode, 200, JSON.stringify(unshared.payload));
    assert.equal(unshared.payload.can_edit, 1);
    assert.equal(isShared(unshared.payload.document_id, users.editor.id), false);

    const editorList = dispatch({ user: users.editor });
    assert.equal(editorList.statusCode, 200);
    assert.deepEqual(
      new Set(editorList.payload.map(record => Number(record.id))),
      new Set([mediaId, Number(unshared.payload.id)]),
    );
    const editorDetail = dispatch({
      path: '/:id',
      params: { id: String(unshared.payload.id) },
      user: users.editor,
    });
    assert.equal(editorDetail.statusCode, 200);
    assert.equal(editorDetail.payload.can_edit, 1);
    assert.ok(getVisibleDocument(unshared.payload.document_id, users.editor));
    const editorUpdatesUnshared = dispatch({
      method: 'PUT',
      path: '/:id',
      params: { id: String(unshared.payload.id) },
      body: input({
        cid: '000125',
        media_name: '未单独共享媒体',
        owner_id: null,
        other_notes: '菜单授权可编辑',
      }),
      user: users.editor,
    });
    assert.equal(editorUpdatesUnshared.statusCode, 200, JSON.stringify(editorUpdatesUnshared.payload));
    assert.equal(editorUpdatesUnshared.payload.other_notes, '菜单授权可编辑');
    setMenuPerms(users.editor.id, []);
    assert.equal(dispatch({ user: users.editor }).statusCode, 403);
    setMenuPerms(users.editor.id, ['/media-management']);
    const guestList = dispatch({ user: users.guestReader });
    assert.equal(guestList.statusCode, 200);
    assert.equal(guestList.payload.length, 2);
    assert.ok(guestList.payload.every(record => Number(record.can_edit) === 0));
    const readonlyList = dispatch({ user: users.readonly });
    assert.equal(readonlyList.statusCode, 200);
    assert.ok(readonlyList.payload.every(record => Number(record.can_edit) === 0));
    const readonlyUpdate = dispatch({
      method: 'PUT',
      path: '/:id',
      params: { id: String(unshared.payload.id) },
      body: input({ cid: '000125', media_name: '只读不得更新', owner_id: null }),
      user: users.readonly,
    });
    assert.equal(readonlyUpdate.statusCode, 403);

    const removeUnshared = dispatch({
      method: 'DELETE',
      path: '/:id',
      params: { id: String(unshared.payload.id) },
      user: users.trafficLeader,
    });
    assert.equal(removeUnshared.statusCode, 200);

    const cxoList = dispatch({ user: users.cxo });
    assert.equal(cxoList.statusCode, 200);
    assert.equal(cxoList.payload[0].can_delete, 1);
    const trafficLeaderList = dispatch({ user: users.trafficLeader });
    assert.equal(trafficLeaderList.statusCode, 200);
    assert.equal(trafficLeaderList.payload[0].can_delete, 1);
    const otherLeaderList = dispatch({ user: users.otherLeader });
    assert.equal(otherLeaderList.statusCode, 200);
    assert.equal(otherLeaderList.payload[0].can_delete, 0);

    db.prepare('UPDATE documents SET content_text = ? WHERE id = ?').run('文档全文命中词', documentId);
    const searched = dispatch({ query: { search: '全文命中词' }, user: users.editor });
    assert.equal(searched.statusCode, 200);
    assert.deepEqual(searched.payload.map(record => record.id), [mediaId]);
    assert.equal(searched.payload[0].can_edit, 1);
    assert.equal(searched.payload[0].can_delete, 0);

    const endpointSearched = dispatch({ query: { search: 'iOS-000124' }, user: users.editor });
    assert.equal(endpointSearched.statusCode, 200);
    assert.deepEqual(endpointSearched.payload.map(record => record.id), [mediaId]);

    const filtered = dispatch({
      query: { category: 'news', budget_types: 'h5,alipay_mini', integration_progress: 'testing' },
      user: users.editor,
    });
    assert.equal(filtered.payload.length, 1);

    const updated = dispatch({
      method: 'PUT',
      path: '/:id',
      params: { id: String(mediaId) },
      body: input({
        cid: '123',
        media_name: '趣头条媒体',
        endpoint_description: '安卓-123/极速版-125',
        integration_progress: 'scaling',
      }),
      user: users.editor,
    });
    assert.equal(updated.statusCode, 200, JSON.stringify(updated.payload));
    assert.equal(updated.payload.integration_progress, 'scaling');
    assert.equal(updated.payload.endpoint_description, '安卓-123/极速版-125');
    assert.equal(db.prepare('SELECT title FROM documents WHERE id = ?').get(documentId).title, '趣头条媒体');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM document_edit_records').get().count, 1);

    const forbiddenDelete = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(mediaId) }, user: users.editor,
    });
    assert.equal(forbiddenDelete.statusCode, 403);
    const adminDelete = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(mediaId) }, user: users.admin,
    });
    assert.equal(adminDelete.statusCode, 403);
    const otherLeaderDelete = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(mediaId) }, user: users.otherLeader,
    });
    assert.equal(otherLeaderDelete.statusCode, 403);
    const trafficLeaderDelete = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(mediaId) }, user: users.trafficLeader,
    });
    assert.equal(trafficLeaderDelete.statusCode, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM media_assets').get().count, 0);
    assert.equal(db.prepare('SELECT is_deleted FROM documents WHERE id = ?').get(documentId).is_deleted, 1);

    const cxoTarget = dispatch({
      method: 'POST',
      body: input({ cid: '000124', media_name: 'CXO 删除验证' }),
    });
    assert.equal(cxoTarget.statusCode, 200, JSON.stringify(cxoTarget.payload));
    shareDocument.run(cxoTarget.payload.document_id, users.cxo.id);
    const cxoDelete = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(cxoTarget.payload.id) }, user: users.cxo,
    });
    assert.equal(cxoDelete.statusCode, 200);
  } finally {
    db.close();
  }
});
