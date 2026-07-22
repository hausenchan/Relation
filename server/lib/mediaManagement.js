const express = require('express');

const MEDIA_MENU_KEY = '/media-management';
const MEDIA_DOCUMENT_DIRECTORY = Object.freeze({
  domain: 'domestic_project',
  projectCode: 'DOMESTIC',
  departmentKey: 'OPS',
  docType: 'IMP',
  folders: Object.freeze([
    Object.freeze({ name: '产运', docType: 'PLAN', sortOrder: 10 }),
    Object.freeze({ name: '落地', docType: 'IMP', sortOrder: 20 }),
    Object.freeze({ name: 'YYZ', docType: 'IMP', sortOrder: 10 }),
    Object.freeze({ name: '媒体对接', docType: 'IMP', sortOrder: 10 }),
  ]),
});

const MEDIA_ENUMS = Object.freeze({
  importance: ['key', 'medium', 'general'],
  category: [
    'ecommerce', 'tool', 'news', 'audio_video', 'travel_service', 'rebate',
    'life_service', 'online_earning', 'novel', 'campus', 'game',
    'alipay_mini_program', 'other',
  ],
  yyz_version: ['alipay_h5', 'api_h5_callback', 'cpd_api', 'sdk_data_ui', 'sdk_data', 'sdk_ui'],
  display_style: ['single_budget', 'flat', 'yyz_aggregate', 'yyz_aggregate_single_budget', 'yyz_aggregate_flat'],
  budget_types: ['h5', 'weixin_mini', 'alipay_mini', 'taobao_mini', 'wish_star', 'cpa_standard', 'cpa_reactivation', 'cpa_weixin_mini', 'self_app'],
  integration_progress: ['pending', 'integrating', 'testing', 'shelved', 'scaling', 'no_volume', 'offline'],
  porn_api_status: ['yes', 'informed_not_integrating', 'communicated_pending'],
});

const MEDIA_ENUM_LABELS = Object.freeze({
  importance: { key: '重点', medium: '中等', general: '一般' },
  category: {
    ecommerce: '电商', tool: '工具', news: '资讯', audio_video: '音视频', travel_service: '出行服务',
    rebate: '返利', life_service: '生活服务', online_earning: '网赚', novel: '小说', campus: '校园',
    game: '游戏', alipay_mini_program: '支付宝小程序', other: '其他',
  },
  yyz_version: {
    alipay_h5: '支付宝H5', api_h5_callback: 'API（H5+回调）', cpd_api: 'CPD-API',
    sdk_data_ui: 'SDK-数据版+UI版', sdk_data: 'SDK-数据版', sdk_ui: 'SDK-UI版',
  },
  display_style: {
    single_budget: '单预算独立', flat: '平铺', yyz_aggregate: 'YYZ聚合',
    yyz_aggregate_single_budget: 'YYZ聚合-单预算独立', yyz_aggregate_flat: 'YYZ聚合-平铺',
  },
  budget_types: {
    h5: 'H5', weixin_mini: '微小', alipay_mini: '支小', taobao_mini: '淘小', wish_star: '许愿星',
    cpa_standard: 'CPA-普通', cpa_reactivation: 'CPA-拉新拉活', cpa_weixin_mini: 'CPA-微小', self_app: '自研APP',
  },
  integration_progress: {
    pending: '待对接', integrating: '对接中', testing: '测试中', shelved: '搁浅',
    scaling: '跑量中', no_volume: '无量', offline: '下线',
  },
  porn_api_status: {
    yes: '是', informed_not_integrating: '已告知但暂不对接', communicated_pending: '已沟通待反馈',
  },
});

const ENCRYPTED_MEDIA_FIELDS = [
  'media_name',
  'domain_name',
  'version_number',
  'latest_features',
  'uv_scale',
  'sdk_ui_appid',
  'task_config_requirements',
  'special_entry_info',
  'other_notes',
];

const MEDIA_TEXT_LIMITS = Object.freeze({
  media_name: 120,
  domain_name: 255,
  version_number: 80,
  latest_features: 5000,
  uv_scale: 120,
  sdk_ui_appid: 32,
  task_config_requirements: 20000,
  special_entry_info: 20000,
  other_notes: 20000,
});

const MEDIA_CID_MAX_LENGTH = 20;

function mediaError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeOptionalText(value, field) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const max = MEDIA_TEXT_LIMITS[field] || 255;
  if (text.length > max) throw mediaError(400, `${field} 不能超过 ${max} 个字符`);
  return text;
}

function normalizeDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw mediaError(400, `${field} 必须是 YYYY-MM-DD 日期格式`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    throw mediaError(400, `${field} 不是有效日期`);
  }
  return text;
}

function normalizeEnum(value, field, { required = false, fallback = null } = {}) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) {
    if (required && !fallback) throw mediaError(400, `${field} 必填`);
    return fallback;
  }
  if (!MEDIA_ENUMS[field]?.includes(text)) throw mediaError(400, `${field} 枚举值不合法`);
  return text;
}

function normalizeBudgetTypes(value) {
  const source = Array.isArray(value)
    ? value
    : (typeof value === 'string' && value.trim() ? value.split(',') : []);
  const result = [...new Set(source.map(item => String(item || '').trim()).filter(Boolean))];
  if (result.some(item => !MEDIA_ENUMS.budget_types.includes(item))) {
    throw mediaError(400, 'budget_types 包含不合法的枚举值');
  }
  return result;
}

function normalizeMediaInput(input = {}) {
  const cid = String(input.cid ?? '').trim();
  if (!new RegExp(`^\\d{1,${MEDIA_CID_MAX_LENGTH}}$`).test(cid)) {
    throw mediaError(400, `cid 必须是 1-${MEDIA_CID_MAX_LENGTH} 位数字`);
  }
  const mediaName = normalizeOptionalText(input.media_name, 'media_name');
  if (!mediaName) throw mediaError(400, '媒体必填');
  const ownerId = input.owner_id === undefined || input.owner_id === null || input.owner_id === ''
    ? null
    : Number(input.owner_id);
  if (ownerId !== null && (!Number.isInteger(ownerId) || ownerId <= 0)) {
    throw mediaError(400, '负责人不合法');
  }

  return {
    cid,
    media_name: mediaName,
    importance: normalizeEnum(input.importance, 'importance', { required: true, fallback: 'general' }),
    category: normalizeEnum(input.category, 'category', { required: true }),
    yyz_version: normalizeEnum(input.yyz_version, 'yyz_version', { required: true }),
    domain_name: normalizeOptionalText(input.domain_name, 'domain_name'),
    version_number: normalizeOptionalText(input.version_number, 'version_number'),
    latest_release_date: normalizeDate(input.latest_release_date, 'latest_release_date'),
    latest_features: normalizeOptionalText(input.latest_features, 'latest_features'),
    display_style: normalizeEnum(input.display_style, 'display_style', { required: true }),
    budget_types: normalizeBudgetTypes(input.budget_types),
    uv_scale: normalizeOptionalText(input.uv_scale, 'uv_scale'),
    integration_progress: normalizeEnum(input.integration_progress, 'integration_progress', { required: true, fallback: 'pending' }),
    owner_id: ownerId,
    launch_date: normalizeDate(input.launch_date, 'launch_date'),
    porn_api_status: normalizeEnum(input.porn_api_status, 'porn_api_status'),
    sdk_ui_appid: normalizeOptionalText(input.sdk_ui_appid, 'sdk_ui_appid'),
    task_config_requirements: normalizeOptionalText(input.task_config_requirements, 'task_config_requirements'),
    special_entry_info: normalizeOptionalText(input.special_entry_info, 'special_entry_info'),
    other_notes: normalizeOptionalText(input.other_notes, 'other_notes'),
  };
}

function parseBudgetTypes(value) {
  if (Array.isArray(value)) return normalizeBudgetTypes(value);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? normalizeBudgetTypes(parsed) : [];
  } catch {
    return normalizeBudgetTypes(value);
  }
}

function getMediaDocumentYear(document = {}) {
  const year = String(document.created_at || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

function formatMediaDocumentNo(globalSeq, year) {
  return [
    `D${String(globalSeq).padStart(6, '0')}`,
    MEDIA_DOCUMENT_DIRECTORY.projectCode,
    MEDIA_DOCUMENT_DIRECTORY.departmentKey,
    MEDIA_DOCUMENT_DIRECTORY.docType,
    String(year || new Date().getFullYear()),
  ].join('-');
}

function findMediaDocumentFolder(db, parentId, name) {
  if (parentId) {
    return db.prepare(`
      SELECT * FROM document_folders
      WHERE parent_id = ? AND name = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(Number(parentId), name);
  }
  return db.prepare(`
    SELECT * FROM document_folders
    WHERE parent_id IS NULL AND name = ? AND domain = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(name, MEDIA_DOCUMENT_DIRECTORY.domain);
}

function ensureMediaDocumentFolder(db, parentId, definition, createdBy) {
  const existing = findMediaDocumentFolder(db, parentId, definition.name);
  if (existing) {
    const metadataChanged = String(existing.domain || '') !== MEDIA_DOCUMENT_DIRECTORY.domain
      || Number(existing.project_group_id || 0) !== 0
      || String(existing.department_key || '') !== MEDIA_DOCUMENT_DIRECTORY.departmentKey
      || String(existing.default_doc_type || '') !== definition.docType;
    if (metadataChanged) {
      db.prepare(`
        UPDATE document_folders SET
          domain = ?, project_group_id = NULL, department_key = ?, default_doc_type = ?
        WHERE id = ?
      `).run(
        MEDIA_DOCUMENT_DIRECTORY.domain,
        MEDIA_DOCUMENT_DIRECTORY.departmentKey,
        definition.docType,
        existing.id,
      );
    }
    return Number(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO document_folders (
      name, parent_id, domain, project_group_id, department_key,
      default_doc_type, sort_order, created_by
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
  `).run(
    definition.name,
    parentId || null,
    MEDIA_DOCUMENT_DIRECTORY.domain,
    MEDIA_DOCUMENT_DIRECTORY.departmentKey,
    definition.docType,
    definition.sortOrder,
    Number(createdBy) || 1,
  );
  return Number(result.lastInsertRowid);
}

function ensureMediaDocumentPlacement(db, { createdBy = 1 } = {}) {
  const ensure = db.transaction(() => {
    let folderId = null;
    MEDIA_DOCUMENT_DIRECTORY.folders.forEach(definition => {
      folderId = ensureMediaDocumentFolder(db, folderId, definition, createdBy);
    });

    const documentDefaults = {
      folder_id: folderId,
      domain: MEDIA_DOCUMENT_DIRECTORY.domain,
      project_group_id: null,
      project_code: MEDIA_DOCUMENT_DIRECTORY.projectCode,
      department_key: MEDIA_DOCUMENT_DIRECTORY.departmentKey,
      doc_type: MEDIA_DOCUMENT_DIRECTORY.docType,
      icon_key: null,
    };
    const documents = db.prepare(`
      SELECT d.id, d.global_seq, d.created_at, d.folder_id, d.domain,
        d.project_group_id, d.project_code, d.department_key, d.doc_type,
        d.document_no, d.icon_key
      FROM documents d
      INNER JOIN media_assets m ON m.document_id = d.id
      WHERE COALESCE(d.is_deleted, 0) = 0
    `).all();
    const pending = documents.map(document => ({
      ...document,
      expectedDocumentNo: formatMediaDocumentNo(document.global_seq, getMediaDocumentYear(document)),
    })).filter(document => (
      Number(document.folder_id || 0) !== Number(folderId)
      || String(document.domain || '') !== MEDIA_DOCUMENT_DIRECTORY.domain
      || Number(document.project_group_id || 0) !== 0
      || String(document.project_code || '') !== MEDIA_DOCUMENT_DIRECTORY.projectCode
      || String(document.department_key || '') !== MEDIA_DOCUMENT_DIRECTORY.departmentKey
      || String(document.doc_type || '') !== MEDIA_DOCUMENT_DIRECTORY.docType
      || String(document.document_no || '') !== document.expectedDocumentNo
      || Boolean(String(document.icon_key || '').trim())
    ));
    const updateDocument = db.prepare(`
      UPDATE documents SET
        folder_id = ?, domain = ?, project_group_id = NULL, project_code = ?,
        department_key = ?, doc_type = ?, document_no = ?, icon_key = NULL
      WHERE id = ?
    `);
    pending.forEach(document => updateDocument.run(
      folderId,
      MEDIA_DOCUMENT_DIRECTORY.domain,
      MEDIA_DOCUMENT_DIRECTORY.projectCode,
      MEDIA_DOCUMENT_DIRECTORY.departmentKey,
      MEDIA_DOCUMENT_DIRECTORY.docType,
      document.expectedDocumentNo,
      document.id,
    ));

    return {
      document_defaults: documentDefaults,
      documents_scanned: documents.length,
      documents_updated: pending.length,
    };
  });
  return ensure();
}

function ensureMediaManagementSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cid TEXT NOT NULL,
      media_name TEXT NOT NULL,
      importance TEXT NOT NULL DEFAULT 'general',
      category TEXT NOT NULL,
      yyz_version TEXT NOT NULL,
      domain_name TEXT,
      version_number TEXT,
      latest_release_date DATE,
      latest_features TEXT,
      display_style TEXT NOT NULL,
      budget_types TEXT,
      uv_scale TEXT,
      integration_progress TEXT NOT NULL DEFAULT 'pending',
      owner_id INTEGER,
      launch_date DATE,
      porn_api_status TEXT,
      sdk_ui_appid TEXT,
      task_config_requirements TEXT,
      special_entry_info TEXT,
      other_notes TEXT,
      document_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      updated_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cid),
      UNIQUE(document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_assets_importance ON media_assets(importance);
    CREATE INDEX IF NOT EXISTS idx_media_assets_category ON media_assets(category);
    CREATE INDEX IF NOT EXISTS idx_media_assets_yyz_version ON media_assets(yyz_version);
    CREATE INDEX IF NOT EXISTS idx_media_assets_display_style ON media_assets(display_style);
    CREATE INDEX IF NOT EXISTS idx_media_assets_progress ON media_assets(integration_progress);
    CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_media_assets_document ON media_assets(document_id);
    CREATE INDEX IF NOT EXISTS idx_media_assets_release_date ON media_assets(latest_release_date);
    CREATE INDEX IF NOT EXISTS idx_media_assets_launch_date ON media_assets(launch_date);
  `);
}

function enumLabel(field, value) {
  return MEDIA_ENUM_LABELS[field]?.[value] || value || '';
}

function resolveMediaDocumentTitle(document, requestedTitle) {
  if (
    Number(document?.media_asset_id || 0) > 0
    || String(document?.doc_type || '').toUpperCase() === 'MEDIA'
  ) return document.title;
  return requestedTitle || document?.title || '未命名文档';
}

function deleteMediaAssetByDocumentId(db, documentId) {
  return db.prepare('DELETE FROM media_assets WHERE document_id = ?').run(Number(documentId));
}

function createMediaManagementRouter(deps) {
  const {
    db,
    canWrite,
    isAdmin,
    getUserMenuPerms,
    getUserModulePerms,
    buildDocumentVisibilityFilter,
    getVisibleDocument,
    canEditDocument,
    canManageDocument,
    createDocumentRecord,
    getDefaultDocumentShares,
    addDocumentShares,
    insertDocumentEditRecord,
    encryptRow,
    decryptRow,
    prepareMediaDocumentPlacement,
  } = deps;
  ensureMediaManagementSchema(db);
  const preparedPlacement = typeof prepareMediaDocumentPlacement === 'function'
    ? prepareMediaDocumentPlacement()
    : null;
  const mediaDocumentDefaults = {
    domain: MEDIA_DOCUMENT_DIRECTORY.domain,
    project_group_id: null,
    project_code: MEDIA_DOCUMENT_DIRECTORY.projectCode,
    department_key: MEDIA_DOCUMENT_DIRECTORY.departmentKey,
    doc_type: MEDIA_DOCUMENT_DIRECTORY.docType,
    icon_key: null,
    ...(preparedPlacement?.document_defaults || {}),
  };
  const router = express.Router();

  const hasProductAssetModuleAccess = (user) => {
    if (!user) return false;
    if (isAdmin(user.role) || isAdmin(user.executive_role)) return true;
    if (['member', 'readonly', 'leader', 'sales_director'].includes(user.role)) return true;
    if (user.role !== 'guest') return false;
    return getUserModulePerms(user.id).some(permission => (
      permission.module === 'product_assets' && Number(permission.can_read) === 1
    ));
  };

  const hasMenuAccess = (user) => Boolean(user && (
    isAdmin(user.role)
    || isAdmin(user.executive_role)
    || (
      getUserMenuPerms(user.id).includes(MEDIA_MENU_KEY)
      && hasProductAssetModuleAccess(user)
    )
  ));

  router.use((req, res, next) => {
    if (!hasMenuAccess(req.user)) return res.status(403).json({ error: '无媒体管理菜单权限' });
    return next();
  });

  const validateOwner = (ownerId) => {
    if (!ownerId) return;
    const owner = db.prepare(`
      SELECT id FROM users
      WHERE id = ? AND COALESCE(account_status, 'active') = 'active'
    `).get(ownerId);
    if (!owner) throw mediaError(400, '负责人不存在或已停用');
  };

  const getVisibleMediaRow = (id, user) => {
    const visibility = buildDocumentVisibilityFilter(user, 'd');
    return db.prepare(`
      SELECT m.*, u.display_name AS owner_name, u.username AS owner_username,
        d.created_by AS document_created_by, d.content_text AS document_content_text,
        d.updated_at AS document_updated_at
      FROM media_assets m
      INNER JOIN documents d ON d.id = m.document_id AND COALESCE(d.is_deleted, 0) = 0
      LEFT JOIN users u ON u.id = m.owner_id
      WHERE m.id = ?
      ${visibility.sql}
    `).get(Number(id), ...visibility.params);
  };

  const serializeMedia = (row, user) => {
    if (!row) return null;
    const decrypted = decryptRow('media_assets', row);
    const document = {
      id: Number(decrypted.document_id),
      created_by: Number(decrypted.document_created_by),
    };
    const {
      document_created_by,
      document_content_text,
      ...record
    } = decrypted;
    return {
      ...record,
      id: Number(record.id),
      document_id: Number(record.document_id),
      owner_id: record.owner_id ? Number(record.owner_id) : null,
      budget_types: parseBudgetTypes(record.budget_types),
      can_edit: canEditDocument(user, document) ? 1 : 0,
      can_delete: canManageDocument(user, document) ? 1 : 0,
    };
  };

  const mediaMatchesSearch = (row, search) => {
    const keyword = String(search || '').trim().toLocaleLowerCase('zh-CN');
    if (!keyword) return true;
    const record = decryptRow('media_assets', row);
    const budgets = parseBudgetTypes(record.budget_types);
    const values = [
      record.cid,
      ...ENCRYPTED_MEDIA_FIELDS.map(field => record[field]),
      enumLabel('importance', record.importance),
      enumLabel('category', record.category),
      enumLabel('yyz_version', record.yyz_version),
      enumLabel('display_style', record.display_style),
      ...budgets.map(value => enumLabel('budget_types', value)),
      enumLabel('integration_progress', record.integration_progress),
      enumLabel('porn_api_status', record.porn_api_status),
      record.latest_release_date,
      record.launch_date,
      record.owner_name,
      record.owner_username,
      record.document_content_text,
    ];
    return values.some(value => String(value || '').toLocaleLowerCase('zh-CN').includes(keyword));
  };

  const respondError = (res, error, fallback) => {
    const message = String(error?.message || '');
    if (/UNIQUE|Duplicate entry|ER_DUP_ENTRY/i.test(message)) {
      return res.status(409).json({ error: 'CID 已存在，请更换后重试' });
    }
    return res.status(error?.statusCode || 500).json({ error: error?.message || fallback });
  };

  router.get('/', (req, res) => {
    try {
      const visibility = buildDocumentVisibilityFilter(req.user, 'd');
      let sql = `
        SELECT m.*, u.display_name AS owner_name, u.username AS owner_username,
          d.created_by AS document_created_by, d.content_text AS document_content_text,
          d.updated_at AS document_updated_at
        FROM media_assets m
        INNER JOIN documents d ON d.id = m.document_id AND COALESCE(d.is_deleted, 0) = 0
        LEFT JOIN users u ON u.id = m.owner_id
        WHERE 1=1
        ${visibility.sql}
      `;
      const params = [...visibility.params];
      const exactFilters = [
        'importance', 'category', 'yyz_version', 'display_style',
        'integration_progress', 'porn_api_status',
      ];
      exactFilters.forEach(field => {
        const value = String(req.query[field] || '').trim();
        if (!value) return;
        sql += ` AND m.${field} = ?`;
        params.push(value);
      });
      const ownerId = Number(req.query.owner_id);
      if (ownerId) {
        sql += ' AND m.owner_id = ?';
        params.push(ownerId);
      }
      if (req.query.latest_release_from) {
        sql += ' AND m.latest_release_date >= ?';
        params.push(String(req.query.latest_release_from));
      }
      if (req.query.latest_release_to) {
        sql += ' AND m.latest_release_date <= ?';
        params.push(String(req.query.latest_release_to));
      }
      if (req.query.launch_from) {
        sql += ' AND m.launch_date >= ?';
        params.push(String(req.query.launch_from));
      }
      if (req.query.launch_to) {
        sql += ' AND m.launch_date <= ?';
        params.push(String(req.query.launch_to));
      }
      sql += ' ORDER BY m.updated_at DESC, m.id DESC';
      const requiredBudgets = normalizeBudgetTypes(req.query.budget_types);
      const rows = db.prepare(sql).all(...params)
        .filter(row => !requiredBudgets.length || requiredBudgets.every(value => parseBudgetTypes(row.budget_types).includes(value)))
        .filter(row => mediaMatchesSearch(row, req.query.search));
      return res.json(rows.map(row => serializeMedia(row, req.user)));
    } catch (error) {
      return respondError(res, error, '加载媒体列表失败');
    }
  });

  router.get('/:id', (req, res) => {
    const row = getVisibleMediaRow(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: '媒体不存在或无权限访问' });
    return res.json(serializeMedia(row, req.user));
  });

  router.post('/', canWrite, (req, res) => {
    let documentId = null;
    try {
      const input = normalizeMediaInput(req.body || {});
      validateOwner(input.owner_id);
      const existing = db.prepare('SELECT id FROM media_assets WHERE cid = ?').get(input.cid);
      if (existing) throw mediaError(409, 'CID 已存在，请更换后重试');
      const shares = [...getDefaultDocumentShares()];
      if (input.owner_id) shares.push({ target_type: 'user', target_id: input.owner_id });
      documentId = Number(createDocumentRecord({
        ...mediaDocumentDefaults,
        title: input.media_name,
        content: { blocks: [] },
        content_text: '',
        icon_key: null,
        tags: ['媒体管理', input.cid],
        shares,
      }, req.user));
      const encrypted = encryptRow('media_assets', input);
      const result = db.prepare(`
        INSERT INTO media_assets (
          cid, media_name, importance, category, yyz_version, domain_name, version_number,
          latest_release_date, latest_features, display_style, budget_types, uv_scale,
          integration_progress, owner_id, launch_date, porn_api_status, sdk_ui_appid,
          task_config_requirements, special_entry_info, other_notes, document_id,
          created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        encrypted.cid,
        encrypted.media_name,
        encrypted.importance,
        encrypted.category,
        encrypted.yyz_version,
        encrypted.domain_name,
        encrypted.version_number,
        encrypted.latest_release_date,
        encrypted.latest_features,
        encrypted.display_style,
        JSON.stringify(input.budget_types),
        encrypted.uv_scale,
        encrypted.integration_progress,
        encrypted.owner_id,
        encrypted.launch_date,
        encrypted.porn_api_status,
        encrypted.sdk_ui_appid,
        encrypted.task_config_requirements,
        encrypted.special_entry_info,
        encrypted.other_notes,
        documentId,
        req.user.id,
        req.user.id,
      );
      return res.json(serializeMedia(getVisibleMediaRow(result.lastInsertRowid, req.user), req.user));
    } catch (error) {
      if (documentId) {
        db.prepare('UPDATE documents SET is_deleted = 1 WHERE id = ?').run(documentId);
      }
      return respondError(res, error, '创建媒体失败');
    }
  });

  router.put('/:id', canWrite, (req, res) => {
    try {
      const row = getVisibleMediaRow(req.params.id, req.user);
      if (!row) return res.status(404).json({ error: '媒体不存在或无权限访问' });
      const document = getVisibleDocument(row.document_id, req.user);
      if (!document || !canEditDocument(req.user, document)) {
        return res.status(403).json({ error: '无权编辑该媒体' });
      }
      const existing = decryptRow('media_assets', row);
      const input = normalizeMediaInput({
        ...existing,
        budget_types: parseBudgetTypes(existing.budget_types),
        ...(req.body || {}),
      });
      validateOwner(input.owner_id);
      const duplicate = db.prepare('SELECT id FROM media_assets WHERE cid = ? AND id <> ?')
        .get(input.cid, Number(row.id));
      if (duplicate) throw mediaError(409, 'CID 已存在，请更换后重试');
      const encrypted = encryptRow('media_assets', input);
      const updatedAt = new Date().toISOString();
      const update = db.transaction(() => {
        db.prepare(`
          UPDATE media_assets SET
            cid = ?, media_name = ?, importance = ?, category = ?, yyz_version = ?,
            domain_name = ?, version_number = ?, latest_release_date = ?, latest_features = ?,
            display_style = ?, budget_types = ?, uv_scale = ?, integration_progress = ?,
            owner_id = ?, launch_date = ?, porn_api_status = ?, sdk_ui_appid = ?,
            task_config_requirements = ?, special_entry_info = ?, other_notes = ?,
            updated_by = ?, updated_at = ?
          WHERE id = ?
        `).run(
          encrypted.cid,
          encrypted.media_name,
          encrypted.importance,
          encrypted.category,
          encrypted.yyz_version,
          encrypted.domain_name,
          encrypted.version_number,
          encrypted.latest_release_date,
          encrypted.latest_features,
          encrypted.display_style,
          JSON.stringify(input.budget_types),
          encrypted.uv_scale,
          encrypted.integration_progress,
          encrypted.owner_id,
          encrypted.launch_date,
          encrypted.porn_api_status,
          encrypted.sdk_ui_appid,
          encrypted.task_config_requirements,
          encrypted.special_entry_info,
          encrypted.other_notes,
          req.user.id,
          updatedAt,
          Number(row.id),
        );
        if (document.title !== input.media_name) {
          const beforeSnapshot = {
            title: document.title,
            content: document.content,
            content_text: document.content_text,
          };
          const afterSnapshot = { ...beforeSnapshot, title: input.media_name };
          db.prepare(`
            UPDATE documents SET title = ?, updated_by = ?, updated_at = ? WHERE id = ?
          `).run(input.media_name, req.user.id, updatedAt, document.id);
          insertDocumentEditRecord(document.id, req.user.id, 'page_update', beforeSnapshot, afterSnapshot);
        }
        if (input.owner_id) {
          addDocumentShares(document.id, [{ target_type: 'user', target_id: input.owner_id }], req.user.id);
        }
      });
      update();
      return res.json(serializeMedia(getVisibleMediaRow(row.id, req.user), req.user));
    } catch (error) {
      return respondError(res, error, '更新媒体失败');
    }
  });

  router.delete('/:id', canWrite, (req, res) => {
    try {
      const row = getVisibleMediaRow(req.params.id, req.user);
      if (!row) return res.status(404).json({ error: '媒体不存在或无权限访问' });
      const document = getVisibleDocument(row.document_id, req.user);
      if (!document || !canManageDocument(req.user, document)) {
        return res.status(403).json({ error: '只有创建人或管理员可以删除媒体' });
      }
      const remove = db.transaction(() => {
        db.prepare('DELETE FROM media_assets WHERE id = ?').run(Number(row.id));
        db.prepare(`
          UPDATE documents SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?
        `).run(req.user.id, new Date().toISOString(), document.id);
      });
      remove();
      return res.json({ success: true });
    } catch (error) {
      return respondError(res, error, '删除媒体失败');
    }
  });

  return router;
}

module.exports = {
  MEDIA_ENUM_LABELS,
  MEDIA_ENUMS,
  MEDIA_MENU_KEY,
  createMediaManagementRouter,
  deleteMediaAssetByDocumentId,
  ensureMediaDocumentPlacement,
  ensureMediaManagementSchema,
  formatMediaDocumentNo,
  MEDIA_DOCUMENT_DIRECTORY,
  normalizeMediaInput,
  parseBudgetTypes,
  resolveMediaDocumentTitle,
};
