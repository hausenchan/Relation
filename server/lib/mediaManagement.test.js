const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const RelationDatabase = require('./database');
const {
  ensureMediaManagementSchema,
  ensureMediaDocumentPlacement,
  deleteMediaAssetByDocumentId,
  formatMediaDocumentNo,
  normalizeMediaInput,
  parseBudgetTypes,
  resolveMediaDocumentTitle,
} = require('./mediaManagement');

function validInput(overrides = {}) {
  return {
    cid: '00000000000000001234',
    media_name: '趣头条',
    importance: 'key',
    category: 'news',
    yyz_version: 'sdk_data_ui',
    display_style: 'yyz_aggregate_flat',
    budget_types: ['alipay_mini', 'h5'],
    integration_progress: 'testing',
    latest_release_date: '2026-07-21',
    launch_date: '2026-07-01',
    porn_api_status: '',
    sdk_ui_appid: 'sdk-ui-appid',
    ...overrides,
  };
}

test('normalizes media input while preserving a twenty-digit CID and optional values', () => {
  const result = normalizeMediaInput(validInput({ budget_types: ['h5', 'h5', 'self_app'] }));

  assert.equal(result.cid, '00000000000000001234');
  assert.equal(result.media_name, '趣头条');
  assert.deepEqual(result.budget_types, ['h5', 'self_app']);
  assert.equal(result.porn_api_status, null);
  assert.equal(result.owner_id, null);
});

test('rejects invalid CID, enum, date, budget, and APPID values', () => {
  assert.throws(() => normalizeMediaInput(validInput({ cid: '123456789012345678901' })), /1-20 位数字/);
  assert.throws(() => normalizeMediaInput(validInput({ cid: '12A' })), /1-20 位数字/);
  assert.throws(() => normalizeMediaInput(validInput({ category: 'video' })), /枚举值不合法/);
  assert.throws(() => normalizeMediaInput(validInput({ latest_release_date: '2026-02-30' })), /不是有效日期/);
  assert.throws(() => normalizeMediaInput(validInput({ budget_types: ['unknown'] })), /不合法/);
  assert.throws(() => normalizeMediaInput(validInput({ sdk_ui_appid: 'a'.repeat(33) })), /32 个字符/);
});

test('parses JSON and comma-separated budget values', () => {
  assert.deepEqual(parseBudgetTypes('["h5","alipay_mini"]'), ['h5', 'alipay_mini']);
  assert.deepEqual(parseBudgetTypes('h5,self_app'), ['h5', 'self_app']);
});

test('creates the media schema and its document relationship columns on SQLite', () => {
  const db = new Database(':memory:');
  try {
    ensureMediaManagementSchema(db);
    const columns = db.prepare('PRAGMA table_info(media_assets)').all().map(column => column.name);
    assert.ok(columns.includes('cid'));
    assert.ok(columns.includes('budget_types'));
    assert.ok(columns.includes('document_id'));
    assert.ok(columns.includes('task_config_requirements'));
    const indexes = db.prepare("PRAGMA index_list('media_assets')").all().map(index => index.name);
    assert.ok(indexes.includes('idx_media_assets_progress'));
  } finally {
    db.close();
  }
});

test('keeps the media name as the linked document title and removes the link on document deletion', () => {
  assert.equal(resolveMediaDocumentTitle({ doc_type: 'MEDIA', title: '趣头条' }, '其他标题'), '趣头条');
  assert.equal(resolveMediaDocumentTitle({ doc_type: 'IMP', media_asset_id: 8, title: '趣头条' }, '其他标题'), '趣头条');
  assert.equal(resolveMediaDocumentTitle({ doc_type: 'TMP', title: '原标题' }, '新标题'), '新标题');

  const db = new Database(':memory:');
  try {
    ensureMediaManagementSchema(db);
    db.prepare(`
      INSERT INTO media_assets (
        cid, media_name, importance, category, yyz_version, display_style,
        integration_progress, document_id, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('0001', '趣头条', 'key', 'news', 'sdk_ui', 'flat', 'testing', 99, 1, 1);
    deleteMediaAssetByDocumentId(db, 99);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM media_assets').get().count, 0);
  } finally {
    db.close();
  }
});

test('places existing and future media documents under the YYZ media folder with the default icon', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE document_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        domain TEXT,
        project_group_id INTEGER,
        department_key TEXT,
        default_doc_type TEXT,
        sort_order INTEGER DEFAULT 0,
        created_by INTEGER
      );
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        global_seq INTEGER NOT NULL,
        document_no TEXT NOT NULL UNIQUE,
        title TEXT,
        created_at TEXT,
        folder_id INTEGER,
        domain TEXT,
        project_group_id INTEGER,
        project_code TEXT,
        department_key TEXT,
        doc_type TEXT,
        icon_key TEXT,
        is_deleted INTEGER DEFAULT 0
      );
    `);
    ensureMediaManagementSchema(db);
    db.prepare(`
      INSERT INTO documents (
        id, global_seq, document_no, title, created_at, domain,
        project_code, department_key, doc_type, icon_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(7, 470, 'D000470-GEN-ALL-MEDIA-2026', '点淘-安卓', '2026-07-21 21:35:00', 'general', 'GEN', 'ALL', 'MEDIA', 'media');
    db.prepare(`
      INSERT INTO media_assets (
        cid, media_name, importance, category, yyz_version, display_style,
        integration_progress, document_id, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('100037', '点淘-安卓', 'key', 'ecommerce', 'api_h5_callback', 'flat', 'testing', 7, 1, 1);

    const placement = ensureMediaDocumentPlacement(db);
    assert.equal(placement.documents_scanned, 1);
    assert.equal(placement.documents_updated, 1);
    assert.equal(placement.document_defaults.icon_key, null);
    const mediaFolder = db.prepare('SELECT * FROM document_folders WHERE id = ?')
      .get(placement.document_defaults.folder_id);
    const yyzFolder = db.prepare('SELECT * FROM document_folders WHERE id = ?').get(mediaFolder.parent_id);
    const landingFolder = db.prepare('SELECT * FROM document_folders WHERE id = ?').get(yyzFolder.parent_id);
    const opsFolder = db.prepare('SELECT * FROM document_folders WHERE id = ?').get(landingFolder.parent_id);
    assert.deepEqual(
      [opsFolder.name, landingFolder.name, yyzFolder.name, mediaFolder.name],
      ['产运', '落地', 'YYZ', '媒体对接'],
    );
    const document = db.prepare('SELECT * FROM documents WHERE id = 7').get();
    assert.equal(document.folder_id, mediaFolder.id);
    assert.equal(document.domain, 'domestic_project');
    assert.equal(document.project_code, 'DOMESTIC');
    assert.equal(document.department_key, 'OPS');
    assert.equal(document.doc_type, 'IMP');
    assert.equal(document.document_no, 'D000470-DOMESTIC-OPS-IMP-2026');
    assert.equal(document.icon_key, null);
    assert.equal(formatMediaDocumentNo(470, 2026), document.document_no);

    const repeated = ensureMediaDocumentPlacement(db);
    assert.equal(repeated.documents_updated, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM document_folders').get().count, 4);
  } finally {
    db.close();
  }
});

test('translates media identifiers and encrypted text safely for MySQL', () => {
  const { columnDefinitionToMysql } = RelationDatabase.mysqlCompat;
  assert.match(
    columnDefinitionToMysql('cid TEXT NOT NULL', new Set(['cid']), 'media_assets'),
    /cid VARCHAR\(191\) NOT NULL/i,
  );
  assert.match(
    columnDefinitionToMysql('media_name TEXT NOT NULL', new Set(), 'media_assets'),
    /media_name LONGTEXT NOT NULL/i,
  );
});
