const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createMediaManagementRouter } = require('./mediaManagement');

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

  const menuByUser = new Map([
    [2, ['/media-management']],
    [4, ['/media-management']],
    [5, ['/media-management']],
  ]);
  const modulePermsByUser = new Map([
    [5, [{ module: 'product_assets', can_read: 1, can_write: 0 }]],
  ]);
  const isAdmin = role => role === 'admin';
  const isShared = (documentId, userId) => Boolean(db.prepare(`
    SELECT 1 FROM document_shares
    WHERE document_id = ? AND target_type = 'user' AND target_id = ?
  `).get(documentId, userId));
  const canEditDocument = (user, document) => Boolean(
    user && document && !['readonly', 'guest'].includes(user.role)
      && (isAdmin(user.role) || Number(document.created_by) === Number(user.id) || isShared(document.id, user.id))
  );
  const canManageDocument = (user, document) => Boolean(
    user && document && (isAdmin(user.role) || Number(document.created_by) === Number(user.id))
  );
  const getVisibleDocument = (id, user) => {
    const document = db.prepare('SELECT * FROM documents WHERE id = ? AND COALESCE(is_deleted, 0) = 0').get(id);
    if (!document) return null;
    return isAdmin(user.role) || Number(document.created_by) === Number(user.id) || isShared(document.id, user.id)
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
    buildDocumentVisibilityFilter: (user, alias) => {
      if (isAdmin(user.role)) return { sql: '', params: [] };
      return {
        sql: ` AND (${alias}.created_by = ? OR EXISTS (
          SELECT 1 FROM document_shares ds
          WHERE ds.document_id = ${alias}.id AND ds.target_type = 'user' AND ds.target_id = ?
        ))`,
        params: [user.id, user.id],
      };
    },
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
    getCreatedDocumentInput: () => createdDocumentInput,
  };
}

function input(overrides = {}) {
  return {
    cid: '000123',
    media_name: '趣头条',
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
  const { db, dispatch, users, getCreatedDocumentInput } = createHarness();
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
    assert.equal(created.payload.can_delete, 1);
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

    db.prepare('UPDATE documents SET content_text = ? WHERE id = ?').run('文档全文命中词', documentId);
    const searched = dispatch({ query: { search: '全文命中词' }, user: users.editor });
    assert.equal(searched.statusCode, 200);
    assert.deepEqual(searched.payload.map(record => record.id), [mediaId]);
    assert.equal(searched.payload[0].can_edit, 1);
    assert.equal(searched.payload[0].can_delete, 0);

    const filtered = dispatch({
      query: { category: 'news', budget_types: 'h5,alipay_mini', integration_progress: 'testing' },
      user: users.editor,
    });
    assert.equal(filtered.payload.length, 1);

    const updated = dispatch({
      method: 'PUT',
      path: '/:id',
      params: { id: String(mediaId) },
      body: input({ cid: '123', media_name: '趣头条媒体', integration_progress: 'scaling' }),
      user: users.editor,
    });
    assert.equal(updated.statusCode, 200, JSON.stringify(updated.payload));
    assert.equal(updated.payload.integration_progress, 'scaling');
    assert.equal(db.prepare('SELECT title FROM documents WHERE id = ?').get(documentId).title, '趣头条媒体');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM document_edit_records').get().count, 1);

    const forbiddenDelete = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(mediaId) }, user: users.editor,
    });
    assert.equal(forbiddenDelete.statusCode, 403);
    const deleted = dispatch({
      method: 'DELETE', path: '/:id', params: { id: String(mediaId) }, user: users.admin,
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM media_assets').get().count, 0);
    assert.equal(db.prepare('SELECT is_deleted FROM documents WHERE id = ?').get(documentId).is_deleted, 1);
  } finally {
    db.close();
  }
});
