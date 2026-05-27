const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { encryptRow, decryptRow, decryptRows } = require('./lib/cryptoDao');
const { decrypt } = require('./lib/crypto');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function normalizeUploadedFilename(filename) {
  if (typeof filename !== 'string' || !filename) return filename;
  if (/[\u4e00-\u9fff]/.test(filename) || !/[\u0080-\u00ff]/.test(filename)) return filename;

  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  if (decoded && !decoded.includes('\uFFFD') && /[\u4e00-\u9fff]/.test(decoded)) {
    return decoded;
  }
  return filename;
}

function normalizeGenericAttachmentRow(row) {
  return row ? { ...row, filename: normalizeUploadedFilename(row.filename) } : row;
}

function normalizeSubjectAttachmentRow(row) {
  return row ? { ...row, file_name: normalizeUploadedFilename(row.file_name) } : row;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(normalizeUploadedFilename(file.originalname));
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|mp4|mov|avi|mp3|wav|m4a|aac|ogg)$/i;
    if (!allowed.test(normalizeUploadedFilename(file.originalname))) {
      cb(new Error('不支持的文件类型'));
      return;
    }
    cb(null, true);
  },
});

const PERSON_NAME_MAX_LENGTH = 30;

function normalizePersonName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPersonNameKey(value) {
  return normalizePersonName(value).toLowerCase();
}

function getThreeCharGivenNameKey(value) {
  const chars = Array.from(getPersonNameKey(value));
  return chars.length === 3 ? chars.slice(1).join('') : '';
}

function getPersonNameDuplicateReason(inputName, existingName) {
  const inputKey = getPersonNameKey(inputName);
  const existingKey = getPersonNameKey(existingName);
  if (!inputKey || !existingKey) return null;
  if (inputKey === existingKey) return 'same_full_name';

  const inputGivenName = getThreeCharGivenNameKey(inputKey);
  const existingGivenName = getThreeCharGivenNameKey(existingKey);
  if ((inputGivenName && inputGivenName === existingKey) || (existingGivenName && existingGivenName === inputKey)) {
    return 'same_given_name';
  }

  return null;
}

function normalizeCompanyNameForMatch(value) {
  return typeof value === 'string'
    ? value
      .trim()
      .toLowerCase()
      .replace(/[()\[\]（）【】「」『』·\s.,，。:：;；\-_/\\]/g, '')
    : '';
}

function getCompanyNameMatchKeys(value) {
  const full = normalizeCompanyNameForMatch(value);
  if (!full) return [];
  const suffixes = [
    '股份有限公司',
    '有限责任公司',
    '有限公司',
    '控股集团',
    '集团公司',
    '集团',
    '公司',
  ];
  const keys = new Set([full]);
  suffixes.forEach(suffix => {
    if (full.endsWith(suffix) && full.length > suffix.length) {
      keys.add(full.slice(0, -suffix.length));
    }
  });
  return [...keys].filter(key => key.length >= 2);
}

function getCompanyNameDuplicateReason(inputName, existingName) {
  const inputKeys = getCompanyNameMatchKeys(inputName);
  const existingKeys = getCompanyNameMatchKeys(existingName);
  if (inputKeys.length === 0 || existingKeys.length === 0) return null;
  if (inputKeys.some(inputKey => existingKeys.includes(inputKey))) return 'same_name';
  if (inputKeys.some(inputKey => existingKeys.some(existingKey => inputKey.includes(existingKey) || existingKey.includes(inputKey)))) {
    return 'keyword_contains';
  }
  return null;
}

function uploadAttachments(req, res, next) {
  upload.array('files', 10)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '单个文件不能超过 50MB' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: '最多只能上传 10 个文件' });
      }
      return res.status(400).json({ error: err.message || '附件上传失败' });
    }
    return res.status(400).json({ error: err.message || '附件上传失败' });
  });
}

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'relation-app-secret-2026';

const EXECUTIVE_ROLES = new Set(['ceo', 'coo', 'cto', 'cmo']);
const ADMIN_ROLES = new Set(['admin', ...EXECUTIVE_ROLES]);
const isAdmin = (role) => ADMIN_ROLES.has(role);
const hasTaskFullVisibility = (role, executiveRole) => isAdmin(role) || ADMIN_ROLES.has(executiveRole);
const isExecutiveIdentity = (user) => EXECUTIVE_ROLES.has(user?.role) || EXECUTIVE_ROLES.has(user?.executive_role);
const PRIVATE_PERSON_SCOPE = 'executive_private';
const COMPANY_PERSON_SCOPE = 'company';

// 腾讯地图 Key（地理编码用）
const TMAP_KEY = 'BFBBZ-CNXC4-XEWUR-KQN7R-QOUGJ-Q4B66';
let tencentServerGeocodeDisabled = false;
const POI_SUFFIX_PATTERN = /(大厦|广场|中心|园区|写字楼|酒店|公寓|大楼|商厦|商城|科技园|产业园|创业园|办公楼|商务楼|大院)/;
const KNOWN_POI_OVERRIDES = [
  {
    city: '北京',
    keywords: ['花园东路', '泰兴大厦'],
    lat: 39.980182,
    lng: 116.368351,
  },
];

function normalizeGeoText(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function firstCityFromValue(city) {
  return String(city || '').split(',')[0].trim();
}

function addressIncludesCity(address, city) {
  const normalizedAddress = normalizeGeoText(address);
  const normalizedCity = normalizeGeoText(city);
  if (!normalizedAddress || !normalizedCity) return false;
  const cityWithoutSuffix = normalizedCity.replace(/市$/, '');
  return normalizedAddress.includes(normalizedCity) ||
    (cityWithoutSuffix && normalizedAddress.includes(cityWithoutSuffix));
}

function buildGeocodeQuery(city, address) {
  const firstCity = firstCityFromValue(city);
  const cleanAddress = String(address || '').trim();
  if (cleanAddress) {
    return firstCity && !addressIncludesCity(cleanAddress, firstCity)
      ? `${firstCity}${cleanAddress}`
      : cleanAddress;
  }
  return firstCity;
}

function buildGeocodeKey(city, address) {
  return normalizeGeoText(buildGeocodeQuery(city, address));
}

function addressLooksLikePoi(address) {
  return POI_SUFFIX_PATTERN.test(normalizeGeoText(address));
}

function findKnownPoiOverride(city, address) {
  const firstCity = normalizeGeoText(firstCityFromValue(city)).replace(/市$/, '');
  const normalizedAddress = normalizeGeoText(address);
  return KNOWN_POI_OVERRIDES.find(item => {
    const itemCity = normalizeGeoText(item.city).replace(/市$/, '');
    return (!itemCity || itemCity === firstCity) &&
      item.keywords.every(keyword => normalizedAddress.includes(normalizeGeoText(keyword)));
  }) || null;
}

async function requestTencentGeocode(candidate) {
  if (tencentServerGeocodeDisabled) return null;
  const params = new URLSearchParams({
    address: candidate.address,
    key: TMAP_KEY,
    output: 'json',
  });
  if (candidate.region) {
    params.set('region', candidate.region);
    params.set('region_fix', '1');
  }
  const res = await fetch(`https://apis.map.qq.com/ws/geocoder/v1/?${params.toString()}`);
  const data = await res.json();
  if (data.status === 110 || data.status === 112) {
    tencentServerGeocodeDisabled = true;
    console.warn(`[geocode] Tencent WebService geocode disabled: ${data.message || data.status}`);
    return null;
  }
  if (data.status === 0 && data.result?.location) {
    return {
      lat: data.result.location.lat,
      lng: data.result.location.lng,
      level: data.result.level || '',
      reliability: data.result.reliability,
    };
  }
  return null;
}

function buildGeocodeCandidates(city, address) {
  const firstCity = firstCityFromValue(city);
  const cleanAddress = String(address || '').trim();
  const fullAddress = buildGeocodeQuery(city, address);
  const candidates = [];
  const seen = new Set();
  const add = (candidate) => {
    if (!candidate.address) return;
    const key = `${candidate.region || ''}|${candidate.address}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (cleanAddress && firstCity) add({ address: cleanAddress, region: firstCity });
  add({ address: fullAddress, region: '' });
  return candidates;
}

// 地理编码：优先用城市作为检索区域约束，再用完整地址兜底
async function geocodeAddress(city, address) {
  const geocodeKey = buildGeocodeKey(city, address);
  if (!geocodeKey) return { lat: null, lng: null, geocode_address: null };
  const knownPoi = findKnownPoiOverride(city, address);
  if (knownPoi) return { lat: knownPoi.lat, lng: knownPoi.lng, geocode_address: geocodeKey };
  if (addressLooksLikePoi(address)) return { lat: null, lng: null, geocode_address: null };
  try {
    for (const candidate of buildGeocodeCandidates(city, address)) {
      const result = await requestTencentGeocode(candidate);
      if (result) {
        return { ...result, geocode_address: geocodeKey };
      }
    }
  } catch {}
  return { lat: null, lng: null, geocode_address: null };
}

app.use(cors());
app.use(express.json());

// JWT 鉴权中间件
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: '未登录' });
  const token = header.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // 验证 password_version，改密码后旧 token 失效
    const user = db.prepare(`
      SELECT id, username, display_name, role, department, team_id, executive_role, password_version
      FROM users
      WHERE id = ?
    `).get(decoded.id);
    if (!user || (user.password_version || 0) !== (decoded.pwv || 0)) {
      return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
    req.user = { ...decoded, ...user, pwv: user.password_version || 0 };
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

// 除登录接口外，所有 /api 路由都需要 JWT 鉴权
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  return auth(req, res, next);
});

const CLIENT_BUILD_DIR = path.join(__dirname, '../client/build');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_BUILD_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));
}
app.use('/uploads', express.static(UPLOADS_DIR));

const DB_PATH = process.env.RELATION_DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (cols.length > 0 && !cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// =========== 用户表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    need_weekly_report INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS user_module_perms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    can_read INTEGER DEFAULT 1,
    can_write INTEGER DEFAULT 0,
    UNIQUE(user_id, module)
  );
`);

// 初始化默认管理员账号（admin / admin123）
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES ('admin', ?, '超级管理员', 'admin')").run(hash);
}

// =========== 建表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    person_category TEXT DEFAULT 'business',
    relation_types TEXT DEFAULT '',
    company TEXT,
    position TEXT,
    industry TEXT,
    phone TEXT,
    email TEXT,
    wechat TEXT,
    birthday TEXT,
    address TEXT,
    tags TEXT,
    notes TEXT,
    success_traits TEXT,
    -- 商务圈字段
    relationship_level TEXT DEFAULT 'normal',
    client_status TEXT DEFAULT 'active',
    -- 人才圈字段
    talent_type TEXT DEFAULT 'external',
    current_company TEXT,
    current_position TEXT,
    target_position TEXT,
    skills TEXT,
    experience_years INTEGER,
    education TEXT,
    recruit_status TEXT DEFAULT 'potential',
    intent_level TEXT DEFAULT 'low',
    expected_salary TEXT,
    source TEXT,
    heart TEXT,
    brain TEXT,
    mouth TEXT,
    hand TEXT,
    visibility_scope TEXT DEFAULT 'company',
    private_owner_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL,
    description TEXT,
    outcome TEXT,
    follow_result TEXT,
    next_action TEXT,
    next_action_date TEXT,
    importance TEXT DEFAULT 'normal',
    visibility_scope TEXT DEFAULT 'company',
    private_owner_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    remind_date TEXT NOT NULL,
    actual_date TEXT,
    type TEXT DEFAULT 'follow_up',
    note TEXT,
    done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// =========== 数据迁移：clients → persons ===========
const migrated = db.prepare("SELECT COUNT(*) as cnt FROM persons").get().cnt;
if (migrated === 0) {
  // 迁移旧 clients 表
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    const insertPerson = db.prepare(`
      INSERT INTO persons (name, person_category, relation_types, company, position, industry,
        phone, email, wechat, birthday, address, tags, notes,
        relationship_level, client_status, created_at, updated_at)
      VALUES (?, 'business', 'client_active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInteraction = db.prepare(`
      INSERT INTO interactions (person_id, type, date, amount, description, outcome, next_action, next_action_date, importance, created_at)
      SELECT ?, type, date, amount, description, outcome, next_action, next_action_date, importance, created_at
      FROM interactions_old WHERE person_type='client' AND person_id=?
    `);

    for (const c of clients) {
      const r = insertPerson.run(
        c.name, c.company, c.position, c.industry,
        c.phone, c.email, c.wechat, c.birthday, c.address, c.tags, c.notes,
        c.relationship_level || 'normal', c.status || 'active',
        c.created_at, c.updated_at
      );
      const newId = r.lastInsertRowid;
      // 迁移该客户的互动记录
      try {
        const ints = db.prepare("SELECT * FROM interactions WHERE person_type='client' AND person_id=?").all(c.id);
        for (const i of ints) {
          db.prepare(`INSERT INTO interactions (person_id, type, date, amount, description, outcome, next_action, next_action_date, importance, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`
          ).run(newId, i.type, i.date, i.amount, i.description, i.outcome, i.next_action, i.next_action_date, i.importance || 'normal', i.created_at);
        }
        const rems = db.prepare("SELECT * FROM reminders WHERE person_type='client' AND person_id=?").all(c.id);
        for (const rem of rems) {
          db.prepare(`INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note, done, created_at)
            VALUES (?,?,?,?,?,?,?,?)`
          ).run(newId, rem.title, rem.remind_date, rem.actual_date, rem.type, rem.note, rem.done, rem.created_at);
        }
      } catch(e) {}
    }
  } catch(e) { /* clients 表不存在则跳过 */ }

  // 迁移旧 talents 表
  try {
    const talents = db.prepare('SELECT * FROM talents').all();
    const insertTalent = db.prepare(`
      INSERT INTO persons (name, person_category, relation_types, phone, email, wechat, birthday, tags, notes,
        talent_type, current_company, current_position, target_position, skills, experience_years,
        education, recruit_status, intent_level, expected_salary, source, heart, brain, mouth, hand,
        created_at, updated_at)
      VALUES ('business', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of talents) {
      const relType = t.talent_type === 'internal' ? 'talent_internal' : 'talent_external';
      const r = db.prepare(`
        INSERT INTO persons (name, person_category, relation_types, phone, email, wechat, birthday, tags, notes,
          talent_type, current_company, current_position, target_position, skills, experience_years,
          education, recruit_status, intent_level, expected_salary, source, heart, brain, mouth, hand,
          created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        t.name, 'talent', relType,
        t.phone, t.email, t.wechat, t.birthday, t.tags, t.notes,
        t.talent_type || 'external',
        t.current_company, t.current_position, t.target_position,
        t.skills, t.experience_years, t.education,
        t.status || 'potential', t.intent_level || 'low',
        t.expected_salary, t.source,
        t.heart, t.brain, t.mouth, t.hand,
        t.created_at, t.updated_at
      );
      const newId = r.lastInsertRowid;
      try {
        const ints = db.prepare("SELECT * FROM interactions WHERE person_type='talent' AND person_id=?").all(t.id);
        for (const i of ints) {
          db.prepare(`INSERT INTO interactions (person_id, type, date, amount, description, outcome, next_action, next_action_date, importance, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`
          ).run(newId, i.type, i.date, i.amount, i.description, i.outcome, i.next_action, i.next_action_date, i.importance || 'normal', i.created_at);
        }
        const rems = db.prepare("SELECT * FROM reminders WHERE person_type='talent' AND person_id=?").all(t.id);
        for (const rem of rems) {
          db.prepare(`INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note, done, created_at)
            VALUES (?,?,?,?,?,?,?,?)`
          ).run(newId, rem.title, rem.remind_date, rem.actual_date, rem.type, rem.note, rem.done, rem.created_at);
        }
      } catch(e) {}
    }
  } catch(e) { /* talents 表不存在则跳过 */ }
}

// =========== 菜单权限表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS user_menu_perms (
    user_id INTEGER NOT NULL,
    menu_key TEXT NOT NULL,
    PRIMARY KEY (user_id, menu_key)
  );
`);

// =========== 小组与总监管辖表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'commercial',
    leader_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS director_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    director_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    UNIQUE(director_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS user_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    UNIQUE(user_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS project_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    description TEXT,
    owner_id INTEGER,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_project_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_group_id INTEGER NOT NULL,
    UNIQUE(user_id, project_group_id)
  );
`);

// =========== 动态加列 ===========
const existingCols = db.prepare("PRAGMA table_info(persons)").all().map(c => c.name);
if (existingCols.length > 0) {
  const personColsToAdd = [
    ["city",          "TEXT"],
    ["resources",     "TEXT"],
    ["demands",       "TEXT"],
    ["success_traits", "TEXT"],
    ["potential_level","TEXT"],
    ["weight",        "TEXT DEFAULT 'medium'"],
    ["created_by",    "INTEGER DEFAULT NULL"],
    ["assigned_to",   "INTEGER DEFAULT NULL"],
    ["lat",           "REAL DEFAULT NULL"],
    ["lng",           "REAL DEFAULT NULL"],
    ["geocode_address", "TEXT DEFAULT NULL"],
    ["visibility_scope", "TEXT DEFAULT 'company'"],
    ["private_owner_id", "INTEGER DEFAULT NULL"],
  ];
  for (const [col, def] of personColsToAdd) {
    if (!existingCols.includes(col)) {
      db.exec(`ALTER TABLE persons ADD COLUMN ${col} ${def}`);
    }
  }
}

const cpCols = db.prepare("PRAGMA table_info(company_personnel)").all().map(c => c.name);
if (cpCols.length > 0) {
  if (!cpCols.includes('manager_id')) {
    db.exec("ALTER TABLE company_personnel ADD COLUMN manager_id INTEGER DEFAULT NULL");
  }
  if (!cpCols.includes('entity_id')) {
    db.exec("ALTER TABLE company_personnel ADD COLUMN entity_id INTEGER DEFAULT NULL");
  }
}

const prCols = db.prepare("PRAGMA table_info(company_products)").all().map(c => c.name);
if (prCols.length > 0 && !prCols.includes('entity_id')) {
  db.exec("ALTER TABLE company_products ADD COLUMN entity_id INTEGER DEFAULT NULL");
}
if (prCols.length > 0 && !prCols.includes('product_category')) {
  db.exec("ALTER TABLE company_products ADD COLUMN product_category TEXT DEFAULT NULL");
}
if (prCols.length > 0 && !prCols.includes('product_link')) {
  db.exec("ALTER TABLE company_products ADD COLUMN product_link TEXT DEFAULT NULL");
}
if (prCols.length > 0 && !prCols.includes('contact_phone')) {
  db.exec("ALTER TABLE company_products ADD COLUMN contact_phone TEXT DEFAULT NULL");
}
if (prCols.length > 0 && !prCols.includes('domain')) {
  db.exec("ALTER TABLE company_products ADD COLUMN domain TEXT DEFAULT NULL");
}
if (prCols.length > 0 && !prCols.includes('discovery_source')) {
  db.exec("ALTER TABLE company_products ADD COLUMN discovery_source TEXT DEFAULT NULL");
}

const intCols = db.prepare("PRAGMA table_info(interactions)").all().map(c => c.name);
if (intCols.length > 0) {
  if (!intCols.includes('gift_name')) db.exec("ALTER TABLE interactions ADD COLUMN gift_name TEXT DEFAULT NULL");
  if (!intCols.includes('opportunity_title')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_title TEXT DEFAULT NULL");
  if (!intCols.includes('opportunity_status')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_status TEXT DEFAULT NULL");
  if (!intCols.includes('opportunity_assignee')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_assignee INTEGER DEFAULT NULL");
  if (!intCols.includes('opportunity_note')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_note TEXT DEFAULT NULL");
  if (!intCols.includes('follow_result')) db.exec("ALTER TABLE interactions ADD COLUMN follow_result TEXT DEFAULT NULL");
  if (!intCols.includes('created_by')) db.exec("ALTER TABLE interactions ADD COLUMN created_by INTEGER DEFAULT NULL");
  if (!intCols.includes('visibility_scope')) db.exec("ALTER TABLE interactions ADD COLUMN visibility_scope TEXT DEFAULT 'company'");
  if (!intCols.includes('private_owner_id')) db.exec("ALTER TABLE interactions ADD COLUMN private_owner_id INTEGER DEFAULT NULL");
}

const crCols = db.prepare("PRAGMA table_info(competitor_research)").all().map(c => c.name);
if (crCols.length > 0) {
  if (!crCols.includes('opportunity_title')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_title TEXT DEFAULT NULL");
  if (!crCols.includes('opportunity_status')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_status TEXT DEFAULT NULL");
  if (!crCols.includes('opportunity_assignee')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_assignee INTEGER DEFAULT NULL");
  if (!crCols.includes('opportunity_note')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_note TEXT DEFAULT NULL");
  if (!crCols.includes('follow_result')) db.exec("ALTER TABLE competitor_research ADD COLUMN follow_result TEXT DEFAULT NULL");
  if (!crCols.includes('created_by')) db.exec("ALTER TABLE competitor_research ADD COLUMN created_by INTEGER DEFAULT NULL");
  if (!crCols.includes('shared_with')) db.exec("ALTER TABLE competitor_research ADD COLUMN shared_with TEXT DEFAULT NULL");
}

const leadCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
if (leadCols.length > 0) {
  if (!leadCols.includes('follow_result')) db.exec("ALTER TABLE leads ADD COLUMN follow_result TEXT DEFAULT NULL");
}

// 回填历史数据 created_by
try {
  // interactions: 通过 person_id 关联 persons.created_by 回填
  db.exec(`
    UPDATE interactions SET created_by = (
      SELECT p.created_by FROM persons p WHERE p.id = interactions.person_id
    ) WHERE created_by IS NULL
  `);
  db.exec(`
    UPDATE interactions SET
      visibility_scope = COALESCE((SELECT p.visibility_scope FROM persons p WHERE p.id = interactions.person_id), 'company'),
      private_owner_id = (SELECT p.private_owner_id FROM persons p WHERE p.id = interactions.person_id)
    WHERE visibility_scope IS NULL
       OR visibility_scope = 'company'
  `);
  // competitor_research: 优先通过 follow_up_tasks.assigned_by 回填
  db.exec(`
    UPDATE competitor_research SET created_by = (
      SELECT ft.assigned_by FROM follow_up_tasks ft
      WHERE ft.competitor_research_id = competitor_research.id LIMIT 1
    ) WHERE created_by IS NULL AND EXISTS (
      SELECT 1 FROM follow_up_tasks ft WHERE ft.competitor_research_id = competitor_research.id
    )
  `);
  // competitor_research: 其余通过 companies.created_by 回填
  db.exec(`
    UPDATE competitor_research SET created_by = (
      SELECT c.created_by FROM companies c WHERE c.id = competitor_research.company_id
    ) WHERE created_by IS NULL
  `);
} catch(e) { /* 忽略回填错误 */ }

// =========== 附件表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// =========== 通知表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications(created_at);
`);

// =========== 手机端任务中心采集表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS mobile_task_apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    package_name TEXT,
    task_center_entry TEXT,
    collector_config TEXT,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    remark TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mobile_task_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_app TEXT NOT NULL,
    mini_program_name TEXT,
    company_entity_name TEXT,
    product_link TEXT,
    product_link_capture_method TEXT,
    matched_asset_subject_id INTEGER,
    matched_asset_subject_name TEXT,
    company_id INTEGER,
    entity_id INTEGER,
    product_id INTEGER,
    task_title TEXT,
    task_description TEXT,
    screenshot_attachment_ids TEXT,
    confidence REAL,
    status TEXT NOT NULL DEFAULT 'matched',
    skip_reason TEXT,
    error_message TEXT,
    review_status TEXT DEFAULT 'none',
    review_note TEXT,
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    raw_payload TEXT,
    collected_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_mobile_task_records_product
    ON mobile_task_records(product_id);
  CREATE INDEX IF NOT EXISTS idx_mobile_task_records_status
    ON mobile_task_records(status);
  CREATE INDEX IF NOT EXISTS idx_mobile_task_records_collected
    ON mobile_task_records(collected_at);
`);
addColumnIfMissing('mobile_task_apps', 'collector_config', 'TEXT DEFAULT NULL');
addColumnIfMissing('mobile_task_records', 'review_status', "TEXT DEFAULT 'none'");
addColumnIfMissing('mobile_task_records', 'review_note', 'TEXT DEFAULT NULL');
addColumnIfMissing('mobile_task_records', 'reviewed_by', 'INTEGER DEFAULT NULL');
addColumnIfMissing('mobile_task_records', 'reviewed_at', 'DATETIME DEFAULT NULL');

// =========== 待跟进任务表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS follow_up_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    interaction_id  INTEGER,
    person_id       INTEGER,
    competitor_research_id INTEGER,
    company_id      INTEGER,
    opportunity_title TEXT,
    opportunity_note  TEXT,
    assigned_to     INTEGER NOT NULL,
    assigned_by     INTEGER NOT NULL,
    status          TEXT DEFAULT 'pending',
    due_date        TEXT,
    started_at      DATETIME,
    done_at         DATETIME,
    done_note       TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// follow_up_tasks 自动迁移
const futCols = db.prepare("PRAGMA table_info(follow_up_tasks)").all().map(c => c.name);
if (futCols.length > 0) {
  if (!futCols.includes('competitor_research_id')) db.exec("ALTER TABLE follow_up_tasks ADD COLUMN competitor_research_id INTEGER DEFAULT NULL");
  if (!futCols.includes('company_id')) db.exec("ALTER TABLE follow_up_tasks ADD COLUMN company_id INTEGER DEFAULT NULL");
  if (!futCols.includes('started_at')) db.exec("ALTER TABLE follow_up_tasks ADD COLUMN started_at DATETIME DEFAULT NULL");
}

// 补创建竞品研究商机对应的 follow_up_tasks（修复历史数据）
try {
  // 改 JS 实现：companies.name 加密后无法在 SQL 里拼接 title
  const missing = db.prepare(`
    SELECT cr.id as cr_id, cr.company_id, cr.opportunity_title, cr.opportunity_assignee, c.name as company_name
    FROM competitor_research cr
    LEFT JOIN companies c ON cr.company_id = c.id
    LEFT JOIN follow_up_tasks ft ON ft.competitor_research_id = cr.id
    WHERE cr.opportunity_title IS NOT NULL AND cr.opportunity_assignee IS NOT NULL AND ft.id IS NULL
  `).all();
  const insertFt = db.prepare(`
    INSERT INTO follow_up_tasks (title, interaction_id, person_id, competitor_research_id, company_id, opportunity_title, assigned_to, assigned_by, status)
    VALUES (?, 0, 0, ?, ?, ?, ?, 1, 'pending')
  `);
  for (const m of missing) {
    const companyName = decrypt(m.company_name) || '未知公司';
    const title = `${companyName} - ${m.opportunity_title}`;
    const enc = encryptRow('follow_up_tasks', { title, opportunity_title: m.opportunity_title });
    insertFt.run(enc.title, m.cr_id, m.company_id, enc.opportunity_title, m.opportunity_assignee);
  }
} catch(e) { /* 表不存在时忽略 */ }

const companyCols = db.prepare("PRAGMA table_info(companies)").all().map(c => c.name);
if (companyCols.length > 0) {
  if (!companyCols.includes('created_by')) db.exec("ALTER TABLE companies ADD COLUMN created_by INTEGER DEFAULT NULL");
  if (!companyCols.includes('shared_with')) db.exec("ALTER TABLE companies ADD COLUMN shared_with TEXT DEFAULT NULL");
  if (!companyCols.includes('project_group_ids')) db.exec("ALTER TABLE companies ADD COLUMN project_group_ids TEXT DEFAULT NULL");
}

// =========== 商务任务表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    date        TEXT NOT NULL,
    status      TEXT DEFAULT 'pending',
    priority    TEXT DEFAULT 'medium',
    created_by  INTEGER NOT NULL,
    assigned_to INTEGER NOT NULL,
    team_id     INTEGER,
    parent_id   INTEGER DEFAULT NULL,
    depth       INTEGER DEFAULT 0,
    done_at     DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_shared_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_task_shared_task ON task_shared_users(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_shared_user ON task_shared_users(user_id);
`);

// tasks 表动态补全 result 字段
const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
if (taskCols.length > 0 && !taskCols.includes('result')) {
  db.exec("ALTER TABLE tasks ADD COLUMN result TEXT DEFAULT NULL");
}
if (taskCols.length > 0 && !taskCols.includes('started_at')) {
  db.exec("ALTER TABLE tasks ADD COLUMN started_at DATETIME DEFAULT NULL");
}

// =========== 线索池表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source TEXT,
    source_type TEXT,
    contact_person TEXT,
    contact_company TEXT,
    contact_info TEXT,
    description TEXT,
    follow_result TEXT,
    status TEXT DEFAULT 'new',
    assignee_id INTEGER,
    priority TEXT DEFAULT 'medium',
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_leads_assignee_id ON leads(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_source_type ON leads(source_type);

  CREATE TABLE IF NOT EXISTS lead_watchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_type, source_id, user_id)
  );
`);

// =========== 策略表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    dimension TEXT NOT NULL,
    role_type TEXT,
    budget_group_type TEXT,
    description TEXT,
    owner_id INTEGER,
    shared_with TEXT,
    status TEXT DEFAULT 'not_started',
    source_type TEXT,
    source_id INTEGER,
    media TEXT,
    access_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_strategies_owner_id ON strategies(owner_id);
  CREATE INDEX IF NOT EXISTS idx_strategies_dimension ON strategies(dimension);
  CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);
  CREATE INDEX IF NOT EXISTS idx_strategies_source ON strategies(source_type, source_id);
`);

// =========== 资产管理表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS company_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT,
    company_entity TEXT NOT NULL,
    mini_program_count INTEGER DEFAULT 0,
    legal_person TEXT,
    legal_person_phone TEXT,
    email TEXT,
    remark TEXT,
    status TEXT DEFAULT 'active',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_subject_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    attachment_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT,
    company_subject_id INTEGER,
    app_name TEXT NOT NULL,
    appid TEXT,
    budget_type TEXT NOT NULL,
    company_entity TEXT NOT NULL,
    platform TEXT,
    app_identifier TEXT,
    launch_status TEXT NOT NULL DEFAULT 'not_launched',
    owner_id INTEGER,
    remark TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_product_assets_budget_type ON product_assets(budget_type);
  CREATE INDEX IF NOT EXISTS idx_product_assets_launch_status ON product_assets(launch_status);
  CREATE INDEX IF NOT EXISTS idx_product_assets_owner_id ON product_assets(owner_id);

  CREATE TABLE IF NOT EXISTS product_asset_reductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    reduction_date TEXT NOT NULL,
    upstream TEXT,
    before_budget REAL,
    after_budget REAL,
    reduction_amount REAL,
    reduction_ratio REAL,
    punishment_object TEXT,
    reason_type TEXT NOT NULL,
    reason_analysis TEXT,
    impact_scope TEXT,
    status TEXT NOT NULL DEFAULT 'pending_analysis',
    owner_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_product_asset_reductions_asset_id ON product_asset_reductions(asset_id);
  CREATE INDEX IF NOT EXISTS idx_product_asset_reductions_status ON product_asset_reductions(status);
  CREATE INDEX IF NOT EXISTS idx_product_asset_reductions_reason_type ON product_asset_reductions(reason_type);
  CREATE INDEX IF NOT EXISTS idx_product_asset_reductions_owner_id ON product_asset_reductions(owner_id);
`);

const companySubjectCols = db.prepare("PRAGMA table_info(company_subjects)").all().map(c => c.name);
if (companySubjectCols.length > 0) {
  if (!companySubjectCols.includes('mini_program_count')) db.exec("ALTER TABLE company_subjects ADD COLUMN mini_program_count INTEGER DEFAULT 0");
  if (!companySubjectCols.includes('legal_person')) db.exec("ALTER TABLE company_subjects ADD COLUMN legal_person TEXT");
  if (!companySubjectCols.includes('legal_person_phone')) db.exec("ALTER TABLE company_subjects ADD COLUMN legal_person_phone TEXT");
  if (!companySubjectCols.includes('email')) db.exec("ALTER TABLE company_subjects ADD COLUMN email TEXT");
  if (!companySubjectCols.includes('remark')) db.exec("ALTER TABLE company_subjects ADD COLUMN remark TEXT");
  if (!companySubjectCols.includes('status')) db.exec("ALTER TABLE company_subjects ADD COLUMN status TEXT DEFAULT 'active'");
  if (!companySubjectCols.includes('created_by')) db.exec("ALTER TABLE company_subjects ADD COLUMN created_by INTEGER");
  if (!companySubjectCols.includes('created_at')) db.exec("ALTER TABLE company_subjects ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  if (!companySubjectCols.includes('updated_at')) db.exec("ALTER TABLE company_subjects ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
}

const productAssetCols = db.prepare("PRAGMA table_info(product_assets)").all().map(c => c.name);
if (productAssetCols.length > 0) {
  if (!productAssetCols.includes('group_name')) db.exec("ALTER TABLE product_assets ADD COLUMN group_name TEXT");
  if (!productAssetCols.includes('company_subject_id')) db.exec("ALTER TABLE product_assets ADD COLUMN company_subject_id INTEGER");
  if (!productAssetCols.includes('appid')) db.exec("ALTER TABLE product_assets ADD COLUMN appid TEXT");
}

const productAssetReductionCols = db.prepare("PRAGMA table_info(product_asset_reductions)").all().map(c => c.name);
if (productAssetReductionCols.length > 0 && !productAssetReductionCols.includes('punishment_object')) {
  db.exec("ALTER TABLE product_asset_reductions ADD COLUMN punishment_object TEXT");
}

// =========== 文档中心表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_no TEXT NOT NULL UNIQUE,
    global_seq INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '未命名文档',
    content TEXT,
    content_text TEXT,
    summary TEXT,
    domain TEXT DEFAULT 'general',
    project_group_id INTEGER,
    project_code TEXT,
    department_key TEXT DEFAULT 'ALL',
    doc_type TEXT DEFAULT 'TMP',
    current_version TEXT DEFAULT 'V1.0',
    folder_id INTEGER,
    tags TEXT,
    toc_enabled INTEGER DEFAULT 0,
    width_mode TEXT DEFAULT 'standard',
    custom_width INTEGER,
    small_font_enabled INTEGER DEFAULT 0,
    title_numbering_enabled INTEGER DEFAULT 0,
    created_by INTEGER,
    updated_by INTEGER,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_documents_no ON documents(document_no);
  CREATE INDEX IF NOT EXISTS idx_documents_domain ON documents(domain);
  CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
  CREATE INDEX IF NOT EXISTS idx_documents_project_group ON documents(project_group_id);
  CREATE INDEX IF NOT EXISTS idx_documents_department ON documents(department_key);
  CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
  CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);

  CREATE TABLE IF NOT EXISTS document_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    domain TEXT DEFAULT 'general',
    project_group_id INTEGER,
    department_key TEXT DEFAULT 'ALL',
    default_doc_type TEXT DEFAULT 'TMP',
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_id);
  CREATE INDEX IF NOT EXISTS idx_document_folders_context ON document_folders(domain, project_group_id, department_key);

  CREATE TABLE IF NOT EXISTS document_sequence_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_key TEXT NOT NULL UNIQUE,
    next_seq INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO document_sequence_state (scope_key, next_seq) VALUES ('global', 1);

  CREATE TABLE IF NOT EXISTS document_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    target_key TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_document_shares_doc ON document_shares(document_id);
  CREATE INDEX IF NOT EXISTS idx_document_shares_target ON document_shares(target_type, target_id, target_key);

  CREATE TABLE IF NOT EXISTS document_change_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    version TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    changed_by INTEGER,
    summary TEXT NOT NULL,
    detail TEXT,
    detail_text TEXT,
    impact_scope TEXT,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_document_change_logs_doc ON document_change_logs(document_id);

  CREATE TABLE IF NOT EXISTS document_edit_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    edited_by INTEGER,
    action_type TEXT DEFAULT 'content_update',
    title_before TEXT,
    title_after TEXT,
    content_before TEXT,
    content_after TEXT,
    content_text_before TEXT,
    content_text_after TEXT,
    diff_json TEXT,
    diff_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_document_edit_records_doc ON document_edit_records(document_id);

  CREATE TABLE IF NOT EXISTS document_favorites (
    user_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, document_id)
  );

  CREATE TABLE IF NOT EXISTS document_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_document_attachments_doc ON document_attachments(document_id);
`);

addColumnIfMissing('document_change_logs', 'detail', 'TEXT DEFAULT NULL');
addColumnIfMissing('document_change_logs', 'detail_text', 'TEXT DEFAULT NULL');
addColumnIfMissing('document_edit_records', 'content_before', 'TEXT DEFAULT NULL');
addColumnIfMissing('document_edit_records', 'content_after', 'TEXT DEFAULT NULL');
addColumnIfMissing('document_edit_records', 'content_text_before', 'TEXT DEFAULT NULL');
addColumnIfMissing('document_edit_records', 'content_text_after', 'TEXT DEFAULT NULL');

// =========== 跨团队访问权限表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS cross_team_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_team_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    granted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_team_id, module)
  );

  CREATE INDEX IF NOT EXISTS idx_cross_team_user ON cross_team_access(user_id);
  CREATE INDEX IF NOT EXISTS idx_cross_team_target ON cross_team_access(target_team_id);
  CREATE INDEX IF NOT EXISTS idx_cross_team_module ON cross_team_access(module);
`);

// =========== 人脉共享用户表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS person_shared_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(person_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_person_shared_person ON person_shared_users(person_id);
  CREATE INDEX IF NOT EXISTS idx_person_shared_user ON person_shared_users(user_id);
`);

// =========== 策略执行记录表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS strategy_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    execute_date TEXT NOT NULL,
    executor_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    action_desc TEXT,
    observation TEXT,
    attachments TEXT,
    continue_flag INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_strategy_execution_logs_strategy_id
    ON strategy_execution_logs(strategy_id);
  CREATE INDEX IF NOT EXISTS idx_strategy_execution_logs_execute_date
    ON strategy_execution_logs(execute_date);
  CREATE INDEX IF NOT EXISTS idx_strategy_execution_logs_executor_id
    ON strategy_execution_logs(executor_id);
`);

// =========== 策略结果复盘表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS strategy_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL UNIQUE,
    baseline_value TEXT,
    target_value TEXT,
    actual_value TEXT,
    result_summary TEXT,
    effect_judgement TEXT,
    review_note TEXT,
    next_action TEXT,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_strategy_reviews_strategy_id
    ON strategy_reviews(strategy_id);
  CREATE INDEX IF NOT EXISTS idx_strategy_reviews_effect_judgement
    ON strategy_reviews(effect_judgement);
`);

// 迁移：为已存在的表添加新字段
['media', 'access_method', 'shared_with'].forEach(col => {
  try { db.exec(`ALTER TABLE strategies ADD COLUMN ${col} TEXT`); } catch (e) {}
});

// 迁移：去掉 strategies.owner_id 的 NOT NULL 约束（重建表）
try {
  const col = db.prepare("SELECT * FROM pragma_table_info('strategies') WHERE name='owner_id'").get();
  if (col && col.notnull === 1) {
    db.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN TRANSACTION;
      CREATE TABLE strategies_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        dimension TEXT NOT NULL,
        role_type TEXT,
        budget_group_type TEXT,
        description TEXT,
        owner_id INTEGER,
        shared_with TEXT,
        status TEXT DEFAULT 'not_started',
        source_type TEXT,
        source_id INTEGER,
        media TEXT,
        access_method TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO strategies_new (id,title,dimension,role_type,budget_group_type,description,owner_id,shared_with,status,source_type,source_id,media,access_method,created_at,updated_at)
        SELECT id,title,dimension,role_type,budget_group_type,description,owner_id,shared_with,status,source_type,source_id,media,access_method,created_at,updated_at FROM strategies;
      DROP TABLE strategies;
      ALTER TABLE strategies_new RENAME TO strategies;
      CREATE INDEX IF NOT EXISTS idx_strategies_owner_id ON strategies(owner_id);
      CREATE INDEX IF NOT EXISTS idx_strategies_dimension ON strategies(dimension);
      CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);
      CREATE INDEX IF NOT EXISTS idx_strategies_source ON strategies(source_type, source_id);
      COMMIT;
      PRAGMA foreign_keys=ON;
    `);
  }
} catch (e) {}

try { db.exec('ALTER TABLE dev_tasks ADD COLUMN completion_note TEXT'); } catch (e) {}

// =========== 研发任务表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS dev_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    source_type TEXT,
    source_id INTEGER,
    assignee_id INTEGER,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    estimated_hours REAL,
    actual_hours REAL,
    start_date TEXT,
    due_date TEXT,
    completed_date TEXT,
    completion_note TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_dev_tasks_assignee_id ON dev_tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_dev_tasks_created_by ON dev_tasks(created_by);
  CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_dev_tasks_source ON dev_tasks(source_type, source_id);
`);

// =========== 预算管理表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL,
    source                TEXT,
    platform              TEXT,
    method                TEXT,
    target                TEXT,
    has_monetization_bd   INTEGER DEFAULT 0,
    ad_format             TEXT,
    market_size           TEXT,
    competitor_scale      TEXT,
    potential_level       TEXT DEFAULT 'medium',
    test_start_date       TEXT,
    status                TEXT DEFAULT 'new_entry',
    update_notes          TEXT,
    created_by            INTEGER NOT NULL,
    team_id               INTEGER,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// =========== 目标管理表（三级层级：季度→月度→周）===========
db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    goal_type   TEXT NOT NULL,
    scope_type  TEXT DEFAULT 'personal',
    period      TEXT NOT NULL,
    parent_id   INTEGER DEFAULT NULL,
    owner_id    INTEGER NOT NULL,
    project_group_id INTEGER DEFAULT NULL,
    department  TEXT,
    team_id     INTEGER DEFAULT NULL,
    deadline    TEXT,
    progress    INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'pending',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// goals 表动态补全字段（兼容旧数据）
const goalCols = db.prepare("PRAGMA table_info(goals)").all().map(c => c.name);
if (goalCols.length > 0) {
  if (!goalCols.includes('goal_type')) {
    db.exec("ALTER TABLE goals ADD COLUMN goal_type TEXT DEFAULT 'quarter'");
  }
  if (!goalCols.includes('period')) {
    db.exec("ALTER TABLE goals ADD COLUMN period TEXT DEFAULT NULL");
  }
  if (!goalCols.includes('scope_type')) {
    db.exec("ALTER TABLE goals ADD COLUMN scope_type TEXT DEFAULT 'personal'");
  }
  if (!goalCols.includes('parent_id')) {
    db.exec("ALTER TABLE goals ADD COLUMN parent_id INTEGER DEFAULT NULL");
  }
  if (!goalCols.includes('project_group_id')) {
    db.exec("ALTER TABLE goals ADD COLUMN project_group_id INTEGER DEFAULT NULL");
  }
  if (!goalCols.includes('team_id')) {
    db.exec("ALTER TABLE goals ADD COLUMN team_id INTEGER DEFAULT NULL");
  }
  if (!goalCols.includes('result')) {
    db.exec("ALTER TABLE goals ADD COLUMN result TEXT DEFAULT NULL");
  }
  if (!goalCols.includes('progress')) {
    db.exec("ALTER TABLE goals ADD COLUMN progress INTEGER DEFAULT 0");
  }
  if (!goalCols.includes('status')) {
    db.exec("ALTER TABLE goals ADD COLUMN status TEXT DEFAULT 'pending'");
  }
}

// users 表加 leader_id / department / team_id
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (userCols.length > 0) {
  if (!userCols.includes('leader_id')) {
    db.exec("ALTER TABLE users ADD COLUMN leader_id INTEGER DEFAULT NULL");
  }
  if (!userCols.includes('department')) {
    db.exec("ALTER TABLE users ADD COLUMN department TEXT DEFAULT NULL");
  }
  if (!userCols.includes('team_id')) {
    db.exec("ALTER TABLE users ADD COLUMN team_id INTEGER DEFAULT NULL");
  }
  if (!userCols.includes('need_weekly_report')) {
    db.exec("ALTER TABLE users ADD COLUMN need_weekly_report INTEGER DEFAULT 0");
  }
  if (!userCols.includes('executive_role')) {
    db.exec("ALTER TABLE users ADD COLUMN executive_role TEXT DEFAULT NULL");
  }
  if (!userCols.includes('password_version')) {
    db.exec("ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 0");
  }
  db.prepare('UPDATE users SET need_weekly_report = 0 WHERE need_weekly_report IS NULL').run();
}

// 公司经营模块：经营周会 / 战略月会报表表
db.exec(`
  CREATE TABLE IF NOT EXISTS executive_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_type TEXT NOT NULL,
    meeting_date TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    week INTEGER,
    weekly_results TEXT,
    key_judgment TEXT,
    decision_needed TEXT,
    next_week_actions TEXT,
    key_issues TEXT,
    decisions TEXT,
    strategic_direction TEXT,
    key_focus TEXT,
    monthly_summary TEXT,
    attendees TEXT,
    last_edited_by INTEGER,
    last_edited_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const executiveReportCols = db.prepare("PRAGMA table_info(executive_reports)").all().map(c => c.name);
if (executiveReportCols.length > 0) {
  const addExecutiveReportColumn = (name, definition) => {
    if (!executiveReportCols.includes(name)) {
      db.exec(`ALTER TABLE executive_reports ADD COLUMN ${name} ${definition}`);
    }
  };

  addExecutiveReportColumn('week', 'INTEGER');
  addExecutiveReportColumn('weekly_results', 'TEXT');
  addExecutiveReportColumn('key_judgment', 'TEXT');
  addExecutiveReportColumn('decision_needed', 'TEXT');
  addExecutiveReportColumn('next_week_actions', 'TEXT');
  addExecutiveReportColumn('key_issues', 'TEXT');
  addExecutiveReportColumn('decisions', 'TEXT');
  addExecutiveReportColumn('strategic_direction', 'TEXT');
  addExecutiveReportColumn('key_focus', 'TEXT');
  addExecutiveReportColumn('monthly_summary', 'TEXT');
  addExecutiveReportColumn('attendees', 'TEXT');
  addExecutiveReportColumn('last_edited_by', 'INTEGER');
  addExecutiveReportColumn('last_edited_at', 'DATETIME');
  addExecutiveReportColumn('created_at', 'DATETIME');
  addExecutiveReportColumn('updated_at', 'DATETIME');
}

try {
  db.exec(`
    INSERT OR IGNORE INTO user_teams (user_id, team_id)
    SELECT id, team_id
    FROM users
    WHERE team_id IS NOT NULL
  `);
} catch (e) {}

// =========== 送礼模块建表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    unit TEXT DEFAULT '个',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gift_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    occasion TEXT,
    plan_date TEXT,
    description TEXT,
    status TEXT DEFAULT 'draft',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gift_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER,
    person_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    requester_id INTEGER NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    reviewer_id INTEGER,
    review_note TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gift_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    sender_id INTEGER NOT NULL,
	    send_date TEXT,
	    status TEXT DEFAULT 'pending',
	    courier_company TEXT,
	    tracking_number TEXT,
	    feedback TEXT,
	    rating INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
	`);

const giftRecordCols = db.prepare("PRAGMA table_info(gift_records)").all().map(c => c.name);
if (giftRecordCols.length > 0) {
  if (!giftRecordCols.includes('courier_company')) db.exec("ALTER TABLE gift_records ADD COLUMN courier_company TEXT");
  if (!giftRecordCols.includes('tracking_number')) db.exec("ALTER TABLE gift_records ADD COLUMN tracking_number TEXT");
}

// =========== 操作日志表与自动留痕 ===========
const OPERATION_LOG_RETENTION_MONTHS = 3;
let lastOperationLogCleanupAt = 0;

db.exec(`
  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER,
    operator_name TEXT,
    operator_role TEXT,
    business_type TEXT NOT NULL,
    business_id TEXT,
    business_name TEXT,
    action TEXT NOT NULL,
    method TEXT,
    path TEXT,
    target_table TEXT,
    status_before TEXT,
    status_after TEXT,
    remark TEXT,
    request_ip TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1,
    error_message TEXT,
    details_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_operator_id ON operation_logs(operator_id);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_business_type ON operation_logs(business_type);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_success ON operation_logs(success);
`);

function purgeExpiredOperationLogs(force = false) {
  const now = Date.now();
  if (!force && now - lastOperationLogCleanupAt < 24 * 60 * 60 * 1000) return;
  lastOperationLogCleanupAt = now;
  try {
    db.prepare("DELETE FROM operation_logs WHERE created_at < datetime('now', ?)").run(`-${OPERATION_LOG_RETENTION_MONTHS} months`);
  } catch (e) {
    console.warn('[operation-log] cleanup failed:', e.message);
  }
}

purgeExpiredOperationLogs(true);
const operationLogCleanupTimer = setInterval(() => purgeExpiredOperationLogs(true), 24 * 60 * 60 * 1000);
if (typeof operationLogCleanupTimer.unref === 'function') operationLogCleanupTimer.unref();

const OPERATION_LOG_STATUS_FIELDS = [
  'status',
  'client_status',
  'recruit_status',
  'launch_status',
  'opportunity_status',
  'done',
  'is_read',
  'need_weekly_report',
  'role',
];

const OPERATION_LOG_NAME_FIELDS = [
  'name',
  'title',
  'display_name',
  'username',
  'app_name',
  'company_entity',
  'destinations',
];

const OPERATION_LOG_BUSINESS_MAP = {
  gifts: '礼品库',
  gift_plans: '客户答谢',
  gift_requests: '送礼申请',
  gift_records: '送礼记录',
  auth: '账号安全',
  users: '用户管理',
  teams: '小组管理',
  'project-groups': '项目组管理',
  admin: '系统权限',
  persons: '人脉管理',
  interactions: '互动记录',
  opportunities: '商机管理',
  'follow-up-tasks': '待跟进任务',
  tasks: '商务任务',
  budgets: '预算管理',
  reminders: '提醒事项',
  companies: '公司研究',
  company_entities: '公司主体',
  company_personnel: '公司人员',
  company_products: '公司产品',
  company_dynamics: '公司动态',
  competitor_research: '竞品研究',
  groups: '出差小组',
  trips: '出差申请',
  trip_expenses: '费用明细',
  reports: '报销单',
  goals: '目标管理',
  'weekly-reports': '周报管理',
  leads: '线索池',
  'company-subjects': '主体管理',
  'company-subject-attachments': '主体附件',
  'product-assets': '产品资产',
  'product-asset-reductions': '产品核减',
  documents: '文档中心',
  'document-folders': '文档目录',
  'document-change-logs': '文档改动历史',
  'document-edit-records': '页面编辑记录',
  strategies: '策略',
  'strategy-execution-logs': '策略执行',
  'dev-tasks': '需求',
  notifications: '通知',
  executive: '公司经营',
  attachments: '附件',
  'cross-team-access': '跨团队权限',
  'boss-watcher': '招聘雷达',
  'mobile-task-center': '手机任务中心采集',
};

const OPERATION_LOG_TABLE_MAP = {
  gifts: 'gifts',
  gift_plans: 'gift_plans',
  gift_requests: 'gift_requests',
  gift_records: 'gift_records',
  users: 'users',
  teams: 'teams',
  'project-groups': 'project_groups',
  persons: 'persons',
  interactions: 'interactions',
  opportunities: 'interactions',
  'follow-up-tasks': 'follow_up_tasks',
  tasks: 'tasks',
  budgets: 'budgets',
  reminders: 'reminders',
  companies: 'companies',
  company_entities: 'company_entities',
  company_personnel: 'company_personnel',
  company_products: 'company_products',
  company_dynamics: 'company_dynamics',
  competitor_research: 'competitor_research',
  groups: 'groups',
  trips: 'business_trips',
  trip_expenses: 'trip_expenses',
  reports: 'expense_reports',
  goals: 'goals',
  'weekly-reports': 'weekly_reports',
  leads: 'leads',
  'company-subjects': 'company_subjects',
  'company-subject-attachments': 'company_subject_attachments',
  'product-assets': 'product_assets',
  'product-asset-reductions': 'product_asset_reductions',
  documents: 'documents',
  'document-folders': 'document_folders',
  'document-change-logs': 'document_change_logs',
  'document-edit-records': 'document_edit_records',
  strategies: 'strategies',
  'strategy-execution-logs': 'strategy_execution_logs',
  'dev-tasks': 'dev_tasks',
  notifications: 'notifications',
  attachments: 'attachments',
  'cross-team-access': 'cross_team_access',
  'mobile-task-center': 'mobile_task_records',
};

const OPERATION_LOG_ROUTE_CONFIGS = [
  { pattern: /^\/auth\/password$/, businessType: '账号安全', table: 'users', action: '修改密码', userTarget: true },
  { pattern: /^\/auth\/logout$/, businessType: '账号安全', action: '退出登录' },
  { pattern: /^\/users\/(\d+)\/reset-password$/, businessType: '用户管理', table: 'users', idGroup: 1, action: '重置密码' },
  { pattern: /^\/users\/(\d+)\/weekly-report$/, businessType: '周报管理', table: 'users', idGroup: 1, action: '配置周报权限' },
  { pattern: /^\/admin\/menu-perms\/(\d+)$/, businessType: '菜单权限管理', table: 'users', idGroup: 1, action: '保存菜单权限' },
  { pattern: /^\/persons\/(\d+)\/assign$/, businessType: '人脉管理', table: 'persons', idGroup: 1, action: '分配人脉' },
  { pattern: /^\/persons\/batch$/, businessType: '人脉管理', table: 'persons', action: '批量更新' },
  { pattern: /^\/persons\/import$/, businessType: '人脉管理', table: 'persons', action: '导入' },
  { pattern: /^\/persons\/import\/preview$/, businessType: '人脉管理', table: 'persons', action: '导入预览', skipSuccessLog: true },
  { pattern: /^\/gift_requests\/(\d+)\/review$/, businessType: '送礼申请', table: 'gift_requests', idGroup: 1 },
  { pattern: /^\/reminders\/(\d+)\/done$/, businessType: '提醒事项', table: 'reminders', idGroup: 1, action: '标记完成' },
  { pattern: /^\/trips\/(\d+)\/submit$/, businessType: '出差申请', table: 'business_trips', idGroup: 1, action: '提交审批' },
  { pattern: /^\/trips\/(\d+)\/approve$/, businessType: '出差申请', table: 'business_trips', idGroup: 1 },
  { pattern: /^\/trips\/(\d+)\/complete$/, businessType: '出差申请', table: 'business_trips', idGroup: 1, action: '标记完成' },
  { pattern: /^\/trips\/(\d+)\/expenses$/, businessType: '费用明细', table: 'trip_expenses', responseId: true },
  { pattern: /^\/trips\/(\d+)\/report$/, businessType: '报销单', table: 'expense_reports', responseId: true, action: '创建报销单' },
  { pattern: /^\/reports\/(\d+)\/submit$/, businessType: '报销单', table: 'expense_reports', idGroup: 1, action: '提交报销' },
  { pattern: /^\/reports\/(\d+)\/approve$/, businessType: '报销单', table: 'expense_reports', idGroup: 1 },
  { pattern: /^\/product-assets\/import$/, businessType: '产品资产', table: 'product_assets', action: '导入' },
  { pattern: /^\/product-assets\/import\/preview$/, businessType: '产品资产', table: 'product_assets', action: '导入预览', skipSuccessLog: true },
  { pattern: /^\/product-assets\/(\d+)\/reductions$/, businessType: '产品核减', table: 'product_asset_reductions', responseId: true },
  { pattern: /^\/documents$/, businessType: '文档中心', table: 'documents', responseId: true, action: '创建文档' },
  { pattern: /^\/documents\/(\d+)$/, businessType: '文档中心', table: 'documents', idGroup: 1 },
  { pattern: /^\/documents\/(\d+)\/content$/, businessType: '文档中心', table: 'documents', idGroup: 1, action: '保存文档内容' },
  { pattern: /^\/documents\/(\d+)\/page-options$/, businessType: '文档中心', table: 'documents', idGroup: 1, action: '保存页面选项' },
  { pattern: /^\/documents\/(\d+)\/shares$/, businessType: '文档共享', table: 'document_shares', idGroup: 1, action: '保存共享范围' },
  { pattern: /^\/documents\/(\d+)\/change-logs$/, businessType: '文档改动历史', table: 'document_change_logs', responseId: true, action: '新增改动历史' },
  { pattern: /^\/documents\/(\d+)\/favorite$/, businessType: '文档收藏', table: 'document_favorites', idGroup: 1 },
  { pattern: /^\/document-change-logs\/(\d+)$/, businessType: '文档改动历史', table: 'document_change_logs', idGroup: 1 },
  { pattern: /^\/document-edit-records\/(\d+)\/restore$/, businessType: '页面编辑记录', table: 'document_edit_records', idGroup: 1, action: '恢复页面版本' },
  { pattern: /^\/document-folders$/, businessType: '文档目录', table: 'document_folders', responseId: true, action: '保存目录' },
  { pattern: /^\/document-folders\/(\d+)$/, businessType: '文档目录', table: 'document_folders', idGroup: 1 },
  { pattern: /^\/document-folders\/apply-template$/, businessType: '文档目录', table: 'document_folders', action: '初始化目录模板' },
  { pattern: /^\/company_products\/(\d+)\/task-center-notification$/, businessType: '公司产品', table: 'company_products', idGroup: 1, action: '发送任务中心采集通知' },
  { pattern: /^\/mobile-task-center\/records$/, businessType: '手机任务中心采集', table: 'mobile_task_records', responseId: true, action: '采集入库' },
  { pattern: /^\/mobile-task-center\/records\/(\d+)\/review$/, businessType: '手机任务中心采集', table: 'mobile_task_records', idGroup: 1, action: '复核采集记录' },
  { pattern: /^\/mobile-task-center\/apps$/, businessType: '手机任务中心采集', table: 'mobile_task_apps', responseId: true, action: '保存采集 App' },
  { pattern: /^\/mobile-task-center\/apps\/(\d+)$/, businessType: '手机任务中心采集', table: 'mobile_task_apps', idGroup: 1 },
  { pattern: /^\/strategies\/(\d+)\/execution-logs$/, businessType: '策略执行', table: 'strategy_execution_logs', responseId: true },
  { pattern: /^\/strategies\/(\d+)\/review$/, businessType: '策略复盘', table: 'strategy_reviews', idGroup: 1, action: '保存复盘' },
  { pattern: /^\/company-subjects\/(\d+)\/attachments$/, businessType: '主体附件', table: 'company_subject_attachments', responseId: true, action: '上传附件' },
  { pattern: /^\/attachments\/upload$/, businessType: '附件', table: 'attachments', action: '上传附件' },
  { pattern: /^\/company_personnel\/(\d+)\/to_person$/, businessType: '公司人员', table: 'company_personnel', idGroup: 1, action: '转为人脉' },
  { pattern: /^\/notifications\/(\d+)\/read$/, businessType: '通知', table: 'notifications', idGroup: 1, action: '标记已读' },
  { pattern: /^\/notifications\/read-all$/, businessType: '通知', table: 'notifications', action: '全部已读' },
];

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

function tableExists(table) {
  if (!isSafeIdentifier(table)) return false;
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

function getTableColumns(table) {
  if (!tableExists(table)) return [];
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

function stringifyForLog(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return decrypt(String(value));
  } catch {
    return String(value);
  }
}

function truncateLogText(value, max = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sanitizeLogPayload(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[Object]';
  if (typeof value === 'string') return truncateLogText(value, 300);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeLogPayload(item, depth + 1));
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/(password|passwd|pwd|token|secret|authorization|jwt|hash|master_key|hmac_key)/i.test(key)) {
      out[key] = '[已脱敏]';
    } else {
      out[key] = sanitizeLogPayload(raw, depth + 1);
    }
  }
  return out;
}

function safeJsonStringifyForLog(value) {
  try {
    return truncateLogText(JSON.stringify(value), 4000);
  } catch {
    return null;
  }
}

function getOperationRouteConfig(reqPath) {
  for (const config of OPERATION_LOG_ROUTE_CONFIGS) {
    const match = reqPath.match(config.pattern);
    if (match) {
      return { ...config, match };
    }
  }

  const segment = reqPath.split('/').filter(Boolean)[0] || 'unknown';
  const idMatch = reqPath.match(/\/(\d+)(?:\/|$)/);
  return {
    businessType: OPERATION_LOG_BUSINESS_MAP[segment] || segment,
    table: OPERATION_LOG_TABLE_MAP[segment] || null,
    targetId: idMatch ? idMatch[1] : null,
  };
}

function getOperationTargetId(config, req, responseBody) {
  if (config.userTarget) return req.user?.id ? String(req.user.id) : null;
  if (config.idGroup && config.match?.[config.idGroup]) return String(config.match[config.idGroup]);
  if (config.targetId) return String(config.targetId);
  if (config.responseId && responseBody?.id) return String(responseBody.id);
  if (req.method === 'POST' && responseBody?.id) return String(responseBody.id);
  return null;
}

function getOperationSnapshot(table, id) {
  if (!table || !id || !tableExists(table)) return null;
  const columns = getTableColumns(table);
  if (!columns.includes('id')) return null;

  const selectedFields = [
    'id',
    ...OPERATION_LOG_STATUS_FIELDS.filter(field => columns.includes(field)),
    ...OPERATION_LOG_NAME_FIELDS.filter(field => columns.includes(field)),
  ];
  const uniqueFields = [...new Set(selectedFields)];
  const row = db.prepare(`SELECT ${uniqueFields.join(', ')} FROM ${table} WHERE id = ?`).get(id);
  if (!row) return null;

  const status = {};
  OPERATION_LOG_STATUS_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      status[field] = stringifyForLog(row[field]);
    }
  });

  let name = null;
  for (const field of OPERATION_LOG_NAME_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field) && row[field] !== null && row[field] !== undefined && row[field] !== '') {
      name = stringifyForLog(row[field]);
      break;
    }
  }

  return { id: String(row.id), name: truncateLogText(name, 200), status };
}

function buildStatusChange(beforeSnapshot, afterSnapshot, method) {
  if (method === 'DELETE') {
    const before = beforeSnapshot?.status || {};
    const beforeText = Object.keys(before).length
      ? Object.entries(before).map(([key, value]) => `${key}: ${value ?? '-'}`).join('；')
      : null;
    return { before: beforeText, after: '已删除' };
  }
  if (!beforeSnapshot && afterSnapshot) {
    const after = afterSnapshot.status || {};
    const afterText = Object.keys(after).length
      ? Object.entries(after).map(([key, value]) => `${key}: ${value ?? '-'}`).join('；')
      : null;
    return { before: null, after: afterText };
  }
  if (!beforeSnapshot || !afterSnapshot) return { before: null, after: null };

  const fields = [...new Set([
    ...Object.keys(beforeSnapshot.status || {}),
    ...Object.keys(afterSnapshot.status || {}),
  ])];
  const beforeParts = [];
  const afterParts = [];
  fields.forEach(field => {
    const beforeValue = beforeSnapshot.status?.[field] ?? null;
    const afterValue = afterSnapshot.status?.[field] ?? null;
    if (beforeValue !== afterValue) {
      beforeParts.push(`${field}: ${beforeValue ?? '-'}`);
      afterParts.push(`${field}: ${afterValue ?? '-'}`);
    }
  });
  return {
    before: beforeParts.length ? beforeParts.join('；') : null,
    after: afterParts.length ? afterParts.join('；') : null,
  };
}

function inferOperationAction(req, responseBody, config) {
  if (config?.action) return config.action;
  const pathName = req.path;
  const bodyAction = req.body?.action;
  if (/\/review$/.test(pathName)) {
    if (bodyAction === 'approve') return '审核通过';
    if (bodyAction === 'reject') return '审核驳回';
    return '审核';
  }
  if (/\/approve$/.test(pathName)) {
    if (bodyAction === 'approved') return '审批通过';
    if (bodyAction === 'rejected') return '审批驳回';
    return '审批';
  }
  if (/\/submit$/.test(pathName)) return '提交';
  if (/\/complete$/.test(pathName)) return '完成';
  if (/\/done$/.test(pathName)) return '标记完成';
  if (/\/assign$/.test(pathName)) return '分配';
  if (/\/import$/.test(pathName)) return '导入';
  if (/\/upload$/.test(pathName)) return '上传';
  if (pathName === '/weekly-reports' && req.method === 'POST') {
    if (responseBody?.updated) return '更新';
    if (responseBody?.created) return '创建';
    return '创建或更新';
  }
  if (req.method === 'POST') return '创建';
  if (req.method === 'PUT' || req.method === 'PATCH') return '更新';
  if (req.method === 'DELETE') return '删除';
  return req.method;
}

function extractOperationRemark(req) {
  const body = req.body || {};
  const fields = [
    'remark',
    'remarks',
    'note',
    'notes',
    'review_note',
    'approve_note',
    'feedback',
    'completion_note',
    'done_note',
    'update_notes',
    'reason_analysis',
  ];
  const parts = [];
  fields.forEach(field => {
    if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
      parts.push(`${field}: ${truncateLogText(body[field], 160)}`);
    }
  });
  return parts.length ? parts.join('；') : null;
}

function writeOperationLog(entry) {
  try {
    purgeExpiredOperationLogs();
    const operator = entry.operator || entry.req?.user || {};
    db.prepare(`
      INSERT INTO operation_logs (
        operator_id, operator_name, operator_role, business_type, business_id, business_name,
        action, method, path, target_table, status_before, status_after, remark, request_ip,
        user_agent, success, error_message, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operator.id || entry.operator_id || null,
      entry.operator_name || operator.display_name || operator.username || null,
      entry.operator_role || operator.role || null,
      entry.business_type || '系统',
      entry.business_id || null,
      truncateLogText(entry.business_name, 200),
      entry.action || '操作',
      entry.method || entry.req?.method || null,
      entry.path || entry.req?.originalUrl || entry.req?.path || null,
      entry.target_table || null,
      truncateLogText(entry.status_before, 500),
      truncateLogText(entry.status_after, 500),
      truncateLogText(entry.remark, 500),
      entry.request_ip || entry.req?.ip || null,
      entry.user_agent || entry.req?.headers?.['user-agent'] || null,
      entry.success ? 1 : 0,
      truncateLogText(entry.error_message, 500),
      entry.details_json || null
    );
  } catch (e) {
    console.warn('[operation-log] write failed:', e.message);
  }
}

function operationLogMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.path === '/auth/login' || req.path.startsWith('/operation-logs')) return next();

  const config = getOperationRouteConfig(req.path);
  const initialTargetId = getOperationTargetId(config, req, null);
  const beforeSnapshot = getOperationSnapshot(config.table, initialTargetId);
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    res.locals.operationLogResponseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const responseBody = res.locals.operationLogResponseBody;
    const success = res.statusCode < 400;
    if (success && config.skipSuccessLog) return;

    const targetId = initialTargetId || getOperationTargetId(config, req, responseBody);
    const afterSnapshot = success && req.method !== 'DELETE'
      ? getOperationSnapshot(config.table, targetId)
      : null;
    const statusChange = buildStatusChange(beforeSnapshot, afterSnapshot, req.method);
    const targetSnapshot = afterSnapshot || beforeSnapshot;
    const details = {
      query: sanitizeLogPayload(req.query || {}),
      body: sanitizeLogPayload(req.body || {}),
      statusCode: res.statusCode,
    };
    const errorMessage = success ? null : (responseBody?.error || responseBody?.message || `HTTP ${res.statusCode}`);

    writeOperationLog({
      req,
      business_type: config.businessType || '系统',
      business_id: targetId,
      business_name: targetSnapshot?.name || null,
      action: inferOperationAction(req, responseBody, config),
      target_table: config.table || null,
      status_before: statusChange.before,
      status_after: statusChange.after,
      remark: extractOperationRemark(req),
      success,
      error_message: errorMessage,
      details_json: safeJsonStringifyForLog(details),
    });
  });

  next();
}

app.use('/api', operationLogMiddleware);

// =========== 送礼模块 API ===========

// 礼品库
app.get('/api/gifts', (req, res) => {
  res.json(db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.source_type = 'gift' AND a.source_id = g.id) as attachment_count
    FROM gifts g
    ORDER BY g.category, g.name
  `).all());
});
app.post('/api/gifts', canWrite, (req, res) => {
  const { name, category, description, price, stock, unit, notes } = req.body;
  const r = db.prepare(`INSERT INTO gifts (name, category, description, price, stock, unit, notes) VALUES (?,?,?,?,?,?,?)`)
    .run(name, category, description, price || 0, stock || 0, unit || '个', notes);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/gifts/:id', canWrite, (req, res) => {
  const { name, category, description, price, stock, unit, notes } = req.body;
  db.prepare(`UPDATE gifts SET name=?, category=?, description=?, price=?, stock=?, unit=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(name, category, description, price, stock, unit || '个', notes, req.params.id);
  res.json({ success: true });
});
app.delete('/api/gifts/:id', canWrite, (req, res) => {
  const gift = db.prepare('SELECT id FROM gifts WHERE id = ?').get(req.params.id);
  if (!gift) return res.status(404).json({ error: '礼品不存在' });

  const attachmentRows = db.prepare("SELECT filepath FROM attachments WHERE source_type = 'gift' AND source_id = ?").all(req.params.id);
  const deleteGift = db.transaction((id) => {
    db.prepare("DELETE FROM attachments WHERE source_type = 'gift' AND source_id = ?").run(id);
    db.prepare('DELETE FROM gifts WHERE id = ?').run(id);
  });
  deleteGift(req.params.id);
  attachmentRows.forEach(att => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, att.filepath)); } catch {}
  });
  res.json({ success: true });
});

// 客户答谢
app.get('/api/gift_plans', (req, res) => {
  const plans = db.prepare(`SELECT gp.*, u.display_name as creator_name FROM gift_plans gp LEFT JOIN users u ON gp.created_by = u.id ORDER BY gp.created_at DESC`).all();
  res.json(plans);
});
app.post('/api/gift_plans', canWrite, (req, res) => {
  const { title, occasion, plan_date, description } = req.body;
  const r = db.prepare(`INSERT INTO gift_plans (title, occasion, plan_date, description, created_by) VALUES (?,?,?,?,?)`)
    .run(title, occasion, plan_date, description, req.user.id);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/gift_plans/:id', canWrite, (req, res) => {
  const { title, occasion, plan_date, description, status } = req.body;
  db.prepare(`UPDATE gift_plans SET title=?, occasion=?, plan_date=?, description=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(title, occasion, plan_date, description, status, req.params.id);
  res.json({ success: true });
});
app.delete('/api/gift_plans/:id', canWrite, (req, res) => {
  db.prepare('DELETE FROM gift_plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 送礼申请
app.get('/api/gift_requests', (req, res) => {
  const { status, plan_id } = req.query;
  let q = `
    SELECT gr.*,
      p.name as person_name, p.company, p.city,
      g.name as gift_name, g.price as gift_price, g.unit as gift_unit,
      u.display_name as requester_name,
      rv.display_name as reviewer_name,
      gp.title as plan_title
    FROM gift_requests gr
    LEFT JOIN persons p ON gr.person_id = p.id
    LEFT JOIN gifts g ON gr.gift_id = g.id
    LEFT JOIN users u ON gr.requester_id = u.id
    LEFT JOIN users rv ON gr.reviewer_id = rv.id
    LEFT JOIN gift_plans gp ON gr.plan_id = gp.id
    WHERE 1=1
  `;
  const params = [];
  const privacy = buildPersonPrivacyFilter(req.user.id, 'p');
  q += privacy.sql;
  params.push(...privacy.params);
  // 按角色过滤可见申请
  const { id: me, role } = req.user;
  const visibleIds = getVisibleUserIds(me, role);
  if (visibleIds !== null) {
    q += ` AND gr.requester_id IN (${visibleIds.map(() => '?').join(',')})`;
    params.push(...visibleIds);
  }
  if (status) { q += ' AND gr.status = ?'; params.push(status); }
  if (plan_id) { q += ' AND gr.plan_id = ?'; params.push(plan_id); }
  q += ' ORDER BY gr.created_at DESC';
  res.json(db.prepare(q).all(...params).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
    company: decrypt(r.company),
    gift_name: decrypt(r.gift_name),
  })));
});

app.post('/api/gift_requests', canWrite, (req, res) => {
  const { plan_id, person_id, gift_id, quantity, notes } = req.body;
  const person = getPersonAccessRecord(person_id);
  if (!person) return res.status(404).json({ error: '未找到人脉' });
  if (!canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到人脉' });
  // 检查库存
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(gift_id);
  if (!gift) return res.status(400).json({ error: '礼品不存在' });
  if (gift.stock < (quantity || 1)) return res.status(400).json({ error: `库存不足，当前库存 ${gift.stock} ${gift.unit}` });
  const r = db.prepare(`INSERT INTO gift_requests (plan_id, person_id, gift_id, quantity, requester_id, notes) VALUES (?,?,?,?,?,?)`)
    .run(plan_id || null, person_id, gift_id, quantity || 1, req.user.id, notes);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/gift_requests/:id', canWrite, (req, res) => {
  const req_ = db.prepare('SELECT * FROM gift_requests WHERE id = ?').get(req.params.id);
  if (!req_) return res.status(404).json({ error: '未找到' });
  if (req_.status !== 'pending') return res.status(400).json({ error: '只能撤回待审核的申请' });
  if (req_.requester_id !== req.user.id && !isAdmin(req.user.role)) return res.status(403).json({ error: '无权操作' });
  db.prepare('DELETE FROM gift_requests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 审核申请（leader / sales_director / admin）
app.post('/api/gift_requests/:id/review', (req, res) => {
  if (req.user.role !== 'leader' && !isAdmin(req.user.role) && req.user.role !== 'sales_director') return res.status(403).json({ error: '无审核权限' });
  const { action, review_note } = req.body; // action: approve | reject
  const request = db.prepare('SELECT * FROM gift_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: '未找到' });
  const person = getPersonAccessRecord(request.person_id);
  if (person && !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  if (request.status !== 'pending') return res.status(400).json({ error: '该申请已处理' });

  if (action === 'approve') {
    // 扣减库存
    const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(request.gift_id);
    if (gift.stock < request.quantity) return res.status(400).json({ error: '库存不足，无法审核通过' });
    const approveAndRecord = db.transaction(() => {
      db.prepare(`UPDATE gift_requests SET status='approved', reviewer_id=?, review_note=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(req.user.id, review_note, req.params.id);
      db.prepare(`UPDATE gifts SET stock = stock - ?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(request.quantity, request.gift_id);
      db.prepare(`INSERT INTO gift_records (request_id, person_id, gift_id, quantity, sender_id) VALUES (?,?,?,?,?)`)
        .run(request.id, request.person_id, request.gift_id, request.quantity, request.requester_id);
    });
    approveAndRecord();
  } else {
    db.prepare(`UPDATE gift_requests SET status='rejected', reviewer_id=?, review_note=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(req.user.id, review_note, req.params.id);
  }
  res.json({ success: true });
});

// 送礼记录
app.get('/api/gift_records', (req, res) => {
  const { status, person_name, company } = req.query;
  let q = `
    SELECT gr.*,
      p.name as person_name, p.company, p.city, p.phone, p.wechat,
      g.name as gift_name, g.unit as gift_unit, g.price as gift_price,
      u.display_name as sender_name
    FROM gift_records gr
    LEFT JOIN persons p ON gr.person_id = p.id
    LEFT JOIN gifts g ON gr.gift_id = g.id
    LEFT JOIN users u ON gr.sender_id = u.id
    WHERE 1=1
  `;
  const params = [];
  const privacy = buildPersonPrivacyFilter(req.user.id, 'p');
  q += privacy.sql;
  params.push(...privacy.params);
  const visibleIds2 = canViewAllGiftRecords(req.user) ? null : getVisibleUserIds(req.user.id, req.user.role);
  if (visibleIds2 !== null) {
    q += ` AND gr.sender_id IN (${visibleIds2.map(() => '?').join(',')})`;
    params.push(...visibleIds2);
  }
  if (status) { q += ' AND gr.status = ?'; params.push(status); }
  q += ' ORDER BY gr.created_at DESC';
  let rows = db.prepare(q).all(...params).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
    company: decrypt(r.company),
    phone: decrypt(r.phone),
    wechat: decrypt(r.wechat),
    gift_name: decrypt(r.gift_name),
  }));
  const personKeyword = String(person_name || '').trim().toLowerCase();
  const companyKeyword = String(company || '').trim().toLowerCase();
  if (personKeyword) {
    rows = rows.filter(r => String(r.person_name || '').toLowerCase().includes(personKeyword));
  }
  if (companyKeyword) {
    rows = rows.filter(r => String(r.company || '').toLowerCase().includes(companyKeyword));
  }
  res.json(rows);
});

app.put('/api/gift_records/:id', (req, res) => {
  const { status, feedback, rating, send_date, courier_company, tracking_number } = req.body;
  const record = db.prepare('SELECT * FROM gift_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '未找到' });
  const person = getPersonAccessRecord(record.person_id);
  if (person && !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  if (record.sender_id !== req.user.id && !isAdmin(req.user.role) && req.user.role !== 'leader') {
    return res.status(403).json({ error: '无权操作' });
  }

  const updateAndLog = db.transaction(() => {
    db.prepare(`UPDATE gift_records SET status=?, feedback=?, rating=?, send_date=?, courier_company=?, tracking_number=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(status, feedback, rating || null, send_date, courier_company || null, tracking_number || null, req.params.id);

    // 状态变为「已接收」且之前不是「已接收」时，自动生成互动记录
    if (status === 'received' && record.status !== 'received') {
      const gift = db.prepare('SELECT name FROM gifts WHERE id = ?').get(record.gift_id);
      const giftName = decrypt(gift?.name) || '礼品';
      const interactionDate = send_date || new Date().toISOString().slice(0, 10);
      const description = `送出礼品：${giftName} × ${record.quantity}${feedback ? `\n收礼反馈：${feedback}` : ''}`;
      const enc = encryptRow('interactions', { description });
      const visibility = getVisibilityFromPerson(person || {});
      db.prepare(`
        INSERT INTO interactions (person_id, type, date, description, importance, created_by, visibility_scope, private_owner_id, created_at)
        VALUES (?, 'gift', ?, ?, 'normal', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(record.person_id, interactionDate, enc.description, req.user.id, visibility.visibility_scope, visibility.private_owner_id);
    }
  });

  updateAndLog();
  res.json({ success: true });
});

// 仅 admin 可访问
function adminOnly(req, res, next) {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  next();
}

// 仅系统管理员可访问；不包含 CEO/COO/CTO/CMO 等高管角色
function systemAdminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可访问' });
  next();
}

// 只读校验（readonly/guest 不能写）
function canWrite(req, res, next) {
  if (req.user.role === 'readonly') return res.status(403).json({ error: '只读账号无法操作' });
  if (req.user.role === 'guest') return res.status(403).json({ error: '访客无法操作' });
  next();
}

// =========== 操作日志 API（admin only）===========
app.get('/api/operation-logs/meta', auth, systemAdminOnly, (req, res) => {
  const businessTypes = db.prepare(`
    SELECT DISTINCT business_type
    FROM operation_logs
    WHERE business_type IS NOT NULL AND business_type != ''
    ORDER BY business_type ASC
  `).all().map(r => r.business_type);
  const actions = db.prepare(`
    SELECT DISTINCT action
    FROM operation_logs
    WHERE action IS NOT NULL AND action != ''
    ORDER BY action ASC
  `).all().map(r => r.action);
  const operators = db.prepare(`
    SELECT id, username, display_name, role
    FROM users
    ORDER BY display_name ASC, username ASC
  `).all();
  res.json({ businessTypes, actions, operators });
});

app.get('/api/operation-logs', auth, systemAdminOnly, (req, res) => {
  const {
    page = 1,
    page_size = 20,
    operator_id,
    business_type,
    action,
    success,
    keyword,
    start_date,
    end_date,
  } = req.query;

  const where = ['1=1'];
  const params = [];

  if (operator_id) {
    where.push('operator_id = ?');
    params.push(operator_id);
  }
  if (business_type) {
    where.push('business_type = ?');
    params.push(business_type);
  }
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (success === '0' || success === '1') {
    where.push('success = ?');
    params.push(Number(success));
  }
  if (start_date) {
    where.push('created_at >= ?');
    params.push(`${start_date} 00:00:00`);
  }
  if (end_date) {
    where.push('created_at <= ?');
    params.push(`${end_date} 23:59:59`);
  }
  if (keyword) {
    where.push(`(
      operator_name LIKE ?
      OR business_type LIKE ?
      OR business_id LIKE ?
      OR business_name LIKE ?
      OR action LIKE ?
      OR remark LIKE ?
      OR path LIKE ?
      OR error_message LIKE ?
    )`);
    const like = `%${keyword}%`;
    params.push(like, like, like, like, like, like, like, like);
  }

  const whereSql = where.join(' AND ');
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(page_size) || 20));
  const offset = (pageNumber - 1) * pageSize;
  const total = db.prepare(`SELECT COUNT(*) as count FROM operation_logs WHERE ${whereSql}`).get(...params).count;
  const items = db.prepare(`
    SELECT *
    FROM operation_logs
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({ items, total, page: pageNumber, page_size: pageSize });
});

app.get('/api/operation-logs/:id', auth, systemAdminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM operation_logs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '日志不存在' });
  let details = null;
  try {
    details = row.details_json ? JSON.parse(row.details_json) : null;
  } catch {
    details = row.details_json;
  }
  res.json({ ...row, details });
});

function getUserTeamIds(userId) {
  const primaryRows = db.prepare('SELECT team_id FROM users WHERE id = ? AND team_id IS NOT NULL').all(userId).map(r => r.team_id);
  const relationRows = db.prepare('SELECT team_id FROM user_teams WHERE user_id = ?').all(userId).map(r => r.team_id);
  return [...new Set([...primaryRows, ...relationRows])];
}

function getUserProjectGroupIds(userId) {
  return db.prepare('SELECT project_group_id FROM user_project_groups WHERE user_id = ?').all(userId).map(r => r.project_group_id);
}

function getUsersByTeamIds(teamIds) {
  if (!teamIds?.length) return [];
  const placeholders = teamIds.map(() => '?').join(',');
  const fromUsers = db.prepare(`SELECT id FROM users WHERE team_id IN (${placeholders})`).all(...teamIds).map(u => u.id);
  const fromRelations = db.prepare(`SELECT user_id as id FROM user_teams WHERE team_id IN (${placeholders})`).all(...teamIds).map(u => u.id);
  return [...new Set([...fromUsers, ...fromRelations])];
}

function isAdministrativeTeam(team) {
  const name = String(team?.name || '').toLowerCase();
  const department = String(team?.department || '').toLowerCase();
  return (
    ['admin', 'administration', 'administrative'].includes(department)
    || name.includes('行政')
    || name.includes('admin')
    || name.includes('administration')
  );
}

function canViewAllGiftRecords(user) {
  if (!user) return false;
  if (isAdmin(user.role)) return true;
  const department = String(user.department || '').toLowerCase();
  if (['admin', 'administration', 'administrative'].includes(department)) return true;

  const teamIds = getUserTeamIds(user.id);
  if (!teamIds.length) return false;
  const placeholders = teamIds.map(() => '?').join(',');
  const teams = db.prepare(`SELECT name, department FROM teams WHERE id IN (${placeholders})`).all(...teamIds);
  return teams.some(isAdministrativeTeam);
}

function getManagedTeamIds(userId, role) {
  if (isAdmin(role)) return null;

  if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    return [...new Set([...myTeams, ...ledTeams])];
  }

  if (role === 'leader') {
    const memberTeams = getUserTeamIds(userId);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    return [...new Set([...memberTeams, ...ledTeams])];
  }

  return getUserTeamIds(userId);
}

function syncUserTeams(userId, teamIds = []) {
  const uniqueTeamIds = [...new Set((teamIds || []).map(id => Number(id)).filter(Boolean))];
  db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
  if (uniqueTeamIds.length > 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)');
    uniqueTeamIds.forEach(teamId => insert.run(userId, teamId));
  }
  db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(uniqueTeamIds[0] || null, userId);
  return uniqueTeamIds;
}

function syncUserProjectGroups(userId, projectGroupIds = []) {
  const uniqueIds = [...new Set((projectGroupIds || []).map(id => Number(id)).filter(Boolean))];
  db.prepare('DELETE FROM user_project_groups WHERE user_id = ?').run(userId);
  if (uniqueIds.length > 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO user_project_groups (user_id, project_group_id) VALUES (?, ?)');
    uniqueIds.forEach(projectGroupId => insert.run(userId, projectGroupId));
  }
  return uniqueIds;
}

function syncLeadWatchers(sourceType, sourceId, watcherIds = []) {
  const uniqueIds = [...new Set((watcherIds || []).map(id => Number(id)).filter(Boolean))];
  db.prepare('DELETE FROM lead_watchers WHERE source_type = ? AND source_id = ?').run(sourceType, sourceId);
  if (uniqueIds.length > 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO lead_watchers (source_type, source_id, user_id) VALUES (?, ?, ?)');
    uniqueIds.forEach(userId => insert.run(sourceType, sourceId, userId));
  }
  return uniqueIds;
}

function syncTaskSharedUsers(taskId, sharedUserIds = []) {
  const uniqueIds = [...new Set((sharedUserIds || []).map(id => Number(id)).filter(Boolean))];
  db.prepare('DELETE FROM task_shared_users WHERE task_id = ?').run(taskId);
  if (uniqueIds.length > 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO task_shared_users (task_id, user_id) VALUES (?, ?)');
    uniqueIds.forEach(userId => insert.run(taskId, userId));
  }
  return uniqueIds;
}

function getTaskVisibleScope(userId, role, executiveRole = null) {
  if (hasTaskFullVisibility(role, executiveRole)) return { all: true, teamIds: null, userIds: null };

  const teamIds = getManagedTeamIds(userId, role) || [];
  const teamUserIds = teamIds.length ? getUsersByTeamIds(teamIds) : [];
  const userIds = [...new Set([userId, ...teamUserIds])];
  return { all: false, teamIds, userIds };
}

function buildTaskVisibilityFilter(userId, role, executiveRole = null) {
  const scope = getTaskVisibleScope(userId, role, executiveRole);
  if (scope.all) return { sql: '', params: [] };

  const conditions = [
    't.assigned_to = ?',
    't.created_by = ?',
    `EXISTS (
      SELECT 1
      FROM task_shared_users tsu
      WHERE tsu.task_id = t.id AND tsu.user_id = ?
    )`,
  ];
  const params = [userId, userId, userId];

  if (scope.teamIds.length > 0) {
    conditions.push(`t.team_id IN (${scope.teamIds.map(() => '?').join(',')})`);
    params.push(...scope.teamIds);
  }

  if (scope.userIds.length > 0) {
    conditions.push(`t.assigned_to IN (${scope.userIds.map(() => '?').join(',')})`);
    params.push(...scope.userIds);
  }

  return {
    sql: ` AND (${conditions.join(' OR ')})`,
    params,
  };
}

function validateGoalScopeFields({ scope_type, project_group_id, department, team_id }) {
  if (!scope_type) {
    return '归属颗粒度必填';
  }

  if (['project_group', 'department', 'team', 'personal'].includes(scope_type) && !project_group_id) {
    return '请选择项目组';
  }

  if (['department', 'team', 'personal'].includes(scope_type) && !department) {
    return '请选择部门';
  }

  if (['team', 'personal'].includes(scope_type) && !team_id) {
    return '请选择小组';
  }

  return null;
}

// 获取当前用户可见的所有用户ID列表（用于数据过滤）
function getVisibleUserIds(userId, role) {
  if (isAdmin(role)) return null; // null 表示不限制，看全部

  if (role === 'sales_director' || role === 'leader') {
    const visibleTeamIds = getManagedTeamIds(userId, role);
    const members = visibleTeamIds?.length ? getUsersByTeamIds(visibleTeamIds) : [];
    const directReports = role === 'leader'
      ? db.prepare('SELECT id FROM users WHERE leader_id = ?').all(userId).map(u => u.id)
      : [];
    return [...new Set([userId, ...members, ...directReports])];
  }

  // member / readonly / guest
  return [userId];
}

function getVisibleGoalOwnerIds(userId, role) {
  if (isAdmin(role)) return null;

  const me = db.prepare('SELECT id, leader_id FROM users WHERE id = ?').get(userId);
  if (!me) return [userId];

  if (role === 'sales_director') {
    return getVisibleUserIds(userId, role);
  }

  if (role === 'leader') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'goals').map(r => r.target_team_id);

    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];

    if (!allTeamIds.length) return [userId];
    const members = getUsersByTeamIds(allTeamIds);
    return [...new Set([userId, ...members])];
  }

  if (role === 'member') {
    const ids = new Set([userId]);
    if (me.leader_id) ids.add(me.leader_id);
    const myTeamIds = getUserTeamIds(userId);
    myTeamIds.forEach(teamId => {
      const team = db.prepare('SELECT leader_id FROM teams WHERE id = ?').get(teamId);
      if (team?.leader_id) ids.add(team.leader_id);
    });

    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'goals').map(r => r.target_team_id);

    if (crossTeams.length > 0) {
      const crossMembers = getUsersByTeamIds(crossTeams);
      crossMembers.forEach(m => ids.add(m));
    }

    return [...ids];
  }

  return [userId];
}

function canManageGoalForOwner(actor, ownerId) {
  if (isAdmin(actor.role)) return true;
  if (Number(ownerId) === actor.id) return true;

  const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(ownerId);
  const ownerTeamIds = getUserTeamIds(ownerId);
  const myTeamIds = getManagedTeamIds(actor.id, actor.role) || [];
  const me = db.prepare('SELECT id FROM users WHERE id = ?').get(actor.id);
  if (!owner || !me) return false;

  if (actor.role === 'leader') {
    return ownerTeamIds.some(teamId => myTeamIds.includes(teamId));
  }

  if (actor.role === 'sales_director') {
    return ownerTeamIds.some(teamId => myTeamIds.includes(teamId));
  }

  return false;
}

function isPrivatePerson(row = {}) {
  row = row || {};
  return row.visibility_scope === PRIVATE_PERSON_SCOPE;
}

function canAccessPrivatePerson(user, row = {}) {
  return isPrivatePerson(row)
    ? isExecutiveIdentity(user) && Number(row.private_owner_id) === Number(user.id)
    : true;
}

function buildPersonPrivacyFilter(userId, tableAlias = 'p') {
  const col = tableAlias ? `${tableAlias}.` : '';
  return {
    sql: ` AND (COALESCE(${col}visibility_scope, ?) != ? OR ${col}private_owner_id = ?)`,
    params: [COMPANY_PERSON_SCOPE, PRIVATE_PERSON_SCOPE, userId],
  };
}

function resolvePersonVisibilityPayload(user, requestedScope, existingPerson = null) {
  if ((requestedScope === undefined || requestedScope === null) && existingPerson) {
    return {
      visibility_scope: existingPerson.visibility_scope || COMPANY_PERSON_SCOPE,
      private_owner_id: existingPerson.private_owner_id || null,
    };
  }

  const scope = requestedScope === PRIVATE_PERSON_SCOPE ? PRIVATE_PERSON_SCOPE : COMPANY_PERSON_SCOPE;
  if (scope !== PRIVATE_PERSON_SCOPE) {
    return { visibility_scope: COMPANY_PERSON_SCOPE, private_owner_id: null };
  }

  if (!isExecutiveIdentity(user)) {
    return { error: '仅 CEO/CTO/CMO/COO 可创建个人私密人脉' };
  }

  if (existingPerson && isPrivatePerson(existingPerson) && Number(existingPerson.private_owner_id) !== Number(user.id)) {
    return { error: '无权修改此私密人脉' };
  }

  if (existingPerson && !isPrivatePerson(existingPerson) && Number(existingPerson.created_by) !== Number(user.id)) {
    return { error: '只能将自己创建的人脉转为个人私密' };
  }

  return { visibility_scope: PRIVATE_PERSON_SCOPE, private_owner_id: user.id };
}

function getPersonAccessRecord(personId) {
  return db.prepare(`
    SELECT id, created_by, assigned_to, visibility_scope, private_owner_id
    FROM persons
    WHERE id = ?
  `).get(personId);
}

function canAccessPerson(user, row = {}) {
  if (!user || !row) return false;
  if (isPrivatePerson(row)) return canAccessPrivatePerson(user, row);
  if (isAdmin(user.role)) return true;

  const ids = getVisibleUserIds(user.id, user.role);
  if (ids === null) return true;
  const visibleIds = ids.map(Number).filter(Boolean);
  if (!visibleIds.length) return false;

  const createdBy = Number(row.created_by);
  const assignedTo = Number(row.assigned_to);
  if (visibleIds.includes(createdBy) || visibleIds.includes(assignedTo)) return true;
  if (!row.id) return false;

  const placeholders = visibleIds.map(() => '?').join(',');
  return Boolean(db.prepare(`
    SELECT 1
    FROM person_shared_users
    WHERE person_id = ?
      AND user_id IN (${placeholders})
    LIMIT 1
  `).get(row.id, ...visibleIds));
}

function getVisibilityFromPerson(row = {}) {
  if (isPrivatePerson(row)) {
    return {
      visibility_scope: PRIVATE_PERSON_SCOPE,
      private_owner_id: row.private_owner_id || null,
    };
  }
  return { visibility_scope: COMPANY_PERSON_SCOPE, private_owner_id: null };
}

function validatePrivatePersonCollaboration(user, person, { opportunity_assignee, watcher_ids } = {}) {
  if (!isPrivatePerson(person)) return null;
  const ownerId = Number(person.private_owner_id);
  if (opportunity_assignee && Number(opportunity_assignee) !== ownerId) {
    return '个人私密人脉的商机只能指派给本人';
  }
  if (Array.isArray(watcher_ids) && watcher_ids.some(id => Number(id) !== ownerId)) {
    return '个人私密人脉不能添加其他关注人';
  }
  if (!isExecutiveIdentity(user) || Number(user.id) !== ownerId) {
    return '无权操作此私密人脉';
  }
  return null;
}

// 构建用户可见ID的 SQL 片段
function buildUserFilter(userId, role, tableAlias) {
  const ids = getVisibleUserIds(userId, role);
  if (ids === null) return { sql: '', params: [] }; // admin，不过滤
  const col = tableAlias ? `${tableAlias}.` : '';
  const placeholders = ids.map(() => '?').join(',');
  return {
    sql: ` AND (
      ${col}created_by IN (${placeholders})
      OR ${col}assigned_to IN (${placeholders})
      OR EXISTS (
        SELECT 1
        FROM person_shared_users psu
        WHERE psu.person_id = ${col}id
          AND psu.user_id IN (${placeholders})
      )
    )`,
    params: [...ids, ...ids, ...ids],
  };
}

// =========== 认证 API ===========
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    writeOperationLog({
      req,
      operator_name: username || null,
      business_type: '账号安全',
      action: '登录失败',
      method: 'POST',
      path: req.originalUrl,
      success: false,
      error_message: '用户名或密码错误',
      details_json: safeJsonStringifyForLog({ body: sanitizeLogPayload({ username }) }),
    });
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  const token = jwt.sign(
    { id: user.id, username: user.username, display_name: user.display_name, role: user.role, pwv: user.password_version || 0 },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  // 查模块权限
  const modulePerms = db.prepare('SELECT * FROM user_module_perms WHERE user_id = ?').all(user.id);
  const menuPerms = db.prepare('SELECT menu_key FROM user_menu_perms WHERE user_id = ?').all(user.id).map(r => r.menu_key);
  const teamIds = getUserTeamIds(user.id);
  const managedTeamIds = getManagedTeamIds(user.id, user.role) || [];
  const projectGroupIds = getUserProjectGroupIds(user.id);
  writeOperationLog({
    req,
    operator: user,
    business_type: '账号安全',
    business_id: String(user.id),
    business_name: user.display_name || user.username,
    action: '登录',
    method: 'POST',
    path: req.originalUrl,
    target_table: 'users',
    success: true,
    remark: '登录成功',
    details_json: safeJsonStringifyForLog({ body: sanitizeLogPayload({ username }) }),
  });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      department: user.department || null,
      team_id: user.team_id || null,
      team_ids: teamIds,
      managed_team_ids: managedTeamIds,
      project_group_ids: projectGroupIds,
      executive_role: user.executive_role,
      modulePerms,
      menuPerms,
    }
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, department, team_id, executive_role, last_login FROM users WHERE id = ?').get(req.user.id);
  const modulePerms = db.prepare('SELECT * FROM user_module_perms WHERE user_id = ?').all(req.user.id);
  const menuPerms = db.prepare('SELECT menu_key FROM user_menu_perms WHERE user_id = ?').all(req.user.id).map(r => r.menu_key);
  res.json({
    ...user,
    team_ids: getUserTeamIds(req.user.id),
    managed_team_ids: getManagedTeamIds(req.user.id, user.role) || [],
    project_group_ids: getUserProjectGroupIds(req.user.id),
    modulePerms,
    menuPerms,
  });
});

app.post('/api/auth/logout', auth, (req, res) => {
  res.json({ success: true });
});

app.put('/api/auth/password', auth, (req, res) => {
  const { old_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(old_password, user.password_hash)) {
    return res.status(400).json({ error: '旧密码错误' });
  }
  db.prepare('UPDATE users SET password_hash = ?, password_version = COALESCE(password_version, 0) + 1 WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ success: true });
});

// admin 重置他人密码
app.put('/api/users/:id/reset-password', auth, adminOnly, (req, res) => {
  const { new_password } = req.body;
  if (!new_password) return res.status(400).json({ error: '新密码必填' });
  db.prepare('UPDATE users SET password_hash = ?, password_version = COALESCE(password_version, 0) + 1 WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.params.id);
  res.json({ success: true });
});

// 所有登录用户可访问（用于指派选人下拉）
app.get('/api/users/simple', auth, (req, res) => {
  const { department, include_readonly } = req.query;
  const where = [];
  const params = [];

  if (!['1', 'true'].includes(String(include_readonly))) {
    where.push('role != ?');
    params.push('readonly');
  }
  if (department) {
    where.push('department = ?');
    params.push(department);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const users = db.prepare(`
    SELECT id, username, display_name, role, team_id, leader_id, department
    FROM users
    ${whereSql}
    ORDER BY display_name ASC
  `).all(...params);
  const userTeams = db.prepare('SELECT user_id, team_id FROM user_teams').all();
  const userProjectGroups = db.prepare('SELECT user_id, project_group_id FROM user_project_groups').all();
  res.json(users.map(u => ({
    ...u,
    team_ids: [...new Set([
      ...(u.team_id ? [u.team_id] : []),
      ...userTeams.filter(row => row.user_id === u.id).map(row => row.team_id),
    ])],
    project_group_ids: [...new Set(
      userProjectGroups.filter(row => row.user_id === u.id).map(row => row.project_group_id)
    )],
  })));
});

// =========== 用户管理 API（admin only）===========
app.get('/api/users', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, department, team_id, created_at, last_login FROM users ORDER BY created_at ASC').all();
  const perms = db.prepare('SELECT * FROM user_module_perms').all();
  const teams = db.prepare('SELECT * FROM teams').all();
  const userTeams = db.prepare('SELECT user_id, team_id FROM user_teams').all();
  const projectGroups = db.prepare('SELECT * FROM project_groups ORDER BY name ASC').all();
  const userProjectGroups = db.prepare('SELECT user_id, project_group_id FROM user_project_groups').all();
  res.json(users.map(u => ({
    ...u,
    modulePerms: perms.filter(p => p.user_id === u.id),
    team_ids: [...new Set([
      ...(u.team_id ? [u.team_id] : []),
      ...userTeams.filter(row => row.user_id === u.id).map(row => row.team_id),
    ])],
    team_name: teams.find(t => t.id === u.team_id)?.name || null,
    team_names: [...new Set([
      ...(u.team_id ? [teams.find(t => t.id === u.team_id)?.name].filter(Boolean) : []),
      ...userTeams
        .filter(row => row.user_id === u.id)
        .map(row => teams.find(t => t.id === row.team_id)?.name)
        .filter(Boolean),
    ])],
    project_group_ids: [...new Set(
      userProjectGroups.filter(row => row.user_id === u.id).map(row => row.project_group_id)
    )],
    project_group_names: [...new Set(
      userProjectGroups
        .filter(row => row.user_id === u.id)
        .map(row => projectGroups.find(g => g.id === row.project_group_id)?.name)
        .filter(Boolean)
    )],
  })));
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, display_name, role, modulePerms, leader_id, department, team_id, team_ids, project_group_ids } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const normalizedTeamIds = [...new Set((team_ids?.length ? team_ids : (team_id ? [team_id] : [])).map(id => Number(id)).filter(Boolean))];
    const primaryTeamId = normalizedTeamIds[0] || null;
    const r = db.prepare("INSERT INTO users (username, password_hash, display_name, role, leader_id, department, team_id) VALUES (?,?,?,?,?,?,?)").run(username, hash, display_name, role || 'member', leader_id || null, department || null, primaryTeamId);
    syncUserTeams(r.lastInsertRowid, normalizedTeamIds);
    syncUserProjectGroups(r.lastInsertRowid, project_group_ids || []);
    if (role === 'guest' && modulePerms?.length) {
      const ins = db.prepare("INSERT OR REPLACE INTO user_module_perms (user_id, module, can_read, can_write) VALUES (?,?,?,?)");
      modulePerms.forEach(p => ins.run(r.lastInsertRowid, p.module, p.can_read ? 1 : 0, p.can_write ? 1 : 0));
    }
    // sales_director 管辖的小组
    if (role === 'sales_director' && req.body.director_teams?.length) {
      const ins = db.prepare("INSERT OR IGNORE INTO director_teams (director_id, team_id) VALUES (?,?)");
      req.body.director_teams.forEach(tid => ins.run(r.lastInsertRowid, tid));
    }
    res.json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: '用户名已存在' });
  }
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const { display_name, role, password, modulePerms, leader_id, department, team_id, team_ids, project_group_ids } = req.body;
  const normalizedTeamIds = [...new Set((team_ids?.length ? team_ids : (team_id ? [team_id] : [])).map(id => Number(id)).filter(Boolean))];
  const primaryTeamId = normalizedTeamIds[0] || null;
  if (password) {
    db.prepare('UPDATE users SET display_name=?, role=?, password_hash=?, leader_id=?, department=?, team_id=? WHERE id=?').run(display_name, role, bcrypt.hashSync(password, 10), leader_id || null, department || null, primaryTeamId, req.params.id);
  } else {
    db.prepare('UPDATE users SET display_name=?, role=?, leader_id=?, department=?, team_id=? WHERE id=?').run(display_name, role, leader_id || null, department || null, primaryTeamId, req.params.id);
  }
  syncUserTeams(req.params.id, normalizedTeamIds);
  syncUserProjectGroups(req.params.id, project_group_ids || []);
  if (role === 'guest') {
    db.prepare('DELETE FROM user_module_perms WHERE user_id = ?').run(req.params.id);
    if (modulePerms?.length) {
      const ins = db.prepare("INSERT OR REPLACE INTO user_module_perms (user_id, module, can_read, can_write) VALUES (?,?,?,?)");
      modulePerms.forEach(p => ins.run(req.params.id, p.module, p.can_read ? 1 : 0, p.can_write ? 1 : 0));
    }
  }
  // 更新 sales_director 管辖的小组
  if (role === 'sales_director') {
    db.prepare('DELETE FROM director_teams WHERE director_id = ?').run(req.params.id);
    if (req.body.director_teams?.length) {
      const ins = db.prepare("INSERT OR IGNORE INTO director_teams (director_id, team_id) VALUES (?,?)");
      req.body.director_teams.forEach(tid => ins.run(req.params.id, tid));
    }
  }
  res.json({ success: true });
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM user_module_perms WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM user_menu_perms WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM user_project_groups WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== Teams API（商务小组） ===========
app.get('/api/teams', auth, (req, res) => {
  const { department } = req.query;
  let q = `SELECT t.*, u.display_name as leader_name FROM teams t LEFT JOIN users u ON t.leader_id = u.id WHERE 1=1`;
  const p = [];
  if (department) { q += ' AND t.department = ?'; p.push(department); }
  q += ' ORDER BY t.department, t.name';
  res.json(db.prepare(q).all(...p));
});

app.post('/api/teams', auth, adminOnly, (req, res) => {
  const { name, department, leader_id } = req.body;
  if (!name) return res.status(400).json({ error: '小组名称必填' });
  const r = db.prepare('INSERT INTO teams (name, department, leader_id) VALUES (?,?,?)').run(name, department || 'commercial', leader_id || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/teams/:id', auth, adminOnly, (req, res) => {
  const { name, department, leader_id } = req.body;
  db.prepare('UPDATE teams SET name=?, department=?, leader_id=? WHERE id=?').run(name, department || 'commercial', leader_id || null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/teams/:id', auth, adminOnly, (req, res) => {
  const affectedUsers = db.prepare('SELECT DISTINCT user_id FROM user_teams WHERE team_id = ?').all(req.params.id).map(r => r.user_id);
  db.prepare('DELETE FROM user_teams WHERE team_id = ?').run(req.params.id);
  db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?').run(req.params.id);
  db.prepare('UPDATE goals SET team_id = NULL WHERE team_id = ?').run(req.params.id);
  affectedUsers.forEach(userId => {
    const nextTeam = db.prepare('SELECT team_id FROM user_teams WHERE user_id = ? ORDER BY id ASC LIMIT 1').get(userId);
    db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(nextTeam?.team_id || null, userId);
  });
  db.prepare('DELETE FROM director_teams WHERE team_id = ?').run(req.params.id);
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 项目组管理 API ===========
app.get('/api/project-groups', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT pg.*, u.display_name as owner_name
    FROM project_groups pg
    LEFT JOIN users u ON pg.owner_id = u.id
    ORDER BY pg.status ASC, pg.name ASC
  `).all();
  res.json(rows);
});

app.post('/api/project-groups', auth, adminOnly, (req, res) => {
  const { name, code, description, owner_id, status } = req.body;
  if (!name) return res.status(400).json({ error: '项目组名称必填' });
  try {
    const result = db.prepare(`
      INSERT INTO project_groups (name, code, description, owner_id, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, code || null, description || null, owner_id || null, status || 'active');
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: '项目组名称已存在' });
  }
});

app.put('/api/project-groups/:id', auth, adminOnly, (req, res) => {
  const { name, code, description, owner_id, status } = req.body;
  try {
    db.prepare(`
      UPDATE project_groups SET
        name = ?,
        code = ?,
        description = ?,
        owner_id = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, code || null, description || null, owner_id || null, status || 'active', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: '更新失败，项目组名称可能重复' });
  }
});

app.delete('/api/project-groups/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM user_project_groups WHERE project_group_id = ?').run(req.params.id);
  db.prepare('UPDATE goals SET project_group_id = NULL WHERE project_group_id = ?').run(req.params.id);
  db.prepare('DELETE FROM project_groups WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 文档中心基础 API ===========
const DOCUMENT_DOMAIN_CODES = {
  domestic_project: 'CN',
  overseas_project: 'OS',
  executive_management: 'MGT',
  general: 'GEN',
  cross_region: 'CR',
};
const DOCUMENT_DEPARTMENTS = [
  { key: 'PM', name: '0_项目' },
  { key: 'PD', name: '1_产研' },
  { key: 'BD', name: '2_商务' },
  { key: 'OPS', name: '3_产运' },
  { key: 'ADS', name: '4_投放' },
];
const DOCUMENT_TEMPLATE_FOLDERS = [
  { name: '01_SOP流程规范', type: 'SOP', order: 10 },
  { name: '02_规则制度', type: 'RULE', order: 20 },
  { name: '03_模板表单', type: 'TPL', order: 30 },
  { name: '04_项目资料', type: 'SPEC', order: 40 },
  { name: '05_复盘案例', type: 'REVIEW', order: 50 },
  { name: '临时文档', type: 'TMP', order: 90 },
];

function normalizeDocumentCode(value, fallback = 'GEN', maxLength = 16) {
  const code = String(value || fallback || 'GEN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (code || fallback).slice(0, maxLength);
}

function normalizeDocumentDomain(value) {
  return DOCUMENT_DOMAIN_CODES[value] ? value : 'general';
}

function normalizeDocumentDepartment(value) {
  return normalizeDocumentCode(value, 'ALL', 8);
}

function normalizeDocumentType(value) {
  return normalizeDocumentCode(value, 'TMP', 12);
}

function getProjectCodeForDocument(projectGroupId, domain, explicitCode) {
  if (explicitCode) return normalizeDocumentCode(explicitCode, DOCUMENT_DOMAIN_CODES[normalizeDocumentDomain(domain)] || 'GEN');
  if (projectGroupId) {
    const group = db.prepare('SELECT id, code, name FROM project_groups WHERE id = ?').get(projectGroupId);
    if (group?.code) return normalizeDocumentCode(group.code, `PG${group.id}`);
    if (group?.id) return `PG${group.id}`;
  }
  return DOCUMENT_DOMAIN_CODES[normalizeDocumentDomain(domain)] || 'GEN';
}

function parseMaybeJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function collectTextFromValue(value, parts = []) {
  if (value === null || value === undefined) return parts;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) parts.push(text);
    return parts;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectTextFromValue(item, parts));
    return parts;
  }
  if (typeof value === 'object') {
    ['text', 'title', 'content', 'children', 'blocks', 'items'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(value, key)) collectTextFromValue(value[key], parts);
    });
  }
  return parts;
}

function extractDocumentText(content, explicitText) {
  if (typeof explicitText === 'string' && explicitText.trim()) return explicitText.trim();
  const parsed = typeof content === 'string' ? parseMaybeJson(content, content) : content;
  return collectTextFromValue(parsed).join('\n').slice(0, 20000);
}

function buildDocumentSummary(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function normalizeDocumentChangeLogDetail(body = {}, fallbackDetail = null, fallbackDetailText = null) {
  const hasDetail = Object.prototype.hasOwnProperty.call(body, 'detail');
  const rawDetail = hasDetail ? body.detail : fallbackDetail;
  const detail = rawDetail === null || rawDetail === undefined || rawDetail === ''
    ? null
    : (typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail));
  const explicitText = Object.prototype.hasOwnProperty.call(body, 'detail_text') ? body.detail_text : fallbackDetailText;
  const detailText = detail ? extractDocumentText(detail, explicitText) : '';
  return {
    detail,
    detail_text: detailText || null,
  };
}

function splitDocumentDiffLines(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 300);
}

function getDocumentLineMatches(oldLines, newLines) {
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  if (!oldCount || !newCount || oldCount * newCount > 40000) {
    return { matchedNewIndexes: new Set(), matchedOldByNew: new Map() };
  }

  const dp = Array.from({ length: oldCount + 1 }, () => Array(newCount + 1).fill(0));
  for (let i = oldCount - 1; i >= 0; i -= 1) {
    for (let j = newCount - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matchedNewIndexes = new Set();
  const matchedOldByNew = new Map();
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldCount && newIndex < newCount) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      matchedNewIndexes.add(newIndex);
      matchedOldByNew.set(newIndex, oldIndex);
      oldIndex += 1;
      newIndex += 1;
    } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }
  return { matchedNewIndexes, matchedOldByNew };
}

function buildInlineDocumentDiffParts(oldText, newText) {
  const before = String(oldText || '');
  const after = String(newText || '');
  if (!after) return [];
  if (!before || before === after) return [{ text: after, changed: before !== after }];

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const parts = [];
  if (start > 0) parts.push({ text: after.slice(0, start), changed: false });
  if (afterEnd >= start) parts.push({ text: after.slice(start, afterEnd + 1), changed: true });
  if (afterEnd + 1 < after.length) parts.push({ text: after.slice(afterEnd + 1), changed: false });
  return parts.filter(part => part.text);
}

function buildDocumentContentDiffItems(beforeText, afterText) {
  const oldLines = splitDocumentDiffLines(beforeText);
  const newLines = splitDocumentDiffLines(afterText);
  const oldFlat = oldLines.join('\n');
  const newFlat = newLines.join('\n');
  if (oldFlat === newFlat) return [];

  if (!newLines.length && oldLines.length) {
    return [{
      label: '删除内容',
      lines: oldLines.slice(0, 8).map(line => ({
        text: `删除：${line}`,
        changed: true,
        parts: [{ text: `删除：${line}`, changed: true }],
      })),
    }];
  }

  const { matchedNewIndexes, matchedOldByNew } = getDocumentLineMatches(oldLines, newLines);
  const changedIndexes = newLines
    .map((_, index) => index)
    .filter(index => !matchedNewIndexes.has(index));

  if (!changedIndexes.length) {
    const removed = oldLines.filter(line => !newLines.includes(line));
    return removed.length ? [{
      label: '删除内容',
      lines: removed.slice(0, 8).map(line => ({
        text: `删除：${line}`,
        changed: true,
        parts: [{ text: `删除：${line}`, changed: true }],
      })),
    }] : [];
  }

  const groups = [];
  changedIndexes.forEach(index => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && index <= lastGroup.end + 1) {
      lastGroup.end = index;
    } else {
      groups.push({ start: index, end: index });
    }
  });

  return groups.slice(0, 8).map(group => {
    const start = Math.max(0, group.start - 1);
    const end = Math.min(newLines.length - 1, group.end + 1);
    const lines = [];
    for (let index = start; index <= end; index += 1) {
      const changed = index >= group.start && index <= group.end;
      const oldIndex = matchedOldByNew.has(index) ? matchedOldByNew.get(index) : index;
      lines.push({
        text: newLines[index],
        changed,
        parts: changed
          ? buildInlineDocumentDiffParts(oldLines[oldIndex], newLines[index])
          : [{ text: newLines[index], changed: false }],
      });
    }
    return { label: '更新内容', lines };
  });
}

function buildDocumentEditDiff(before, after) {
  const beforeTitle = String(before?.title || '').trim();
  const afterTitle = String(after?.title || '').trim();
  const beforeText = String(before?.content_text || '').trim();
  const afterText = String(after?.content_text || '').trim();
  const items = [];

  if (beforeTitle !== afterTitle) {
    items.push({
      label: '标题',
      lines: [
        ...(beforeTitle ? [{ text: `原标题：${beforeTitle}`, changed: false, parts: [{ text: `原标题：${beforeTitle}`, changed: false }] }] : []),
        {
          text: `新标题：${afterTitle || '未命名文档'}`,
          changed: true,
          parts: buildInlineDocumentDiffParts(beforeTitle ? `新标题：${beforeTitle}` : '', `新标题：${afterTitle || '未命名文档'}`),
        },
      ],
    });
  }

  items.push(...buildDocumentContentDiffItems(beforeText, afterText));
  const changedText = items
    .flatMap(item => item.lines || [])
    .filter(line => line.changed)
    .map(line => line.text)
    .join('\n')
    .slice(0, 2000);

  return items.length ? { items, changed_text: changedText } : null;
}

function insertDocumentEditRecord(documentId, userId, actionType, before, after) {
  const diff = buildDocumentEditDiff(before, after);
  if (!diff) return;
  const beforeContent = before?.content === undefined || before?.content === null
    ? null
    : (typeof before.content === 'string' ? before.content : JSON.stringify(before.content));
  const afterContent = after?.content === undefined || after?.content === null
    ? null
    : (typeof after.content === 'string' ? after.content : JSON.stringify(after.content));
  db.prepare(`
    INSERT INTO document_edit_records (
      document_id, edited_by, action_type, title_before, title_after,
      content_before, content_after, content_text_before, content_text_after,
      diff_json, diff_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    documentId,
    userId,
    actionType || 'content_update',
    before?.title || null,
    after?.title || null,
    beforeContent,
    afterContent,
    before?.content_text || null,
    after?.content_text || null,
    JSON.stringify(diff),
    diff.changed_text || null
  );
}

function hasDocumentSnapshotContent(value) {
  return value !== undefined && value !== null && String(value) !== '';
}

function resolveDocumentEditRecordRestoreSnapshot(record, documentRow) {
  if (!record) return null;
  if (hasDocumentSnapshotContent(record.content_after)) {
    const content = record.content_after;
    return {
      title: record.title_after || documentRow?.title || '未命名文档',
      content,
      content_text: record.content_text_after || extractDocumentText(content),
    };
  }

  const nextRecord = db.prepare(`
    SELECT title_before, content_before, content_text_before
    FROM document_edit_records
    WHERE document_id = ? AND id > ?
      AND content_before IS NOT NULL AND content_before <> ''
    ORDER BY id ASC
    LIMIT 1
  `).get(record.document_id, record.id);
  if (hasDocumentSnapshotContent(nextRecord?.content_before)) {
    const content = nextRecord.content_before;
    return {
      title: nextRecord.title_before || record.title_after || documentRow?.title || '未命名文档',
      content,
      content_text: nextRecord.content_text_before || record.content_text_after || extractDocumentText(content),
    };
  }

  const latestRecord = db.prepare(`
    SELECT id FROM document_edit_records
    WHERE document_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(record.document_id);
  if (Number(latestRecord?.id) === Number(record.id) && hasDocumentSnapshotContent(documentRow?.content)) {
    return {
      title: record.title_after || documentRow.title || '未命名文档',
      content: documentRow.content,
      content_text: record.content_text_after || documentRow.content_text || extractDocumentText(documentRow.content),
    };
  }

  return null;
}

function formatDocumentNo(seq, projectCode, departmentKey, docType, year) {
  const seqText = String(seq).padStart(6, '0');
  return [
    `D${seqText}`,
    normalizeDocumentCode(projectCode, 'GEN'),
    normalizeDocumentDepartment(departmentKey),
    normalizeDocumentType(docType),
    String(year || new Date().getFullYear()),
  ].join('-');
}

function getNextDocumentSequence() {
  const row = db.prepare('SELECT next_seq FROM document_sequence_state WHERE scope_key = ?').get('global');
  if (!row) {
    db.prepare('INSERT INTO document_sequence_state (scope_key, next_seq) VALUES (?, ?)').run('global', 2);
    return 1;
  }
  db.prepare('UPDATE document_sequence_state SET next_seq = next_seq + 1, updated_at = CURRENT_TIMESTAMP WHERE scope_key = ?').run('global');
  return row.next_seq;
}

function canManageDocument(user, document) {
  if (!user || !document) return false;
  return isAdmin(user.role) || isExecutiveIdentity(user) || Number(document.created_by) === Number(user.id);
}

function buildDocumentVisibilityFilter(user, alias = 'd') {
  if (isAdmin(user.role) || isExecutiveIdentity(user)) return { sql: '', params: [] };

  const clauses = [`${alias}.created_by = ?`];
  const params = [user.id];

  clauses.push(`EXISTS (SELECT 1 FROM document_shares ds_user WHERE ds_user.document_id = ${alias}.id AND ds_user.target_type = 'user' AND ds_user.target_id = ?)`);
  params.push(user.id);

  if (user.department) {
    clauses.push(`EXISTS (SELECT 1 FROM document_shares ds_dept WHERE ds_dept.document_id = ${alias}.id AND ds_dept.target_type = 'department' AND ds_dept.target_key = ?)`);
    params.push(user.department);
  }

  const teamIds = getUserTeamIds(user.id);
  if (teamIds.length) {
    clauses.push(`EXISTS (SELECT 1 FROM document_shares ds_team WHERE ds_team.document_id = ${alias}.id AND ds_team.target_type = 'team' AND ds_team.target_id IN (${teamIds.map(() => '?').join(',')}))`);
    params.push(...teamIds);
  }

  const projectGroupIds = getUserProjectGroupIds(user.id);
  if (projectGroupIds.length) {
    clauses.push(`EXISTS (SELECT 1 FROM document_shares ds_pg WHERE ds_pg.document_id = ${alias}.id AND ds_pg.target_type = 'project_group' AND ds_pg.target_id IN (${projectGroupIds.map(() => '?').join(',')}))`);
    params.push(...projectGroupIds);
  }

  return { sql: ` AND (${clauses.join(' OR ')})`, params };
}

function getVisibleDocument(id, user) {
  const visibility = buildDocumentVisibilityFilter(user, 'd');
  return db.prepare(`
    SELECT d.*,
      creator.display_name as created_by_name,
      updater.display_name as updated_by_name,
      pg.name as project_group_name,
      f.name as folder_name,
      CASE WHEN fav.user_id IS NULL THEN 0 ELSE 1 END as is_favorite
    FROM documents d
    LEFT JOIN users creator ON d.created_by = creator.id
    LEFT JOIN users updater ON d.updated_by = updater.id
    LEFT JOIN project_groups pg ON d.project_group_id = pg.id
    LEFT JOIN document_folders f ON d.folder_id = f.id
    LEFT JOIN document_favorites fav ON fav.document_id = d.id AND fav.user_id = ?
    WHERE d.id = ? AND COALESCE(d.is_deleted, 0) = 0
    ${visibility.sql}
  `).get(user.id, id, ...visibility.params);
}

function normalizeDocumentShares(shares) {
  if (!Array.isArray(shares)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of shares) {
    const targetType = item?.target_type;
    if (!['project_group', 'department', 'team', 'user'].includes(targetType)) continue;
    const targetId = targetType === 'department' ? null : Number(item.target_id);
    const targetKey = targetType === 'department' ? String(item.target_key || '').trim() : null;
    if (targetType === 'department' && !targetKey) continue;
    if (targetType !== 'department' && !targetId) continue;
    const key = `${targetType}:${targetId || ''}:${targetKey || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ target_type: targetType, target_id: targetId, target_key: targetKey });
  }
  return rows;
}

function replaceDocumentShares(documentId, shares, userId) {
  const normalized = normalizeDocumentShares(shares);
  db.prepare('DELETE FROM document_shares WHERE document_id = ?').run(documentId);
  const insert = db.prepare(`
    INSERT INTO document_shares (document_id, target_type, target_id, target_key, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  normalized.forEach(share => insert.run(documentId, share.target_type, share.target_id, share.target_key, userId));
  return normalized;
}

function getDocumentShares(documentId) {
  return db.prepare(`
    SELECT ds.*,
      u.display_name as user_name,
      t.name as team_name,
      pg.name as project_group_name
    FROM document_shares ds
    LEFT JOIN users u ON ds.target_type = 'user' AND ds.target_id = u.id
    LEFT JOIN teams t ON ds.target_type = 'team' AND ds.target_id = t.id
    LEFT JOIN project_groups pg ON ds.target_type = 'project_group' AND ds.target_id = pg.id
    WHERE ds.document_id = ?
    ORDER BY ds.target_type, ds.id
  `).all(documentId);
}

function addDocumentAccessUser(accessMap, userId, source) {
  const id = Number(userId);
  if (!id) return;
  if (!accessMap.has(id)) {
    accessMap.set(id, new Set());
  }
  accessMap.get(id).add(source);
}

function getDocumentAccessMap(document) {
  const accessMap = new Map();
  if (!document) return accessMap;
  if (document.created_by) addDocumentAccessUser(accessMap, document.created_by, 'creator');

  db.prepare(`
    SELECT id FROM users
    WHERE role IN ('admin', 'ceo', 'coo', 'cto', 'cmo')
       OR executive_role IN ('ceo', 'coo', 'cto', 'cmo')
  `).all().forEach(row => addDocumentAccessUser(accessMap, row.id, 'default'));

  const shares = db.prepare('SELECT target_type, target_id, target_key FROM document_shares WHERE document_id = ?').all(document.id);
  shares.forEach(share => {
    if (share.target_type === 'user' && share.target_id) {
      addDocumentAccessUser(accessMap, share.target_id, 'user');
    } else if (share.target_type === 'department' && share.target_key) {
      db.prepare('SELECT id FROM users WHERE department = ?').all(share.target_key)
        .forEach(row => addDocumentAccessUser(accessMap, row.id, 'department'));
    } else if (share.target_type === 'team' && share.target_id) {
      getUsersByTeamIds([Number(share.target_id)]).forEach(id => addDocumentAccessUser(accessMap, id, 'team'));
    } else if (share.target_type === 'project_group' && share.target_id) {
      db.prepare('SELECT user_id FROM user_project_groups WHERE project_group_id = ?').all(share.target_id)
        .forEach(row => addDocumentAccessUser(accessMap, row.user_id, 'project_group'));
    }
  });
  return accessMap;
}

function getDocumentAccessUserIds(document) {
  return [...getDocumentAccessMap(document).keys()];
}

function shouldShowDocumentAccessUser(user) {
  return user?.role !== 'admin';
}

function getDocumentAccessUsers(document) {
  const accessMap = getDocumentAccessMap(document);
  const ids = [...accessMap.keys()];
  if (!ids.length) return [];
  const rows = db.prepare(`
    SELECT id, username, display_name, role, executive_role, department, team_id
    FROM users
    WHERE id IN (${ids.map(() => '?').join(',')})
  `).all(...ids);
  const usersById = new Map(rows.map(row => [Number(row.id), row]));
  return ids
    .map(id => {
      const row = usersById.get(id);
      if (!row) return null;
      const sourceTypes = [...accessMap.get(id)];
      return {
        id,
        name: row.display_name || row.username || `用户${id}`,
        username: row.username,
        role: row.role,
        executive_role: row.executive_role,
        department: row.department,
        team_id: row.team_id,
        source_types: sourceTypes,
        is_creator: sourceTypes.includes('creator') ? 1 : 0,
        is_default: sourceTypes.includes('default') ? 1 : 0,
        is_shared: sourceTypes.some(type => !['creator', 'default'].includes(type)) ? 1 : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      Number(b.is_creator) - Number(a.is_creator)
      || Number(b.is_default) - Number(a.is_default)
      || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
    ));
}

function getDocumentAccessSummary(document) {
  const users = getDocumentAccessUsers(document).filter(shouldShowDocumentAccessUser);
  return {
    access_count: users.length,
    label: users.length <= 1 ? '仅自己' : `共 ${users.length} 人`,
    users,
  };
}

function serializeDocument(row, options = {}) {
  if (!row) return null;
  const result = {
    ...row,
    tags: parseMaybeJson(row.tags, []),
    is_favorite: Number(row.is_favorite || 0),
  };
  if (options.withAccessSummary) result.access_summary = getDocumentAccessSummary(row);
  return result;
}

function serializeDocumentEditRecord(row, options = {}) {
  if (!row) return null;
  const {
    content_before,
    content_after,
    content_text_before,
    content_text_after,
    ...rest
  } = row;
  return {
    ...rest,
    can_restore: Boolean(resolveDocumentEditRecordRestoreSnapshot(row, options.document)),
    diff: parseMaybeJson(row.diff_json, { items: [] }),
  };
}

function createDocumentRecord(body, user) {
  const createDoc = db.transaction(() => {
    const folder = body.folder_id ? db.prepare('SELECT * FROM document_folders WHERE id = ?').get(body.folder_id) : null;
    const domain = normalizeDocumentDomain(body.domain || folder?.domain);
    const projectGroupId = body.project_group_id ?? folder?.project_group_id ?? null;
    const departmentKey = normalizeDocumentDepartment(body.department_key || folder?.department_key || 'ALL');
    const docType = normalizeDocumentType(body.doc_type || folder?.default_doc_type || 'TMP');
    const projectCode = getProjectCodeForDocument(projectGroupId, domain, body.project_code);
    const globalSeq = getNextDocumentSequence();
    const year = new Date().getFullYear();
    const documentNo = formatDocumentNo(globalSeq, projectCode, departmentKey, docType, year);
    const content = body.content ?? JSON.stringify({ blocks: [] });
    const contentText = extractDocumentText(content, body.content_text);
    const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : (body.tags || null);
    const result = db.prepare(`
      INSERT INTO documents (
        document_no, global_seq, title, content, content_text, summary, domain,
        project_group_id, project_code, department_key, doc_type, current_version,
        folder_id, tags, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      documentNo,
      globalSeq,
      body.title || '未命名文档',
      typeof content === 'string' ? content : JSON.stringify(content),
      contentText,
      buildDocumentSummary(contentText),
      domain,
      projectGroupId || null,
      projectCode,
      departmentKey,
      docType,
      body.current_version || 'V1.0',
      body.folder_id || null,
      tags,
      user.id,
      user.id
    );
    if (Array.isArray(body.shares)) replaceDocumentShares(result.lastInsertRowid, body.shares, user.id);
    return result.lastInsertRowid;
  });
  return createDoc();
}

app.get('/api/document-folders', (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, pg.name as project_group_name
    FROM document_folders f
    LEFT JOIN project_groups pg ON f.project_group_id = pg.id
    ORDER BY f.domain, COALESCE(pg.name, ''), f.department_key, f.sort_order, f.name
  `).all();
  res.json(rows);
});

app.post('/api/document-folders', canWrite, (req, res) => {
  const { name, parent_id, domain, project_group_id, department_key, default_doc_type, sort_order } = req.body;
  if (!String(name || '').trim()) return res.status(400).json({ error: '目录名称必填' });
  const result = db.prepare(`
    INSERT INTO document_folders (name, parent_id, domain, project_group_id, department_key, default_doc_type, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(name).trim(),
    parent_id || null,
    normalizeDocumentDomain(domain),
    project_group_id || null,
    normalizeDocumentDepartment(department_key || 'ALL'),
    normalizeDocumentType(default_doc_type || 'TMP'),
    Number(sort_order) || 0,
    req.user.id
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/document-folders/:id', canWrite, (req, res) => {
  const existing = db.prepare('SELECT id FROM document_folders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '目录不存在' });
  const { name, parent_id, domain, project_group_id, department_key, default_doc_type, sort_order } = req.body;
  if (!String(name || '').trim()) return res.status(400).json({ error: '目录名称必填' });
  db.prepare(`
    UPDATE document_folders SET
      name = ?, parent_id = ?, domain = ?, project_group_id = ?, department_key = ?,
      default_doc_type = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(name).trim(),
    parent_id || null,
    normalizeDocumentDomain(domain),
    project_group_id || null,
    normalizeDocumentDepartment(department_key || 'ALL'),
    normalizeDocumentType(default_doc_type || 'TMP'),
    Number(sort_order) || 0,
    req.params.id
  );
  res.json({ success: true });
});

app.delete('/api/document-folders/:id', canWrite, (req, res) => {
  const linked = db.prepare('SELECT COUNT(*) as count FROM documents WHERE folder_id = ? AND COALESCE(is_deleted, 0) = 0').get(req.params.id).count;
  if (linked > 0) return res.status(400).json({ error: '目录下仍有文档，不能删除' });
  db.prepare('DELETE FROM document_folders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/document-folders/apply-template', canWrite, (req, res) => {
  const domain = normalizeDocumentDomain(req.body.domain);
  const projectGroupId = req.body.project_group_id || null;
  const departments = Array.isArray(req.body.departments) && req.body.departments.length
    ? req.body.departments.map(item => ({ key: normalizeDocumentDepartment(item.key || item), name: item.name || item.key || item }))
    : DOCUMENT_DEPARTMENTS;
  const insert = db.prepare(`
    INSERT INTO document_folders (name, domain, project_group_id, department_key, default_doc_type, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let created = 0;
  for (const department of departments) {
    for (const folder of DOCUMENT_TEMPLATE_FOLDERS) {
      const exists = db.prepare(`
        SELECT id FROM document_folders
        WHERE name = ? AND domain = ? AND COALESCE(project_group_id, 0) = COALESCE(?, 0) AND department_key = ?
      `).get(folder.name, domain, projectGroupId, department.key);
      if (exists) continue;
      insert.run(folder.name, domain, projectGroupId, department.key, folder.type, folder.order, req.user.id);
      created++;
    }
  }
  res.json({ success: true, created });
});

app.get('/api/documents', (req, res) => {
  const { search, domain, folder_id, project_group_id, department_key, doc_type, favorite, sop_only } = req.query;
  const visibility = buildDocumentVisibilityFilter(req.user, 'd');
  let q = `
    SELECT d.id, d.document_no, d.global_seq, d.title, d.summary, d.domain, d.project_group_id,
      d.project_code, d.department_key, d.doc_type, d.current_version, d.folder_id,
      d.tags, d.created_by, d.updated_by, d.created_at, d.updated_at,
      creator.display_name as created_by_name,
      updater.display_name as updated_by_name,
      pg.name as project_group_name,
      f.name as folder_name,
      CASE WHEN fav.user_id IS NULL THEN 0 ELSE 1 END as is_favorite
    FROM documents d
    LEFT JOIN users creator ON d.created_by = creator.id
    LEFT JOIN users updater ON d.updated_by = updater.id
    LEFT JOIN project_groups pg ON d.project_group_id = pg.id
    LEFT JOIN document_folders f ON d.folder_id = f.id
    LEFT JOIN document_favorites fav ON fav.document_id = d.id AND fav.user_id = ?
    WHERE COALESCE(d.is_deleted, 0) = 0
    ${visibility.sql}
  `;
  const params = [req.user.id, ...visibility.params];
  if (search) {
    const kw = `%${String(search).trim()}%`;
    q += ' AND (d.title LIKE ? OR d.document_no LIKE ? OR d.content_text LIKE ? OR d.tags LIKE ?)';
    params.push(kw, kw, kw, kw);
  }
  if (domain) { q += ' AND d.domain = ?'; params.push(domain); }
  if (folder_id) { q += ' AND d.folder_id = ?'; params.push(folder_id); }
  if (project_group_id) { q += ' AND d.project_group_id = ?'; params.push(project_group_id); }
  if (department_key) { q += ' AND d.department_key = ?'; params.push(normalizeDocumentDepartment(department_key)); }
  if (doc_type) { q += ' AND d.doc_type = ?'; params.push(normalizeDocumentType(doc_type)); }
  if (sop_only === '1' || sop_only === 'true') { q += " AND d.doc_type = 'SOP'"; }
  if (favorite === '1' || favorite === 'true') { q += ' AND fav.user_id IS NOT NULL'; }
  q += ' ORDER BY d.updated_at DESC, d.id DESC';
  res.json(db.prepare(q).all(...params).map(row => serializeDocument(row)));
});

app.post('/api/documents', canWrite, (req, res) => {
  const id = createDocumentRecord(req.body || {}, req.user);
  const row = getVisibleDocument(id, req.user);
  res.json(serializeDocument(row, { withAccessSummary: true }));
});

app.get('/api/documents/:id', (req, res) => {
  const row = getVisibleDocument(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: '文档不存在或无权限访问' });
  res.json({
    ...serializeDocument(row, { withAccessSummary: true }),
    shares: getDocumentShares(row.id),
    change_logs: db.prepare(`
      SELECT l.*, u.display_name as changed_by_name
      FROM document_change_logs l
      LEFT JOIN users u ON l.changed_by = u.id
      WHERE l.document_id = ?
      ORDER BY datetime(COALESCE(l.changed_at, l.created_at)) DESC, l.id DESC
    `).all(row.id),
    edit_records: db.prepare(`
      SELECT e.*, u.display_name as edited_by_name
      FROM document_edit_records e
      LEFT JOIN users u ON e.edited_by = u.id
      WHERE e.document_id = ?
      ORDER BY datetime(COALESCE(e.edited_at, e.created_at)) DESC, e.id DESC
      LIMIT 80
    `).all(row.id).map(editRecord => serializeDocumentEditRecord(editRecord, { document: row })),
  });
});

app.put('/api/documents/:id', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以编辑文档' });
  const hasBodyField = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
  const nextFolderId = hasBodyField('folder_id') ? (req.body.folder_id || null) : doc.folder_id;
  const folder = nextFolderId ? db.prepare('SELECT * FROM document_folders WHERE id = ?').get(nextFolderId) : null;
  if (nextFolderId && !folder) return res.status(400).json({ error: '目标目录不存在' });
  const domain = normalizeDocumentDomain(hasBodyField('domain') ? req.body.domain : (folder?.domain ?? doc.domain));
  const projectGroupId = hasBodyField('project_group_id')
    ? (req.body.project_group_id || null)
    : (folder ? (folder.project_group_id || null) : doc.project_group_id);
  const departmentKey = normalizeDocumentDepartment(hasBodyField('department_key') ? req.body.department_key : (folder?.department_key ?? doc.department_key));
  const docType = normalizeDocumentType(hasBodyField('doc_type') ? req.body.doc_type : (doc.doc_type ?? folder?.default_doc_type));
  const content = Object.prototype.hasOwnProperty.call(req.body, 'content') ? req.body.content : doc.content;
  const storedContent = typeof content === 'string' ? content : JSON.stringify(content);
  const contentText = extractDocumentText(content, req.body.content_text);
  const beforeSnapshot = {
    title: doc.title,
    content: doc.content,
    content_text: doc.content_text,
  };
  const afterSnapshot = {
    title: req.body.title || doc.title,
    content: storedContent,
    content_text: contentText,
  };
  const tags = Array.isArray(req.body.tags) ? JSON.stringify(req.body.tags) : (req.body.tags ?? doc.tags);
  db.prepare(`
    UPDATE documents SET
      title = ?, content = ?, content_text = ?, summary = ?, domain = ?, project_group_id = ?,
      project_code = ?, department_key = ?, doc_type = ?, current_version = ?, folder_id = ?,
      tags = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    req.body.title || doc.title,
    storedContent,
    contentText,
    buildDocumentSummary(contentText),
    domain,
    projectGroupId || null,
    getProjectCodeForDocument(projectGroupId, domain, req.body.project_code || doc.project_code),
    departmentKey,
    docType,
    req.body.current_version || doc.current_version || 'V1.0',
    nextFolderId,
    tags,
    req.user.id,
    doc.id
  );
  insertDocumentEditRecord(doc.id, req.user.id, 'page_update', beforeSnapshot, afterSnapshot);
  res.json(serializeDocument(getVisibleDocument(doc.id, req.user), { withAccessSummary: true }));
});

app.put('/api/documents/:id/content', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以编辑文档' });
  const content = req.body.content ?? JSON.stringify({ blocks: [] });
  const storedContent = typeof content === 'string' ? content : JSON.stringify(content);
  const contentText = extractDocumentText(content, req.body.content_text);
  const beforeSnapshot = {
    title: doc.title,
    content: doc.content,
    content_text: doc.content_text,
  };
  const afterSnapshot = {
    title: doc.title,
    content: storedContent,
    content_text: contentText,
  };
  db.prepare(`
    UPDATE documents SET content = ?, content_text = ?, summary = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    storedContent,
    contentText,
    buildDocumentSummary(contentText),
    req.user.id,
    doc.id
  );
  insertDocumentEditRecord(doc.id, req.user.id, 'content_update', beforeSnapshot, afterSnapshot);
  res.json({ success: true, summary: buildDocumentSummary(contentText), updated_at: new Date().toISOString() });
});

app.post('/api/document-edit-records/:recordId/restore', canWrite, (req, res) => {
  const record = db.prepare('SELECT * FROM document_edit_records WHERE id = ?').get(req.params.recordId);
  if (!record) return res.status(404).json({ error: '页面编辑记录不存在' });
  const doc = getVisibleDocument(record.document_id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以恢复文档版本' });
  const restoreSnapshot = resolveDocumentEditRecordRestoreSnapshot(record, doc);
  if (!restoreSnapshot) return res.status(400).json({ error: '该页面编辑记录缺少可恢复快照，无法恢复' });

  const targetTitle = restoreSnapshot.title;
  const targetContent = restoreSnapshot.content;
  const targetContentText = restoreSnapshot.content_text;
  const beforeSnapshot = {
    title: doc.title,
    content: doc.content,
    content_text: doc.content_text,
  };
  const afterSnapshot = {
    title: targetTitle,
    content: targetContent,
    content_text: targetContentText,
  };

  db.prepare(`
    UPDATE documents SET
      title = ?, content = ?, content_text = ?, summary = ?,
      updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    targetTitle,
    targetContent,
    targetContentText,
    buildDocumentSummary(targetContentText),
    req.user.id,
    doc.id
  );
  insertDocumentEditRecord(doc.id, req.user.id, 'restore_version', beforeSnapshot, afterSnapshot);
  res.json(serializeDocument(getVisibleDocument(doc.id, req.user), { withAccessSummary: true }));
});

app.put('/api/documents/:id/page-options', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以编辑文档' });
  db.prepare(`
    UPDATE documents SET
      toc_enabled = ?, width_mode = ?, custom_width = ?, small_font_enabled = ?,
      title_numbering_enabled = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    req.body.toc_enabled ? 1 : 0,
    req.body.width_mode || doc.width_mode || 'standard',
    req.body.custom_width || null,
    req.body.small_font_enabled ? 1 : 0,
    req.body.title_numbering_enabled ? 1 : 0,
    req.user.id,
    doc.id
  );
  res.json({ success: true });
});

app.post('/api/documents/:id/renumber', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!(isAdmin(req.user.role) || isExecutiveIdentity(req.user))) {
    return res.status(403).json({ error: '仅管理员或高管可以刷新文档编号业务字段' });
  }
  if (!String(req.body.reason || '').trim()) return res.status(400).json({ error: '请填写重新编号原因' });
  const domain = normalizeDocumentDomain(req.body.domain || doc.domain);
  const projectGroupId = req.body.project_group_id ?? doc.project_group_id;
  const projectCode = getProjectCodeForDocument(projectGroupId, domain, req.body.project_code || doc.project_code);
  const departmentKey = normalizeDocumentDepartment(req.body.department_key || doc.department_key);
  const docType = normalizeDocumentType(req.body.doc_type || doc.doc_type);
  const year = String(req.body.year || doc.created_at || '').slice(0, 4) || new Date().getFullYear();
  const documentNo = formatDocumentNo(doc.global_seq, projectCode, departmentKey, docType, year);
  db.prepare(`
    UPDATE documents SET
      document_no = ?, domain = ?, project_group_id = ?, project_code = ?,
      department_key = ?, doc_type = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(documentNo, domain, projectGroupId || null, projectCode, departmentKey, docType, req.user.id, doc.id);
  db.prepare(`
    INSERT INTO document_change_logs (document_id, version, changed_by, summary, remark)
    VALUES (?, ?, ?, ?, ?)
  `).run(doc.id, doc.current_version || 'V1.0', req.user.id, '刷新文档编号业务字段', String(req.body.reason).trim());
  res.json(serializeDocument(getVisibleDocument(doc.id, req.user), { withAccessSummary: true }));
});

app.delete('/api/documents/:id', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以删除文档' });
  db.prepare('UPDATE documents SET is_deleted = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.id, doc.id);
  res.json({ success: true });
});

app.get('/api/documents/:id/shares', (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  res.json(getDocumentShares(doc.id));
});

app.put('/api/documents/:id/shares', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以调整共享范围' });
  const shares = replaceDocumentShares(doc.id, req.body.shares || [], req.user.id);
  res.json({ success: true, shares, access_summary: getDocumentAccessSummary(doc) });
});

app.get('/api/documents/:id/access-summary', (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  res.json(getDocumentAccessSummary(doc));
});

app.post('/api/documents/:id/favorite', (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  db.prepare('INSERT OR IGNORE INTO document_favorites (user_id, document_id) VALUES (?, ?)').run(req.user.id, doc.id);
  res.json({ success: true });
});

app.delete('/api/documents/:id/favorite', (req, res) => {
  db.prepare('DELETE FROM document_favorites WHERE user_id = ? AND document_id = ?').run(req.user.id, req.params.id);
  res.json({ success: true });
});

app.get('/api/documents/:id/change-logs', (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  res.json(db.prepare(`
    SELECT l.*, u.display_name as changed_by_name
    FROM document_change_logs l
    LEFT JOIN users u ON l.changed_by = u.id
    WHERE l.document_id = ?
    ORDER BY datetime(COALESCE(l.changed_at, l.created_at)) DESC, l.id DESC
  `).all(doc.id));
});

app.post('/api/documents/:id/change-logs', canWrite, (req, res) => {
  const doc = getVisibleDocument(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以维护改动历史' });
  if (!String(req.body.summary || '').trim()) return res.status(400).json({ error: '改动摘要必填' });
  const version = req.body.version || doc.current_version || 'V1.0';
  const changeDetail = normalizeDocumentChangeLogDetail(req.body);
  const result = db.prepare(`
    INSERT INTO document_change_logs (document_id, version, changed_at, changed_by, summary, detail, detail_text, impact_scope, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    doc.id,
    version,
    req.body.changed_at || new Date().toISOString(),
    req.user.id,
    String(req.body.summary).trim(),
    changeDetail.detail,
    changeDetail.detail_text,
    req.body.impact_scope || null,
    req.body.remark || null
  );
  db.prepare('UPDATE documents SET current_version = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(version, req.user.id, doc.id);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/document-change-logs/:logId', canWrite, (req, res) => {
  const log = db.prepare('SELECT * FROM document_change_logs WHERE id = ?').get(req.params.logId);
  if (!log) return res.status(404).json({ error: '改动历史不存在' });
  const doc = getVisibleDocument(log.document_id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!(canManageDocument(req.user, doc) || Number(log.changed_by) === Number(req.user.id))) {
    return res.status(403).json({ error: '只有创建人、管理员、高管或记录创建人可以维护改动历史' });
  }
  if (!String(req.body.summary || '').trim()) return res.status(400).json({ error: '改动摘要必填' });
  const changeDetail = normalizeDocumentChangeLogDetail(req.body, log.detail, log.detail_text);
  db.prepare(`
    UPDATE document_change_logs SET
      version = ?, changed_at = ?, summary = ?, detail = ?, detail_text = ?, impact_scope = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    req.body.version || log.version,
    req.body.changed_at || log.changed_at,
    String(req.body.summary).trim(),
    changeDetail.detail,
    changeDetail.detail_text,
    req.body.impact_scope || null,
    req.body.remark || null,
    log.id
  );
  res.json({ success: true });
});

app.delete('/api/document-change-logs/:logId', canWrite, (req, res) => {
  const log = db.prepare('SELECT * FROM document_change_logs WHERE id = ?').get(req.params.logId);
  if (!log) return res.status(404).json({ error: '改动历史不存在' });
  const doc = getVisibleDocument(log.document_id, req.user);
  if (!doc) return res.status(404).json({ error: '文档不存在或无权限访问' });
  if (!canManageDocument(req.user, doc)) return res.status(403).json({ error: '只有创建人、管理员或高管可以维护改动历史' });
  db.prepare('DELETE FROM document_change_logs WHERE id = ?').run(log.id);
  res.json({ success: true });
});

// 获取某个 sales_director 管辖的小组
app.get('/api/users/:id/director-teams', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, u.display_name as leader_name
    FROM director_teams dt
    JOIN teams t ON dt.team_id = t.id
    LEFT JOIN users u ON t.leader_id = u.id
    WHERE dt.director_id = ?
  `).all(req.params.id);
  res.json(rows);
});

// =========== 菜单权限 API（admin only）===========
// 获取某用户的菜单权限
app.get('/api/admin/menu-perms/:userId', auth, adminOnly, (req, res) => {
  const keys = db.prepare('SELECT menu_key FROM user_menu_perms WHERE user_id = ?').all(req.params.userId).map(r => r.menu_key);
  res.json({ userId: parseInt(req.params.userId), menuKeys: keys });
});

// 保存某用户的菜单权限（全量替换）
app.put('/api/admin/menu-perms/:userId', auth, adminOnly, (req, res) => {
  const userId = parseInt(req.params.userId);
  const { menuKeys } = req.body; // string[]
  if (!Array.isArray(menuKeys)) return res.status(400).json({ error: 'menuKeys 必须为数组' });

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM user_menu_perms WHERE user_id = ?').run(userId);
    const ins = db.prepare('INSERT INTO user_menu_perms (user_id, menu_key) VALUES (?, ?)');
    for (const key of menuKeys) {
      ins.run(userId, key);
    }
  });
  replace();
  res.json({ success: true });
});

// =========== 人脉 API ===========
app.get('/api/persons', (req, res) => {
  const { search, person_category, relation_type, potential_level, recruit_status, intent_level, city, weight, created_by, visibility_scope } = req.query;
  const { id: me, role } = req.user;
  let query = `
    SELECT p.*,
      u1.display_name as created_by_name,
      u2.display_name as assigned_to_name,
      (
        SELECT GROUP_CONCAT(u.display_name, ', ')
        FROM person_shared_users psu
        LEFT JOIN users u ON psu.user_id = u.id
        WHERE psu.person_id = p.id
      ) as shared_to_names,
      (
        SELECT GROUP_CONCAT(psu.user_id, ',')
        FROM person_shared_users psu
        WHERE psu.person_id = p.id
      ) as shared_to_ids
    FROM persons p
    LEFT JOIN users u1 ON p.created_by = u1.id
    LEFT JOIN users u2 ON p.assigned_to = u2.id
    WHERE 1=1
  `;
  const params = [];

  const privacy = buildPersonPrivacyFilter(me, 'p');
  query += privacy.sql;
  params.push(...privacy.params);

  // 按角色过滤可见数据
  const filter = buildUserFilter(me, role, 'p');
  if (filter.sql) {
    query += filter.sql;
    params.push(...filter.params);
  }

  if (search) {
    // name / company / current_company / phone / tags / skills 加密存储，
    // 无法用 SQL LIKE 匹配，改为先 SELECT 解密后在内存过滤
  }
  if (person_category) { query += ' AND p.person_category = ?'; params.push(person_category); }
  if (relation_type) { query += ' AND (p.relation_types = ? OR p.relation_types LIKE ? OR p.relation_types LIKE ? OR p.relation_types LIKE ?)'; params.push(relation_type, `${relation_type},%`, `%,${relation_type}`, `%,${relation_type},%`); }
  if (potential_level) { query += ' AND p.potential_level = ?'; params.push(potential_level); }
  if (recruit_status) { query += ' AND p.recruit_status = ?'; params.push(recruit_status); }
  if (intent_level) { query += ' AND p.intent_level = ?'; params.push(intent_level); }
  if (city) {
    const cities = city.split(',').filter(Boolean);
    if (cities.length === 1) {
      query += ' AND p.city LIKE ?'; params.push(`%${cities[0]}%`);
    } else if (cities.length > 1) {
      const clauses = cities.map(() => 'p.city LIKE ?');
      query += ` AND (${clauses.join(' OR ')})`;
      cities.forEach(c => params.push(`%${c}%`));
    }
  }
  if (weight) { query += ' AND p.weight = ?'; params.push(weight); }
  if (created_by) { query += ' AND p.created_by = ?'; params.push(created_by); }
  if (visibility_scope === PRIVATE_PERSON_SCOPE) {
    query += ' AND p.visibility_scope = ? AND p.private_owner_id = ?';
    params.push(PRIVATE_PERSON_SCOPE, me);
  } else if (visibility_scope === COMPANY_PERSON_SCOPE) {
    query += ' AND COALESCE(p.visibility_scope, ?) != ?';
    params.push(COMPANY_PERSON_SCOPE, PRIVATE_PERSON_SCOPE);
  }

  query += ' ORDER BY p.updated_at DESC';
  const rows = decryptRows('persons', db.prepare(query).all(...params));
  if (search) {
    const s = String(search).toLowerCase();
    const hit = v => v && String(v).toLowerCase().includes(s);
    return res.json(rows.filter(r =>
      hit(r.name) || hit(r.company) || hit(r.current_company) ||
      hit(r.phone) || hit(r.tags) || hit(r.skills) || hit(r.success_traits)
    ));
  }
  res.json(rows);
});

app.get('/api/persons/duplicate-check', canWrite, (req, res) => {
  const name = normalizePersonName(req.query.name);
  if (!name) return res.json({ total: 0, matches: [] });

  const visiblePersons = getVisiblePersonsForImport(req.user);
  const matches = visiblePersons
    .map(person => ({
      person,
      reason: getPersonNameDuplicateReason(name, person.name),
    }))
    .filter(item => item.reason);

  res.json({
    total: matches.length,
    matches: matches.slice(0, 10).map(({ person, reason }) => ({
      id: person.id,
      name: person.name,
      company: person.company || person.current_company || '',
      position: person.position || person.current_position || '',
      person_category: person.person_category,
      reason,
    })),
  });
});

const MAP_GEOCODE_REFRESH_LIMIT = 40;

async function refreshPersonMapCoordinates(rows) {
  const updateGeo = db.prepare('UPDATE persons SET lat = ?, lng = ?, geocode_address = ? WHERE id = ?');
  let refreshed = 0;
  for (const row of rows) {
    const geocodeKey = buildGeocodeKey(row.city, row.address);
    if (!geocodeKey) continue;

    const hasDetailedAddress = Boolean(normalizeGeoText(row.address));
    const hasCoords = row.lat !== null && row.lat !== undefined && row.lng !== null && row.lng !== undefined;
    const needsRefresh = !hasCoords || row.geocode_address !== geocodeKey;
    if (!needsRefresh) continue;

    // 历史城市级坐标不用反复刷新；有街道地址时才强制校准到详细地址。
    if (!hasDetailedAddress && hasCoords) continue;
    if (refreshed >= MAP_GEOCODE_REFRESH_LIMIT) break;

    const geo = await geocodeAddress(row.city, row.address);
    if (!geo.geocode_address || geo.lat === null || geo.lng === null) continue;

    row.lat = geo.lat;
    row.lng = geo.lng;
    row.geocode_address = geo.geocode_address;
    updateGeo.run(geo.lat, geo.lng, geo.geocode_address, row.id);
    refreshed++;
  }
  return rows;
}

// 人脉地图数据（精简字段 + 上次联系时间）
app.get('/api/persons/map', async (req, res) => {
  const { search, city, person_category, relationship_level, weight, created_by } = req.query;
  const { id: me, role } = req.user;
  let query = `SELECT p.id, p.name, p.company, p.city, p.address, p.lat, p.lng, p.geocode_address, p.person_category, p.relationship_level, p.weight, p.phone,
    p.created_by, COALESCE(u.display_name, u.username) as created_by_name,
    (SELECT MAX(i.date) FROM interactions i WHERE i.person_id = p.id) as last_interaction_date,
    CAST(julianday('now') - julianday((SELECT MAX(i.date) FROM interactions i WHERE i.person_id = p.id)) AS INTEGER) as days_since_contact
    FROM persons p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE ((p.city IS NOT NULL AND p.city != '') OR (p.address IS NOT NULL AND p.address != ''))`;
  const params = [];

  const privacy = buildPersonPrivacyFilter(me, 'p');
  query += privacy.sql;
  params.push(...privacy.params);

  const filter = buildUserFilter(me, role, 'p');
  if (filter.sql) { query += filter.sql; params.push(...filter.params); }

  if (city) {
    const cities = city.split(',').filter(Boolean);
    if (cities.length === 1) {
      query += ' AND p.city LIKE ?'; params.push(`%${cities[0]}%`);
    } else if (cities.length > 1) {
      const clauses = cities.map(() => 'p.city LIKE ?');
      query += ` AND (${clauses.join(' OR ')})`;
      cities.forEach(c => params.push(`%${c}%`));
    }
  }
  if (person_category) { query += ' AND p.person_category = ?'; params.push(person_category); }
  if (relationship_level) { query += ' AND p.relationship_level = ?'; params.push(relationship_level); }
  if (weight) { query += ' AND p.weight = ?'; params.push(weight); }
  if (created_by) { query += ' AND p.created_by = ?'; params.push(created_by); }

  query += ' ORDER BY p.city, p.name';
  try {
    const rows = decryptRows('persons', db.prepare(query).all(...params));
    const keyword = String(search || '').trim().toLowerCase();
    const filteredRows = keyword
      ? rows.filter(row => String(row.name || '').toLowerCase().includes(keyword))
      : rows;
    res.json(await refreshPersonMapCoordinates(filteredRows));
  } catch (err) {
    console.error('persons map failed:', err);
    res.status(500).json({ error: '地图数据加载失败' });
  }
});

app.get('/api/persons/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const p = db.prepare('SELECT p.*, u1.display_name as created_by_name, u2.display_name as assigned_to_name FROM persons p LEFT JOIN users u1 ON p.created_by = u1.id LEFT JOIN users u2 ON p.assigned_to = u2.id WHERE p.id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '未找到' });
  if (!canAccessPerson(req.user, p)) return res.status(404).json({ error: '未找到' });
  res.json(decryptRow('persons', p));
});

app.post('/api/persons', canWrite, async (req, res) => {
  const {
    name, person_category, relation_types, city, company, position, industry,
    phone, email, wechat, birthday, address, tags, notes, resources, demands, success_traits,
    relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight,
    shared_to, visibility_scope
  } = req.body;
  const normalizedName = normalizePersonName(name);
  if (!normalizedName) return res.status(400).json({ error: '姓名必填' });
  if (normalizedName.length > PERSON_NAME_MAX_LENGTH) {
    return res.status(400).json({ error: `姓名不能超过 ${PERSON_NAME_MAX_LENGTH} 个字符` });
  }
  const visibility = resolvePersonVisibilityPayload(req.user, visibility_scope);
  if (visibility.error) return res.status(403).json({ error: visibility.error });
  const geo = await geocodeAddress(city, address);
  const enc = encryptRow('persons', {
    name: normalizedName, company, position, phone, email, wechat, address, tags, notes,
    current_company, current_position, target_position,
    skills, education, expected_salary, source,
    heart, brain, mouth, hand, resources, demands, success_traits,
  });
  const result = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, city, company, position, industry,
      phone, email, wechat, birthday, address, tags, notes, resources, demands, success_traits,
      relationship_level, client_status,
      talent_type, current_company, current_position, target_position,
      skills, experience_years, education, recruit_status, intent_level,
      potential_level, expected_salary, source, heart, brain, mouth, hand, weight, lat, lng, created_by,
      visibility_scope, private_owner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    enc.name, person_category || 'social', relation_types || '', city,
    enc.company, enc.position, industry, enc.phone, enc.email, enc.wechat, birthday, enc.address, enc.tags, enc.notes,
    enc.resources, enc.demands, enc.success_traits, relationship_level || 'normal', client_status || 'active',
    talent_type || 'external', enc.current_company, enc.current_position, enc.target_position,
    enc.skills, experience_years, enc.education, recruit_status || 'potential', intent_level || 'low',
    potential_level, enc.expected_salary, enc.source, enc.heart, enc.brain, enc.mouth, enc.hand, weight || 'medium', geo.lat, geo.lng, req.user.id
    , visibility.visibility_scope, visibility.private_owner_id
  );

  const personId = result.lastInsertRowid;
  db.prepare('UPDATE persons SET geocode_address = ? WHERE id = ?').run(geo.geocode_address, personId);
  if (visibility.visibility_scope !== PRIVATE_PERSON_SCOPE && Array.isArray(shared_to) && shared_to.length > 0) {
    const insertShared = db.prepare('INSERT OR IGNORE INTO person_shared_users (person_id, user_id) VALUES (?, ?)');
    shared_to.forEach(uid => insertShared.run(personId, uid));
  }
  res.json({ id: personId });
});

app.put('/api/persons/batch', canWrite, (req, res) => {
  const { ids, patch } = req.body || {};
  const personIds = [...new Set((Array.isArray(ids) ? ids : [])
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0))];

  if (personIds.length === 0) return res.status(400).json({ error: '请选择要批量编辑的人脉' });
  if (personIds.length > 500) return res.status(400).json({ error: '单次最多批量编辑 500 条人脉' });
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: '请提供要修改的字段' });

  const scalarFields = [];
  const allowedValues = {
    weight: new Set(['high', 'medium', 'low']),
    potential_level: new Set(['high', 'medium', 'low', '']),
    recruit_status: new Set(['potential', 'contacted', 'interviewing', 'offered', 'joined', 'passed']),
    intent_level: new Set(['high', 'medium', 'low', 'advisor', 'unknown']),
  };
  const talentBatchFields = new Set(['potential_level', 'recruit_status', 'intent_level']);

  let scalarError = null;
  ['weight', 'potential_level', 'recruit_status', 'intent_level'].forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
    const value = patch[field] === null || patch[field] === undefined ? '' : String(patch[field]);
    if (!allowedValues[field].has(value)) {
      scalarError = `字段 ${field} 的值不合法`;
      return;
    }
    scalarFields.push({ field, value: value || null });
  });
  if (scalarError) return res.status(400).json({ error: scalarError });

  const splitTags = (value) => String(value || '')
    .split(/[,，]/)
    .map(v => v.trim())
    .filter(Boolean);
  const mergeTags = (current, mode, values) => {
    const currentTags = splitTags(current);
    const selected = splitTags(values);
    if (mode === 'replace') return selected.join(',');
    if (mode === 'remove') {
      const removeSet = new Set(selected);
      return currentTags.filter(tag => !removeSet.has(tag)).join(',');
    }
    const next = [...currentTags];
    selected.forEach(tag => {
      if (!next.includes(tag)) next.push(tag);
    });
    return next.join(',');
  };

  const tagsPatch = patch.tags && typeof patch.tags === 'object' ? patch.tags : null;
  const hasTagsPatch = Boolean(tagsPatch);
  if (hasTagsPatch) {
    if (!['append', 'remove', 'replace'].includes(tagsPatch.mode)) {
      return res.status(400).json({ error: '标签操作方式不合法' });
    }
    if (tagsPatch.mode !== 'replace' && splitTags(tagsPatch.value).length === 0) {
      return res.status(400).json({ error: '请填写要处理的标签' });
    }
  }

  const sharedPatch = patch.shared_to && typeof patch.shared_to === 'object' ? patch.shared_to : null;
  const hasSharedPatch = Boolean(sharedPatch);
  if (hasSharedPatch) {
    if (!['append', 'remove', 'replace'].includes(sharedPatch.mode)) {
      return res.status(400).json({ error: '共享人操作方式不合法' });
    }
    sharedPatch.user_ids = [...new Set((Array.isArray(sharedPatch.user_ids) ? sharedPatch.user_ids : [])
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0))];
    if (sharedPatch.mode !== 'replace' && sharedPatch.user_ids.length === 0) {
      return res.status(400).json({ error: '请选择要处理的共享人' });
    }
  }

  const hasVisibilityPatch = Object.prototype.hasOwnProperty.call(patch, 'visibility_scope');
  if (hasVisibilityPatch && ![COMPANY_PERSON_SCOPE, PRIVATE_PERSON_SCOPE].includes(patch.visibility_scope)) {
    return res.status(400).json({ error: '可见范围不合法' });
  }
  const visibilityScopePatch = hasVisibilityPatch
    ? (patch.visibility_scope === PRIVATE_PERSON_SCOPE ? PRIVATE_PERSON_SCOPE : COMPANY_PERSON_SCOPE)
    : null;
  if (hasSharedPatch && visibilityScopePatch === PRIVATE_PERSON_SCOPE) {
    return res.status(400).json({ error: '个人私密人脉不支持设置共享人' });
  }

  if (scalarFields.length === 0 && !hasTagsPatch && !hasSharedPatch && !hasVisibilityPatch) {
    return res.status(400).json({ error: '请至少选择一个批量修改项' });
  }

  const placeholders = personIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, created_by, assigned_to, visibility_scope, private_owner_id, person_category, relation_types, tags
    FROM persons
    WHERE id IN (${placeholders})
  `).all(...personIds);
  const rowMap = new Map(rows.map(row => [Number(row.id), row]));

  const commonScalarFields = scalarFields.filter(({ field }) => !talentBatchFields.has(field));
  const talentScalarFields = scalarFields.filter(({ field }) => talentBatchFields.has(field));
  const makeScalarUpdate = (fields) => fields.length
    ? db.prepare(`UPDATE persons SET ${fields.map(({ field }) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    : null;
  const updateCommonScalar = makeScalarUpdate(commonScalarFields);
  const updateTalentScalar = makeScalarUpdate(talentScalarFields);
  const updateTags = hasTagsPatch ? db.prepare('UPDATE persons SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?') : null;
  const updateVisibility = hasVisibilityPatch ? db.prepare('UPDATE persons SET visibility_scope = ?, private_owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?') : null;
  const deleteSharedAll = (hasSharedPatch || hasVisibilityPatch) ? db.prepare('DELETE FROM person_shared_users WHERE person_id = ?') : null;
  const deleteSharedOne = hasSharedPatch ? db.prepare('DELETE FROM person_shared_users WHERE person_id = ? AND user_id = ?') : null;
  const insertShared = hasSharedPatch ? db.prepare('INSERT OR IGNORE INTO person_shared_users (person_id, user_id) VALUES (?, ?)') : null;

  const errors = [];
  let success = 0;
  const applyBatch = db.transaction(() => {
    personIds.forEach(id => {
      const person = rowMap.get(id);
      if (!person) {
        errors.push({ id, reason: '未找到' });
        return;
      }
      if (!canAccessPerson(req.user, person)) {
        errors.push({ id, reason: '无权访问此数据' });
        return;
      }
      if (req.user.role === 'member') {
        const isOwner = Number(person.created_by) === Number(req.user.id);
        const isAssigned = Number(person.assigned_to) === Number(req.user.id);
        if (!isOwner && !isAssigned) {
          errors.push({ id, reason: '无权修改此数据' });
          return;
        }
      }
      if (hasSharedPatch && isPrivatePerson(person) && visibilityScopePatch !== COMPANY_PERSON_SCOPE) {
        errors.push({ id, reason: '个人私密人脉不能共享' });
        return;
      }

      let touched = false;
      let finalVisibility = getVisibilityFromPerson(person);
      const relationTypes = String(person.relation_types || '').split(',').map(v => v.trim()).filter(Boolean);
      const isExternalTalentPerson = person.person_category === 'talent' && relationTypes.includes('talent_external');
      if (updateCommonScalar) {
        updateCommonScalar.run(...commonScalarFields.map(({ value }) => value), id);
        touched = true;
      }
      if (updateTalentScalar && isExternalTalentPerson) {
        updateTalentScalar.run(...talentScalarFields.map(({ value }) => value), id);
        touched = true;
      }
      if (updateTags) {
        const decrypted = decryptRow('persons', person);
        const nextTags = mergeTags(decrypted.tags || '', tagsPatch.mode, tagsPatch.value || '');
        const enc = encryptRow('persons', { tags: nextTags });
        updateTags.run(enc.tags, id);
        touched = true;
      }
      if (updateVisibility) {
        const visibility = resolvePersonVisibilityPayload(req.user, visibilityScopePatch, person);
        if (visibility.error) {
          errors.push({ id, reason: visibility.error });
          return;
        }
        updateVisibility.run(visibility.visibility_scope, visibility.private_owner_id, id);
        finalVisibility = visibility;
        if (visibility.visibility_scope === PRIVATE_PERSON_SCOPE) {
          deleteSharedAll.run(id);
        }
        touched = true;
      }
      if (hasSharedPatch) {
        if (finalVisibility.visibility_scope === PRIVATE_PERSON_SCOPE) {
          errors.push({ id, reason: '个人私密人脉不能共享' });
          return;
        } else if (sharedPatch.mode === 'replace') {
          deleteSharedAll.run(id);
          sharedPatch.user_ids.forEach(uid => insertShared.run(id, uid));
        } else if (sharedPatch.mode === 'append') {
          sharedPatch.user_ids.forEach(uid => insertShared.run(id, uid));
        } else {
          sharedPatch.user_ids.forEach(uid => deleteSharedOne.run(id, uid));
        }
        touched = true;
      }
      if (touched) {
        success += 1;
      } else {
        errors.push({ id, reason: '仅外部人才支持该批量字段' });
      }
    });
  });

  applyBatch();
  res.json({ success, failed: errors.length, errors });
});

app.put('/api/persons/:id', canWrite, async (req, res) => {
  const existingPerson = db.prepare('SELECT created_by, assigned_to, visibility_scope, private_owner_id, city, address, lat, lng, geocode_address FROM persons WHERE id = ?').get(req.params.id);
  if (!existingPerson) return res.status(404).json({ error: '未找到' });
  if (!canAccessPerson(req.user, { ...existingPerson, id: Number(req.params.id) })) return res.status(404).json({ error: '未找到' });
  // member / readonly 只能改自己录入的 或 被指派给自己的
  if (req.user.role === 'member' || req.user.role === 'readonly') {
    const isOwner = existingPerson.created_by === req.user.id;
    const isAssigned = existingPerson.assigned_to === req.user.id;
    if (!isOwner && !isAssigned) return res.status(403).json({ error: '无权修改此数据' });
  }
  const {
    name, person_category, relation_types, city, company, position, industry,
    phone, email, wechat, birthday, address, tags, notes, resources, demands, success_traits,
    relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight,
    shared_to, visibility_scope
  } = req.body;
  const normalizedName = normalizePersonName(name);
  if (!normalizedName) return res.status(400).json({ error: '姓名必填' });
  if (normalizedName.length > PERSON_NAME_MAX_LENGTH) {
    return res.status(400).json({ error: `姓名不能超过 ${PERSON_NAME_MAX_LENGTH} 个字符` });
  }
  const visibility = resolvePersonVisibilityPayload(req.user, visibility_scope, existingPerson);
  if (visibility.error) return res.status(403).json({ error: visibility.error });
  const existingPlain = decryptRow('persons', existingPerson);
  const nextGeocodeKey = buildGeocodeKey(city, address);
  const previousGeocodeKey = buildGeocodeKey(existingPlain.city, existingPlain.address);
  const geocodeInputChanged = nextGeocodeKey !== previousGeocodeKey;
  let geo = await geocodeAddress(city, address);
  if (!geo.geocode_address && !geocodeInputChanged) {
    geo = {
      lat: existingPerson.lat,
      lng: existingPerson.lng,
      geocode_address: existingPerson.geocode_address || null,
    };
  }
  const enc = encryptRow('persons', {
    name: normalizedName, company, position, phone, email, wechat, address, tags, notes,
    current_company, current_position, target_position,
    skills, education, expected_salary, source,
    heart, brain, mouth, hand, resources, demands, success_traits,
  });
  db.prepare(`
    UPDATE persons SET name=?, person_category=?, relation_types=?, city=?, company=?, position=?, industry=?,
      phone=?, email=?, wechat=?, birthday=?, address=?, tags=?, notes=?, resources=?, demands=?, success_traits=?,
      relationship_level=?, client_status=?,
      talent_type=?, current_company=?, current_position=?, target_position=?,
      skills=?, experience_years=?, education=?, recruit_status=?, intent_level=?,
      potential_level=?, expected_salary=?, source=?, heart=?, brain=?, mouth=?, hand=?, weight=?,
      lat=?, lng=?, visibility_scope=?, private_owner_id=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    enc.name, person_category, relation_types || '', city,
    enc.company, enc.position, industry, enc.phone, enc.email, enc.wechat, birthday, enc.address, enc.tags, enc.notes,
    enc.resources, enc.demands, enc.success_traits, relationship_level, client_status,
    talent_type, enc.current_company, enc.current_position, enc.target_position,
    enc.skills, experience_years, enc.education, recruit_status, intent_level,
    potential_level, enc.expected_salary, enc.source, enc.heart, enc.brain, enc.mouth, enc.hand, weight || 'medium',
    geo.lat, geo.lng, visibility.visibility_scope, visibility.private_owner_id, req.params.id
  );
  db.prepare('UPDATE persons SET geocode_address = ? WHERE id = ?').run(geo.geocode_address, req.params.id);

  // 更新共享人
  db.prepare('DELETE FROM person_shared_users WHERE person_id = ?').run(req.params.id);
  if (visibility.visibility_scope !== PRIVATE_PERSON_SCOPE && Array.isArray(shared_to) && shared_to.length > 0) {
    const insertShared = db.prepare('INSERT OR IGNORE INTO person_shared_users (person_id, user_id) VALUES (?, ?)');
    shared_to.forEach(uid => insertShared.run(req.params.id, uid));
  }
  res.json({ success: true });
});

app.delete('/api/persons/:id', canWrite, (req, res) => {
  const person = getPersonAccessRecord(req.params.id);
  if (!person) return res.status(404).json({ error: '未找到' });
  if (!canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  if (req.user.role === 'member') {
    if (person.created_by && person.created_by !== req.user.id) return res.status(403).json({ error: '无权删除他人录入的数据' });
  }
  db.prepare('DELETE FROM person_shared_users WHERE person_id = ?').run(req.params.id);
  db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM interactions WHERE person_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reminders WHERE person_id = ?').run(req.params.id);
  db.prepare('UPDATE company_personnel SET person_id = NULL WHERE person_id = ?').run(req.params.id);
  res.json({ success: true });
});

// 人脉指派（组长/admin/sales_director 可用）
app.put('/api/persons/:id/assign', auth, (req, res) => {
  const { role } = req.user;
  if (!isAdmin(role) && role !== 'leader' && role !== 'sales_director') {
    return res.status(403).json({ error: '无指派权限' });
  }
  const person = getPersonAccessRecord(req.params.id);
  if (!person) return res.status(404).json({ error: '未找到' });
  if (!canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  if (isPrivatePerson(person)) return res.status(400).json({ error: '个人私密人脉不能指派' });
  const { assigned_to } = req.body;
  db.prepare('UPDATE persons SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(assigned_to || null, req.params.id);
  res.json({ success: true });
});

const PERSON_IMPORT_FIELD_LABELS = {
  person_category: '圈子分类',
  relation_types: '关系类型',
  city: '城市',
  company: '公司',
  position: '职位',
  industry: '行业',
  phone: '手机',
  email: '邮箱',
  wechat: '微信',
  birthday: '生日',
  address: '地址',
  tags: '标签',
  notes: '备注',
  resources: '拥有资源',
  demands: '诉求',
  success_traits: '关键成事特质',
  relationship_level: '关系等级',
  client_status: '客户状态',
  talent_type: '人才类型',
  current_company: '现任公司',
  current_position: '现任职位',
  target_position: '目标职位',
  skills: '技能标签',
  experience_years: '工作年限',
  education: '最高学历',
  recruit_status: '转化阶段',
  intent_level: '意向程度',
  potential_level: '潜力评级',
  expected_salary: '期望薪资',
  source: '来源渠道',
  weight: '权重',
};

const PERSON_IMPORT_UPDATE_FIELDS = Object.keys(PERSON_IMPORT_FIELD_LABELS);

function getPersonImportRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.rows)) return body.rows;
  return null;
}

function normalizeImportCompareValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getProvidedImportValue(row, key) {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return undefined;
  const value = normalizeImportCompareValue(row[key]);
  return value ? value : undefined;
}

function summarizePersonImportRow(row = {}) {
  return {
    company: row.company || row.current_company || '',
    position: row.position || row.current_position || '',
    city: row.city || '',
    weight: row.weight || '',
  };
}

function canUpdateImportedPerson(user, person) {
  if (!canAccessPerson(user, person)) return false;
  if (['readonly', 'guest'].includes(user.role)) return false;
  if (user.role === 'member') {
    return Number(person.created_by) === Number(user.id) || Number(person.assigned_to) === Number(user.id);
  }
  return true;
}

function getVisiblePersonsForImport(user) {
  let query = `
    SELECT p.id, p.created_by, p.assigned_to, p.visibility_scope, p.private_owner_id,
      p.name, p.person_category, p.relation_types, p.city, p.company, p.position, p.industry,
      p.phone, p.email, p.wechat, p.birthday, p.address, p.tags, p.notes, p.resources, p.demands, p.success_traits,
      p.relationship_level, p.client_status, p.talent_type, p.current_company, p.current_position,
      p.target_position, p.skills, p.experience_years, p.education, p.recruit_status, p.intent_level,
      p.potential_level, p.expected_salary, p.source, p.weight
    FROM persons p
    WHERE 1=1
  `;
  const params = [];
  const privacy = buildPersonPrivacyFilter(user.id, 'p');
  query += privacy.sql;
  params.push(...privacy.params);
  const filter = buildUserFilter(user.id, user.role, 'p');
  if (filter.sql) {
    query += filter.sql;
    params.push(...filter.params);
  }
  return decryptRows('persons', db.prepare(query).all(...params));
}

function collectPersonImportPatch(row, existing) {
  const patch = {};
  const diffFields = [];
  PERSON_IMPORT_UPDATE_FIELDS.forEach(key => {
    const next = getProvidedImportValue(row, key);
    if (next === undefined) return;
    const current = normalizeImportCompareValue(existing?.[key]);
    if (current !== normalizeImportCompareValue(next)) {
      patch[key] = next;
      diffFields.push(key);
    }
  });
  return { patch, diffFields };
}

function buildPersonImportPlan(rows, user) {
  const visiblePersons = getVisiblePersonsForImport(user);
  const byName = new Map();
  visiblePersons.forEach(person => {
    const key = normalizePersonName(person.name).toLowerCase();
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(person);
  });

  const seenImportNames = new Set();
  const summary = {
    total: rows.length,
    new: 0,
    existing: 0,
    updateable: 0,
    no_change: 0,
    ambiguous: 0,
    no_permission: 0,
    file_duplicate: 0,
    invalid: 0,
    skip_empty_name: 0,
    skip_name_too_long: 0,
  };

  const items = rows.map((row, index) => {
    const line = index + 2;
    const normalizedName = normalizePersonName(row.name);
    const item = { line, name: normalizedName || row.name || '', row };

    if (!normalizedName) {
      summary.invalid++;
      summary.skip_empty_name++;
      return { ...item, status: 'invalid', reason: '缺少姓名' };
    }
    if (normalizedName.length > PERSON_NAME_MAX_LENGTH) {
      summary.invalid++;
      summary.skip_name_too_long++;
      return { ...item, status: 'invalid', reason: `姓名超过 ${PERSON_NAME_MAX_LENGTH} 字` };
    }

    const nameKey = normalizedName.toLowerCase();
    if (seenImportNames.has(nameKey)) {
      summary.file_duplicate++;
      return { ...item, status: 'file_duplicate', reason: '导入文件内姓名重复' };
    }
    seenImportNames.add(nameKey);

    const matches = byName.get(nameKey) || [];
    if (matches.length === 0) {
      summary.new++;
      return { ...item, status: 'new' };
    }

    summary.existing++;
    if (matches.length > 1) {
      summary.ambiguous++;
      return { ...item, status: 'ambiguous', reason: '系统内存在多条同名记录', existing_count: matches.length };
    }

    const existing = matches[0];
    const { patch, diffFields } = collectPersonImportPatch(row, existing);
    const canUpdate = canUpdateImportedPerson(user, existing);
    if (!canUpdate) {
      summary.no_permission++;
      return {
        ...item,
        status: 'no_permission',
        reason: '无权更新此记录',
        existing,
        existing_id: existing.id,
        diff_fields: diffFields,
        diff_labels: diffFields.map(field => PERSON_IMPORT_FIELD_LABELS[field] || field),
      };
    }
    if (diffFields.length === 0) {
      summary.no_change++;
      return {
        ...item,
        status: 'same',
        reason: '无差异',
        existing,
        existing_id: existing.id,
        diff_fields: [],
        diff_labels: [],
      };
    }
    summary.updateable++;
    return {
      ...item,
      status: 'updateable',
      existing,
      existing_id: existing.id,
      patch,
      diff_fields: diffFields,
      diff_labels: diffFields.map(field => PERSON_IMPORT_FIELD_LABELS[field] || field),
    };
  });

  return { summary, items };
}

function serializePersonImportItem(item) {
  return {
    line: item.line,
    name: item.name,
    status: item.status,
    reason: item.reason,
    existing_count: item.existing_count || (item.existing ? 1 : 0),
    existing_id: item.existing_id,
    existing: item.existing ? summarizePersonImportRow(item.existing) : null,
    incoming: summarizePersonImportRow(item.row),
    diff_fields: item.diff_fields || [],
    diff_labels: item.diff_labels || [],
  };
}

function insertImportedPerson(insert, row, userId) {
  const normalizedName = normalizePersonName(row.name);
  const enc = encryptRow('persons', {
    name: normalizedName,
    company: row.company, position: row.position,
    phone: row.phone, email: row.email, wechat: row.wechat, address: row.address,
    tags: row.tags, notes: row.notes, resources: row.resources, demands: row.demands, success_traits: row.success_traits,
    current_company: row.current_company, current_position: row.current_position, target_position: row.target_position,
    skills: row.skills, education: row.education, expected_salary: row.expected_salary, source: row.source,
  });
  insert.run(
    enc.name, row.person_category || 'social', row.relation_types || '',
    row.city, enc.company, enc.position, row.industry,
    enc.phone, enc.email, enc.wechat, row.birthday, enc.address, enc.tags, enc.notes,
    enc.resources, enc.demands, enc.success_traits,
    row.relationship_level || 'normal', row.client_status || 'active',
    row.talent_type || 'external', enc.current_company, enc.current_position, enc.target_position,
    enc.skills, row.experience_years || null, enc.education,
    row.recruit_status || 'potential', row.intent_level || 'low',
    row.potential_level, enc.expected_salary, enc.source, row.weight || 'medium',
    userId, COMPANY_PERSON_SCOPE, null
  );
}

function updateImportedPerson(personId, patch) {
  const fields = Object.keys(patch || {});
  if (fields.length === 0) return false;
  const encPatch = encryptRow('persons', patch);
  db.prepare(`
    UPDATE persons
    SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...fields.map(field => encPatch[field]), personId);
  return true;
}

app.post('/api/persons/import/preview', canWrite, (req, res) => {
  const rows = getPersonImportRows(req.body);
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: '数据为空' });
  }
  const plan = buildPersonImportPlan(rows, req.user);
  res.json({
    summary: plan.summary,
    items: plan.items
      .filter(item => item.status !== 'new')
      .map(serializePersonImportItem),
  });
});

// 批量导入
app.post('/api/persons/import', canWrite, (req, res) => {
  const rows = getPersonImportRows(req.body);
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: '数据为空' });
  }
  const duplicateMode = req.body?.duplicate_mode === 'update' ? 'update' : 'skip';
  const plan = buildPersonImportPlan(rows, req.user);
  const insert = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, city, company, position, industry,
      phone, email, wechat, birthday, address, tags, notes, resources, demands, success_traits,
      relationship_level, client_status,
      talent_type, current_company, current_position, target_position,
      skills, experience_years, education, recruit_status, intent_level,
      potential_level, expected_salary, source, weight, created_by, visibility_scope, private_owner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const result = {
    created: 0,
    updated: 0,
    skipped_existing: 0,
    skipped_no_change: 0,
    skipped_file_duplicate: 0,
    skipped_ambiguous: 0,
    skipped_no_permission: 0,
    skip_empty_name: plan.summary.skip_empty_name,
    skip_name_too_long: plan.summary.skip_name_too_long,
    errors: [],
  };

  const importMany = db.transaction(() => {
    for (const item of plan.items) {
      if (item.status === 'new') {
        insertImportedPerson(insert, item.row, req.user.id);
        result.created++;
      } else if (item.status === 'updateable') {
        if (duplicateMode === 'update') {
          if (updateImportedPerson(item.existing_id, item.patch)) result.updated++;
          else result.skipped_no_change++;
        } else {
          result.skipped_existing++;
        }
      } else if (item.status === 'same') {
        result.skipped_no_change++;
      } else if (item.status === 'file_duplicate') {
        result.skipped_file_duplicate++;
      } else if (item.status === 'ambiguous') {
        result.skipped_ambiguous++;
        result.errors.push({ line: item.line, name: item.name, reason: item.reason });
      } else if (item.status === 'no_permission') {
        if (duplicateMode === 'update') {
          result.skipped_no_permission++;
          result.errors.push({ line: item.line, name: item.name, reason: item.reason });
        } else {
          result.skipped_existing++;
        }
      }
    }
  });

  importMany();
  result.skip = result.skipped_existing + result.skipped_no_change + result.skipped_file_duplicate +
    result.skipped_ambiguous + result.skipped_no_permission + result.skip_empty_name + result.skip_name_too_long;
  result.skipped_total = result.skip;
  result.ok = result.created + result.updated;
  res.json(result);
});

// =========== 互动记录 API ===========
app.get('/api/interactions', (req, res) => {
  const { person_id, type, city, weight, importance, date_start, date_end, created_by, visibility_scope } = req.query;
  const { id: me, role } = req.user;
  let query = `
    SELECT i.*, p.name as person_name, p.person_category, p.company, p.current_company, p.city, p.weight,
      p.visibility_scope as person_visibility_scope,
      p.private_owner_id as person_private_owner_id
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    WHERE 1=1
  `;
  const params = [];

  const privacy = buildPersonPrivacyFilter(me, 'p');
  query += privacy.sql;
  params.push(...privacy.params);

  // 按角色过滤：通过关联的 person 的 created_by / assigned_to 来控制可见范围
  const filter = buildUserFilter(me, role, 'p');
  if (filter.sql) {
    query += filter.sql;
    params.push(...filter.params);
  }

  if (person_id) { query += ' AND i.person_id = ?'; params.push(person_id); }
  if (type) { query += ' AND i.type = ?'; params.push(type); }
  if (city) { query += ' AND p.city LIKE ?'; params.push(`%${city}%`); }
  if (weight) { query += ' AND p.weight = ?'; params.push(weight); }
  if (importance) { query += ' AND i.importance = ?'; params.push(importance); }
  if (created_by) { query += ' AND i.created_by = ?'; params.push(created_by); }
  if (visibility_scope === PRIVATE_PERSON_SCOPE) {
    query += ' AND COALESCE(p.visibility_scope, i.visibility_scope, ?) = ? AND COALESCE(p.private_owner_id, i.private_owner_id) = ?';
    params.push(COMPANY_PERSON_SCOPE, PRIVATE_PERSON_SCOPE, me);
  } else if (visibility_scope === COMPANY_PERSON_SCOPE) {
    query += ' AND COALESCE(p.visibility_scope, i.visibility_scope, ?) != ?';
    params.push(COMPANY_PERSON_SCOPE, PRIVATE_PERSON_SCOPE);
  }
  if (date_start) { query += ' AND i.date >= ?'; params.push(date_start); }
  if (date_end) { query += ' AND i.date <= ?'; params.push(date_end); }
  query += ' ORDER BY i.date DESC';
  const rows = db.prepare(query).all(...params);
  // interactions.* 用 interactions 解密；p.name/company/current_company 来自 persons
  const out = decryptRows('interactions', rows).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
    company: decrypt(r.company),
    current_company: decrypt(r.current_company),
  }));
  res.json(out);
});

app.post('/api/interactions', (req, res) => {
  const { person_id, type, date, amount, description, outcome, follow_result, next_action, next_action_date, importance, gift_name,
    opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, watcher_ids } = req.body;
  const createdBy = req.user?.id || null;
  const person = getPersonAccessRecord(person_id);
  if (!person) return res.status(404).json({ error: '未找到人脉' });
  if (!canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到人脉' });
  const collaborationError = validatePrivatePersonCollaboration(req.user, person, { opportunity_assignee, watcher_ids });
  if (collaborationError) return res.status(403).json({ error: collaborationError });
  const visibility = getVisibilityFromPerson(person);
  const enc = encryptRow('interactions', {
    description, outcome, follow_result, next_action,
    opportunity_title, opportunity_note, gift_name,
  });
  const result = db.prepare(`
    INSERT INTO interactions (person_id, type, date, amount, description, outcome, follow_result, next_action, next_action_date, importance, gift_name,
      opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, created_by, visibility_scope, private_owner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(person_id, type, date, amount, enc.description, enc.outcome, enc.follow_result || null, enc.next_action, next_action_date, importance || 'normal', enc.gift_name || null,
    enc.opportunity_title || null, opportunity_status || null, opportunity_assignee || null, enc.opportunity_note || null, createdBy,
    visibility.visibility_scope, visibility.private_owner_id);

  const interactionId = result.lastInsertRowid;

  // 自动创建跟进提醒
  if (next_action_date && next_action) {
    const remindDate = new Date(next_action_date);
    remindDate.setDate(remindDate.getDate() - 3);
    const remindDateStr = remindDate.toISOString().split('T')[0];
    const title = `跟进: ${next_action}`;
    const remEnc = encryptRow('reminders', { title, note: description });
    // title 加密存储，无法 WHERE title=? 去重，改为内存过滤
    const candidates = db.prepare(
      'SELECT id, title FROM reminders WHERE person_id=? AND actual_date=? AND done=0'
    ).all(person_id, next_action_date);
    const existing = candidates.find(c => decrypt(c.title) === title);
    if (existing) {
      db.prepare('UPDATE reminders SET remind_date=?, note=? WHERE id=?').run(remindDateStr, remEnc.note, existing.id);
    } else {
      db.prepare(`INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note) VALUES (?,?,?,?,'follow_up',?)`)
        .run(person_id, remEnc.title, remindDateStr, next_action_date, remEnc.note);
    }
  }

  // 自动创建待跟进任务
  if (opportunity_title && opportunity_assignee) {
    const person = db.prepare('SELECT name FROM persons WHERE id = ?').get(person_id);
    const personName = decrypt(person?.name) || '未知人脉';
    const taskTitle = `${personName} - ${opportunity_title}`;
    const ftEnc = encryptRow('follow_up_tasks', {
      title: taskTitle, opportunity_title, opportunity_note,
    });
    db.prepare(`
      INSERT INTO follow_up_tasks (title, interaction_id, person_id, opportunity_title, opportunity_note, assigned_to, assigned_by)
      VALUES (?,?,?,?,?,?,?)
    `).run(ftEnc.title, interactionId, person_id, ftEnc.opportunity_title, ftEnc.opportunity_note || null,
      opportunity_assignee, createdBy || 0);
  }

  if (watcher_ids?.length) {
    syncLeadWatchers('interaction', interactionId, watcher_ids);
  }

  res.json({ id: interactionId });
});

app.put('/api/interactions/:id', (req, res) => {
  const { type, date, amount, description, outcome, follow_result, next_action, next_action_date, importance, gift_name,
    opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, watcher_ids } = req.body;
  const original = db.prepare(`
    SELECT i.person_id, p.id as person_record_id, p.created_by, p.assigned_to, p.visibility_scope, p.private_owner_id
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    WHERE i.id=?
  `).get(req.params.id);
  if (!original) return res.status(404).json({ error: '未找到' });
  const person = {
    id: original.person_record_id,
    created_by: original.created_by,
    assigned_to: original.assigned_to,
    visibility_scope: original.visibility_scope,
    private_owner_id: original.private_owner_id,
  };
  if (!canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  const collaborationError = validatePrivatePersonCollaboration(req.user, person, { opportunity_assignee, watcher_ids });
  if (collaborationError) return res.status(403).json({ error: collaborationError });
  const enc = encryptRow('interactions', {
    description, outcome, follow_result, next_action,
    opportunity_title, opportunity_note, gift_name,
  });
  db.prepare(`
    UPDATE interactions SET type=?, date=?, amount=?, description=?, outcome=?, follow_result=?, next_action=?, next_action_date=?, importance=?, gift_name=?,
      opportunity_title=?, opportunity_status=?, opportunity_assignee=?, opportunity_note=?
    WHERE id=?
  `).run(type, date, amount, enc.description, enc.outcome, enc.follow_result || null, enc.next_action, next_action_date, importance || 'normal', enc.gift_name || null,
    enc.opportunity_title || null, opportunity_status || null, opportunity_assignee || null, enc.opportunity_note || null,
    req.params.id);

  if (next_action_date && next_action && original) {
    const remindDate = new Date(next_action_date);
    remindDate.setDate(remindDate.getDate() - 3);
    const remindDateStr = remindDate.toISOString().split('T')[0];
    const title = `跟进: ${next_action}`;
    const remEnc = encryptRow('reminders', { title, note: description });
    // title 加密存储，无法 WHERE title=? 去重，先查同日未完成，再内存匹配
    const candidates = db.prepare(
      'SELECT id, title FROM reminders WHERE person_id=? AND actual_date=? AND done=0'
    ).all(original.person_id, next_action_date);
    const existing = candidates.find(c => decrypt(c.title) === title);
    if (existing) {
      db.prepare('UPDATE reminders SET remind_date=?, note=? WHERE id=?').run(remindDateStr, remEnc.note, existing.id);
    } else {
      db.prepare(`INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note) VALUES (?,?,?,?,'follow_up',?)`)
        .run(original.person_id, remEnc.title, remindDateStr, next_action_date, remEnc.note);
    }
  }
  res.json({ success: true });
});

app.delete('/api/interactions/:id', (req, res) => {
  const original = db.prepare(`
    SELECT p.id, p.created_by, p.assigned_to, p.visibility_scope, p.private_owner_id
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!original) return res.status(404).json({ error: '未找到' });
  if (!canAccessPerson(req.user, original)) return res.status(404).json({ error: '未找到' });
  db.prepare('DELETE FROM interactions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 商机管理 API ===========
app.get('/api/opportunities', auth, (req, res) => {
  const { status, assignee } = req.query;
  const { id: me, role } = req.user;

  // 从 interactions 表获取商机
  let query1 = `
    SELECT i.*,
      'interaction' as source_type,
      i.id as source_id,
      p.name as person_name, p.company, p.city, p.current_company, p.person_category,
      u.display_name as assignee_name,
      ub.display_name as created_by_name,
      COALESCE((SELECT GROUP_CONCAT(lw.user_id) FROM lead_watchers lw WHERE lw.source_type='interaction' AND lw.source_id=i.id), '') as watcher_ids,
      COALESCE((SELECT GROUP_CONCAT(uw.display_name, '、') FROM lead_watchers lw LEFT JOIN users uw ON lw.user_id = uw.id WHERE lw.source_type='interaction' AND lw.source_id=i.id), '') as watcher_names,
      (SELECT COUNT(*) FROM attachments WHERE source_type='interaction' AND source_id=i.id) as attachment_count
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    LEFT JOIN users u ON i.opportunity_assignee = u.id
    LEFT JOIN users ub ON i.created_by = ub.id
    WHERE i.opportunity_title IS NOT NULL AND i.opportunity_title != ''
  `;
  const params1 = [];

  const opportunityPersonPrivacy = buildPersonPrivacyFilter(me, 'p');
  query1 += opportunityPersonPrivacy.sql;
  params1.push(...opportunityPersonPrivacy.params);

  // 按角色过滤
  const visibleIds = getVisibleUserIds(me, role);
  if (visibleIds !== null) {
    query1 += ` AND (i.created_by IN (${visibleIds.map(() => '?').join(',')}) OR i.opportunity_assignee IN (${visibleIds.map(() => '?').join(',')}))`;
    params1.push(...visibleIds, ...visibleIds);
  }

  if (status) { query1 += ' AND i.opportunity_status = ?'; params1.push(status); }
  if (assignee) { query1 += ' AND i.opportunity_assignee = ?'; params1.push(assignee); }

  // 从 competitor_research 表获取商机
  let query2 = `
    SELECT cr.*,
      'competitor_research' as source_type,
      cr.id as source_id,
      c.name as company_name,
      NULL as person_name, NULL as company, NULL as city, NULL as current_company, NULL as person_category,
      u.display_name as assignee_name,
      COALESCE(
        cr.created_by,
        (SELECT ft.assigned_by FROM follow_up_tasks ft WHERE ft.competitor_research_id = cr.id ORDER BY ft.id ASC LIMIT 1)
      ) as created_by,
      ub.display_name as created_by_name,
      COALESCE((SELECT GROUP_CONCAT(lw.user_id) FROM lead_watchers lw WHERE lw.source_type='competitor_research' AND lw.source_id=cr.id), '') as watcher_ids,
      COALESCE((SELECT GROUP_CONCAT(uw.display_name, '、') FROM lead_watchers lw LEFT JOIN users uw ON lw.user_id = uw.id WHERE lw.source_type='competitor_research' AND lw.source_id=cr.id), '') as watcher_names,
      (SELECT COUNT(*) FROM attachments WHERE source_type='competitor_research' AND source_id=cr.id) as attachment_count
    FROM competitor_research cr
    LEFT JOIN companies c ON cr.company_id = c.id
    LEFT JOIN users u ON cr.opportunity_assignee = u.id
    LEFT JOIN users ub ON ub.id = COALESCE(
      cr.created_by,
      (SELECT ft.assigned_by FROM follow_up_tasks ft WHERE ft.competitor_research_id = cr.id ORDER BY ft.id ASC LIMIT 1)
    )
    WHERE cr.opportunity_title IS NOT NULL AND cr.opportunity_title != ''
  `;
  const params2 = [];

  if (visibleIds !== null) {
    query2 += ` AND (
      COALESCE(
        cr.created_by,
        (SELECT ft.assigned_by FROM follow_up_tasks ft WHERE ft.competitor_research_id = cr.id ORDER BY ft.id ASC LIMIT 1)
      ) IN (${visibleIds.map(() => '?').join(',')})
      OR cr.opportunity_assignee IN (${visibleIds.map(() => '?').join(',')})
    )`;
    params2.push(...visibleIds, ...visibleIds);
  }

  if (status) { query2 += ' AND cr.opportunity_status = ?'; params2.push(status); }
  if (assignee) { query2 += ' AND cr.opportunity_assignee = ?'; params2.push(assignee); }

  try {
    const results1Raw = db.prepare(query1).all(...params1);
    const results1 = decryptRows('interactions', results1Raw).map(r => ({
      ...r,
      person_name: decrypt(r.person_name),
      company: decrypt(r.company),
      current_company: decrypt(r.current_company),
    }));
    let results2 = [];

    // 尝试查询 competitor_research 表，如果表不存在则跳过
    try {
      results2 = db.prepare(query2).all(...params2);
    } catch (err) {
      // 表不存在或其他错误，忽略
      console.warn('competitor_research query failed:', err.message);
    }

    // 合并结果并按日期排序
    const combined = [...results1, ...results2].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(combined);
  } catch (err) {
    console.error('opportunities list error:', err);
    res.status(500).json({ error: '加载失败' });
  }
});

app.put('/api/opportunities/:id', (req, res) => {
  const {
    opportunity_status,
    opportunity_assignee,
    opportunity_note,
    opportunity_title,
    follow_result,
    date,
    importance,
    description,
    outcome,
    next_action,
    next_action_date,
    interaction_type,
    info_source,
    impact,
    source_type,
    watcher_ids,
  } = req.body;

  // 根据来源类型更新不同的表
  if (source_type === 'competitor_research') {
    const original = db.prepare('SELECT * FROM competitor_research WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: '未找到' });

    db.prepare(`
      UPDATE competitor_research SET
        date=?,
        importance=?,
        content=?,
        source=?,
        impact=?,
        outcome=?,
        follow_result=?,
        next_action=?,
        next_action_date=?,
        opportunity_title=?,
        opportunity_status=?,
        opportunity_assignee=?,
        opportunity_note=?
      WHERE id=?
    `).run(
      date ?? original.date,
      importance ?? original.importance,
      description ?? original.content,
      info_source ?? original.source,
      impact ?? original.impact,
      outcome ?? original.outcome,
      follow_result ?? original.follow_result,
      next_action ?? original.next_action,
      next_action_date ?? original.next_action_date,
      opportunity_title ?? original.opportunity_title,
      opportunity_status ?? original.opportunity_status,
      opportunity_assignee ?? original.opportunity_assignee,
      opportunity_note ?? original.opportunity_note,
      req.params.id
    );
  } else {
    // 默认处理 interactions
    const original = db.prepare('SELECT * FROM interactions WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: '未找到' });
    const person = getPersonAccessRecord(original.person_id);
    if (person && !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
    const collaborationError = validatePrivatePersonCollaboration(req.user, person, {
      opportunity_assignee,
      watcher_ids,
    });
    if (collaborationError) return res.status(403).json({ error: collaborationError });

    // original.* 的加密字段保持密文，new value 是明文；encryptRow 幂等（密文穿透）
    const merged = encryptRow('interactions', {
      description: description ?? original.description,
      outcome: outcome ?? original.outcome,
      follow_result: follow_result ?? original.follow_result,
      next_action: next_action ?? original.next_action,
      opportunity_title: opportunity_title ?? original.opportunity_title,
      opportunity_note: opportunity_note ?? original.opportunity_note,
    });

    db.prepare(`
      UPDATE interactions SET
        type=?,
        date=?,
        importance=?,
        description=?,
        outcome=?,
        follow_result=?,
        next_action=?,
        next_action_date=?,
        opportunity_title=?,
        opportunity_status=?,
        opportunity_assignee=?,
        opportunity_note=?
      WHERE id=?
    `).run(
      interaction_type ?? original.type,
      date ?? original.date,
      importance ?? original.importance,
      merged.description,
      merged.outcome,
      merged.follow_result,
      merged.next_action,
      next_action_date ?? original.next_action_date,
      merged.opportunity_title,
      opportunity_status ?? original.opportunity_status,
      opportunity_assignee ?? original.opportunity_assignee,
      merged.opportunity_note,
      req.params.id
    );

    // 若更改了指派人，同步更新对应的 follow_up_tasks（未完成的）
    if (opportunity_assignee && opportunity_assignee !== original.opportunity_assignee) {
      db.prepare(`
        UPDATE follow_up_tasks SET assigned_to=?, updated_at=CURRENT_TIMESTAMP
        WHERE interaction_id=? AND status != 'done'
      `).run(opportunity_assignee, req.params.id);
    }
  }

  if (watcher_ids !== undefined) {
    syncLeadWatchers('interaction', req.params.id, watcher_ids);
  }

  res.json({ success: true });
});

// =========== 待跟进任务 API ===========
app.get('/api/follow-up-tasks', (req, res) => {
  const { status, all } = req.query;
  const { id: me, role, executive_role } = req.user;
  let query = `
    SELECT f.*,
      p.name as person_name, p.company, p.city, p.current_company, p.person_category,
      ua.display_name as assigned_to_name,
      ub.display_name as assigned_by_name,
      i.type as interaction_type, i.date as interaction_date, i.description as interaction_desc, i.outcome as interaction_outcome,
      co.name as company_name
    FROM follow_up_tasks f
    LEFT JOIN persons p ON f.person_id = p.id
    LEFT JOIN users ua ON f.assigned_to = ua.id
    LEFT JOIN users ub ON f.assigned_by = ub.id
    LEFT JOIN interactions i ON f.interaction_id = i.id
    LEFT JOIN companies co ON f.company_id = co.id
    WHERE 1=1
  `;
  const params = [];
  const personPrivacy = buildPersonPrivacyFilter(me, 'p');
  query += personPrivacy.sql;
  params.push(...personPrivacy.params);
  if (all === '1' && hasTaskFullVisibility(role, executive_role)) {
    // 管理员和高管查看全量跟进任务。
  } else if (all === '1' && ['leader', 'sales_director'].includes(role)) {
    const visibleUserIds = getVisibleUserIds(me, role) || [];
    query += ` AND (f.assigned_to IN (${visibleUserIds.map(() => '?').join(',')}) OR f.assigned_by IN (${visibleUserIds.map(() => '?').join(',')}))`;
    params.push(...visibleUserIds, ...visibleUserIds);
  } else {
    query += ' AND (f.assigned_to = ? OR f.assigned_by = ?)';
    params.push(me, me);
  }
  if (status) { query += ' AND f.status = ?'; params.push(status); }
  query += ' ORDER BY f.created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(decryptRows('follow_up_tasks', rows).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
    company: decrypt(r.company),
    current_company: decrypt(r.current_company),
    interaction_desc: decrypt(r.interaction_desc),
    interaction_outcome: decrypt(r.interaction_outcome),
    company_name: decrypt(r.company_name),
  })));
});

app.get('/api/follow-up-tasks/count', (req, res) => {
  const { id: me } = req.user;
  const privacy = buildPersonPrivacyFilter(me, 'p');
  const cnt = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM follow_up_tasks f
    LEFT JOIN persons p ON f.person_id = p.id
    WHERE f.assigned_to = ? AND f.status != 'done'
    ${privacy.sql}
  `).get(me, ...privacy.params).cnt;
  res.json({ count: cnt });
});

app.get('/api/follow-up-tasks/watch', (req, res) => {
  const { status } = req.query;
  const { id: me } = req.user;
  let query = `
    SELECT DISTINCT
      f.*,
      p.name as person_name, p.company, p.city, p.current_company, p.person_category,
      ua.display_name as assigned_to_name,
      ub.display_name as assigned_by_name,
      i.type as interaction_type, i.date as interaction_date, i.description as interaction_desc, i.outcome as interaction_outcome,
      co.name as company_name
    FROM follow_up_tasks f
    LEFT JOIN persons p ON f.person_id = p.id
    LEFT JOIN users ua ON f.assigned_to = ua.id
    LEFT JOIN users ub ON f.assigned_by = ub.id
    LEFT JOIN interactions i ON f.interaction_id = i.id
    LEFT JOIN companies co ON f.company_id = co.id
    LEFT JOIN lead_watchers lw ON (
      (lw.source_type = 'interaction' AND lw.source_id = f.interaction_id)
      OR (lw.source_type = 'competitor_research' AND lw.source_id = f.competitor_research_id)
    )
    WHERE lw.user_id = ? AND f.assigned_to != ?
  `;
  const params = [me, me];
  const personPrivacy = buildPersonPrivacyFilter(me, 'p');
  query += personPrivacy.sql;
  params.push(...personPrivacy.params);
  if (status) {
    query += ' AND f.status = ?';
    params.push(status);
  }
  query += ' ORDER BY f.created_at DESC';
  const watchRows = db.prepare(query).all(...params);
  res.json(decryptRows('follow_up_tasks', watchRows).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
    company: decrypt(r.company),
    current_company: decrypt(r.current_company),
    interaction_desc: decrypt(r.interaction_desc),
    interaction_outcome: decrypt(r.interaction_outcome),
    company_name: decrypt(r.company_name),
  })));
});

app.get('/api/follow-up-tasks/watch/count', (req, res) => {
  const { id: me } = req.user;
  const privacy = buildPersonPrivacyFilter(me, 'p');
  const cnt = db.prepare(`
    SELECT COUNT(DISTINCT f.id) as cnt
    FROM follow_up_tasks f
    LEFT JOIN persons p ON f.person_id = p.id
    LEFT JOIN lead_watchers lw ON (
      (lw.source_type = 'interaction' AND lw.source_id = f.interaction_id)
      OR (lw.source_type = 'competitor_research' AND lw.source_id = f.competitor_research_id)
    )
    WHERE lw.user_id = ? AND f.assigned_to != ? AND f.status != 'done'
    ${privacy.sql}
  `).get(me, me, ...privacy.params).cnt;
  res.json({ count: cnt });
});

app.put('/api/follow-up-tasks/:id', (req, res) => {
  const { status, done_note, due_date } = req.body;
  const task = db.prepare('SELECT * FROM follow_up_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '未找到' });
  if (task.person_id) {
    const person = getPersonAccessRecord(task.person_id);
    if (person && !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  }
  if (task.assigned_to !== req.user.id && !isAdmin(req.user.role)) {
    return res.status(403).json({ error: '无权操作' });
  }
  const now = new Date().toISOString();
  const startedAt = status === 'in_progress'
    ? (task.started_at || now)
    : task.started_at;
  const doneAt = status === 'done' ? now : (status && status !== 'done' ? null : task.done_at);
  const enc = encryptRow('follow_up_tasks', { done_note: done_note ?? task.done_note });
  db.prepare(`
    UPDATE follow_up_tasks SET status=?, done_note=?, due_date=?, started_at=?, done_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(status ?? task.status, enc.done_note, due_date ?? task.due_date, startedAt, doneAt, req.params.id);
  res.json({ success: true });
});

// =========== 商务任务 API ===========
const TASK_STATUSES = new Set(['pending', 'in_progress', 'done', 'suspended']);

// 获取可见任务（按角色过滤）
app.get('/api/tasks', (req, res) => {
  const { date, assigned_to, team_id, status, parent_id, mine } = req.query;
  const { id: me, role, executive_role } = req.user;

  let q = `
    SELECT t.*,
      uc.display_name as created_by_name,
      ua.display_name as assigned_to_name,
      tm.name as team_name,
      p.title as parent_title,
      EXISTS (
        SELECT 1
        FROM task_shared_users tsu
        WHERE tsu.task_id = t.id AND tsu.user_id = ?
      ) as shared_to_me,
      (
        SELECT GROUP_CONCAT(tsu.user_id, ',')
        FROM task_shared_users tsu
        WHERE tsu.task_id = t.id
      ) as shared_to_ids,
      (
        SELECT GROUP_CONCAT(COALESCE(u.display_name, u.username), '、')
        FROM task_shared_users tsu
        LEFT JOIN users u ON tsu.user_id = u.id
        WHERE tsu.task_id = t.id
      ) as shared_to_names
    FROM tasks t
    LEFT JOIN users uc ON t.created_by = uc.id
    LEFT JOIN users ua ON t.assigned_to = ua.id
    LEFT JOIN teams tm ON t.team_id = tm.id
    LEFT JOIN tasks p ON t.parent_id = p.id
    WHERE 1=1
  `;
  const params = [me];

  const visibility = buildTaskVisibilityFilter(me, role, executive_role);
  q += visibility.sql;
  params.push(...visibility.params);

  if (mine === '1') { q += ' AND t.assigned_to = ?'; params.push(me); }
  if (date) { q += ' AND t.date = ?'; params.push(date); }
  if (assigned_to) { q += ' AND t.assigned_to = ?'; params.push(assigned_to); }
  if (team_id) { q += ' AND t.team_id = ?'; params.push(team_id); }
  if (status) { q += ' AND t.status = ?'; params.push(status); }
  if (parent_id === 'null') { q += ' AND t.parent_id IS NULL'; }
  else if (parent_id) { q += ' AND t.parent_id = ?'; params.push(parent_id); }

  q += ' ORDER BY CASE t.priority WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, t.created_at ASC';
  // parent_title 来自 tasks.title（加密）
  res.json(decryptRows('tasks', db.prepare(q).all(...params)).map(r => ({
    ...r,
    parent_title: decrypt(r.parent_title),
  })));
});

// 今日未完成任务数（用于Badge）
app.get('/api/tasks/count', (req, res) => {
  const { id: me } = req.user;
  const today = new Date().toISOString().slice(0, 10);
  const cnt = db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE assigned_to = ? AND date = ? AND status IN ('pending', 'in_progress')
  `).get(me, today).cnt;
  res.json({ count: cnt });
});

// 看板数据（按成员分组，按老板/小组/共享权限过滤）
app.get('/api/tasks/board', (req, res) => {
  const { id: me, role, executive_role } = req.user;
  const taskScope = getTaskVisibleScope(me, role, executive_role);
  if (!taskScope.all && !['leader', 'sales_director'].includes(role) && !taskScope.teamIds?.length) {
    return res.status(403).json({ error: '无权访问看板' });
  }
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // 获取可见成员
  let visibleIds;
  if (taskScope.all) {
    visibleIds = db.prepare('SELECT id FROM users WHERE role != ?').all('readonly').map(u => u.id);
  } else {
    visibleIds = taskScope.userIds || [me];
  }
  if (!visibleIds.includes(me)) visibleIds = [me, ...visibleIds];

  // 获取这些成员的基本信息
  const members = db.prepare(`
    SELECT u.id, u.display_name, u.role, u.team_id, t.name as team_name
    FROM users u LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id IN (${visibleIds.map(() => '?').join(',')})
    ORDER BY t.name, u.display_name
  `).all(...visibleIds);

  // 获取这些成员当天的任务
  const tasksRaw = db.prepare(`
    SELECT t.*, uc.display_name as created_by_name, p.title as parent_title
    FROM tasks t
    LEFT JOIN users uc ON t.created_by = uc.id
    LEFT JOIN tasks p ON t.parent_id = p.id
    WHERE t.assigned_to IN (${visibleIds.map(() => '?').join(',')}) AND t.date = ?
    ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at ASC
  `).all(...visibleIds, targetDate);
  const tasks = decryptRows('tasks', tasksRaw).map(r => ({
    ...r,
    parent_title: decrypt(r.parent_title),
  }));

  // 按成员组装
  const board = members.map(m => ({
    ...m,
    tasks: tasks.filter(t => t.assigned_to === m.id),
  }));

  res.json(board);
});

// 创建任务
app.post('/api/tasks', (req, res) => {
  const { title, description, date, status, priority, assigned_to, team_id, parent_id, result, shared_to } = req.body;
  const { id: me } = req.user;
  if (!title || !date || !assigned_to) return res.status(400).json({ error: '标题、日期、被指派人必填' });
  const normalizedStatus = status || 'pending';
  if (!TASK_STATUSES.has(normalizedStatus)) {
    return res.status(400).json({ error: '任务状态不合法' });
  }

  // 计算 depth
  let depth = 0;
  if (parent_id) {
    const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(parent_id);
    depth = (parent?.depth ?? 0) + 1;
  }

  // 获取 team_id（若未传，从被指派人推断）
  let resolvedTeamId = team_id || null;
  if (!resolvedTeamId) {
    const assignee = db.prepare('SELECT team_id FROM users WHERE id = ?').get(assigned_to);
    resolvedTeamId = assignee?.team_id || null;
  }

  const enc = encryptRow('tasks', { title, description, result });
  const r = db.prepare(`
    INSERT INTO tasks (title, description, date, status, priority, created_by, assigned_to, team_id, parent_id, depth, result)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    enc.title,
    enc.description || null,
    date,
    normalizedStatus,
    priority || 'medium',
    me,
    assigned_to,
    resolvedTeamId,
    parent_id || null,
    depth,
    enc.result || null
  );

  if (Array.isArray(shared_to)) {
    syncTaskSharedUsers(r.lastInsertRowid, shared_to);
  }

  res.json({ id: r.lastInsertRowid });
});

// 更新任务
app.put('/api/tasks/:id', (req, res) => {
  const { title, description, status, priority, date, result, shared_to } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '未找到' });
  if (status !== undefined && !TASK_STATUSES.has(status)) {
    return res.status(400).json({ error: '任务状态不合法' });
  }

  const { id: me, role } = req.user;
  // 只有被指派人或创建人可修改
  if (task.assigned_to !== me && task.created_by !== me && !isAdmin(role) && role !== 'sales_director') {
    return res.status(403).json({ error: '无权修改此任务' });
  }

  const now = new Date().toISOString();
  const startedAt = status === 'in_progress'
    ? (task.started_at || now)
    : task.started_at;
  const doneAt = status === 'done' ? now : (status && status !== 'done' ? null : task.done_at);
  const merged = encryptRow('tasks', {
    title: title ?? task.title,
    description: description ?? task.description,
    result: result !== undefined ? result : task.result,
  });
  db.prepare(`
    UPDATE tasks SET title=?, description=?, status=?, priority=?, date=?, started_at=?, done_at=?, result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(
    merged.title,
    merged.description,
    status ?? task.status,
    priority ?? task.priority,
    date ?? task.date,
    startedAt,
    doneAt,
    merged.result,
    req.params.id
  );
  if (Array.isArray(shared_to) && (task.created_by === me || isAdmin(role) || role === 'sales_director')) {
    syncTaskSharedUsers(req.params.id, shared_to);
  }
  res.json({ success: true });
});

// 删除任务（只有创建人且状态为pending）
app.delete('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '未找到' });
  const { id: me, role } = req.user;
  if (task.created_by !== me && !isAdmin(role)) return res.status(403).json({ error: '无权删除' });
  if (task.status !== 'pending' && !isAdmin(role)) return res.status(400).json({ error: '只能删除待处理的任务' });
  // 同时删除子任务
  db.prepare('DELETE FROM task_shared_users WHERE task_id IN (SELECT id FROM tasks WHERE parent_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE parent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM task_shared_users WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 预算管理 API ===========

// 获取预算列表（按角色过滤）
app.get('/api/budgets', (req, res) => {
  const { status, potential_level } = req.query;
  const { id: me, role } = req.user;

  let q = `
    SELECT b.*,
      u.display_name as created_by_name,
      tm.name as team_name
    FROM budgets b
    LEFT JOIN users u ON b.created_by = u.id
    LEFT JOIN teams tm ON b.team_id = tm.id
    WHERE 1=1
  `;
  const params = [];

  // 角色数据过滤
  if (role === 'member') {
    q += ' AND b.created_by = ?';
    params.push(me);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(me);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      const ids = [...new Set([me, ...members])];
      q += ` AND b.created_by IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    } else {
      q += ' AND b.created_by = ?';
      params.push(me);
    }
  } else if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(me).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(me).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      const ids = [...new Set([me, ...members])];
      q += ` AND b.created_by IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
  }
  // admin: 不过滤

  if (status) { q += ' AND b.status = ?'; params.push(status); }
  if (potential_level) { q += ' AND b.potential_level = ?'; params.push(potential_level); }

  q += ' ORDER BY b.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

// 创建预算
app.post('/api/budgets', canWrite, (req, res) => {
  const {
    name, source, platform, method, target, has_monetization_bd,
    ad_format, market_size, competitor_scale, potential_level,
    test_start_date, status, update_notes
  } = req.body;

  if (!name) return res.status(400).json({ error: '预算名称必填' });

  const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(req.user.id);
  const r = db.prepare(`
    INSERT INTO budgets (
      name, source, platform, method, target, has_monetization_bd,
      ad_format, market_size, competitor_scale, potential_level,
      test_start_date, status, update_notes, created_by, team_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, source, platform, method, target, has_monetization_bd ? 1 : 0,
    ad_format, market_size, competitor_scale, potential_level || 'medium',
    test_start_date, status || 'new_entry', update_notes, req.user.id, myUser?.team_id
  );
  res.json({ id: r.lastInsertRowid });
});

// 更新预算
app.put('/api/budgets/:id', canWrite, (req, res) => {
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  if (!budget) return res.status(404).json({ error: '未找到' });

  const { id: me, role } = req.user;
  // 只有创建人或管理员可修改
  if (budget.created_by !== me && !isAdmin(role) && role !== 'sales_director') {
    return res.status(403).json({ error: '无权修改此预算' });
  }

  const {
    name, source, platform, method, target, has_monetization_bd,
    ad_format, market_size, competitor_scale, potential_level,
    test_start_date, status, update_notes
  } = req.body;

  db.prepare(`
    UPDATE budgets SET
      name=?, source=?, platform=?, method=?, target=?, has_monetization_bd=?,
      ad_format=?, market_size=?, competitor_scale=?, potential_level=?,
      test_start_date=?, status=?, update_notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name ?? budget.name,
    source ?? budget.source,
    platform ?? budget.platform,
    method ?? budget.method,
    target ?? budget.target,
    has_monetization_bd !== undefined ? (has_monetization_bd ? 1 : 0) : budget.has_monetization_bd,
    ad_format ?? budget.ad_format,
    market_size ?? budget.market_size,
    competitor_scale ?? budget.competitor_scale,
    potential_level ?? budget.potential_level,
    test_start_date ?? budget.test_start_date,
    status ?? budget.status,
    update_notes ?? budget.update_notes,
    req.params.id
  );
  res.json({ success: true });
});

// 删除预算
app.delete('/api/budgets/:id', canWrite, (req, res) => {
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  if (!budget) return res.status(404).json({ error: '未找到' });
  const { id: me, role } = req.user;
  if (budget.created_by !== me && !isAdmin(role)) return res.status(403).json({ error: '无权删除' });
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 提醒 API ===========
app.get('/api/reminders', (req, res) => {
  const { done, person_id } = req.query;
  const { id: me, role } = req.user;
  let query = `
    SELECT r.*, p.name as person_name, p.company as person_company, p.current_company
    FROM reminders r
    LEFT JOIN persons p ON r.person_id = p.id
    WHERE 1=1
  `;
  const params = [];
  const privacy = buildPersonPrivacyFilter(me, 'p');
  query += privacy.sql;
  params.push(...privacy.params);
  const filter = buildUserFilter(me, role, 'p');
  if (filter.sql) {
    query += filter.sql;
    params.push(...filter.params);
  }
  if (done !== undefined && done !== '') { query += ' AND r.done = ?'; params.push(parseInt(done)); }
  if (person_id) { query += ' AND r.person_id = ?'; params.push(person_id); }
  query += ' ORDER BY r.remind_date ASC';
  const rows = decryptRows('reminders', db.prepare(query).all(...params)).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
    person_company: decrypt(r.person_company),
    current_company: decrypt(r.current_company),
  }));
  res.json(rows);
});

app.post('/api/reminders', (req, res) => {
  const { person_id, title, remind_date, actual_date, type, note } = req.body;
  const person = getPersonAccessRecord(person_id);
  if (!person) return res.status(404).json({ error: '未找到人脉' });
  if (!canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到人脉' });
  const enc = encryptRow('reminders', { title, note });
  const result = db.prepare(`
    INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note)
    VALUES (?,?,?,?,?,?)
  `).run(person_id, enc.title, remind_date, actual_date, type || 'follow_up', enc.note);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/reminders/:id/done', (req, res) => {
  const reminder = db.prepare('SELECT person_id FROM reminders WHERE id=?').get(req.params.id);
  if (!reminder) return res.status(404).json({ error: '未找到' });
  const person = getPersonAccessRecord(reminder.person_id);
  if (person && !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  const reminder = db.prepare('SELECT person_id FROM reminders WHERE id=?').get(req.params.id);
  if (!reminder) return res.status(404).json({ error: '未找到' });
  const person = getPersonAccessRecord(reminder.person_id);
  if (person && !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到' });
  db.prepare('DELETE FROM reminders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// =========== 统计 API ===========
app.get('/api/stats', (req, res) => {
  const { id: me, role } = req.user;
  const currentUser = db.prepare('SELECT department FROM users WHERE id = ?').get(me);
  const showRelationshipPanels = !['operation', 'rd'].includes(currentUser?.department);
  const privacy = buildPersonPrivacyFilter(me, 'p');
  const filter = buildUserFilter(me, role, 'p');
  const personWhereSql = `${privacy.sql}${filter.sql}`;
  const personWhereParams = [...privacy.params, ...filter.params];
  const personCountSql = `SELECT COUNT(*) as cnt FROM persons p WHERE 1=1${personWhereSql}`;
  const personCount = db.prepare(personCountSql).get(...personWhereParams).cnt;
  const categoryStats = db.prepare(`
    SELECT person_category, COUNT(*) as cnt
    FROM persons p
    WHERE 1=1${personWhereSql}
    GROUP BY person_category
  `).all(...personWhereParams);
  const userId = req.user?.id;
  const monthlyInteractions = db.prepare(
    "SELECT COUNT(*) as cnt FROM interactions WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now') AND created_by = ?"
  ).get(userId).cnt;
  const monthlyResearch = db.prepare(
    "SELECT COUNT(*) as cnt FROM competitor_research WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now') AND created_by = ?"
  ).get(userId).cnt;
  const monthlyTotal = monthlyInteractions + monthlyResearch;
  const pendingReminders = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM reminders r
    LEFT JOIN persons p ON r.person_id = p.id
    WHERE r.done=0 AND r.remind_date <= date('now', '+7 days')
    ${personWhereSql}
  `).get(...personWhereParams).cnt;
  const recentInteractionsRaw = db.prepare(`
    SELECT i.*, p.name as person_name, p.person_category
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    WHERE 1=1${personWhereSql}
    ORDER BY i.date DESC LIMIT 5
  `).all(...personWhereParams);
  const recentInteractions = decryptRows('interactions', recentInteractionsRaw).map(r => ({
    ...r,
    person_name: decrypt(r.person_name),
  }));
  res.json({
    personCount,
    categoryStats,
    monthlyInteractions: monthlyTotal,
    pendingReminders,
    recentInteractions,
    showRelationshipPanels,
  });
});

// =========== 公司研究表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'competitor',
    industry TEXT,
    scale TEXT,
    founded_year TEXT,
    hq_city TEXT,
    website TEXT,
    business TEXT,
    business_model TEXT,
    revenue_scale TEXT,
    tags TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    reg_name TEXT,
    city TEXT,
    business TEXT,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    department TEXT,
    level TEXT DEFAULT 'mid',
    status TEXT DEFAULT 'active',
    join_date TEXT,
    leave_date TEXT,
    background TEXT,
    skills TEXT,
    importance TEXT DEFAULT 'normal',
    person_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    entity_id INTEGER DEFAULT NULL,
    name TEXT NOT NULL,
    category TEXT,
    product_category TEXT,
    status TEXT DEFAULT 'active',
    launch_date TEXT,
    contact_phone TEXT,
    domain TEXT,
    product_link TEXT,
    discovery_source TEXT,
    description TEXT,
    target_users TEXT,
    core_features TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_dynamics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'talent',
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    importance TEXT DEFAULT 'normal',
    content TEXT,
    source TEXT,
    impact TEXT,
    personnel_id INTEGER,
    product_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

addColumnIfMissing('companies', 'created_by', 'INTEGER DEFAULT NULL');
addColumnIfMissing('companies', 'shared_with', 'TEXT DEFAULT NULL');
addColumnIfMissing('companies', 'project_group_ids', 'TEXT DEFAULT NULL');
addColumnIfMissing('company_personnel', 'manager_id', 'INTEGER DEFAULT NULL');
addColumnIfMissing('company_personnel', 'entity_id', 'INTEGER DEFAULT NULL');
addColumnIfMissing('company_products', 'entity_id', 'INTEGER DEFAULT NULL');
addColumnIfMissing('company_products', 'product_category', 'TEXT DEFAULT NULL');
addColumnIfMissing('company_products', 'product_link', 'TEXT DEFAULT NULL');
addColumnIfMissing('company_products', 'contact_phone', 'TEXT DEFAULT NULL');
addColumnIfMissing('company_products', 'domain', 'TEXT DEFAULT NULL');
addColumnIfMissing('company_products', 'discovery_source', 'TEXT DEFAULT NULL');

// =========== 公司研究 API ===========

// 公司
function canAccessCompany(user, company) {
  if (isAdmin(user.role)) return true;
  const shared = String(company.shared_with || '').split(',').filter(Boolean).map(Number);
  return Number(company.created_by) === Number(user.id) || shared.includes(Number(user.id));
}

function normalizeProjectGroupIds(projectGroupIds) {
  const raw = Array.isArray(projectGroupIds)
    ? projectGroupIds
    : String(projectGroupIds || '').split(',');
  const ids = [...new Set(raw.map(id => Number(id)).filter(Boolean))];
  return ids.length ? ids.join(',') : null;
}

function buildCompanyDuplicateInfo(name, user) {
  const rows = decryptRows('companies', db.prepare(`
    SELECT c.*, COALESCE(u.display_name, u.username) as created_by_name
    FROM companies c
    LEFT JOIN users u ON c.created_by = u.id
    ORDER BY c.updated_at DESC
  `).all());
  const matches = rows
    .map(company => ({
      company,
      match_type: getCompanyNameDuplicateReason(name, company.name),
      visible: canAccessCompany(user, company),
    }))
    .filter(item => item.match_type);

  return {
    total: matches.length,
    blocking: matches.length > 0,
    matches: matches.slice(0, 10).map(({ company, match_type, visible }) => ({
      id: visible ? company.id : null,
      name: company.name,
      match_type,
      visible,
      created_by_name: company.created_by_name || '未知用户',
    })),
  };
}

app.get('/api/companies', (req, res) => {
  const { search, category, project_group_id, project_group_ids } = req.query;
  let q = 'SELECT * FROM companies WHERE 1=1';
  const p = [];
  // name / business / tags 已加密，无法 SQL LIKE；search 全部走内存过滤
  if (category) { q += ' AND category = ?'; p.push(category); }
  const filterProjectGroupIds = normalizeProjectGroupIds(project_group_ids || project_group_id);
  if (filterProjectGroupIds) {
    const ids = filterProjectGroupIds.split(',');
    q += ` AND (${ids.map(() => "(',' || IFNULL(project_group_ids,'') || ',') LIKE ?").join(' OR ')})`;
    ids.forEach(id => p.push(`%,${id},%`));
  }
  if (!isAdmin(req.user.role)) {
    const uid = req.user.id;
    q += " AND (created_by = ? OR (',' || IFNULL(shared_with,'') || ',') LIKE ?)";
    p.push(uid, `%,${uid},%`);
  }
  q += ' ORDER BY updated_at DESC';
  const rows = decryptRows('companies', db.prepare(q).all(...p));
  if (search) {
    const s = String(search).toLowerCase();
    const hit = v => v && String(v).toLowerCase().includes(s);
    return res.json(rows.filter(r =>
      hit(r.name) || hit(r.industry) || hit(r.tags) || hit(r.business)
    ));
  }
  res.json(rows);
});

app.get('/api/companies/duplicate-check', canWrite, (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (!name) return res.json({ total: 0, blocking: false, matches: [] });
  res.json(buildCompanyDuplicateInfo(name, req.user));
});

app.get('/api/companies/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '未找到' });
  if (!canAccessCompany(req.user, c)) {
    return res.status(403).json({ error: '无权访问' });
  }
  res.json(decryptRow('companies', c));
});

app.post('/api/companies', canWrite, (req, res) => {
  const { name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes, shared_with, project_group_ids } = req.body;
  if (!String(name || '').trim()) return res.status(400).json({ error: '公司名称必填' });
  const duplicate = buildCompanyDuplicateInfo(name, req.user);
  if (duplicate.blocking) {
    return res.status(409).json({
      error: '系统已存在疑似同名公司，请联系创建人共享后再维护，避免重复新建',
      duplicate,
    });
  }
  const enc = encryptRow('companies', { name, website, business, business_model, revenue_scale, tags, notes });
  const sharedCsv = Array.isArray(shared_with) && shared_with.length ? shared_with.join(',') : null;
  const projectGroupCsv = normalizeProjectGroupIds(project_group_ids);
  const r = db.prepare(`
    INSERT INTO companies (name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes, created_by, shared_with, project_group_ids)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(enc.name, category || 'competitor', industry, scale, founded_year, hq_city, enc.website, enc.business, enc.business_model, enc.revenue_scale, enc.tags, enc.notes, req.user.id, sharedCsv, projectGroupCsv);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/companies/:id', canWrite, (req, res) => {
  const { name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes, shared_with, project_group_ids } = req.body;
  const enc = encryptRow('companies', { name, website, business, business_model, revenue_scale, tags, notes });
  const sharedCsv = Array.isArray(shared_with) && shared_with.length ? shared_with.join(',') : null;
  const projectGroupCsv = normalizeProjectGroupIds(project_group_ids);
  db.prepare(`
    UPDATE companies SET name=?, category=?, industry=?, scale=?, founded_year=?, hq_city=?, website=?,
      business=?, business_model=?, revenue_scale=?, tags=?, notes=?, shared_with=?, project_group_ids=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(enc.name, category, industry, scale, founded_year, hq_city, enc.website, enc.business, enc.business_model, enc.revenue_scale, enc.tags, enc.notes, sharedCsv, projectGroupCsv, req.params.id);
  res.json({ success: true });
});

// 公司研究摘要
app.get('/api/companies/:id/summary', (req, res) => {
  const id = req.params.id;
  const since30 = "date('now', '-30 days')";

  // 人员统计
  const totalPersonnel = db.prepare('SELECT COUNT(*) as cnt FROM company_personnel WHERE company_id = ?').get(id).cnt;
  const activePersonnel = db.prepare("SELECT COUNT(*) as cnt FROM company_personnel WHERE company_id = ? AND status = 'active'").get(id).cnt;
  const recentLeft = db.prepare(`SELECT * FROM company_personnel WHERE company_id = ? AND status = 'left' AND leave_date >= ${since30} ORDER BY leave_date DESC`).all(id);
  const recentJoined = db.prepare(`SELECT * FROM company_personnel WHERE company_id = ? AND status = 'active' AND join_date >= ${since30} ORDER BY join_date DESC`).all(id);

  // 产品统计
  const totalProducts = db.prepare('SELECT COUNT(*) as cnt FROM company_products WHERE company_id = ?').get(id).cnt;
  const activeProducts = db.prepare("SELECT COUNT(*) as cnt FROM company_products WHERE company_id = ? AND status = 'active'").get(id).cnt;
  const devProducts = db.prepare("SELECT COUNT(*) as cnt FROM company_products WHERE company_id = ? AND (status = 'developing' OR status = 'beta')").get(id).cnt;

  // 动向统计（最近30天）
  const recentDynamics = decryptRows('company_dynamics',
    db.prepare(`SELECT * FROM company_dynamics WHERE company_id = ? AND date >= ${since30} ORDER BY date DESC`).all(id)
  );
  const talentDynamics = recentDynamics.filter(d => d.type === 'talent');
  const productDynamics = recentDynamics.filter(d => d.type === 'product');
  const highImportance = recentDynamics.filter(d => d.importance === 'high');

  res.json({
    personnel: { total: totalPersonnel, active: activePersonnel, recentLeft, recentJoined },
    products: { total: totalProducts, active: activeProducts, developing: devProducts },
    dynamics: {
      total: recentDynamics.length,
      talent: talentDynamics.length,
      product: productDynamics.length,
      highImportance: highImportance.length,
      recent: recentDynamics.slice(0, 5),
    },
  });
});

// =========== 主体 API ===========
app.get('/api/company_entities', (req, res) => {
  const { company_id } = req.query;
  let q = 'SELECT * FROM company_entities WHERE 1=1';
  const p = [];
  if (company_id) { q += ' AND company_id = ?'; p.push(company_id); }
  q += ' ORDER BY sort_order ASC, created_at ASC';
  res.json(db.prepare(q).all(...p));
});

app.post('/api/company_entities', (req, res) => {
  const { company_id, name, reg_name, city, business, notes, sort_order } = req.body;
  const targetCompanyId = Number(company_id);
  if (!targetCompanyId) return res.status(400).json({ error: '所属公司必填' });
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(targetCompanyId);
  if (!company || !canAccessCompany(req.user, company)) return res.status(404).json({ error: '所属公司不存在或无权访问' });
  const r = db.prepare(`
    INSERT INTO company_entities (company_id, name, reg_name, city, business, notes, sort_order)
    VALUES (?,?,?,?,?,?,?)
  `).run(targetCompanyId, name, reg_name, city, business, notes, sort_order || 0);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_entities/:id', (req, res) => {
  const { company_id, name, reg_name, city, business, notes, sort_order } = req.body;
  const id = Number(req.params.id);
  const currentEntity = db.prepare('SELECT * FROM company_entities WHERE id = ?').get(id);
  if (!currentEntity) return res.status(404).json({ error: '主体不存在' });
  const currentCompany = db.prepare('SELECT * FROM companies WHERE id = ?').get(currentEntity.company_id);
  if (!currentCompany || !canAccessCompany(req.user, currentCompany)) return res.status(403).json({ error: '无权编辑该主体' });

  const targetCompanyId = Number(company_id || currentEntity.company_id);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(targetCompanyId);
  if (!company || !canAccessCompany(req.user, company)) return res.status(404).json({ error: '所属公司不存在或无权访问' });

  const updateEntity = db.transaction(() => {
    db.prepare(`
      UPDATE company_entities SET company_id=?, name=?, reg_name=?, city=?, business=?, notes=?, sort_order=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(targetCompanyId, name, reg_name, city, business, notes, sort_order || 0, id);

    if (Number(currentEntity.company_id) !== targetCompanyId) {
      db.prepare(`
        UPDATE company_products SET company_id=?, updated_at=CURRENT_TIMESTAMP
        WHERE entity_id=?
      `).run(targetCompanyId, id);
    }
  });
  updateEntity();
  res.json({ success: true });
});

app.delete('/api/company_entities/:id', (req, res) => {
  const id = req.params.id;
  // 解绑该主体下的人员和产品（保留记录，entity_id 置 null）
  db.prepare('UPDATE company_personnel SET entity_id = NULL WHERE entity_id = ?').run(id);
  db.prepare('UPDATE company_products SET entity_id = NULL WHERE entity_id = ?').run(id);
  db.prepare('DELETE FROM company_entities WHERE id = ?').run(id);
  res.json({ success: true });
});

app.delete('/api/companies/:id', (req, res) => {
  db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM company_personnel WHERE company_id = ?').run(req.params.id);
  db.prepare('DELETE FROM company_products WHERE company_id = ?').run(req.params.id);
  db.prepare('DELETE FROM company_dynamics WHERE company_id = ?').run(req.params.id);
  res.json({ success: true });
});

// 人员
app.get('/api/company_personnel', (req, res) => {
  const { company_id, entity_id } = req.query;
  const privacy = buildPersonPrivacyFilter(req.user.id, 'p');
  let q = `SELECT cp.*, p.name as linked_person_name FROM company_personnel cp
    LEFT JOIN persons p ON cp.person_id = p.id ${privacy.sql.replace(/^ AND /, 'AND ')}
    WHERE 1=1`;
  const params = [...privacy.params];
  if (company_id) { q += ' AND cp.company_id = ?'; params.push(company_id); }
  if (entity_id === 'null') { q += ' AND cp.entity_id IS NULL'; }
  else if (entity_id) { q += ' AND cp.entity_id = ?'; params.push(entity_id); }
  q += ' ORDER BY cp.importance DESC, cp.level DESC, cp.name ASC';
  res.json(db.prepare(q).all(...params).map(r => ({
    ...r,
    linked_person_name: decrypt(r.linked_person_name),
  })));
});

app.post('/api/company_personnel', (req, res) => {
  const { company_id, name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id, notes, manager_id, entity_id } = req.body;
  if (person_id) {
    const person = getPersonAccessRecord(person_id);
    if (!person || !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到人脉' });
    if (isPrivatePerson(person)) return res.status(400).json({ error: '个人私密人脉不能关联到公司人员' });
  }
  const r = db.prepare(`
    INSERT INTO company_personnel (company_id, name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id, notes, manager_id, entity_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, name, title, department, level || 'mid', status || 'active', join_date, leave_date, background, skills, importance || 'normal', person_id || null, notes, manager_id || null, entity_id || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_personnel/:id', (req, res) => {
  const { name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id, notes, manager_id, entity_id } = req.body;
  if (person_id) {
    const person = getPersonAccessRecord(person_id);
    if (!person || !canAccessPerson(req.user, person)) return res.status(404).json({ error: '未找到人脉' });
    if (isPrivatePerson(person)) return res.status(400).json({ error: '个人私密人脉不能关联到公司人员' });
  }
  db.prepare(`
    UPDATE company_personnel SET name=?, title=?, department=?, level=?, status=?, join_date=?, leave_date=?,
      background=?, skills=?, importance=?, person_id=?, notes=?, manager_id=?, entity_id=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id || null, notes, manager_id || null, entity_id || null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/company_personnel/:id', (req, res) => {
  db.prepare('DELETE FROM company_personnel WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 将公司人员转为人脉库外部人才
app.post('/api/company_personnel/:id/to_person', (req, res) => {
  const cp = db.prepare('SELECT cp.*, c.name as company_name FROM company_personnel cp LEFT JOIN companies c ON cp.company_id = c.id WHERE cp.id = ?').get(req.params.id);
  if (!cp) return res.status(404).json({ error: '未找到' });
  // company_name 来自 companies.name（将来加密），cp.skills/notes/background 来自未加密的 company_personnel
  const companyName = decrypt(cp.company_name);
  const enc = encryptRow('persons', {
    name: cp.name, company: companyName, position: cp.title,
    skills: cp.skills, notes: cp.notes || cp.background,
    current_company: companyName, current_position: cp.title,
  });
  const r = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, company, position,
      skills, notes, talent_type, current_company, current_position, recruit_status, intent_level,
      created_by, visibility_scope, private_owner_id)
    VALUES (?, 'talent', 'talent_external', ?, ?, ?, ?, 'external', ?, ?, 'potential', 'low', ?, 'company', NULL)
  `).run(enc.name, enc.company, enc.position, enc.skills, enc.notes, enc.current_company, enc.current_position, req.user.id);
  // 回写 person_id
  db.prepare('UPDATE company_personnel SET person_id = ? WHERE id = ?').run(r.lastInsertRowid, cp.id);
  res.json({ id: r.lastInsertRowid });
});

// 产品
app.get('/api/company_products', (req, res) => {
  const { company_id, entity_id } = req.query;
  let q = `
    SELECT cp.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.source_type = 'company_product' AND a.source_id = cp.id) as attachment_count
    FROM company_products cp
    WHERE 1=1
  `;
  const params = [];
  if (company_id) { q += ' AND cp.company_id = ?'; params.push(company_id); }
  if (entity_id === 'null') { q += ' AND cp.entity_id IS NULL'; }
  else if (entity_id) { q += ' AND cp.entity_id = ?'; params.push(entity_id); }
  q += ' ORDER BY cp.launch_date DESC, cp.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/company_products', (req, res) => {
  const {
    company_id,
    name,
    category,
    product_category,
    status,
    launch_date,
    contact_phone,
    domain,
    product_link,
    discovery_source,
    description,
    target_users,
    core_features,
    notes,
    entity_id,
  } = req.body;
  const r = db.prepare(`
    INSERT INTO company_products (
      company_id, name, category, product_category, status, launch_date,
      contact_phone, domain, product_link, discovery_source,
      description, target_users, core_features, notes, entity_id
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    company_id,
    name,
    category,
    product_category || null,
    status || 'active',
    launch_date,
    contact_phone || null,
    domain || null,
    product_link || null,
    discovery_source || null,
    description,
    target_users,
    core_features,
    notes,
    entity_id || null
  );
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_products/:id', (req, res) => {
  const {
    name,
    category,
    product_category,
    status,
    launch_date,
    contact_phone,
    domain,
    product_link,
    discovery_source,
    description,
    target_users,
    core_features,
    notes,
    entity_id,
  } = req.body;
  db.prepare(`
    UPDATE company_products
    SET name=?, category=?, product_category=?, status=?, launch_date=?,
      contact_phone=?, domain=?, product_link=?, discovery_source=?,
      description=?, target_users=?, core_features=?, notes=?, entity_id=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name,
    category,
    product_category || null,
    status,
    launch_date,
    contact_phone || null,
    domain || null,
    product_link || null,
    discovery_source || null,
    description,
    target_users,
    core_features,
    notes,
    entity_id || null,
    req.params.id
  );
  res.json({ success: true });
});

function normalizeTaskCenterText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTaskCenterJsonObjectText(value, fieldLabel) {
  const text = normalizeTaskCenterText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      const err = new Error(`${fieldLabel} 必须是 JSON 对象`);
      err.statusCode = 400;
      throw err;
    }
    return JSON.stringify(parsed);
  } catch (err) {
    if (err.statusCode) throw err;
    const invalid = new Error(`${fieldLabel} 不是有效 JSON`);
    invalid.statusCode = 400;
    throw invalid;
  }
}

function normalizeTaskCenterSource(value) {
  return normalizeTaskCenterText(value)
    .replace(/[，,、;；]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTaskCenterSourceKey(value) {
  return normalizeTaskCenterSource(value).toLowerCase().replace(/\s/g, '');
}

function splitDiscoverySources(value) {
  return String(value || '')
    .split(/[，,、;；]/)
    .map(normalizeTaskCenterSource)
    .filter(Boolean);
}

function appendDiscoverySource(existing, sourceApp) {
  const source = normalizeTaskCenterSource(sourceApp);
  const sources = splitDiscoverySources(existing);
  const keys = new Set(sources.map(getTaskCenterSourceKey).filter(Boolean));
  const sourceKey = getTaskCenterSourceKey(source);
  if (source && sourceKey && !keys.has(sourceKey)) sources.push(source);
  return sources.length ? sources.join('，') : null;
}

function getTaskCenterNameKey(value) {
  return normalizeTaskCenterText(value).toLowerCase().replace(/\s+/g, '');
}

function isCompanyLikeNameMatch(inputName, existingName) {
  const input = normalizeTaskCenterText(inputName);
  const existing = normalizeTaskCenterText(existingName);
  if (!input || !existing) return false;
  if (input === existing) return true;
  return Boolean(getCompanyNameDuplicateReason(input, existing));
}

function parseTaskCenterAttachmentIds(value) {
  let raw = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        raw = Array.isArray(parsed) ? parsed : text;
      } catch {
        raw = text;
      }
    }
  }
  raw = Array.isArray(raw)
    ? raw
    : String(raw || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  return [...new Set(raw.map(id => Number(id)).filter(Boolean))];
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function insertMobileTaskRecord(record) {
  const result = db.prepare(`
    INSERT INTO mobile_task_records (
      source_app, mini_program_name, company_entity_name, product_link, product_link_capture_method,
      matched_asset_subject_id, matched_asset_subject_name, company_id, entity_id, product_id,
      task_title, task_description, screenshot_attachment_ids, confidence, status, skip_reason,
      error_message, review_status, review_note, raw_payload, collected_at, created_by
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    record.source_app,
    record.mini_program_name || null,
    record.company_entity_name || null,
    record.product_link || null,
    record.product_link_capture_method || null,
    record.matched_asset_subject_id || null,
    record.matched_asset_subject_name || null,
    record.company_id || null,
    record.entity_id || null,
    record.product_id || null,
    record.task_title || null,
    record.task_description || null,
    safeJsonStringify(record.screenshot_attachment_ids || []),
    record.confidence ?? null,
    record.status,
    record.skip_reason || null,
    record.error_message || null,
    record.review_status || 'none',
    record.review_note || null,
    safeJsonStringify(record.raw_payload || null),
    record.collected_at || null,
    record.created_by || null
  );
  return result.lastInsertRowid;
}

function findMatchedAssetSubject(companyEntityName) {
  const input = normalizeTaskCenterText(companyEntityName);
  if (!input) return null;
  const rows = decryptRows('company_subjects', db.prepare(`
    SELECT id, group_name, company_entity, status
    FROM company_subjects
  `).all());
  return rows.find(row => {
    if (row.status && row.status !== 'active') return false;
    return isCompanyLikeNameMatch(input, row.company_entity);
  }) || null;
}

function getCompanyDisplayName(companyId) {
  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
  return company ? decrypt(company.name) : null;
}

function findCompanyByName(name) {
  const input = normalizeTaskCenterText(name);
  if (!input) return null;
  const rows = decryptRows('companies', db.prepare('SELECT * FROM companies').all());
  return rows.find(company => isCompanyLikeNameMatch(input, company.name)) || null;
}

function findResearchEntityBySubject(companyEntityName) {
  const input = normalizeTaskCenterText(companyEntityName);
  if (!input) return null;
  const rows = db.prepare(`
    SELECT ce.*, c.name as company_name
    FROM company_entities ce
    LEFT JOIN companies c ON ce.company_id = c.id
  `).all();
  return rows.find(row =>
    isCompanyLikeNameMatch(input, row.name) || isCompanyLikeNameMatch(input, row.reg_name)
  ) || null;
}

function findOrCreateUnknownCompany(userId) {
  const existing = findCompanyByName('竞品未知公司');
  if (existing) return { ...existing, created: false };

  const enc = encryptRow('companies', {
    name: '竞品未知公司',
    business: '手机任务中心采集到的未知主体竞品',
  });
  const result = db.prepare(`
    INSERT INTO companies (name, category, industry, business, created_by)
    VALUES (?, 'competitor', '待识别', ?, ?)
  `).run(enc.name, enc.business, userId || null);
  return { id: result.lastInsertRowid, name: '竞品未知公司', created: true };
}

function findOrCreateResearchEntity(companyId, companyEntityName) {
  const entityName = normalizeTaskCenterText(companyEntityName) || '待识别主体';
  const rows = db.prepare('SELECT * FROM company_entities WHERE company_id = ?').all(companyId);
  const existing = rows.find(row =>
    isCompanyLikeNameMatch(entityName, row.name) || isCompanyLikeNameMatch(entityName, row.reg_name)
  );
  if (existing) return { ...existing, created: false };

  const result = db.prepare(`
    INSERT INTO company_entities (company_id, name, reg_name, sort_order)
    VALUES (?, ?, ?, 0)
  `).run(companyId, entityName, companyEntityName ? entityName : null);
  return { id: result.lastInsertRowid, company_id: companyId, name: entityName, reg_name: companyEntityName ? entityName : null, created: true };
}

function findExistingTaskCenterProduct(companyId, entityId, productName) {
  const productKey = getTaskCenterNameKey(productName);
  if (!productKey) return null;
  const rows = db.prepare(`
    SELECT *
    FROM company_products
    WHERE company_id = ?
      AND ((? IS NULL AND entity_id IS NULL) OR entity_id = ?)
  `).all(companyId, entityId || null, entityId || null);
  return rows.find(row => getTaskCenterNameKey(row.name) === productKey) || null;
}

function findExistingTaskCenterProductByName(productName) {
  const productKey = getTaskCenterNameKey(productName);
  if (!productKey) return null;
  const rows = db.prepare(`
    SELECT *
    FROM company_products
    ORDER BY updated_at DESC, created_at DESC, id DESC
  `).all();
  return rows.find(row => getTaskCenterNameKey(row.name) === productKey) || null;
}

function getResearchEntityById(entityId) {
  return entityId
    ? db.prepare('SELECT * FROM company_entities WHERE id = ?').get(entityId)
    : null;
}

function buildTaskCenterProductNote(payload) {
  const parts = [];
  if (payload.source_app) parts.push(`来源App：${payload.source_app}`);
  if (payload.task_title) parts.push(`任务标题：${payload.task_title}`);
  if (payload.collected_at) parts.push(`采集时间：${payload.collected_at}`);
  if (payload.confidence !== undefined && payload.confidence !== null && payload.confidence !== '') {
    parts.push(`采集置信度：${payload.confidence}`);
  }
  if (payload.product_link) parts.push(`本次捕获链接：${payload.product_link}`);
  return parts.join('；');
}

function appendProductNotes(existingNotes, newNote) {
  const existing = normalizeTaskCenterText(existingNotes);
  const note = normalizeTaskCenterText(newNote);
  if (!note) return existing || null;
  if (existing && existing.includes(note)) return existing;
  return [existing, note].filter(Boolean).join('\n');
}

function bindTaskCenterAttachmentsToProduct(attachmentIds, productId) {
  if (!attachmentIds.length || !productId) return 0;
  const update = db.prepare(`
    UPDATE attachments
    SET source_type = 'company_product', source_id = ?
    WHERE id = ?
  `);
  let count = 0;
  attachmentIds.forEach(id => {
    const result = update.run(productId, id);
    count += result.changes;
  });
  return count;
}

function getMobileTaskRecordAttachments(row) {
  const ids = parseTaskCenterAttachmentIds(row.screenshot_attachment_ids);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, filename, mimetype, size, created_at
    FROM attachments
    WHERE id IN (${placeholders})
  `).all(...ids).map(normalizeGenericAttachmentRow);
  const byId = new Map(rows.map(item => [Number(item.id), item]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function getTaskCenterRecordTimeValue(record) {
  return normalizeTaskCenterText(record?.collected_at)
    || normalizeTaskCenterText(record?.created_at)
    || normalizeTaskCenterText(record?.record_at);
}

function getTaskCenterRecordDateKey(value) {
  return normalizeTaskCenterText(value).slice(0, 10);
}

function getTaskCenterRecordTimeMs(value) {
  const text = normalizeTaskCenterText(value);
  if (!text) return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)
    ? text.replace(' ', 'T')
    : text;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

function isTaskCenterTimeLater(nextValue, currentValue) {
  if (!nextValue) return false;
  if (!currentValue) return true;
  const nextMs = getTaskCenterRecordTimeMs(nextValue);
  const currentMs = getTaskCenterRecordTimeMs(currentValue);
  if (!Number.isNaN(nextMs) && !Number.isNaN(currentMs)) return nextMs > currentMs;
  return String(nextValue) > String(currentValue);
}

function isTaskCenterTimeEarlier(nextValue, currentValue) {
  if (!nextValue) return false;
  if (!currentValue) return true;
  const nextMs = getTaskCenterRecordTimeMs(nextValue);
  const currentMs = getTaskCenterRecordTimeMs(currentValue);
  if (!Number.isNaN(nextMs) && !Number.isNaN(currentMs)) return nextMs < currentMs;
  return String(nextValue) < String(currentValue);
}

function formatTaskCenterStatsDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildTaskCenterStatsDateKeys(startDate, endDate) {
  const keys = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    keys.push(formatTaskCenterStatsDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function createMobileTaskCenterSummary(daysInput) {
  const days = Math.min(Math.max(Number(daysInput) || 30, 1), 365);
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);
  const startDateKey = formatTaskCenterStatsDate(startDate);
  const endDateKey = formatTaskCenterStatsDate(endDate);
  const effectiveStatuses = new Set(['matched', 'unknown']);

  const rows = db.prepare(`
    SELECT r.*, c.name as company_name, ce.name as entity_name, ce.reg_name as entity_reg_name, cp.name as product_name
    FROM mobile_task_records r
    LEFT JOIN companies c ON r.company_id = c.id
    LEFT JOIN company_entities ce ON r.entity_id = ce.id
    LEFT JOIN company_products cp ON r.product_id = cp.id
    ORDER BY r.created_at DESC, r.id DESC
  `).all().map(row => {
    const recordAt = getTaskCenterRecordTimeValue(row);
    return {
      ...row,
      company_name: row.company_name ? decrypt(row.company_name) : null,
      record_at: recordAt,
      record_date: getTaskCenterRecordDateKey(recordAt),
    };
  }).filter(row => row.record_date && row.record_date >= startDateKey && row.record_date <= endDateKey);

  const firstSeenByProductId = new Map();
  db.prepare(`
    SELECT id, product_id, source_app, company_id, entity_id, collected_at, created_at
    FROM mobile_task_records
    WHERE product_id IS NOT NULL AND status IN ('matched', 'unknown')
    ORDER BY id ASC
  `).all().forEach(row => {
    const productId = Number(row.product_id);
    if (!productId) return;
    const recordAt = getTaskCenterRecordTimeValue(row);
    const existing = firstSeenByProductId.get(productId);
    if (!existing || isTaskCenterTimeEarlier(recordAt, existing.record_at)) {
      firstSeenByProductId.set(productId, {
        product_id: productId,
        source_app: normalizeTaskCenterSource(row.source_app),
        company_id: row.company_id || null,
        entity_id: row.entity_id || null,
        record_at: recordAt,
        record_date: getTaskCenterRecordDateKey(recordAt),
      });
    }
  });

  const overview = {
    total_records: rows.length,
    effective_records: 0,
    matched_records: 0,
    unknown_records: 0,
    skipped_records: 0,
    failed_records: 0,
    pending_review_records: 0,
    reviewed_records: 0,
    apps_covered: 0,
    companies_covered: 0,
    products_covered: 0,
    new_products: 0,
    records_with_link: 0,
    last_collected_at: null,
  };

  const appSet = new Set();
  const companySet = new Set();
  const productSet = new Set();
  const newProductSet = new Set();
  const dailyStatsMap = new Map(
    buildTaskCenterStatsDateKeys(startDate, endDate).map(date => [date, {
      date,
      total_records: 0,
      effective_records: 0,
      matched_records: 0,
      unknown_records: 0,
      skipped_records: 0,
      failed_records: 0,
      pending_review_count: 0,
      new_product_count: 0,
    }])
  );
  const appStatsMap = new Map();
  const companyStatsMap = new Map();
  const captureMethodMap = new Map();
  const issueMap = new Map();

  rows.forEach(row => {
    const dateKey = row.record_date;
    const isEffective = effectiveStatuses.has(row.status);
    const sourceApp = normalizeTaskCenterSource(row.source_app) || '未命名来源';
    const daily = dailyStatsMap.get(dateKey);
    if (daily) {
      daily.total_records += 1;
      if (row.review_status === 'pending') daily.pending_review_count += 1;
      if (row.status === 'matched') daily.matched_records += 1;
      if (row.status === 'unknown') daily.unknown_records += 1;
      if (row.status === 'skipped') daily.skipped_records += 1;
      if (row.status === 'failed') daily.failed_records += 1;
      if (isEffective) daily.effective_records += 1;
    }

    appSet.add(sourceApp);
    if (row.company_id) companySet.add(Number(row.company_id));
    if (row.product_id) productSet.add(Number(row.product_id));
    if (row.product_link) overview.records_with_link += 1;
    if (row.review_status === 'pending') overview.pending_review_records += 1;
    if (row.review_status === 'reviewed') overview.reviewed_records += 1;
    if (row.status === 'matched') overview.matched_records += 1;
    if (row.status === 'unknown') overview.unknown_records += 1;
    if (row.status === 'skipped') overview.skipped_records += 1;
    if (row.status === 'failed') overview.failed_records += 1;
    if (isEffective) overview.effective_records += 1;
    if (isTaskCenterTimeLater(row.record_at, overview.last_collected_at)) overview.last_collected_at = row.record_at;

    if (!appStatsMap.has(sourceApp)) {
      appStatsMap.set(sourceApp, {
        source_app: sourceApp,
        total_records: 0,
        effective_records: 0,
        skipped_records: 0,
        failed_records: 0,
        pending_review_count: 0,
        new_product_count: 0,
        product_ids: new Set(),
        company_ids: new Set(),
        last_collected_at: null,
      });
    }
    const appStats = appStatsMap.get(sourceApp);
    appStats.total_records += 1;
    if (isEffective) appStats.effective_records += 1;
    if (row.status === 'skipped') appStats.skipped_records += 1;
    if (row.status === 'failed') appStats.failed_records += 1;
    if (row.review_status === 'pending') appStats.pending_review_count += 1;
    if (row.product_id) appStats.product_ids.add(Number(row.product_id));
    if (row.company_id) appStats.company_ids.add(Number(row.company_id));
    if (isTaskCenterTimeLater(row.record_at, appStats.last_collected_at)) appStats.last_collected_at = row.record_at;

    if (isEffective) {
      const companyKey = `${row.company_id || 0}:${row.entity_id || 0}`;
      if (!companyStatsMap.has(companyKey)) {
        companyStatsMap.set(companyKey, {
          key: companyKey,
          company_id: row.company_id || null,
          company_name: row.company_name || '未匹配公司',
          entity_id: row.entity_id || null,
          entity_name: row.entity_name || row.entity_reg_name || '待识别主体',
          record_count: 0,
          new_product_count: 0,
          product_ids: new Set(),
          source_apps: new Set(),
          last_collected_at: null,
        });
      }
      const companyStats = companyStatsMap.get(companyKey);
      companyStats.record_count += 1;
      if (row.product_id) companyStats.product_ids.add(Number(row.product_id));
      companyStats.source_apps.add(sourceApp);
      if (isTaskCenterTimeLater(row.record_at, companyStats.last_collected_at)) companyStats.last_collected_at = row.record_at;

      const captureMethod = normalizeTaskCenterText(row.product_link_capture_method) || '未记录';
      captureMethodMap.set(captureMethod, (captureMethodMap.get(captureMethod) || 0) + 1);
    }

    if (row.status === 'skipped' || row.status === 'failed') {
      const reason = normalizeTaskCenterText(row.skip_reason || row.error_message) || '未记录原因';
      const issueKey = `${row.status}:${reason}`;
      if (!issueMap.has(issueKey)) {
        issueMap.set(issueKey, {
          type: row.status,
          reason,
          count: 0,
        });
      }
      issueMap.get(issueKey).count += 1;
    }
  });

  firstSeenByProductId.forEach(item => {
    if (!item.record_date || item.record_date < startDateKey || item.record_date > endDateKey) return;
    newProductSet.add(item.product_id);
    const daily = dailyStatsMap.get(item.record_date);
    if (daily) daily.new_product_count += 1;

    const appStats = appStatsMap.get(item.source_app);
    if (appStats) appStats.new_product_count += 1;

    const companyKey = `${item.company_id || 0}:${item.entity_id || 0}`;
    const companyStats = companyStatsMap.get(companyKey);
    if (companyStats) companyStats.new_product_count += 1;
  });

  overview.apps_covered = appSet.size;
  overview.companies_covered = companySet.size;
  overview.products_covered = productSet.size;
  overview.new_products = newProductSet.size;

  return {
    days,
    date_range: {
      start_date: startDateKey,
      end_date: endDateKey,
    },
    overview,
    daily_stats: [...dailyStatsMap.values()],
    app_stats: [...appStatsMap.values()]
      .map(({ product_ids, company_ids, ...item }) => ({
        ...item,
        product_count: product_ids.size,
        company_count: company_ids.size,
      }))
      .sort((a, b) =>
        b.effective_records - a.effective_records
        || b.new_product_count - a.new_product_count
        || b.total_records - a.total_records
        || a.source_app.localeCompare(b.source_app, 'zh-CN')),
    company_stats: [...companyStatsMap.values()]
      .map(({ product_ids, source_apps, ...item }) => ({
        ...item,
        product_count: product_ids.size,
        source_app_count: source_apps.size,
      }))
      .sort((a, b) =>
        b.product_count - a.product_count
        || b.record_count - a.record_count
        || (a.company_name || '').localeCompare(b.company_name || '', 'zh-CN')),
    capture_method_stats: [...captureMethodMap.entries()]
      .map(([capture_method, count]) => ({ capture_method, count }))
      .sort((a, b) => b.count - a.count || a.capture_method.localeCompare(b.capture_method, 'zh-CN')),
    issue_stats: [...issueMap.values()]
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'zh-CN')),
  };
}

function saveMobileTaskCenterRecord(payload, user) {
  const sourceApp = normalizeTaskCenterSource(payload.source_app);
  const miniProgramName = normalizeTaskCenterText(payload.mini_program_name);
  const companyEntityName = normalizeTaskCenterText(payload.company_entity_name);
  const productLink = normalizeTaskCenterText(payload.product_link);
  const attachmentIds = parseTaskCenterAttachmentIds(payload.screenshot_attachment_ids || payload.screenshot_paths);
  const baseRecord = {
    source_app: sourceApp,
    mini_program_name: miniProgramName,
    company_entity_name: companyEntityName,
    product_link: productLink,
    product_link_capture_method: normalizeTaskCenterText(payload.product_link_capture_method),
    task_title: normalizeTaskCenterText(payload.task_title),
    task_description: normalizeTaskCenterText(payload.task_description),
    screenshot_attachment_ids: attachmentIds,
    confidence: payload.confidence,
    collected_at: normalizeTaskCenterText(payload.collected_at) || new Date().toISOString(),
    created_by: user?.id,
    raw_payload: payload,
  };

  if (!sourceApp) {
    const err = new Error('来源 App 必填');
    err.statusCode = 400;
    throw err;
  }

  if (!miniProgramName) {
    const id = insertMobileTaskRecord({
      ...baseRecord,
      status: 'failed',
      error_message: '未抓到小程序名',
      review_status: 'pending',
      review_note: '未抓到小程序名，需人工复核任务页面或采集规则',
    });
    return { id, record_id: id, status: 'failed', review_status: 'pending', error: '未抓到小程序名' };
  }

  const assetSubject = findMatchedAssetSubject(companyEntityName);
  if (assetSubject) {
    const id = insertMobileTaskRecord({
      ...baseRecord,
      status: 'skipped',
      skip_reason: '命中资产管理主体，跳过入库',
      matched_asset_subject_id: assetSubject.id,
      matched_asset_subject_name: assetSubject.company_entity,
    });
    return {
      id,
      record_id: id,
      status: 'skipped',
      review_status: 'none',
      skip_reason: '命中资产管理主体，跳过入库',
      matched_asset_subject_id: assetSubject.id,
      matched_asset_subject_name: assetSubject.company_entity,
    };
  }

  let matchStatus = 'matched';
  let entity = findResearchEntityBySubject(companyEntityName);
  let companyId = entity?.company_id || null;
  let productMatchedByName = null;

  if (!companyId) {
    const matchedCompany = findCompanyByName(companyEntityName);
    if (matchedCompany) {
      companyId = matchedCompany.id;
    } else {
      productMatchedByName = findExistingTaskCenterProductByName(miniProgramName);
      if (productMatchedByName) {
        companyId = productMatchedByName.company_id;
        entity = getResearchEntityById(productMatchedByName.entity_id);
      } else {
        const unknownCompany = findOrCreateUnknownCompany(user?.id);
        companyId = unknownCompany.id;
        matchStatus = 'unknown';
      }
    }
    if (!entity) {
      entity = findOrCreateResearchEntity(companyId, companyEntityName);
    }
  }

  const existingProduct = productMatchedByName || findExistingTaskCenterProduct(companyId, entity?.id || null, miniProgramName);
  const productNote = buildTaskCenterProductNote(baseRecord);
  let productId;
  let productCreated = false;
  let productLinkConflict = null;
  let storedProductLink = null;

  if (existingProduct) {
    productId = existingProduct.id;
    const nextDiscoverySource = appendDiscoverySource(existingProduct.discovery_source, sourceApp);
    const existingLink = normalizeTaskCenterText(existingProduct.product_link);
    const nextLink = existingLink || productLink || null;
    storedProductLink = nextLink;
    if (existingLink && productLink && existingLink !== productLink) {
      productLinkConflict = { existing: existingLink, captured: productLink };
    }
    db.prepare(`
      UPDATE company_products
      SET entity_id = COALESCE(entity_id, ?),
        product_link = ?, discovery_source = ?,
        description = COALESCE(NULLIF(description, ''), ?),
        notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      entity?.id || null,
      nextLink,
      nextDiscoverySource,
      baseRecord.task_description || null,
      appendProductNotes(existingProduct.notes, productNote),
      productId
    );
  } else {
    const result = db.prepare(`
      INSERT INTO company_products (
        company_id, name, category, status, product_link, discovery_source,
        description, notes, entity_id
      )
      VALUES (?, ?, '支付宝小程序', 'active', ?, ?, ?, ?, ?)
    `).run(
      companyId,
      miniProgramName,
      productLink || null,
      appendDiscoverySource(null, sourceApp),
      baseRecord.task_description || null,
      productNote || null,
      entity?.id || null
    );
    productId = result.lastInsertRowid;
    productCreated = true;
    storedProductLink = productLink || null;
  }

  const boundAttachmentCount = bindTaskCenterAttachmentsToProduct(attachmentIds, productId);
  const id = insertMobileTaskRecord({
    ...baseRecord,
    status: matchStatus,
    company_id: companyId,
    entity_id: entity?.id || null,
    product_id: productId,
    error_message: productLinkConflict ? `本次抓取链接与已有产品链接不一致：${productLinkConflict.captured}` : null,
    review_status: productLinkConflict ? 'pending' : 'none',
    review_note: productLinkConflict ? `已有链接：${productLinkConflict.existing}\n本次链接：${productLinkConflict.captured}` : null,
  });

  return {
    id,
    record_id: id,
    status: matchStatus,
    company_id: companyId,
    company_name: getCompanyDisplayName(companyId),
    entity_id: entity?.id || null,
    entity_name: entity?.name || null,
    product_id: productId,
    product_created: productCreated,
    review_status: productLinkConflict ? 'pending' : 'none',
    discovery_source: appendDiscoverySource(existingProduct?.discovery_source, sourceApp),
    product_link: storedProductLink,
    captured_product_link: productLink || null,
    product_link_conflict: productLinkConflict,
    bound_attachment_count: boundAttachmentCount,
    should_notify: true,
  };
}

app.post('/api/company_products/:id/task-center-notification', canWrite, (req, res) => {
  const result = notifyTaskCenterProductRecord(req.params.id, req.body || {});
  if (!result) return res.status(404).json({ error: '产品不存在' });
  res.json({ success: true, notified_count: result.recipients.length });
});

app.delete('/api/company_products/:id', (req, res) => {
  const product = db.prepare('SELECT id FROM company_products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: '产品不存在' });

  const attachmentRows = db.prepare("SELECT filepath FROM attachments WHERE source_type = 'company_product' AND source_id = ?").all(req.params.id);
  const deleteProduct = db.transaction((id) => {
    db.prepare("DELETE FROM attachments WHERE source_type = 'company_product' AND source_id = ?").run(id);
    db.prepare('DELETE FROM company_products WHERE id = ?').run(id);
  });
  deleteProduct(req.params.id);
  attachmentRows.forEach(att => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, att.filepath)); } catch {}
  });
  res.json({ success: true });
});

app.get('/api/mobile-task-center/apps', (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM mobile_task_apps
    ORDER BY sort_order ASC, id ASC
  `).all();
  res.json(rows);
});

app.post('/api/mobile-task-center/apps', canWrite, (req, res) => {
  const { app_name, package_name, task_center_entry, collector_config, enabled = 1, sort_order = 0, remark } = req.body;
  const name = normalizeTaskCenterText(app_name);
  if (!name) return res.status(400).json({ error: 'App 名称必填' });
  try {
    const result = db.prepare(`
      INSERT INTO mobile_task_apps (
        app_name, package_name, task_center_entry, collector_config, enabled, sort_order, remark, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      normalizeTaskCenterText(package_name) || null,
      normalizeTaskCenterText(task_center_entry) || null,
      normalizeTaskCenterJsonObjectText(collector_config, '高级采集配置'),
      enabled ? 1 : 0,
      Number(sort_order) || 0,
      normalizeTaskCenterText(remark) || null,
      req.user.id
    );
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : '保存采集 App 失败' });
  }
});

app.put('/api/mobile-task-center/apps/:id', canWrite, (req, res) => {
  const existing = db.prepare('SELECT id FROM mobile_task_apps WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '采集 App 不存在' });
  const { app_name, package_name, task_center_entry, collector_config, enabled = 1, sort_order = 0, remark } = req.body;
  const name = normalizeTaskCenterText(app_name);
  if (!name) return res.status(400).json({ error: 'App 名称必填' });
  try {
    db.prepare(`
      UPDATE mobile_task_apps
      SET app_name = ?, package_name = ?, task_center_entry = ?, collector_config = ?, enabled = ?,
        sort_order = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      normalizeTaskCenterText(package_name) || null,
      normalizeTaskCenterText(task_center_entry) || null,
      normalizeTaskCenterJsonObjectText(collector_config, '高级采集配置'),
      enabled ? 1 : 0,
      Number(sort_order) || 0,
      normalizeTaskCenterText(remark) || null,
      req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : '保存采集 App 失败' });
  }
});

app.delete('/api/mobile-task-center/apps/:id', canWrite, (req, res) => {
  const existing = db.prepare('SELECT id FROM mobile_task_apps WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '采集 App 不存在' });
  db.prepare('DELETE FROM mobile_task_apps WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/mobile-task-center/summary', (req, res) => {
  try {
    res.json(createMobileTaskCenterSummary(req.query.days));
  } catch (err) {
    console.error('加载手机任务中心统计失败:', err);
    res.status(500).json({ error: '加载手机任务中心统计失败' });
  }
});

app.get('/api/mobile-task-center/records', (req, res) => {
  const { status, source_app, product_id, review_status, limit = 100 } = req.query;
  let q = `
    SELECT r.*, cp.name as product_name, c.name as company_name, ce.name as entity_name,
      COALESCE(u.display_name, u.username) as reviewed_by_name
    FROM mobile_task_records r
    LEFT JOIN company_products cp ON r.product_id = cp.id
    LEFT JOIN companies c ON r.company_id = c.id
    LEFT JOIN company_entities ce ON r.entity_id = ce.id
    LEFT JOIN users u ON r.reviewed_by = u.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { q += ' AND r.status = ?'; params.push(status); }
  if (source_app) { q += ' AND r.source_app = ?'; params.push(source_app); }
  if (product_id) { q += ' AND r.product_id = ?'; params.push(product_id); }
  if (review_status) { q += ' AND r.review_status = ?'; params.push(review_status); }
  q += ' ORDER BY r.created_at DESC LIMIT ?';
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  const rows = db.prepare(q).all(...params).map(row => ({
    ...row,
    company_name: decrypt(row.company_name),
    screenshot_attachments: getMobileTaskRecordAttachments(row),
  }));
  res.json(rows);
});

app.put('/api/mobile-task-center/records/:id/review', canWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM mobile_task_records WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '采集记录不存在' });
  const allowed = new Set(['none', 'pending', 'reviewed']);
  const reviewStatus = normalizeTaskCenterText(req.body.review_status || 'reviewed');
  if (!allowed.has(reviewStatus)) return res.status(400).json({ error: '无效的复核状态' });
  const reviewNote = normalizeTaskCenterText(req.body.review_note) || null;
  db.prepare(`
    UPDATE mobile_task_records
    SET review_status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reviewStatus, reviewNote, req.user.id, id);
  res.json({ success: true });
});

app.post('/api/mobile-task-center/records', canWrite, (req, res) => {
  try {
    const saveRecord = db.transaction((payload, user) => saveMobileTaskCenterRecord(payload, user));
    const result = saveRecord(req.body || {}, req.user);

    if (result.should_notify && result.product_id) {
      const notification = notifyTaskCenterProductRecord(result.product_id, {
        source_app: req.body.source_app,
        mini_program_name: req.body.mini_program_name,
        company_name: result.company_name,
        entity_name: result.entity_name,
        screenshot_count: parseTaskCenterAttachmentIds(req.body.screenshot_attachment_ids || req.body.screenshot_paths).length,
      });
      result.notified_count = notification?.recipients?.length || 0;
    }

    delete result.should_notify;
    res.json(result);
  } catch (err) {
    console.error('手机任务中心采集入库失败:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : '手机任务中心采集入库失败' });
  }
});

// 动向
app.get('/api/company_dynamics', (req, res) => {
  const { company_id, type } = req.query;
  let q = 'SELECT * FROM company_dynamics WHERE 1=1';
  const params = [];
  if (company_id) { q += ' AND company_id = ?'; params.push(company_id); }
  if (type) { q += ' AND type = ?'; params.push(type); }
  q += ' ORDER BY date DESC, created_at DESC';
  res.json(decryptRows('company_dynamics', db.prepare(q).all(...params)));
});

app.post('/api/company_dynamics', (req, res) => {
  const { company_id, type, title, date, importance, content, source, impact, personnel_id, product_id } = req.body;
  const enc = encryptRow('company_dynamics', { title, content, source, impact });
  const r = db.prepare(`
    INSERT INTO company_dynamics (company_id, type, title, date, importance, content, source, impact, personnel_id, product_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, type || 'talent', enc.title, date, importance || 'normal', enc.content, enc.source, enc.impact, personnel_id || null, product_id || null);
  // 更新公司 updated_at
  db.prepare('UPDATE companies SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(company_id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_dynamics/:id', (req, res) => {
  const { type, title, date, importance, content, source, impact, personnel_id, product_id } = req.body;
  const enc = encryptRow('company_dynamics', { title, content, source, impact });
  db.prepare(`
    UPDATE company_dynamics SET type=?, title=?, date=?, importance=?, content=?, source=?, impact=?, personnel_id=?, product_id=?
    WHERE id=?
  `).run(type, enc.title, date, importance, enc.content, enc.source, enc.impact, personnel_id || null, product_id || null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/company_dynamics/:id', (req, res) => {
  db.prepare('DELETE FROM company_dynamics WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 竞品研究记录 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS competitor_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    importance TEXT DEFAULT 'normal',
    content TEXT,
    source TEXT,
    impact TEXT,
    amount REAL,
    outcome TEXT,
    follow_result TEXT,
    next_action TEXT,
    next_action_date TEXT,
    opportunity_title TEXT,
    opportunity_status TEXT,
    opportunity_assignee INTEGER,
    opportunity_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.get('/api/competitor_research', (req, res) => {
  const { company_id } = req.query;
  let q = 'SELECT * FROM competitor_research WHERE 1=1';
  const params = [];
  if (company_id) { q += ' AND company_id = ?'; params.push(company_id); }
  if (!isAdmin(req.user.role)) {
    const uid = req.user.id;
    q += " AND (created_by = ? OR (',' || IFNULL(shared_with,'') || ',') LIKE ?)";
    params.push(uid, `%,${uid},%`);
  }
  q += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/competitor_research', (req, res) => {
  const { company_id, date, title, importance, content, source, impact, amount, outcome, follow_result, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, watcher_ids, shared_with } = req.body;
  const createdBy = req.user?.id || null;
  const sharedCsv = Array.isArray(shared_with) && shared_with.length ? shared_with.join(',') : null;
  const r = db.prepare(`
    INSERT INTO competitor_research (company_id, date, title, importance, content, source, impact, amount, outcome, follow_result, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, created_by, shared_with)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, date, title, importance || 'normal', content, source, impact, amount || null, outcome, follow_result || null, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee || null, opportunity_note, createdBy, sharedCsv);
  db.prepare('UPDATE companies SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(company_id);

  // 自动创建待跟进任务（商机指派）
  if (opportunity_title && opportunity_assignee) {
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(company_id);
    const companyName = decrypt(company?.name) || '未知公司';
    const taskTitle = `${companyName} - ${opportunity_title}`;
    const ftEnc = encryptRow('follow_up_tasks', {
      title: taskTitle, opportunity_title, opportunity_note,
    });
    db.prepare(`
      INSERT INTO follow_up_tasks (title, interaction_id, person_id, competitor_research_id, company_id, opportunity_title, opportunity_note, assigned_to, assigned_by)
      VALUES (?,0,0,?,?,?,?,?,?)
    `).run(ftEnc.title, r.lastInsertRowid, company_id, ftEnc.opportunity_title, ftEnc.opportunity_note || null,
      opportunity_assignee, req.user.id);
  }

  if (watcher_ids?.length) {
    syncLeadWatchers('competitor_research', r.lastInsertRowid, watcher_ids);
  }

  res.json({ id: r.lastInsertRowid });
});

app.put('/api/competitor_research/:id', (req, res) => {
  const { date, title, importance, content, source, impact, amount, outcome, follow_result, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, watcher_ids, shared_with } = req.body;
  const sharedCsv = Array.isArray(shared_with) && shared_with.length ? shared_with.join(',') : null;
  db.prepare(`
    UPDATE competitor_research SET date=?, title=?, importance=?, content=?, source=?, impact=?, amount=?, outcome=?, follow_result=?, next_action=?, next_action_date=?, opportunity_title=?, opportunity_status=?, opportunity_assignee=?, opportunity_note=?, shared_with=?
    WHERE id=?
  `).run(date, title, importance, content, source, impact, amount || null, outcome, follow_result || null, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee || null, opportunity_note, sharedCsv, req.params.id);

  // 同步更新待跟进任务
  if (opportunity_title && opportunity_assignee) {
    const existing = db.prepare('SELECT id FROM follow_up_tasks WHERE competitor_research_id = ? AND status != ?').get(req.params.id, 'done');
    if (existing) {
      const ftUpd = encryptRow('follow_up_tasks', { opportunity_title, opportunity_note });
      db.prepare('UPDATE follow_up_tasks SET assigned_to=?, opportunity_title=?, opportunity_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(opportunity_assignee, ftUpd.opportunity_title, ftUpd.opportunity_note || null, existing.id);
    } else {
      const cr = db.prepare('SELECT company_id FROM competitor_research WHERE id = ?').get(req.params.id);
      const company = cr ? db.prepare('SELECT name FROM companies WHERE id = ?').get(cr.company_id) : null;
      const companyName = decrypt(company?.name) || '未知公司';
      const taskTitle = `${companyName} - ${opportunity_title}`;
      const ftEnc = encryptRow('follow_up_tasks', {
        title: taskTitle, opportunity_title, opportunity_note,
      });
      db.prepare(`
        INSERT INTO follow_up_tasks (title, interaction_id, person_id, competitor_research_id, company_id, opportunity_title, opportunity_note, assigned_to, assigned_by)
        VALUES (?,0,0,?,?,?,?,?,?)
      `).run(ftEnc.title, req.params.id, cr?.company_id || 0, ftEnc.opportunity_title, ftEnc.opportunity_note || null,
        opportunity_assignee, req.user.id);
    }
  }

  if (watcher_ids !== undefined) {
    syncLeadWatchers('competitor_research', req.params.id, watcher_ids);
  }

  res.json({ success: true });
});

app.delete('/api/competitor_research/:id', (req, res) => {
  db.prepare('DELETE FROM competitor_research WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 出差管理建表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    leader_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS business_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id INTEGER,
    destinations TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    purpose TEXT,
    related_persons TEXT,
    estimated_cost REAL,
    status TEXT DEFAULT 'draft',
    approve_note TEXT,
    approved_by INTEGER,
    approved_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trip_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expense_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    approve_note TEXT,
    approved_by INTEGER,
    approved_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 动态加列：users.group_id
const userColsForGroup = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userColsForGroup.includes('group_id')) {
  db.exec("ALTER TABLE users ADD COLUMN group_id INTEGER DEFAULT NULL");
}

// =========== 小组 API ===========
app.get('/api/groups', (req, res) => {
  const rows = db.prepare(`
    SELECT g.*, u.display_name as leader_name
    FROM groups g LEFT JOIN users u ON g.leader_id = u.id
    ORDER BY g.id ASC
  `).all();
  res.json(rows);
});

app.post('/api/groups', (req, res) => {
  const { name, leader_id, notes } = req.body;
  const r = db.prepare('INSERT INTO groups (name, leader_id, notes) VALUES (?,?,?)').run(name, leader_id || null, notes);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/groups/:id', (req, res) => {
  const { name, leader_id, notes } = req.body;
  db.prepare('UPDATE groups SET name=?, leader_id=?, notes=? WHERE id=?').run(name, leader_id || null, notes, req.params.id);
  res.json({ success: true });
});

app.delete('/api/groups/:id', (req, res) => {
  db.prepare('UPDATE users SET group_id=NULL WHERE group_id=?').run(req.params.id);
  db.prepare('DELETE FROM groups WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// =========== 出差申请 API ===========
// 权限辅助：是否可操作该申请（本人 or leader/admin）
function canAccessTrip(req, tripUserId) {
  const { id, role } = req.user;
  return isAdmin(role) || role === 'leader' || role === 'sales_director' || id === tripUserId;
}

app.get('/api/trips', (req, res) => {
  const { status, user_id, group_id } = req.query;
  const { id: me, role } = req.user;
  let q = `
    SELECT t.*, u.display_name as user_name, u.group_id,
           g.name as group_name,
           a.display_name as approver_name,
           er.status as report_status, er.total_amount, er.id as report_id
    FROM business_trips t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN groups g ON t.group_id = g.id
    LEFT JOIN users a ON t.approved_by = a.id
    LEFT JOIN expense_reports er ON er.trip_id = t.id
    WHERE 1=1
  `;
  const params = [];
  // 按角色过滤可见出差申请
  const visibleTripIds = getVisibleUserIds(me, role);
  if (visibleTripIds !== null) {
    q += ` AND t.user_id IN (${visibleTripIds.map(() => '?').join(',')})`;
    params.push(...visibleTripIds);
  }
  if (status) { q += ' AND t.status = ?'; params.push(status); }
  if (user_id) { q += ' AND t.user_id = ?'; params.push(user_id); }
  if (group_id) { q += ' AND u.group_id = ?'; params.push(group_id); }
  q += ' ORDER BY t.created_at DESC';
  res.json(decryptRows('business_trips', db.prepare(q).all(...params)));
});

app.get('/api/trips/:id', (req, res) => {
  const t = db.prepare(`
    SELECT t.*, u.display_name as user_name, g.name as group_name, a.display_name as approver_name
    FROM business_trips t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN groups g ON t.group_id = g.id
    LEFT JOIN users a ON t.approved_by = a.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到' });
  if (!canAccessTrip(req, t.user_id)) return res.status(403).json({ error: '无权限' });
  const expenses = decryptRows('trip_expenses', db.prepare('SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY date ASC').all(req.params.id));
  const report = db.prepare('SELECT * FROM expense_reports WHERE trip_id = ?').get(req.params.id);
  res.json({ ...decryptRow('business_trips', t), expenses, report: report ? decryptRow('expense_reports', report) : null });
});

app.post('/api/trips', (req, res) => {
  const { destinations, start_date, end_date, purpose, related_persons, estimated_cost } = req.body;
  const user = db.prepare('SELECT group_id FROM users WHERE id=?').get(req.user.id);
  const enc = encryptRow('business_trips', { destinations, purpose, related_persons });
  const r = db.prepare(`
    INSERT INTO business_trips (user_id, group_id, destinations, start_date, end_date, purpose, related_persons, estimated_cost, status)
    VALUES (?,?,?,?,?,?,?,?,'draft')
  `).run(req.user.id, user?.group_id || null, enc.destinations, start_date, end_date, enc.purpose, enc.related_persons || '', estimated_cost || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/trips/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到' });
  if (t.user_id !== req.user.id && !isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  if (!['draft', 'rejected'].includes(t.status)) return res.status(400).json({ error: '当前状态不可编辑' });
  const { destinations, start_date, end_date, purpose, related_persons, estimated_cost } = req.body;
  const enc = encryptRow('business_trips', { destinations, purpose, related_persons });
  db.prepare(`
    UPDATE business_trips SET destinations=?, start_date=?, end_date=?, purpose=?, related_persons=?, estimated_cost=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(enc.destinations, start_date, end_date, enc.purpose, enc.related_persons || '', estimated_cost || null, req.params.id);
  res.json({ success: true });
});

// 提交审批
app.post('/api/trips/:id/submit', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t || t.user_id !== req.user.id) return res.status(403).json({ error: '无权限' });
  if (!['draft', 'rejected'].includes(t.status)) return res.status(400).json({ error: '当前状态不可提交' });
  db.prepare("UPDATE business_trips SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// 审批
app.post('/api/trips/:id/approve', (req, res) => {
  const { role } = req.user;
  if (!isAdmin(role) && role !== 'leader' && role !== 'sales_director') return res.status(403).json({ error: '无审批权限' });
  const { action, note } = req.body; // action: approved | rejected
  if (!['approved', 'rejected'].includes(action)) return res.status(400).json({ error: '无效操作' });
  const enc = encryptRow('business_trips', { approve_note: note || '' });
  db.prepare(`
    UPDATE business_trips SET status=?, approve_note=?, approved_by=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(action, enc.approve_note, req.user.id, req.params.id);
  res.json({ success: true });
});

// 标记完成
app.post('/api/trips/:id/complete', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到' });
  if (t.user_id !== req.user.id && !isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  db.prepare("UPDATE business_trips SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/trips/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t || (t.user_id !== req.user.id && !isAdmin(req.user.role))) return res.status(403).json({ error: '无权限' });
  if (t.status === 'approved') return res.status(400).json({ error: '已审批的申请不可删除' });
  db.prepare('DELETE FROM trip_expenses WHERE trip_id=?').run(req.params.id);
  db.prepare('DELETE FROM expense_reports WHERE trip_id=?').run(req.params.id);
  db.prepare('DELETE FROM business_trips WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// =========== 费用明细 API ===========
app.get('/api/trips/:id/expenses', (req, res) => {
  res.json(decryptRows('trip_expenses', db.prepare('SELECT * FROM trip_expenses WHERE trip_id=? ORDER BY date ASC').all(req.params.id)));
});

app.post('/api/trips/:id/expenses', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到' });
  if (!['approved', 'completed'].includes(t.status)) return res.status(400).json({ error: '出差审批通过后才能录入费用' });
  const { type, date, amount, description } = req.body;
  const enc = encryptRow('trip_expenses', { description });
  const r = db.prepare('INSERT INTO trip_expenses (trip_id, type, date, amount, description) VALUES (?,?,?,?,?)')
    .run(req.params.id, type, date, amount, enc.description);
  // 更新报销单总额
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM trip_expenses WHERE trip_id=?').get(req.params.id).t;
  db.prepare('UPDATE expense_reports SET total_amount=?, updated_at=CURRENT_TIMESTAMP WHERE trip_id=?').run(total, req.params.id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/trip_expenses/:id', (req, res) => {
  const { type, date, amount, description } = req.body;
  const exp = db.prepare('SELECT trip_id FROM trip_expenses WHERE id=?').get(req.params.id);
  const enc = encryptRow('trip_expenses', { description });
  db.prepare('UPDATE trip_expenses SET type=?, date=?, amount=?, description=? WHERE id=?').run(type, date, amount, enc.description, req.params.id);
  if (exp) {
    const total = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM trip_expenses WHERE trip_id=?').get(exp.trip_id).t;
    db.prepare('UPDATE expense_reports SET total_amount=?, updated_at=CURRENT_TIMESTAMP WHERE trip_id=?').run(total, exp.trip_id);
  }
  res.json({ success: true });
});

app.delete('/api/trip_expenses/:id', (req, res) => {
  const exp = db.prepare('SELECT trip_id FROM trip_expenses WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM trip_expenses WHERE id=?').run(req.params.id);
  if (exp) {
    const total = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM trip_expenses WHERE trip_id=?').get(exp.trip_id).t;
    db.prepare('UPDATE expense_reports SET total_amount=?, updated_at=CURRENT_TIMESTAMP WHERE trip_id=?').run(total, exp.trip_id);
  }
  res.json({ success: true });
});

// =========== 报销单 API ===========
app.get('/api/trips/:id/report', (req, res) => {
  const report = db.prepare('SELECT * FROM expense_reports WHERE trip_id=?').get(req.params.id);
  if (!report) return res.status(404).json({ error: '报销单不存在' });
  res.json(report);
});

// 创建报销单
app.post('/api/trips/:id/report', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t || t.status !== 'completed') return res.status(400).json({ error: '出差须完成后才能提交报销' });
  const exists = db.prepare('SELECT id FROM expense_reports WHERE trip_id=?').get(req.params.id);
  if (exists) return res.status(400).json({ error: '报销单已存在' });
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM trip_expenses WHERE trip_id=?').get(req.params.id).t;
  const r = db.prepare('INSERT INTO expense_reports (trip_id, user_id, total_amount, status) VALUES (?,?,?,\'draft\')')
    .run(req.params.id, req.user.id, total);
  res.json({ id: r.lastInsertRowid });
});

// 提交报销审批
app.post('/api/reports/:id/submit', (req, res) => {
  db.prepare("UPDATE expense_reports SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// 审批报销
app.post('/api/reports/:id/approve', (req, res) => {
  const { role } = req.user;
  if (!isAdmin(role) && role !== 'leader') return res.status(403).json({ error: '无审批权限' });
  const { action, note } = req.body;
  const status = action === 'approved' ? 'paid' : 'rejected';
  db.prepare(`UPDATE expense_reports SET status=?, approve_note=?, approved_by=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(status, note || '', req.user.id, req.params.id);
  res.json({ success: true });
});

// =========== 出差统计 API ===========
app.get('/api/trips/stats/summary', (req, res) => {
  const { year, month, group_id } = req.query;
  const personPrivacy = buildPersonPrivacyFilter(req.user.id, 'p');

  let baseWhere = "WHERE t.status IN ('approved','completed')";
  const p = [];
  if (year && month) {
    baseWhere += ` AND strftime('%Y-%m', t.start_date) = ?`;
    p.push(`${year}-${String(month).padStart(2,'0')}`);
  } else if (year) {
    baseWhere += ` AND strftime('%Y', t.start_date) = ?`;
    p.push(year);
  }
  if (group_id) { baseWhere += ' AND u.group_id = ?'; p.push(group_id); }

  // 月度费用趋势（近12个月）
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', t.start_date) as month,
           COUNT(DISTINCT t.id) as trip_count,
           COALESCE(SUM(er.total_amount),0) as total_amount
    FROM business_trips t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN expense_reports er ON er.trip_id = t.id AND er.status = 'paid'
    WHERE t.status IN ('approved','completed')
      AND t.start_date >= date('now','-12 months')
    ${group_id ? 'AND u.group_id = ?' : ''}
    GROUP BY month ORDER BY month ASC
  `).all(...(group_id ? [group_id] : []));

  // 费用类型分布
  const byType = db.prepare(`
    SELECT e.type, COALESCE(SUM(e.amount),0) as total
    FROM trip_expenses e
    JOIN business_trips t ON e.trip_id = t.id
    LEFT JOIN users u ON t.user_id = u.id
    ${baseWhere.replace('WHERE','WHERE')}
    GROUP BY e.type
  `).all(...p);

  // 人员费用排行
  const byUser = db.prepare(`
    SELECT u.display_name, COUNT(DISTINCT t.id) as trip_count,
           COALESCE(SUM(er.total_amount),0) as total_amount
    FROM business_trips t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN expense_reports er ON er.trip_id = t.id AND er.status='paid'
    ${baseWhere}
    GROUP BY t.user_id ORDER BY total_amount DESC LIMIT 10
  `).all(...p);

  // 小组费用对比
  const byGroup = db.prepare(`
    SELECT g.name as group_name, COUNT(DISTINCT t.id) as trip_count,
           COALESCE(SUM(er.total_amount),0) as total_amount
    FROM business_trips t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN groups g ON u.group_id = g.id
    LEFT JOIN expense_reports er ON er.trip_id = t.id AND er.status='paid'
    WHERE t.status IN ('approved','completed')
    GROUP BY u.group_id ORDER BY total_amount DESC
  `).all();

  // 重点客户预警：relationship_level in (vip,key)，超过60天未有出差互动
  const alertsRaw = db.prepare(`
    SELECT p.id, p.name, p.company, p.current_company, p.relationship_level,
           MAX(t.end_date) as last_trip_date,
           CAST(julianday('now') - julianday(MAX(t.end_date)) AS INTEGER) as days_since
    FROM persons p
    LEFT JOIN business_trips t ON (
      t.related_persons LIKE '%,' || p.id || ',%'
      OR t.related_persons LIKE p.id || ',%'
      OR t.related_persons LIKE '%,' || p.id
      OR t.related_persons = CAST(p.id AS TEXT)
    ) AND t.status IN ('approved','completed')
    WHERE p.relationship_level IN ('vip','key')
    ${personPrivacy.sql}
    GROUP BY p.id
    HAVING last_trip_date IS NULL OR days_since > 60
    ORDER BY days_since DESC
    LIMIT 20
  `).all(...personPrivacy.params);
  const alerts = alertsRaw.map(r => ({
    ...r,
    name: decrypt(r.name),
    company: decrypt(r.company),
    current_company: decrypt(r.current_company),
  }));

  res.json({ monthly, byType, byUser, byGroup, alerts });
});

// =========== 目标管理 API ===========
// 获取目标列表
app.get('/api/goals', (req, res) => {
  const { department, status, goal_type, scope_type, period, parent_id, owner_id, owner_role, project_group_id, team_id } = req.query;
  const { id: userId, role } = req.user;

  let q = `
    SELECT
      g.*,
      u.display_name as owner_name,
      u.role as owner_role,
      u.department as owner_department,
      p.title as parent_title,
      pg.name as project_group_name,
      tm.name as team_name
    FROM goals g
    LEFT JOIN users u ON g.owner_id = u.id
    LEFT JOIN goals p ON g.parent_id = p.id
    LEFT JOIN project_groups pg ON g.project_group_id = pg.id
    LEFT JOIN teams tm ON g.team_id = tm.id
    WHERE 1=1
  `;
  const params = [];

  const visibleOwnerIds = getVisibleGoalOwnerIds(userId, role);
  if (visibleOwnerIds !== null) {
    if (visibleOwnerIds.length === 0) {
      return res.json([]);
    }
    q += ` AND g.owner_id IN (${visibleOwnerIds.map(() => '?').join(',')})`;
    params.push(...visibleOwnerIds);
  }

  if (department) {
    q += ' AND COALESCE(g.department, u.department) = ?';
    params.push(department);
  }
  if (status) {
    q += ' AND g.status = ?';
    params.push(status);
  }
  if (goal_type) {
    q += ' AND g.goal_type = ?';
    params.push(goal_type);
  }
  if (scope_type) {
    q += ' AND g.scope_type = ?';
    params.push(scope_type);
  }
  if (period) {
    q += ' AND g.period = ?';
    params.push(period);
  }
  if (project_group_id) {
    q += ' AND g.project_group_id = ?';
    params.push(project_group_id);
  }
  if (team_id) {
    q += ' AND g.team_id = ?';
    params.push(team_id);
  }
  if (owner_id) {
    q += ' AND g.owner_id = ?';
    params.push(owner_id);
  }
  if (owner_role) {
    q += ' AND u.role = ?';
    params.push(owner_role);
  }
  if (parent_id !== undefined) {
    if (parent_id === 'null') {
      q += ' AND g.parent_id IS NULL';
    } else {
      q += ' AND g.parent_id = ?';
      params.push(parent_id);
    }
  }

  q += `
    ORDER BY
      CASE g.goal_type
        WHEN 'quarter' THEN 1
        WHEN 'month' THEN 2
        WHEN 'week' THEN 3
        ELSE 4
      END,
      g.period DESC,
      g.created_at DESC
  `;
  const goals = decryptRows('goals', db.prepare(q).all(...params)).map(g => ({
    ...g,
    parent_title: decrypt(g.parent_title),
  }));

  // 为每个目标加载子目标数量
  goals.forEach(g => {
    const childCount = db.prepare('SELECT COUNT(*) as cnt FROM goals WHERE parent_id = ?').get(g.id);
    g.child_count = childCount.cnt;
    g.department = g.department || g.owner_department || null;
  });

  res.json(goals);
});

app.get('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const { id: userId, role } = req.user;
  const goal = db.prepare(`
    SELECT
      g.*,
      u.display_name as owner_name,
      u.role as owner_role,
      u.department as owner_department,
      p.title as parent_title,
      pg.name as project_group_name,
      tm.name as team_name
    FROM goals g
    LEFT JOIN users u ON g.owner_id = u.id
    LEFT JOIN goals p ON g.parent_id = p.id
    LEFT JOIN project_groups pg ON g.project_group_id = pg.id
    LEFT JOIN teams tm ON g.team_id = tm.id
    WHERE g.id = ?
  `).get(id);

  if (!goal) return res.status(404).json({ error: '目标不存在' });

  const visibleOwnerIds = getVisibleGoalOwnerIds(userId, role);
  if (visibleOwnerIds !== null && !visibleOwnerIds.includes(goal.owner_id)) {
    return res.status(403).json({ error: '无权限查看该目标' });
  }

  const childrenRaw = db.prepare(`
    SELECT
      g.*,
      u.display_name as owner_name,
      u.role as owner_role,
      pg.name as project_group_name,
      tm.name as team_name
    FROM goals g
    LEFT JOIN users u ON g.owner_id = u.id
    LEFT JOIN project_groups pg ON g.project_group_id = pg.id
    LEFT JOIN teams tm ON g.team_id = tm.id
    WHERE g.parent_id = ?
    ORDER BY g.period DESC, g.created_at DESC
  `).all(id);
  const children = decryptRows('goals', childrenRaw);

  const decGoal = decryptRow('goals', goal);
  decGoal.parent_title = decrypt(decGoal.parent_title);
  res.json({
    ...decGoal,
    department: decGoal.department || decGoal.owner_department || null,
    children,
  });
});

// 创建目标
app.post('/api/goals', (req, res) => {
  const { title, description, owner_id, department, team_id, project_group_id, scope_type, deadline, progress, status, result: goalResult, goal_type, period, parent_id } = req.body;
  if (!title || !owner_id || !goal_type || !period) {
    return res.status(400).json({ error: '标题、负责人、目标类型、周期必填' });
  }
  const scopeError = validateGoalScopeFields({ scope_type, project_group_id, department, team_id });
  if (scopeError) {
    return res.status(400).json({ error: scopeError });
  }

  if (!canManageGoalForOwner(req.user, owner_id)) {
    return res.status(403).json({ error: '无权为该负责人创建目标' });
  }

  const owner = db.prepare('SELECT department FROM users WHERE id = ?').get(owner_id);
  const normalizedDepartment = department || owner?.department || null;
  const normalizedStatus = status || 'pending';
  const normalizedScopeType = scope_type || 'personal';

  const enc = encryptRow('goals', { title, description, result: goalResult });
  const insertResult = db.prepare(`
    INSERT INTO goals (title, description, owner_id, department, team_id, project_group_id, scope_type, deadline, progress, status, result, goal_type, period, parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(enc.title, enc.description, owner_id, normalizedDepartment, team_id || null, project_group_id || null, normalizedScopeType, deadline, progress || 0, normalizedStatus, enc.result || null, goal_type, period, parent_id || null);

  res.json({ id: insertResult.lastInsertRowid });
});

// 更新目标
app.put('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, owner_id, department, team_id, project_group_id, scope_type, deadline, progress, status, result, goal_type, period, parent_id } = req.body;
  const existing = db.prepare('SELECT owner_id, department, team_id, project_group_id, scope_type FROM goals WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '目标不存在' });

  const targetOwnerId = owner_id || existing.owner_id;
  if (!canManageGoalForOwner(req.user, targetOwnerId)) {
    return res.status(403).json({ error: '无权编辑该目标' });
  }

  const scopeError = validateGoalScopeFields({
    scope_type: scope_type || existing.scope_type,
    project_group_id: project_group_id ?? existing.project_group_id,
    department: department ?? existing.department,
    team_id: team_id ?? existing.team_id,
  });
  if (scopeError) {
    return res.status(400).json({ error: scopeError });
  }

  const owner = db.prepare('SELECT department FROM users WHERE id = ?').get(targetOwnerId);
  const normalizedDepartment = department || owner?.department || null;
  const normalizedStatus = status;

  const enc = encryptRow('goals', { title, description, result });
  db.prepare(`
    UPDATE goals SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      owner_id = COALESCE(?, owner_id),
      department = COALESCE(?, department),
      team_id = COALESCE(?, team_id),
      project_group_id = COALESCE(?, project_group_id),
      scope_type = COALESCE(?, scope_type),
      deadline = COALESCE(?, deadline),
      progress = COALESCE(?, progress),
      status = COALESCE(?, status),
      result = COALESCE(?, result),
      goal_type = COALESCE(?, goal_type),
      period = COALESCE(?, period),
      parent_id = COALESCE(?, parent_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enc.title, enc.description, owner_id, normalizedDepartment, team_id, project_group_id, scope_type, deadline, progress, normalizedStatus, enc.result, goal_type, period, parent_id, id);

  res.json({ success: true });
});

// 删除目标（级联删除子目标）
app.delete('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const goal = db.prepare('SELECT owner_id FROM goals WHERE id = ?').get(id);
  if (!goal) return res.status(404).json({ error: '目标不存在' });
  if (!canManageGoalForOwner(req.user, goal.owner_id)) {
    return res.status(403).json({ error: '无权删除该目标' });
  }
  // 递归删除所有子目标
  function deleteGoalAndChildren(goalId) {
    const children = db.prepare('SELECT id FROM goals WHERE parent_id = ?').all(goalId);
    children.forEach(c => deleteGoalAndChildren(c.id));
    db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);
  }
  deleteGoalAndChildren(id);
  res.json({ success: true });
});

// =========== 周报管理 API ===========
// 获取周报列表
app.get('/api/weekly-reports', (req, res) => {
  const { week_start, department } = req.query;
  const { id: userId, role } = req.user;

  let q = `
    SELECT wr.*, u.display_name as user_name, u.department, u.role as user_role
    FROM weekly_reports wr
    LEFT JOIN users u ON wr.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // 角色过滤
  if (role === 'member') {
    const visibleIds = new Set([userId]);
    const me = db.prepare('SELECT leader_id FROM users WHERE id = ?').get(userId);
    if (me?.leader_id) visibleIds.add(me.leader_id);

    const myTeamIds = getUserTeamIds(userId);
    myTeamIds.forEach(teamId => {
      const team = db.prepare('SELECT leader_id FROM teams WHERE id = ?').get(teamId);
      if (team?.leader_id) visibleIds.add(team.leader_id);
    });

    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'weekly_reports').map(r => r.target_team_id);
    if (crossTeams.length > 0) {
      const crossMembers = getUsersByTeamIds(crossTeams);
      crossMembers.forEach(id => visibleIds.add(id));
    }

    const ids = [...visibleIds];
    q += ` AND wr.user_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  } else if (role === 'leader') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'weekly_reports').map(r => r.target_team_id);

    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];

    if (allTeamIds.length) {
      const members = getUsersByTeamIds(allTeamIds);
      q += ` AND wr.user_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    } else {
      q += ' AND wr.user_id = ?';
      params.push(userId);
    }
  } else if (role === 'sales_director') {
    // 总监看辖区内的周报
    const managedTeamIds = getManagedTeamIds(userId, role);
    if (managedTeamIds?.length) {
      const members = getUsersByTeamIds(managedTeamIds);
      q += ` AND wr.user_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    }
  }
  // admin 看全部，不加过滤

  if (week_start) { q += ' AND wr.week_start = ?'; params.push(week_start); }
  if (department) { q += ' AND u.department = ?'; params.push(department); }

  q += ' ORDER BY wr.week_start DESC, u.display_name ASC';
  res.json(decryptRows('weekly_reports', db.prepare(q).all(...params)));
});

// 创建或更新周报
app.post('/api/weekly-reports', (req, res) => {
  const { user_id, week_start, week_end, completed, next_week_plan, risks } = req.body;
  const { id: currentUserId, role } = req.user;

  if (!user_id || !week_start || !week_end) {
    return res.status(400).json({ error: '用户、周起止日期必填' });
  }

  // 权限检查：只能写自己的周报，除非是 admin
  if (!isAdmin(role) && user_id !== currentUserId) {
    return res.status(403).json({ error: '无权限' });
  }

  // 检查是否已存在
  const existing = db.prepare('SELECT id FROM weekly_reports WHERE user_id = ? AND week_start = ?').get(user_id, week_start);

  const enc = encryptRow('weekly_reports', { completed, next_week_plan, risks });
  if (existing) {
    // 更新
    db.prepare(`
      UPDATE weekly_reports SET
        week_end = ?,
        completed = ?,
        next_week_plan = ?,
        risks = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(week_end, enc.completed, enc.next_week_plan, enc.risks, existing.id);
    res.json({ id: existing.id, updated: true });
  } else {
    // 新建
    const result = db.prepare(`
      INSERT INTO weekly_reports (user_id, week_start, week_end, completed, next_week_plan, risks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id, week_start, week_end, enc.completed, enc.next_week_plan, enc.risks);
    res.json({ id: result.lastInsertRowid, created: true });
  }
});

// 删除周报
app.delete('/api/weekly-reports/:id', (req, res) => {
  const { id } = req.params;
  const { role } = req.user;

  if (!isAdmin(role)) {
    return res.status(403).json({ error: '仅管理员可删除' });
  }

  db.prepare('DELETE FROM weekly_reports WHERE id = ?').run(id);
  res.json({ success: true });
});

// 获取需要写周报的用户列表
app.get('/api/weekly-reports/writers', (req, res) => {
  const { role } = req.user;

  if (!isAdmin(role)) {
    return res.status(403).json({ error: '仅管理员可访问' });
  }

  const writers = db.prepare(`
    SELECT id, username, display_name, department, role, need_weekly_report
    FROM users
    WHERE role NOT IN ('admin', 'ceo', 'coo', 'cto', 'cmo')
    ORDER BY department, display_name
  `).all();

  res.json(writers);
});

// 更新用户周报权限（老板指定普通成员写周报）
app.put('/api/users/:id/weekly-report', (req, res) => {
  const { id } = req.params;
  const { need_weekly_report } = req.body;
  const { role } = req.user;

  if (!isAdmin(role)) {
    return res.status(403).json({ error: '仅管理员可操作' });
  }

  db.prepare('UPDATE users SET need_weekly_report = ? WHERE id = ?').run(need_weekly_report ? 1 : 0, id);
  res.json({ success: true });
});

// =========== 线索池 API ===========
// 获取线索列表
app.get('/api/leads', (req, res) => {
  const { status, assignee_id, priority, source_type } = req.query;
  const { id: userId, role } = req.user;

  let q = 'SELECT l.*, u.display_name as assignee_name, c.display_name as created_by_name FROM leads l LEFT JOIN users u ON l.assignee_id = u.id LEFT JOIN users c ON l.created_by = c.id WHERE 1=1';
  const params = [];

  // 角色过滤
  if (role === 'member') {
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'leads').map(r => r.target_team_id);

    if (crossTeams.length > 0) {
      const crossMembers = getUsersByTeamIds(crossTeams);
      q += ' AND (l.assignee_id = ? OR l.created_by = ? OR l.assignee_id IN (' + crossMembers.map(() => '?').join(',') + ') OR l.created_by IN (' + crossMembers.map(() => '?').join(',') + '))';
      params.push(userId, userId, ...crossMembers, ...crossMembers);
    } else {
      q += ' AND (l.assignee_id = ? OR l.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'leader') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'leads').map(r => r.target_team_id);

    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];

    if (allTeamIds.length) {
      const members = getUsersByTeamIds(allTeamIds);
      q += ` AND (l.assignee_id IN (${members.map(() => '?').join(',')}) OR l.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    } else {
      q += ' AND (l.assignee_id = ? OR l.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'sales_director') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    if (managedTeamIds?.length) {
      const members = getUsersByTeamIds(managedTeamIds);
      q += ` AND (l.assignee_id IN (${members.map(() => '?').join(',')}) OR l.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    }
  }

  if (status) { q += ' AND l.status = ?'; params.push(status); }
  if (assignee_id) { q += ' AND l.assignee_id = ?'; params.push(assignee_id); }
  if (priority) { q += ' AND l.priority = ?'; params.push(priority); }
  if (source_type) { q += ' AND l.source_type = ?'; params.push(source_type); }

  q += ' ORDER BY l.created_at DESC';
  res.json(decryptRows('leads', db.prepare(q).all(...params)));
});

// 获取可关联的线索列表（用于研发任务来源选择）
app.get('/api/leads/simple', (req, res) => {
  const leads = db.prepare('SELECT id, title, status, follow_result FROM leads WHERE status != ? ORDER BY created_at DESC LIMIT 100').all('closed');
  res.json(decryptRows('leads', leads));
});

// 获取单个线索详情（含关联的策略和研发任务）
app.get('/api/leads/:id', (req, res) => {
  const { id } = req.params;

  const lead = db.prepare(`
    SELECT l.*, u.display_name as assignee_name, c.display_name as creator_name
    FROM leads l
    LEFT JOIN users u ON l.assignee_id = u.id
    LEFT JOIN users c ON l.created_by = c.id
    WHERE l.id = ?
  `).get(id);

  if (!lead) return res.status(404).json({ error: '线索不存在' });

  // 获取关联的策略
  const strategies = db.prepare(`
    SELECT s.*, u.display_name as owner_name,
      (SELECT result_summary FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as latest_result_summary,
      (SELECT effect_judgement FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as effect_judgement
    FROM strategies s
    LEFT JOIN users u ON s.owner_id = u.id
    WHERE s.source_type = 'lead' AND s.source_id = ?
    ORDER BY s.created_at DESC
  `).all(id);

  // 获取关联的研发任务
  const devTasks = db.prepare(`
    SELECT dt.*, u.display_name as assignee_name
    FROM dev_tasks dt
    LEFT JOIN users u ON dt.assignee_id = u.id
    WHERE dt.source_type = 'lead' AND dt.source_id = ?
    ORDER BY dt.created_at DESC
  `).all(id);

  res.json({ ...decryptRow('leads', lead), strategies, devTasks });
});

// 创建线索
app.post('/api/leads', (req, res) => {
  const { title, source, source_type, contact_person, contact_company, contact_info, description, follow_result, assignee_id, priority } = req.body;
  const { id: userId } = req.user;

  if (!title) return res.status(400).json({ error: '线索标题必填' });

  const enc = encryptRow('leads', { title, source, contact_person, contact_company, contact_info, description, follow_result });
  const result = db.prepare(`
    INSERT INTO leads (title, source, source_type, contact_person, contact_company, contact_info, description, follow_result, assignee_id, priority, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(enc.title, enc.source, source_type, enc.contact_person, enc.contact_company, enc.contact_info, enc.description, enc.follow_result || null, assignee_id, priority, userId);

  // 如果指定了负责人，发送通知
  if (assignee_id && assignee_id !== userId) {
    createNotification(
      assignee_id,
      'lead_assigned',
      '新线索分配',
      `您被分配了新线索：${title}`,
      `/leads`
    );
  }

  res.json({ id: result.lastInsertRowid });
});

// 更新线索
app.put('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const { title, source, source_type, contact_person, contact_company, contact_info, description, follow_result, status, assignee_id, priority } = req.body;

  const enc = encryptRow('leads', { title, source, contact_person, contact_company, contact_info, description, follow_result });
  db.prepare(`
    UPDATE leads SET
      title = COALESCE(?, title),
      source = COALESCE(?, source),
      source_type = COALESCE(?, source_type),
      contact_person = COALESCE(?, contact_person),
      contact_company = COALESCE(?, contact_company),
      contact_info = COALESCE(?, contact_info),
      description = COALESCE(?, description),
      follow_result = COALESCE(?, follow_result),
      status = COALESCE(?, status),
      assignee_id = COALESCE(?, assignee_id),
      priority = COALESCE(?, priority),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enc.title, enc.source, source_type, enc.contact_person, enc.contact_company, enc.contact_info, enc.description, enc.follow_result, status, assignee_id, priority, id);

  res.json({ success: true });
});

// 删除线索
app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  res.json({ success: true });
});

// =========== 产品资产 API ===========
function applyProductAssetVisibility(q, params, userId, role) {
  if (role === 'member') {
    const teamIds = getUserTeamIds(userId);
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'product_assets').map(r => r.target_team_id);
    const allTeamIds = [...new Set([...teamIds, ...crossTeams])];

    if (allTeamIds.length > 0) {
      const visibleMembers = getUsersByTeamIds(allTeamIds);
      q += ' AND (pa.owner_id = ? OR pa.created_by = ?';
      params.push(userId, userId);
      if (visibleMembers.length > 0) {
        q += ' OR pa.owner_id IN (' + visibleMembers.map(() => '?').join(',') + ') OR pa.created_by IN (' + visibleMembers.map(() => '?').join(',') + ')';
        params.push(...visibleMembers, ...visibleMembers);
      }
      q += ')';
    } else {
      q += ' AND (pa.owner_id = ? OR pa.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'leader') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'product_assets').map(r => r.target_team_id);
    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];

    if (allTeamIds.length) {
      const members = getUsersByTeamIds(allTeamIds);
      if (members.length > 0) {
        q += ` AND (pa.owner_id IN (${members.map(() => '?').join(',')}) OR pa.created_by IN (${members.map(() => '?').join(',')}))`;
        params.push(...members, ...members);
      } else {
        q += ' AND (pa.owner_id = ? OR pa.created_by = ?)';
        params.push(userId, userId);
      }
    } else {
      q += ' AND (pa.owner_id = ? OR pa.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'sales_director') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    if (managedTeamIds?.length) {
      const members = getUsersByTeamIds(managedTeamIds);
      if (members.length > 0) {
        q += ` AND (pa.owner_id IN (${members.map(() => '?').join(',')}) OR pa.created_by IN (${members.map(() => '?').join(',')}))`;
        params.push(...members, ...members);
      }
    }
  }

  return q;
}

function getReductionSourceInfo(reductionId) {
  const row = db.prepare(`
    SELECT r.id, r.asset_id, r.reduction_date, r.reason_type, r.status,
      pa.app_name, pa.budget_type, pa.company_entity
    FROM product_asset_reductions r
    LEFT JOIN product_assets pa ON r.asset_id = pa.id
    WHERE r.id = ?
  `).get(reductionId);
  if (!row) return null;
  const decrypted = {
    ...row,
    app_name: decrypt(row.app_name),
    company_entity: decrypt(row.company_entity),
  };
  decrypted.title = `${decrypted.app_name || '产品资产'} · ${decrypted.reduction_date || '核减记录'}`;
  return decrypted;
}

const SUBJECT_ATTACHMENT_TYPES = new Set([
  'legal_person_id_card_front',
  'legal_person_id_card_back',
  'business_license',
  'icp_license',
  'network_culture_license',
  'radio_tv_program_license',
  'other',
]);

function getCompanySubject(subjectId) {
  if (!subjectId) return null;
  const subject = db.prepare('SELECT * FROM company_subjects WHERE id = ?').get(subjectId);
  return subject ? decryptRow('company_subjects', subject) : null;
}

function resolveCompanySubject(companySubjectId) {
  const subject = getCompanySubject(companySubjectId);
  if (!subject) return null;
  return {
    id: subject.id,
    group_name: subject.group_name,
    company_entity: subject.company_entity,
  };
}

function parseProductAssetPayload(body) {
  const subject = resolveCompanySubject(body.company_subject_id);
  if (!subject) return { error: '请选择有效的公司主体' };
  return {
    app_name: body.app_name,
    budget_type: body.budget_type,
    company_subject_id: subject.id,
    group_name: subject.group_name,
    company_entity: subject.company_entity,
    appid: body.appid,
    platform: body.platform,
    app_identifier: body.app_identifier,
    launch_status: body.launch_status || 'not_launched',
    owner_id: body.owner_id || null,
    remark: body.remark,
  };
}

function normalizeAssetImportText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .trim();
}

function normalizeSubjectMatchText(value) {
  return normalizeAssetImportText(value);
}

const PRODUCT_ASSET_LAUNCH_STATUS_RANK = {
  running: 0,
  launched: 1,
  launched_available: 1,
  launched_unavailable: 2,
  not_launched: 3,
  paused: 4,
  offline: 5,
};

function productAssetLaunchStatusRank(status) {
  return PRODUCT_ASSET_LAUNCH_STATUS_RANK[status] ?? 99;
}

function productAssetSubjectSortKey(asset) {
  const entity = normalizeSubjectMatchText(asset.company_entity).toLowerCase();
  const group = normalizeSubjectMatchText(asset.group_name).toLowerCase();
  const subjectId = asset.company_subject_id ? String(asset.company_subject_id).padStart(12, '0') : '';
  return [entity, group, subjectId].filter(Boolean).join('|') || '~';
}

function compareProductAssets(a, b) {
  const statusDiff = productAssetLaunchStatusRank(a.launch_status) - productAssetLaunchStatusRank(b.launch_status);
  if (statusDiff !== 0) return statusDiff;

  const subjectDiff = productAssetSubjectSortKey(a).localeCompare(productAssetSubjectSortKey(b), 'zh-Hans-CN');
  if (subjectDiff !== 0) return subjectDiff;

  const updatedDiff = String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  if (updatedDiff !== 0) return updatedDiff;

  return Number(b.id || 0) - Number(a.id || 0);
}

app.get('/api/company-subjects', (req, res) => {
  const { group_name, company_entity, legal_person, email } = req.query;
  const rows = db.prepare(`
    SELECT cs.*, c.display_name as created_by_name,
      (SELECT COUNT(*) FROM product_assets pa WHERE pa.company_subject_id = cs.id) as product_count,
      (SELECT COUNT(*) FROM company_subject_attachments a WHERE a.subject_id = cs.id) as attachment_count
    FROM company_subjects cs
    LEFT JOIN users c ON cs.created_by = c.id
    ORDER BY cs.updated_at DESC, cs.id DESC
  `).all();
  let data = decryptRows('company_subjects', rows);
  if (group_name) data = data.filter(r => (r.group_name || '').includes(String(group_name).trim()));
  if (company_entity) data = data.filter(r => (r.company_entity || '').includes(String(company_entity).trim()));
  if (legal_person) data = data.filter(r => (r.legal_person || '').includes(String(legal_person).trim()));
  if (email) data = data.filter(r => (r.email || '').includes(String(email).trim()));
  res.json(data);
});

app.get('/api/company-subjects/simple', (req, res) => {
  const rows = db.prepare(`
    SELECT id, group_name, company_entity, mini_program_count, status
    FROM company_subjects
    WHERE COALESCE(status, 'active') = 'active'
    ORDER BY updated_at DESC, id DESC
  `).all();
  res.json(decryptRows('company_subjects', rows));
});

app.get('/api/company-subjects/:id', (req, res) => {
  const row = db.prepare(`
    SELECT cs.*, c.display_name as created_by_name,
      (SELECT COUNT(*) FROM product_assets pa WHERE pa.company_subject_id = cs.id) as product_count
    FROM company_subjects cs
    LEFT JOIN users c ON cs.created_by = c.id
    WHERE cs.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: '主体不存在' });
  const attachments = db.prepare(`
    SELECT a.*, u.display_name as uploaded_by_name
    FROM company_subject_attachments a
    LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.subject_id = ?
    ORDER BY a.created_at DESC, a.id DESC
  `).all(req.params.id);
  res.json({ ...decryptRow('company_subjects', row), attachments: attachments.map(normalizeSubjectAttachmentRow) });
});

app.post('/api/company-subjects', (req, res) => {
  const { group_name, company_entity, mini_program_count, legal_person, legal_person_phone, email, remark, status } = req.body;
  if (!company_entity) return res.status(400).json({ error: '公司主体必填' });
  const enc = encryptRow('company_subjects', { group_name: group_name || '', company_entity, legal_person, legal_person_phone, email, remark });
  const result = db.prepare(`
    INSERT INTO company_subjects (
      group_name, company_entity, mini_program_count, legal_person, legal_person_phone,
      email, remark, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    enc.group_name,
    enc.company_entity,
    mini_program_count ?? 0,
    enc.legal_person || null,
    enc.legal_person_phone || null,
    enc.email || null,
    enc.remark || null,
    status || 'active',
    req.user.id
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/company-subjects/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM company_subjects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '主体不存在' });
  const { group_name, company_entity, mini_program_count, legal_person, legal_person_phone, email, remark, status } = req.body;
  if (!company_entity) return res.status(400).json({ error: '公司主体必填' });
  const enc = encryptRow('company_subjects', { group_name: group_name || '', company_entity, legal_person, legal_person_phone, email, remark });
  db.prepare(`
    UPDATE company_subjects SET
      group_name = ?, company_entity = ?, mini_program_count = ?, legal_person = ?,
      legal_person_phone = ?, email = ?, remark = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    enc.group_name,
    enc.company_entity,
    mini_program_count ?? 0,
    enc.legal_person || null,
    enc.legal_person_phone || null,
    enc.email || null,
    enc.remark || null,
    status || 'active',
    id
  );
  const encAsset = encryptRow('product_assets', { group_name: group_name || '', company_entity });
  db.prepare(`
    UPDATE product_assets SET group_name = ?, company_entity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE company_subject_id = ?
  `).run(encAsset.group_name, encAsset.company_entity, id);
  res.json({ success: true });
});

app.delete('/api/company-subjects/:id', (req, res) => {
  const linked = db.prepare('SELECT COUNT(*) as count FROM product_assets WHERE company_subject_id = ?').get(req.params.id).count;
  if (linked > 0) return res.status(400).json({ error: '该主体已关联产品资产，不能删除' });
  const attachments = db.prepare('SELECT file_path FROM company_subject_attachments WHERE subject_id = ?').all(req.params.id);
  attachments.forEach(att => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, att.file_path)); } catch {}
  });
  db.prepare('DELETE FROM company_subject_attachments WHERE subject_id = ?').run(req.params.id);
  db.prepare('DELETE FROM company_subjects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/company-subjects/:id/attachments', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || '附件上传失败' });
    const subject = db.prepare('SELECT id FROM company_subjects WHERE id = ?').get(req.params.id);
    if (!subject) return res.status(404).json({ error: '主体不存在' });
    const { attachment_type = 'other' } = req.body;
    if (!SUBJECT_ATTACHMENT_TYPES.has(attachment_type)) {
      return res.status(400).json({ error: '附件类型不合法' });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const result = db.prepare(`
      INSERT INTO company_subject_attachments (
        subject_id, attachment_type, file_name, file_path, file_size, mime_type, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      attachment_type,
      normalizeUploadedFilename(req.file.originalname),
      req.file.filename,
      req.file.size,
      req.file.mimetype,
      req.user.id
    );
    res.json({ id: result.lastInsertRowid });
  });
});

app.delete('/api/company-subject-attachments/:id', (req, res) => {
  const att = db.prepare('SELECT * FROM company_subject_attachments WHERE id = ?').get(req.params.id);
  if (!att) return res.status(404).json({ error: '附件不存在' });
  try { fs.unlinkSync(path.join(UPLOADS_DIR, att.file_path)); } catch {}
  db.prepare('DELETE FROM company_subject_attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/product-assets', (req, res) => {
  const { budget_type, platform, launch_status, owner_id, has_reduction, reduction_status, company_entity, company_subject_id, group_name, appid } = req.query;
  const { id: userId, role } = req.user;

  let q = `
    SELECT pa.*, u.display_name as owner_name, c.display_name as created_by_name,
      (SELECT COUNT(*) FROM product_asset_reductions r WHERE r.asset_id = pa.id) as reduction_count,
      (SELECT r.reduction_date FROM product_asset_reductions r WHERE r.asset_id = pa.id ORDER BY r.reduction_date DESC, r.id DESC LIMIT 1) as latest_reduction_date,
      (SELECT r.status FROM product_asset_reductions r WHERE r.asset_id = pa.id ORDER BY r.reduction_date DESC, r.id DESC LIMIT 1) as latest_reduction_status
    FROM product_assets pa
    LEFT JOIN users u ON pa.owner_id = u.id
    LEFT JOIN users c ON pa.created_by = c.id
    WHERE 1=1
  `;
  const params = [];
  q = applyProductAssetVisibility(q, params, userId, role);

  if (budget_type) { q += ' AND pa.budget_type = ?'; params.push(budget_type); }
  if (platform) { q += ' AND pa.platform = ?'; params.push(platform); }
  if (launch_status) { q += ' AND pa.launch_status = ?'; params.push(launch_status); }
  if (owner_id) { q += ' AND pa.owner_id = ?'; params.push(owner_id); }
  if (has_reduction === 'yes') q += ' AND EXISTS (SELECT 1 FROM product_asset_reductions r WHERE r.asset_id = pa.id)';
  if (has_reduction === 'no') q += ' AND NOT EXISTS (SELECT 1 FROM product_asset_reductions r WHERE r.asset_id = pa.id)';
  if (reduction_status) {
    q += ` AND (
      SELECT r.status FROM product_asset_reductions r
      WHERE r.asset_id = pa.id
      ORDER BY r.reduction_date DESC, r.id DESC LIMIT 1
    ) = ?`;
    params.push(reduction_status);
  }

  q += ' ORDER BY pa.updated_at DESC, pa.id DESC';
  let rows = decryptRows('product_assets', db.prepare(q).all(...params));
  if (company_subject_id) {
    const subject = getCompanySubject(company_subject_id);
    if (!subject) return res.json([]);
    const subjectCompany = normalizeSubjectMatchText(subject.company_entity);
    rows = rows.filter(r => (
      String(r.company_subject_id || '') === String(company_subject_id)
      || normalizeSubjectMatchText(r.company_entity) === subjectCompany
    ));
  }
  if (company_entity) {
    const keyword = String(company_entity).trim();
    rows = rows.filter(r => (r.company_entity || '').includes(keyword));
  }
  if (group_name) {
    const keyword = String(group_name).trim();
    rows = rows.filter(r => (r.group_name || '').includes(keyword));
  }
  if (appid) {
    const keyword = String(appid).trim();
    rows = rows.filter(r => (r.appid || '').includes(keyword));
  }
  rows.sort(compareProductAssets);
  res.json(rows);
});

app.get('/api/product-assets/:id', (req, res) => {
  const { id } = req.params;
  const asset = db.prepare(`
    SELECT pa.*, u.display_name as owner_name, c.display_name as created_by_name
    FROM product_assets pa
    LEFT JOIN users u ON pa.owner_id = u.id
    LEFT JOIN users c ON pa.created_by = c.id
    WHERE pa.id = ?
  `).get(id);
  if (!asset) return res.status(404).json({ error: '产品资产不存在' });

  const reductions = db.prepare(`
    SELECT r.*, u.display_name as owner_name, c.display_name as created_by_name,
      (SELECT COUNT(*) FROM strategies s WHERE s.source_type = 'asset_reduction' AND s.source_id = r.id) as strategy_count
    FROM product_asset_reductions r
    LEFT JOIN users u ON r.owner_id = u.id
    LEFT JOIN users c ON r.created_by = c.id
    WHERE r.asset_id = ?
    ORDER BY r.reduction_date DESC, r.id DESC
  `).all(id);

  const decodedReductions = decryptRows('product_asset_reductions', reductions).map(r => ({
    ...r,
    strategies: db.prepare(`
      SELECT s.id, s.title, s.dimension, s.status, s.owner_id, u.display_name as owner_name,
        (SELECT result_summary FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as latest_result_summary,
        (SELECT effect_judgement FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as effect_judgement
      FROM strategies s
      LEFT JOIN users u ON s.owner_id = u.id
      WHERE s.source_type = 'asset_reduction' AND s.source_id = ?
      ORDER BY s.created_at DESC
    `).all(r.id),
  }));

  res.json({ ...decryptRow('product_assets', asset), reductions: decodedReductions });
});

app.post('/api/product-assets', (req, res) => {
  const { id: userId } = req.user;
  const payload = parseProductAssetPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const { app_name, budget_type, company_entity, company_subject_id, group_name, appid, platform, app_identifier, launch_status, owner_id, remark } = payload;
  if (!app_name || !budget_type || !company_entity) {
    return res.status(400).json({ error: '应用名称、预算类型、公司主体必填' });
  }

  const enc = encryptRow('product_assets', { group_name, app_name, company_entity, appid, app_identifier, remark });
  const result = db.prepare(`
    INSERT INTO product_assets (
      group_name, company_subject_id, app_name, appid, budget_type, company_entity,
      platform, app_identifier, launch_status, owner_id, remark, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    enc.group_name,
    company_subject_id,
    enc.app_name,
    enc.appid || null,
    budget_type,
    enc.company_entity,
    platform || null,
    enc.app_identifier || null,
    launch_status || 'not_launched',
    owner_id || null,
    enc.remark || null,
    userId
  );

  res.json({ id: result.lastInsertRowid });
});

app.put('/api/product-assets/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM product_assets WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '产品资产不存在' });
  const payload = parseProductAssetPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const { app_name, budget_type, company_entity, company_subject_id, group_name, appid, platform, app_identifier, launch_status, owner_id, remark } = payload;

  const enc = encryptRow('product_assets', { group_name, app_name, company_entity, appid, app_identifier, remark });
  db.prepare(`
    UPDATE product_assets SET
      group_name = COALESCE(?, group_name),
      company_subject_id = COALESCE(?, company_subject_id),
      app_name = COALESCE(?, app_name),
      appid = ?,
      budget_type = COALESCE(?, budget_type),
      company_entity = COALESCE(?, company_entity),
      platform = ?,
      app_identifier = ?,
      launch_status = COALESCE(?, launch_status),
      owner_id = ?,
      remark = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    enc.group_name || null,
    company_subject_id || null,
    enc.app_name || null,
    enc.appid || null,
    budget_type || null,
    enc.company_entity || null,
    platform || null,
    enc.app_identifier || null,
    launch_status || null,
    owner_id || null,
    enc.remark || null,
    id
  );

  res.json({ success: true });
});

const PRODUCT_ASSET_IMPORT_FIELD_LABELS = {
  group_name: '集团名字',
  company_entity: '公司主体',
  company_subject_id: '公司主体',
  app_name: '应用名称',
  appid: 'APPID',
  budget_type: '预算类型',
  platform: '平台',
  app_identifier: '应用标识',
  launch_status: '上线状态',
  owner_id: '运营负责人',
  remark: '备注',
};

const PRODUCT_ASSET_IMPORT_HEADER_MAP = new Map([
  ['group_name', 'group_name'], ['集团名字', 'group_name'], ['集团名称', 'group_name'],
  ['company_entity', 'company_entity'], ['公司主体', 'company_entity'], ['主体', 'company_entity'],
  ['app_name', 'app_name'], ['应用名称', 'app_name'], ['产品名称', 'app_name'],
  ['appid', 'appid'], ['APPID', 'appid'], ['AppID', 'appid'],
  ['budget_type', 'budget_type'], ['预算类型', 'budget_type'],
  ['platform', 'platform'], ['平台', 'platform'],
  ['app_identifier', 'app_identifier'], ['应用标识', 'app_identifier'],
  ['launch_status', 'launch_status'], ['上线状态', 'launch_status'],
  ['owner_name', 'owner_name'], ['运营负责人', 'owner_name'], ['负责人', 'owner_name'],
  ['remark', 'remark'], ['备注', 'remark'],
].map(([key, field]) => [normalizeAssetImportText(key), field]));

const PRODUCT_ASSET_BUDGET_TYPES = new Set(['zhixiao', 'douxiao', 'weixiao', 'kuaiyingyong', 'h5', 'other']);
const PRODUCT_ASSET_PLATFORMS = new Set(['android', 'ios', 'h5', 'mini_program', 'quick_app', 'other', '', null, undefined]);
const PRODUCT_ASSET_LAUNCH_STATUSES = new Set(['not_launched', 'launched', 'launched_available', 'launched_unavailable', 'running', 'paused', 'offline']);
const PRODUCT_ASSET_BUDGET_LABELS = { '支小': 'zhixiao', '抖小': 'douxiao', '微小': 'weixiao', '快应用': 'kuaiyingyong', H5: 'h5', '其他': 'other' };
const PRODUCT_ASSET_PLATFORM_LABELS = { Android: 'android', iOS: 'ios', IOS: 'ios', H5: 'h5', '小程序': 'mini_program', '快应用': 'quick_app', '其他': 'other' };
const PRODUCT_ASSET_LAUNCH_STATUS_LABELS = {
  '未上线': 'not_launched',
  '已上线': 'launched_available',
  '已上线可用': 'launched_available',
  '已上线不可用': 'launched_unavailable',
  '投放中': 'running',
  '暂停投放': 'paused',
  '已下线': 'offline',
};

function getProductAssetImportRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.rows)) return body.rows;
  return null;
}

function normalizeProductAssetImportRow(row = {}) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const field = PRODUCT_ASSET_IMPORT_HEADER_MAP.get(normalizeAssetImportText(key));
    if (field) normalized[field] = typeof value === 'string' ? value.trim() : value;
  });
  return { ...row, ...normalized };
}

function normalizeProductAssetImportValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getProvidedProductAssetImportValue(row, key) {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return undefined;
  const value = normalizeProductAssetImportValue(row[key]);
  return value ? value : undefined;
}

function getProductAssetImportContext() {
  return {
    subjects: decryptRows('company_subjects', db.prepare('SELECT * FROM company_subjects').all()),
    assets: decryptRows('product_assets', db.prepare(`
      SELECT pa.*, u.display_name as owner_name
      FROM product_assets pa
      LEFT JOIN users u ON pa.owner_id = u.id
      ORDER BY pa.updated_at DESC, pa.id DESC
    `).all()),
    users: db.prepare('SELECT id, username, display_name FROM users').all(),
  };
}

function findProductAssetImportSubject(subjects, groupName, companyEntity, required = false) {
  const normalizedCompany = normalizeAssetImportText(companyEntity);
  const normalizedGroup = normalizeAssetImportText(groupName);
  if (!normalizedCompany) {
    return { subject: null, error: required ? '公司主体必填' : null };
  }

  const companyMatches = subjects.filter(s => normalizeAssetImportText(s.company_entity) === normalizedCompany);
  if (companyMatches.length === 1) return { subject: companyMatches[0], error: null };
  if (companyMatches.length > 1) {
    if (!normalizedGroup) return { subject: null, error: '公司主体重名，请填写集团名字辅助匹配' };
    const subject = companyMatches.find(s => normalizeAssetImportText(s.group_name) === normalizedGroup);
    return { subject: subject || null, error: subject ? null : '公司主体重名，集团名字未匹配' };
  }
  return { subject: null, error: '公司主体未匹配' };
}

function findProductAssetImportOwner(users, ownerName) {
  const keyword = normalizeProductAssetImportValue(ownerName);
  if (!keyword) return { ownerId: undefined, error: null };
  const user = users.find(u => u.username === keyword || u.display_name === keyword);
  return user ? { ownerId: user.id, error: null } : { ownerId: undefined, error: '运营负责人未匹配' };
}

function getProductAssetImportMatches(assets, appName) {
  const normalizedAppName = normalizeAssetImportText(appName);
  if (!normalizedAppName) return [];
  return assets.filter(asset => normalizeAssetImportText(asset.app_name) === normalizedAppName);
}

function normalizeProductAssetImportPayload(row, context, mode) {
  const errors = [];
  const next = {};
  const appName = getProvidedProductAssetImportValue(row, 'app_name');
  if (appName) next.app_name = appName;

  const budgetTypeRaw = getProvidedProductAssetImportValue(row, 'budget_type');
  if (budgetTypeRaw !== undefined) {
    const budgetType = PRODUCT_ASSET_BUDGET_LABELS[budgetTypeRaw] || budgetTypeRaw;
    if (!PRODUCT_ASSET_BUDGET_TYPES.has(budgetType)) errors.push('预算类型不合法');
    else next.budget_type = budgetType;
  } else if (mode === 'create') {
    errors.push('预算类型必填');
  }

  const platformRaw = getProvidedProductAssetImportValue(row, 'platform');
  if (platformRaw !== undefined) {
    const platform = PRODUCT_ASSET_PLATFORM_LABELS[platformRaw] || platformRaw;
    if (!PRODUCT_ASSET_PLATFORMS.has(platform)) errors.push('平台不合法');
    else next.platform = platform || null;
  }

  const launchStatusRaw = getProvidedProductAssetImportValue(row, 'launch_status');
  if (launchStatusRaw !== undefined) {
    const launchStatus = PRODUCT_ASSET_LAUNCH_STATUS_LABELS[launchStatusRaw] || launchStatusRaw;
    if (!PRODUCT_ASSET_LAUNCH_STATUSES.has(launchStatus)) errors.push('上线状态不合法');
    else next.launch_status = launchStatus;
  } else if (mode === 'create') {
    next.launch_status = 'not_launched';
  }

  ['appid', 'app_identifier', 'remark'].forEach(field => {
    const value = getProvidedProductAssetImportValue(row, field);
    if (value !== undefined) next[field] = value;
  });

  const subjectRequired = mode === 'create';
  const hasSubjectInput = getProvidedProductAssetImportValue(row, 'company_entity') !== undefined;
  if (subjectRequired || hasSubjectInput) {
    const { subject, error } = findProductAssetImportSubject(context.subjects, row.group_name, row.company_entity, subjectRequired);
    if (!subject) errors.push(error || '公司主体未匹配');
    else {
      next.company_subject_id = subject.id;
      next.group_name = subject.group_name;
      next.company_entity = subject.company_entity;
    }
  }

  const ownerValue = getProvidedProductAssetImportValue(row, 'owner_name');
  if (ownerValue !== undefined) {
    const { ownerId, error } = findProductAssetImportOwner(context.users, ownerValue);
    if (error) errors.push(error);
    else next.owner_id = ownerId;
  }

  if (!appName) errors.push('应用名称必填');
  return { values: next, errors };
}

function collectProductAssetImportPatch(values, existing) {
  const patch = {};
  const diffFields = [];
  Object.entries(values).forEach(([field, value]) => {
    const current = field === 'owner_id'
      ? String(existing?.owner_id || '')
      : normalizeProductAssetImportValue(existing?.[field]);
    const next = field === 'owner_id'
      ? String(value || '')
      : normalizeProductAssetImportValue(value);
    if (current !== next) {
      patch[field] = value;
      diffFields.push(field === 'company_subject_id' ? 'company_entity' : field);
    }
  });
  return { patch, diffFields: [...new Set(diffFields)] };
}

function summarizeProductAssetImportRow(row = {}) {
  return {
    app_name: row.app_name || '',
    company_entity: row.company_entity || '',
    budget_type: row.budget_type || '',
    launch_status: row.launch_status || '',
    owner_name: row.owner_name || '',
  };
}

function buildProductAssetImportPlan(rows, user) {
  const context = getProductAssetImportContext();
  const seenImportNames = new Set();
  const summary = {
    total: rows.length,
    new: 0,
    existing: 0,
    updateable: 0,
    no_change: 0,
    ambiguous: 0,
    file_duplicate: 0,
    invalid: 0,
  };

  const items = rows.map((rawRow, index) => {
    const line = index + 2;
    const row = normalizeProductAssetImportRow(rawRow);
    const appName = normalizeProductAssetImportValue(row.app_name);
    const item = { line, app_name: appName, row };

    if (!appName) {
      summary.invalid++;
      return { ...item, status: 'invalid', reason: '应用名称必填' };
    }

    const appKey = normalizeAssetImportText(appName);
    if (seenImportNames.has(appKey)) {
      summary.file_duplicate++;
      return { ...item, status: 'file_duplicate', reason: '导入文件内应用名称重复' };
    }
    seenImportNames.add(appKey);

    const matches = getProductAssetImportMatches(context.assets, appName);
    if (matches.length > 1) {
      summary.existing++;
      summary.ambiguous++;
      return { ...item, status: 'ambiguous', reason: '系统内存在多条同名产品资产', existing_count: matches.length };
    }

    if (matches.length === 0) {
      const normalized = normalizeProductAssetImportPayload(row, context, 'create');
      if (normalized.errors.length) {
        summary.invalid++;
        return { ...item, status: 'invalid', reason: normalized.errors.join('；') };
      }
      summary.new++;
      return { ...item, status: 'new', values: normalized.values };
    }

    const existing = matches[0];
    summary.existing++;
    const normalized = normalizeProductAssetImportPayload(row, context, 'update');
    if (normalized.errors.length) {
      summary.invalid++;
      return { ...item, status: 'invalid', reason: normalized.errors.join('；'), existing, existing_id: existing.id };
    }
    const { patch, diffFields } = collectProductAssetImportPatch(normalized.values, existing);
    if (diffFields.length === 0) {
      summary.no_change++;
      return { ...item, status: 'same', reason: '无差异', existing, existing_id: existing.id, diff_fields: [], diff_labels: [] };
    }
    summary.updateable++;
    return {
      ...item,
      status: 'updateable',
      existing,
      existing_id: existing.id,
      values: normalized.values,
      patch,
      diff_fields: diffFields,
      diff_labels: diffFields.map(field => PRODUCT_ASSET_IMPORT_FIELD_LABELS[field] || field),
    };
  });

  return { summary, items };
}

function serializeProductAssetImportItem(item) {
  return {
    line: item.line,
    app_name: item.app_name,
    status: item.status,
    reason: item.reason,
    existing_count: item.existing_count || (item.existing ? 1 : 0),
    existing_id: item.existing_id,
    existing: item.existing ? summarizeProductAssetImportRow(item.existing) : null,
    incoming: summarizeProductAssetImportRow({ ...item.row, ...(item.values || {}) }),
    diff_fields: item.diff_fields || [],
    diff_labels: item.diff_labels || [],
  };
}

function insertImportedProductAsset(values, userId) {
  const enc = encryptRow('product_assets', {
    group_name: values.group_name,
    app_name: values.app_name,
    company_entity: values.company_entity,
    appid: values.appid,
    app_identifier: values.app_identifier,
    remark: values.remark,
  });
  const result = db.prepare(`
    INSERT INTO product_assets (
      group_name, company_subject_id, app_name, appid, budget_type, company_entity,
      platform, app_identifier, launch_status, owner_id, remark, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    enc.group_name,
    values.company_subject_id,
    enc.app_name,
    enc.appid || null,
    values.budget_type,
    enc.company_entity,
    values.platform || null,
    enc.app_identifier || null,
    values.launch_status || 'not_launched',
    values.owner_id || null,
    enc.remark || null,
    userId
  );
  return result.lastInsertRowid;
}

function updateImportedProductAsset(assetId, patch) {
  const fields = Object.keys(patch || {});
  if (fields.length === 0) return false;
  const encPatch = encryptRow('product_assets', patch);
  db.prepare(`
    UPDATE product_assets
    SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...fields.map(field => encPatch[field] ?? null), assetId);
  return true;
}

app.post('/api/product-assets/import/preview', (req, res) => {
  const rows = getProductAssetImportRows(req.body);
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: '数据为空' });
  }
  const plan = buildProductAssetImportPlan(rows, req.user);
  res.json({
    summary: plan.summary,
    items: plan.items
      .filter(item => item.status !== 'new')
      .map(serializeProductAssetImportItem),
  });
});

app.post('/api/product-assets/import', (req, res) => {
  const rows = getProductAssetImportRows(req.body);
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: '数据为空' });
  }
  const duplicateMode = req.body?.duplicate_mode === 'update' ? 'update' : 'skip';
  const plan = buildProductAssetImportPlan(rows, req.user);
  const result = {
    total: rows.length,
    successCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedExistingCount: 0,
    skippedNoChangeCount: 0,
    skippedFileDuplicateCount: 0,
    skippedAmbiguousCount: 0,
    updatedNames: [],
    results: [],
  };

  const importMany = db.transaction(() => {
    plan.items.forEach(item => {
      if (item.status === 'new') {
        const id = insertImportedProductAsset(item.values, req.user.id);
        result.createdCount += 1;
        result.successCount += 1;
        result.results.push({ line: item.line, success: true, action: 'created', id, app_name: item.app_name });
      } else if (item.status === 'updateable') {
        if (duplicateMode === 'update') {
          updateImportedProductAsset(item.existing_id, item.patch);
          result.updatedCount += 1;
          result.successCount += 1;
          result.updatedNames.push(item.app_name);
          result.results.push({ line: item.line, success: true, action: 'updated', id: item.existing_id, app_name: item.app_name, diff_fields: item.diff_fields, diff_labels: item.diff_labels });
        } else {
          result.skippedExistingCount += 1;
          result.results.push({ line: item.line, success: true, action: 'skipped_existing', id: item.existing_id, app_name: item.app_name });
        }
      } else if (item.status === 'same') {
        result.skippedNoChangeCount += 1;
        result.results.push({ line: item.line, success: true, action: 'skipped_no_change', id: item.existing_id, app_name: item.app_name });
      } else if (item.status === 'file_duplicate') {
        result.skippedFileDuplicateCount += 1;
        result.results.push({ line: item.line, success: true, action: 'skipped_file_duplicate', app_name: item.app_name, error: item.reason });
      } else if (item.status === 'ambiguous') {
        result.skippedAmbiguousCount += 1;
        result.results.push({ line: item.line, success: false, action: 'skipped_ambiguous', app_name: item.app_name, error: item.reason });
      } else {
        result.results.push({ line: item.line, success: false, action: 'invalid', app_name: item.app_name, error: item.reason });
      }
    });
  });

  importMany();
  result.failCount = result.results.filter(r => !r.success).length;
  result.skippedCount = result.skippedExistingCount + result.skippedNoChangeCount +
    result.skippedFileDuplicateCount + result.skippedAmbiguousCount;
  res.json(result);
});

app.delete('/api/product-assets/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM product_asset_reductions WHERE asset_id = ?').run(id);
  db.prepare('DELETE FROM product_assets WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/product-assets/:assetId/reductions', (req, res) => {
  const { assetId } = req.params;
  const {
    reduction_date, upstream, before_budget, after_budget, reduction_amount,
    reduction_ratio, punishment_object, reason_type, reason_analysis, impact_scope, status, owner_id,
  } = req.body;
  const { id: userId } = req.user;
  const asset = db.prepare('SELECT id FROM product_assets WHERE id = ?').get(assetId);
  if (!asset) return res.status(404).json({ error: '产品资产不存在' });
  if (!reduction_date || !reason_type) return res.status(400).json({ error: '核减日期和原因分类必填' });

  const enc = encryptRow('product_asset_reductions', { upstream, reason_analysis, impact_scope });
  const result = db.prepare(`
    INSERT INTO product_asset_reductions (
      asset_id, reduction_date, upstream, before_budget, after_budget, reduction_amount,
      reduction_ratio, punishment_object, reason_type, reason_analysis, impact_scope, status, owner_id, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    assetId,
    reduction_date,
    enc.upstream || null,
    before_budget ?? null,
    after_budget ?? null,
    reduction_amount ?? null,
    reduction_ratio ?? null,
    punishment_object || null,
    reason_type,
    enc.reason_analysis || null,
    enc.impact_scope || null,
    status || 'pending_analysis',
    owner_id || null,
    userId
  );
  db.prepare('UPDATE product_assets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(assetId);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/product-asset-reductions/:id', (req, res) => {
  const { id } = req.params;
  const {
    reduction_date, upstream, before_budget, after_budget, reduction_amount,
    reduction_ratio, punishment_object, reason_type, reason_analysis, impact_scope, status, owner_id,
  } = req.body;
  const existing = db.prepare('SELECT asset_id FROM product_asset_reductions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '核减记录不存在' });

  const enc = encryptRow('product_asset_reductions', { upstream, reason_analysis, impact_scope });
  db.prepare(`
    UPDATE product_asset_reductions SET
      reduction_date = COALESCE(?, reduction_date),
      upstream = ?,
      before_budget = ?,
      after_budget = ?,
      reduction_amount = ?,
      reduction_ratio = ?,
      punishment_object = ?,
      reason_type = COALESCE(?, reason_type),
      reason_analysis = ?,
      impact_scope = ?,
      status = COALESCE(?, status),
      owner_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    reduction_date || null,
    enc.upstream || null,
    before_budget ?? null,
    after_budget ?? null,
    reduction_amount ?? null,
    reduction_ratio ?? null,
    punishment_object || null,
    reason_type || null,
    enc.reason_analysis || null,
    enc.impact_scope || null,
    status || null,
    owner_id || null,
    id
  );
  db.prepare('UPDATE product_assets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.asset_id);
  res.json({ success: true });
});

app.delete('/api/product-asset-reductions/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT asset_id FROM product_asset_reductions WHERE id = ?').get(id);
  db.prepare('DELETE FROM product_asset_reductions WHERE id = ?').run(id);
  if (existing) db.prepare('UPDATE product_assets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.asset_id);
  res.json({ success: true });
});

app.get('/api/product-asset-reductions/simple', (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.reduction_date, r.reason_type, r.status, pa.app_name, pa.budget_type
    FROM product_asset_reductions r
    LEFT JOIN product_assets pa ON r.asset_id = pa.id
    ORDER BY r.reduction_date DESC, r.id DESC
    LIMIT 100
  `).all().map(r => ({
    ...r,
    app_name: decrypt(r.app_name),
    title: `${decrypt(r.app_name) || '产品资产'} · ${r.reduction_date || '核减记录'}`,
  }));
  res.json(rows);
});

// =========== 策略管理 API ===========
function normalizeSharedUserIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const ids = [...new Set(raw.map(id => Number(id)).filter(Boolean))];
  return ids.length ? ids.join(',') : null;
}

function getStrategySharedUserIds(strategy) {
  return String(strategy?.shared_with || '').split(',').map(id => Number(id)).filter(Boolean);
}

function canAccessStrategy(user, strategy) {
  if (isAdmin(user.role)) return true;
  if (getStrategySharedUserIds(strategy).includes(Number(user.id))) return true;

  const ownerId = Number(strategy.owner_id || 0);
  const currentUser = db.prepare('SELECT department FROM users WHERE id = ?').get(user.id);

  if (user.role === 'member' && currentUser?.department === 'operation') {
    const teamIds = getUserTeamIds(user.id);
    if (teamIds.length > 0) {
      return getUsersByTeamIds(teamIds).map(Number).includes(ownerId);
    }
    return ownerId === Number(user.id) || !ownerId;
  }

  if (user.role === 'member') {
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(user.id, 'strategies').map(r => r.target_team_id);
    if (crossTeams.length > 0) {
      const crossMembers = getUsersByTeamIds(crossTeams).map(Number);
      return ownerId === Number(user.id) || !ownerId || crossMembers.includes(ownerId);
    }
    return ownerId === Number(user.id) || !ownerId;
  }

  if (user.role === 'leader') {
    const managedTeamIds = getManagedTeamIds(user.id, user.role);
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(user.id, 'strategies').map(r => r.target_team_id);
    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];
    if (allTeamIds.length > 0) {
      return getUsersByTeamIds(allTeamIds).map(Number).includes(ownerId);
    }
    return ownerId === Number(user.id);
  }

  if (user.role === 'sales_director') {
    const managedTeamIds = getManagedTeamIds(user.id, user.role);
    if (managedTeamIds?.length) {
      return getUsersByTeamIds(managedTeamIds).map(Number).includes(ownerId);
    }
  }

  return true;
}

// 获取策略列表
app.get('/api/strategies', (req, res) => {
  const { id, dimension, role_type, budget_group_type, status, media, access_method } = req.query;
  const { id: userId, role } = req.user;
  const currentUser = db.prepare('SELECT department FROM users WHERE id = ?').get(userId);
  const sharedFilterSql = "(',' || IFNULL(s.shared_with,'') || ',') LIKE ?";
  const sharedFilterParam = `%,${userId},%`;

  let q = `
    SELECT s.*, u.display_name as owner_name,
      CASE
        WHEN s.source_type = 'lead' THEN s.source_id
        ELSE NULL
      END as source_lead_id,
      CASE
        WHEN s.source_type = 'asset_reduction' THEN s.source_id
        ELSE NULL
      END as source_reduction_id,
      CASE
        WHEN s.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = s.source_id)
        ELSE NULL
      END as source_title,
      (SELECT COUNT(*) FROM dev_tasks dt WHERE dt.source_type = 'strategy' AND dt.source_id = s.id) as dev_task_count,
      COALESCE((
        SELECT GROUP_CONCAT(CAST(dt.id AS TEXT) || ':' || dt.title, '||')
        FROM dev_tasks dt
        WHERE dt.source_type = 'strategy' AND dt.source_id = s.id
      ), '') as dev_task_details,
      (SELECT result_summary FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as latest_result_summary,
      (SELECT effect_judgement FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as effect_judgement,
      (SELECT MAX(execute_date) FROM strategy_execution_logs sel WHERE sel.strategy_id = s.id) as last_execution_date,
      (SELECT updated_at FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as last_review_time
    FROM strategies s
    LEFT JOIN users u ON s.owner_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // 角色过滤
  if (role === 'member' && currentUser?.department === 'operation') {
    const teamIds = getUserTeamIds(userId);
    if (teamIds.length > 0) {
      const members = getUsersByTeamIds(teamIds);
      if (members.length > 0) {
        q += ` AND (s.owner_id IN (${members.map(() => '?').join(',')}) OR ${sharedFilterSql})`;
        params.push(...members, sharedFilterParam);
      } else {
        q += ` AND ${sharedFilterSql}`;
        params.push(sharedFilterParam);
      }
    } else {
      q += ` AND (s.owner_id = ? OR s.owner_id IS NULL OR ${sharedFilterSql})`;
      params.push(userId, sharedFilterParam);
    }
  } else if (role === 'member') {
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'strategies').map(r => r.target_team_id);

    if (crossTeams.length > 0) {
      const crossMembers = getUsersByTeamIds(crossTeams);
      if (crossMembers.length > 0) {
        q += ' AND (s.owner_id = ? OR s.owner_id IS NULL OR s.owner_id IN (' + crossMembers.map(() => '?').join(',') + `) OR ${sharedFilterSql})`;
        params.push(userId, ...crossMembers, sharedFilterParam);
      } else {
        q += ` AND (s.owner_id = ? OR s.owner_id IS NULL OR ${sharedFilterSql})`;
        params.push(userId, sharedFilterParam);
      }
    } else {
      q += ` AND (s.owner_id = ? OR s.owner_id IS NULL OR ${sharedFilterSql})`;
      params.push(userId, sharedFilterParam);
    }
  } else if (role === 'leader') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'strategies').map(r => r.target_team_id);

    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];

    if (allTeamIds.length) {
      const members = getUsersByTeamIds(allTeamIds);
      if (members.length > 0) {
        q += ` AND (s.owner_id IN (${members.map(() => '?').join(',')}) OR ${sharedFilterSql})`;
        params.push(...members, sharedFilterParam);
      } else {
        q += ` AND ${sharedFilterSql}`;
        params.push(sharedFilterParam);
      }
    } else {
      q += ` AND (s.owner_id = ? OR ${sharedFilterSql})`;
      params.push(userId, sharedFilterParam);
    }
  } else if (role === 'sales_director') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    if (managedTeamIds?.length) {
      const members = getUsersByTeamIds(managedTeamIds);
      if (members.length > 0) {
        q += ` AND (s.owner_id IN (${members.map(() => '?').join(',')}) OR ${sharedFilterSql})`;
        params.push(...members, sharedFilterParam);
      } else {
        q += ` AND ${sharedFilterSql}`;
        params.push(sharedFilterParam);
      }
    }
  }

  if (id) { q += ' AND s.id = ?'; params.push(id); }
  if (dimension) { q += ' AND s.dimension = ?'; params.push(dimension); }
  if (role_type) { q += ' AND s.role_type = ?'; params.push(role_type); }
  if (budget_group_type) { q += ' AND s.budget_group_type = ?'; params.push(budget_group_type); }
  if (status) { q += ' AND s.status = ?'; params.push(status); }
  if (media) { q += ' AND s.media LIKE ?'; params.push(`%${media}%`); }
  if (access_method) { q += ' AND s.access_method = ?'; params.push(access_method); }

  q += ' ORDER BY s.created_at DESC';
  // source_title 来自 leads.title（加密）或核减记录摘要，单独处理
  const rows = db.prepare(q).all(...params).map(r => ({
    ...r,
    source_title: r.source_type === 'lead'
      ? decrypt(r.source_title)
      : r.source_type === 'asset_reduction'
        ? getReductionSourceInfo(r.source_id)?.title
        : null,
  }));
  res.json(rows);
});

// 获取可关联的策略列表（用于研发任务来源选择）
app.get('/api/strategies/simple', (req, res) => {
  const strategies = db.prepare('SELECT id, title, dimension FROM strategies WHERE status = ? ORDER BY created_at DESC LIMIT 100').all('active');
  res.json(strategies);
});

// 获取单个策略详情（含关联的研发任务）
app.get('/api/strategies/:id', (req, res) => {
  const { id } = req.params;

  const strategy = db.prepare(`
    SELECT s.*, u.display_name as owner_name,
      CASE
        WHEN s.source_type = 'lead' THEN s.source_id
        ELSE NULL
      END as source_lead_id,
      CASE
        WHEN s.source_type = 'asset_reduction' THEN s.source_id
        ELSE NULL
      END as source_reduction_id,
      CASE
        WHEN s.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = s.source_id)
        ELSE NULL
      END as source_title
    FROM strategies s
    LEFT JOIN users u ON s.owner_id = u.id
    WHERE s.id = ?
  `).get(id);

  if (!strategy) return res.status(404).json({ error: '策略不存在' });
  if (!canAccessStrategy(req.user, strategy)) {
    return res.status(403).json({ error: '无权访问该策略' });
  }
  strategy.source_title = strategy.source_type === 'lead'
    ? decrypt(strategy.source_title)
    : strategy.source_type === 'asset_reduction'
      ? getReductionSourceInfo(strategy.source_id)?.title
      : null;

  const sourceInfo = (() => {
    if (strategy.source_type === 'lead' && strategy.source_id) {
        const l = db.prepare(`
          SELECT id, title, status, assignee_id, priority, created_by, created_at, updated_at
          FROM leads
          WHERE id = ?
        `).get(strategy.source_id);
        return l ? decryptRow('leads', l) : null;
    }
    if (strategy.source_type === 'asset_reduction' && strategy.source_id) {
      return getReductionSourceInfo(strategy.source_id);
    }
    return null;
  })();

  // 获取关联的研发任务
  const devTasks = db.prepare(`
    SELECT dt.*, u.display_name as assignee_name, c.display_name as creator_name
    FROM dev_tasks dt
    LEFT JOIN users u ON dt.assignee_id = u.id
    LEFT JOIN users c ON dt.created_by = c.id
    WHERE dt.source_type = 'strategy' AND dt.source_id = ?
    ORDER BY dt.created_at DESC
  `).all(id);

  const executionLogs = db.prepare(`
    SELECT l.*, u.display_name as executor_name,
      (SELECT COUNT(*) FROM attachments a WHERE a.source_type = 'strategy_execution_log' AND a.source_id = l.id) as attachment_count
    FROM strategy_execution_logs l
    LEFT JOIN users u ON l.executor_id = u.id
    WHERE l.strategy_id = ?
    ORDER BY l.execute_date DESC, l.id DESC
  `).all(id);

  const review = db.prepare(`
    SELECT sr.*, u.display_name as updated_by_name
    FROM strategy_reviews sr
    LEFT JOIN users u ON sr.updated_by = u.id
    WHERE sr.strategy_id = ?
  `).get(id) || null;

  res.json({ ...strategy, source_info: sourceInfo, executionLogs, review, devTasks });
});

app.get('/api/strategies/:id/execution-logs', (req, res) => {
  const { id } = req.params;
  const rows = db.prepare(`
    SELECT l.*, u.display_name as executor_name,
      (SELECT COUNT(*) FROM attachments a WHERE a.source_type = 'strategy_execution_log' AND a.source_id = l.id) as attachment_count
    FROM strategy_execution_logs l
    LEFT JOIN users u ON l.executor_id = u.id
    WHERE l.strategy_id = ?
    ORDER BY l.execute_date DESC, l.id DESC
  `).all(id);
  res.json(rows);
});

app.post('/api/strategies/:id/execution-logs', (req, res) => {
  const { id } = req.params;
  const {
    execute_date,
    executor_id,
    action_type,
    action_desc,
    observation,
    attachments,
    continue_flag,
  } = req.body;

  if (!execute_date || !executor_id || !action_type) {
    return res.status(400).json({ error: '执行日期、执行人、动作类型必填' });
  }

  const strategy = db.prepare('SELECT id FROM strategies WHERE id = ?').get(id);
  if (!strategy) return res.status(404).json({ error: '策略不存在' });

  const result = db.prepare(`
    INSERT INTO strategy_execution_logs (
      strategy_id, execute_date, executor_id, action_type, action_desc, observation, attachments, continue_flag
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    execute_date,
    executor_id,
    action_type,
    action_desc || null,
    observation || null,
    attachments || null,
    continue_flag === undefined ? 1 : (continue_flag ? 1 : 0)
  );

  res.json({ id: result.lastInsertRowid });
});

app.put('/api/strategy-execution-logs/:id', (req, res) => {
  const { id } = req.params;
  const {
    execute_date,
    executor_id,
    action_type,
    action_desc,
    observation,
    attachments,
    continue_flag,
  } = req.body;

  const existing = db.prepare('SELECT * FROM strategy_execution_logs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '执行记录不存在' });

  db.prepare(`
    UPDATE strategy_execution_logs SET
      execute_date = COALESCE(?, execute_date),
      executor_id = COALESCE(?, executor_id),
      action_type = COALESCE(?, action_type),
      action_desc = COALESCE(?, action_desc),
      observation = COALESCE(?, observation),
      attachments = COALESCE(?, attachments),
      continue_flag = COALESCE(?, continue_flag),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    execute_date,
    executor_id,
    action_type,
    action_desc,
    observation,
    attachments,
    continue_flag === undefined ? null : (continue_flag ? 1 : 0),
    id
  );

  res.json({ success: true });
});

app.delete('/api/strategy-execution-logs/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM strategy_execution_logs WHERE id = ?').run(id);
  res.json({ success: true });
});

app.get('/api/strategies/:id/review', (req, res) => {
  const { id } = req.params;
  const review = db.prepare(`
    SELECT sr.*, u.display_name as updated_by_name
    FROM strategy_reviews sr
    LEFT JOIN users u ON sr.updated_by = u.id
    WHERE sr.strategy_id = ?
  `).get(id);
  res.json(review || null);
});

app.post('/api/strategies/:id/review', (req, res) => {
  const { id } = req.params;
  const {
    baseline_value,
    target_value,
    actual_value,
    result_summary,
    effect_judgement,
    review_note,
    next_action,
  } = req.body;
  const { id: userId } = req.user;

  const strategy = db.prepare('SELECT id FROM strategies WHERE id = ?').get(id);
  if (!strategy) return res.status(404).json({ error: '策略不存在' });

  const existing = db.prepare('SELECT id FROM strategy_reviews WHERE strategy_id = ?').get(id);
  if (existing) {
    db.prepare(`
      UPDATE strategy_reviews SET
        baseline_value = ?,
        target_value = ?,
        actual_value = ?,
        result_summary = ?,
        effect_judgement = ?,
        review_note = ?,
        next_action = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE strategy_id = ?
    `).run(
      baseline_value || null,
      target_value || null,
      actual_value || null,
      result_summary || null,
      effect_judgement || null,
      review_note || null,
      next_action || null,
      userId,
      id
    );
    return res.json({ id: existing.id, updated: true });
  }

  const result = db.prepare(`
    INSERT INTO strategy_reviews (
      strategy_id, baseline_value, target_value, actual_value, result_summary,
      effect_judgement, review_note, next_action, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    baseline_value || null,
    target_value || null,
    actual_value || null,
    result_summary || null,
    effect_judgement || null,
    review_note || null,
    next_action || null,
    userId
  );

  res.json({ id: result.lastInsertRowid, created: true });
});

// 创建策略
app.post('/api/strategies', (req, res) => {
  const { title, dimension, role_type, budget_group_type, description, owner_id, source_type, source_id, media, access_method, shared_with } = req.body;
  if (!title || !dimension) return res.status(400).json({ error: '标题和维度必填' });
  if (!owner_id) return res.status(400).json({ error: '负责人必填' });
  const sharedCsv = normalizeSharedUserIds(shared_with);

  const result = db.prepare(`
    INSERT INTO strategies (title, dimension, role_type, budget_group_type, description, owner_id, shared_with, source_type, source_id, media, access_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')
  `).run(title, dimension, role_type ?? null, budget_group_type ?? null, description ?? null, owner_id ?? null, sharedCsv, source_type ?? null, source_id ?? null, media ?? null, access_method ?? null);

  res.json({ id: result.lastInsertRowid });
});

// 更新策略
app.put('/api/strategies/:id', (req, res) => {
  const { id } = req.params;
  const { title, dimension, role_type, budget_group_type, description, owner_id, status, source_type, source_id, media, access_method, shared_with } = req.body;
  const hasSharedWith = Object.prototype.hasOwnProperty.call(req.body, 'shared_with');
  const sharedCsv = hasSharedWith ? normalizeSharedUserIds(shared_with) : null;

  db.prepare(`
    UPDATE strategies SET
      title = COALESCE(?, title),
      dimension = COALESCE(?, dimension),
      role_type = COALESCE(?, role_type),
      budget_group_type = COALESCE(?, budget_group_type),
      description = COALESCE(?, description),
      owner_id = COALESCE(?, owner_id),
      shared_with = CASE WHEN ? THEN ? ELSE shared_with END,
      status = COALESCE(?, status),
      source_type = ?,
      source_id = ?,
      media = ?,
      access_method = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, dimension, role_type, budget_group_type, description, owner_id, hasSharedWith ? 1 : 0, sharedCsv, status, source_type, source_id, media, access_method, id);

  res.json({ success: true });
});

// 删除策略
app.delete('/api/strategies/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM strategies WHERE id = ?').run(id);
  res.json({ success: true });
});

// =========== 研发任务 API ===========
// 获取研发任务列表
app.get('/api/dev-tasks', (req, res) => {
  const { id, status, assignee_id, priority, source_type } = req.query;
  const { id: userId, role } = req.user;
  const currentUser = db.prepare('SELECT department FROM users WHERE id = ?').get(userId);

  let q = `
    SELECT dt.*,
      u.display_name as assignee_name,
      c.display_name as creator_name,
      CASE
        WHEN dt.source_type = 'lead' THEN dt.source_id
        WHEN dt.source_type = 'strategy' THEN (
          SELECT s.source_id FROM strategies s WHERE s.id = dt.source_id AND s.source_type = 'lead'
        )
        ELSE NULL
      END as related_lead_id,
      CASE
        WHEN dt.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = dt.source_id)
        WHEN dt.source_type = 'strategy' THEN (
          SELECT l.title
          FROM strategies s
          LEFT JOIN leads l ON s.source_id = l.id
          WHERE s.id = dt.source_id AND s.source_type = 'lead'
        )
        ELSE NULL
      END as related_lead_title,
      CASE
        WHEN dt.source_type = 'strategy' THEN dt.source_id
        ELSE NULL
      END as related_strategy_id,
      CASE
        WHEN dt.source_type = 'strategy' THEN (SELECT title FROM strategies WHERE id = dt.source_id)
        ELSE NULL
      END as related_strategy_title,
      CASE
        WHEN dt.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = dt.source_id)
        WHEN dt.source_type = 'strategy' THEN (SELECT title FROM strategies WHERE id = dt.source_id)
        ELSE NULL
      END as source_title
    FROM dev_tasks dt
    LEFT JOIN users u ON dt.assignee_id = u.id
    LEFT JOIN users c ON dt.created_by = c.id
    WHERE 1=1
  `;
  const params = [];

  // 角色过滤
  if (role === 'member' && currentUser?.department === 'operation') {
    const teamIds = getUserTeamIds(userId);
    if (teamIds.length > 0) {
      const members = getUsersByTeamIds(teamIds);
      q += ` AND (dt.assignee_id IN (${members.map(() => '?').join(',')}) OR dt.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    } else {
      q += ' AND (dt.assignee_id = ? OR dt.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'member') {
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'dev_tasks').map(r => r.target_team_id);

    if (crossTeams.length > 0) {
      const crossMembers = getUsersByTeamIds(crossTeams);
      q += ' AND (dt.assignee_id = ? OR dt.created_by = ? OR dt.assignee_id IN (' + crossMembers.map(() => '?').join(',') + ') OR dt.created_by IN (' + crossMembers.map(() => '?').join(',') + '))';
      params.push(userId, userId, ...crossMembers, ...crossMembers);
    } else {
      q += ' AND (dt.assignee_id = ? OR dt.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'leader') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    // 获取跨团队访问权限
    const crossTeams = db.prepare('SELECT target_team_id FROM cross_team_access WHERE user_id = ? AND module = ?')
      .all(userId, 'dev_tasks').map(r => r.target_team_id);

    const allTeamIds = [...new Set([...(managedTeamIds || []), ...crossTeams])];

    if (allTeamIds.length) {
      const members = getUsersByTeamIds(allTeamIds);
      q += ` AND (dt.assignee_id IN (${members.map(() => '?').join(',')}) OR dt.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    } else {
      q += ' AND (dt.assignee_id = ? OR dt.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'sales_director') {
    const managedTeamIds = getManagedTeamIds(userId, role);
    if (managedTeamIds?.length) {
      const members = getUsersByTeamIds(managedTeamIds);
      q += ` AND (dt.assignee_id IN (${members.map(() => '?').join(',')}) OR dt.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    }
  }

  if (id) { q += ' AND dt.id = ?'; params.push(id); }
  if (status) { q += ' AND dt.status = ?'; params.push(status); }
  if (assignee_id) { q += ' AND dt.assignee_id = ?'; params.push(assignee_id); }
  if (priority) { q += ' AND dt.priority = ?'; params.push(priority); }
  if (source_type) { q += ' AND dt.source_type = ?'; params.push(source_type); }

  q += ' ORDER BY dt.created_at DESC';
  // related_lead_title / source_title 来自 leads.title（加密），单独解密
  res.json(db.prepare(q).all(...params).map(r => ({
    ...r,
    related_lead_title: decrypt(r.related_lead_title),
    source_title: decrypt(r.source_title),
  })));
});

app.get('/api/dev-tasks/:id', (req, res) => {
  const { id } = req.params;

  const task = db.prepare(`
    SELECT dt.*,
      u.display_name as assignee_name,
      c.display_name as creator_name,
      CASE
        WHEN dt.source_type = 'lead' THEN dt.source_id
        WHEN dt.source_type = 'strategy' THEN (
          SELECT s.source_id FROM strategies s WHERE s.id = dt.source_id AND s.source_type = 'lead'
        )
        ELSE NULL
      END as related_lead_id,
      CASE
        WHEN dt.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = dt.source_id)
        WHEN dt.source_type = 'strategy' THEN (
          SELECT l.title
          FROM strategies s
          LEFT JOIN leads l ON s.source_id = l.id
          WHERE s.id = dt.source_id AND s.source_type = 'lead'
        )
        ELSE NULL
      END as related_lead_title,
      CASE
        WHEN dt.source_type = 'strategy' THEN dt.source_id
        ELSE NULL
      END as related_strategy_id,
      CASE
        WHEN dt.source_type = 'strategy' THEN (SELECT title FROM strategies WHERE id = dt.source_id)
        ELSE NULL
      END as related_strategy_title,
      CASE
        WHEN dt.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = dt.source_id)
        WHEN dt.source_type = 'strategy' THEN (SELECT title FROM strategies WHERE id = dt.source_id)
        ELSE NULL
      END as source_title
    FROM dev_tasks dt
    LEFT JOIN users u ON dt.assignee_id = u.id
    LEFT JOIN users c ON dt.created_by = c.id
    WHERE dt.id = ?
  `).get(id);

  if (!task) return res.status(404).json({ error: '需求不存在' });
  task.related_lead_title = decrypt(task.related_lead_title);
  task.source_title = decrypt(task.source_title);

  const sourceStrategy = task.source_type === 'strategy' && task.source_id
    ? db.prepare(`
        SELECT s.*, u.display_name as owner_name,
          (SELECT result_summary FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as latest_result_summary,
          (SELECT effect_judgement FROM strategy_reviews sr WHERE sr.strategy_id = s.id) as effect_judgement
        FROM strategies s
        LEFT JOIN users u ON s.owner_id = u.id
        WHERE s.id = ?
      `).get(task.source_id)
    : null;

  res.json({ ...task, source_strategy: sourceStrategy });
});

// 创建研发任务
app.post('/api/dev-tasks', (req, res) => {
  const { title, description, source_type, source_id, assignee_id, priority, estimated_hours, start_date, due_date } = req.body;
  const { id: userId, role } = req.user;

  if (!title) return res.status(400).json({ error: '任务标题必填' });

  // 权限校验：member 只能给自己创建
  if (role === 'member' && assignee_id && parseInt(assignee_id) !== userId) {
    return res.status(403).json({ error: '普通成员只能给自己创建任务' });
  }

  const result = db.prepare(`
    INSERT INTO dev_tasks (title, description, source_type, source_id, assignee_id, priority, estimated_hours, start_date, due_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description, source_type, source_id, assignee_id, priority, estimated_hours, start_date, due_date, userId);

  // 如果指定了负责人，发送通知
  if (assignee_id && assignee_id !== userId) {
    createNotification(
      assignee_id,
      'dev_task_assigned',
      '新研发任务分配',
      `您被分配了新研发任务：${title}`,
      `/dev-tasks`
    );
  }

  res.json({ id: result.lastInsertRowid });
});

// 更新研发任务
app.put('/api/dev-tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, source_type, source_id, assignee_id, status, priority, estimated_hours, actual_hours, start_date, due_date, completed_date, completion_note } = req.body;
  const { id: userId } = req.user;

  // 获取旧任务信息
  const oldTask = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id);

  db.prepare(`
    UPDATE dev_tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      source_type = COALESCE(?, source_type),
      source_id = COALESCE(?, source_id),
      assignee_id = COALESCE(?, assignee_id),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      estimated_hours = COALESCE(?, estimated_hours),
      actual_hours = COALESCE(?, actual_hours),
      start_date = COALESCE(?, start_date),
      due_date = COALESCE(?, due_date),
      completed_date = COALESCE(?, completed_date),
      completion_note = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, source_type, source_id, assignee_id, status, priority, estimated_hours, actual_hours, start_date, due_date, completed_date, completion_note !== undefined ? completion_note : oldTask.completion_note, id);

  // 如果负责人变更，通知新负责人
  if (assignee_id && assignee_id !== oldTask.assignee_id && assignee_id !== userId) {
    createNotification(
      assignee_id,
      'dev_task_assigned',
      '研发任务重新分配',
      `您被分配了研发任务：${oldTask.title}`,
      `/dev-tasks`
    );
  }

  // 如果任务完成，通知创建人
  if (status === 'completed' && oldTask.status !== 'completed' && oldTask.created_by && oldTask.created_by !== userId) {
    createNotification(
      oldTask.created_by,
      'dev_task_completed',
      '研发任务已完成',
      `研发任务已完成：${oldTask.title}`,
      `/dev-tasks`
    );
  }

  res.json({ success: true });
});

// 删除研发任务
app.delete('/api/dev-tasks/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM dev_tasks WHERE id = ?').run(id);
  res.json({ success: true });
});


// =========== 通知系统 API ===========
// 创建通知（内部函数）
function createNotification(userId, type, title, content, link) {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, content, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, content, link);
}

function getTaskCenterNotificationUserIds() {
  const ids = new Set();
  const executiveRoles = ['ceo', 'cto', 'coo', 'cmo'];
  db.prepare(`
    SELECT id FROM users
    WHERE department = 'operation'
      OR LOWER(IFNULL(role, '')) IN (${executiveRoles.map(() => '?').join(',')})
      OR LOWER(IFNULL(executive_role, '')) IN (${executiveRoles.map(() => '?').join(',')})
  `).all(...executiveRoles, ...executiveRoles).forEach(row => ids.add(row.id));

  const operationTeamIds = db.prepare("SELECT id FROM teams WHERE department = 'operation'").all().map(row => row.id);
  getUsersByTeamIds(operationTeamIds).forEach(id => ids.add(id));

  const commercialTeamIds = db.prepare(`
    SELECT id FROM teams
    WHERE department = 'commercial' AND TRIM(name) IN ('商务流量组', '商务预算组')
  `).all().map(row => row.id);
  getUsersByTeamIds(commercialTeamIds).forEach(id => ids.add(id));

  return [...ids].filter(Boolean);
}

function notifyTaskCenterProductRecord(productId, options = {}) {
  const product = db.prepare(`
    SELECT cp.*, c.name as company_name, ce.name as entity_name, ce.reg_name as entity_reg_name
    FROM company_products cp
    LEFT JOIN companies c ON cp.company_id = c.id
    LEFT JOIN company_entities ce ON cp.entity_id = ce.id
    WHERE cp.id = ?
  `).get(productId);
  if (!product) return null;

  const productName = options.mini_program_name || product.name || '未知小程序';
  const companyName = options.company_name || decrypt(product.company_name) || '竞品未知公司';
  const entityName = options.entity_name || product.entity_name || product.entity_reg_name || '未关联主体';
  const sourceApp = options.source_app ? `来源App：${options.source_app}；` : '';
  const screenshotText = options.screenshot_count ? `截图：${options.screenshot_count}张；` : '';
  const title = `发现支付宝小程序任务：${productName}`;
  const content = `${sourceApp}公司：${companyName}；主体：${entityName}；${screenshotText}已记录到公司研究全部产品。`;
  const recipients = getTaskCenterNotificationUserIds();

  recipients.forEach(userId => {
    createNotification(
      userId,
      'task_center_product_found',
      title,
      content,
      '/companies'
    );
  });

  return { recipients, productName, companyName, entityName };
}

// 获取当前用户的通知列表
app.get('/api/notifications', (req, res) => {
  const { id: userId } = req.user;
  const { is_read, limit = 50 } = req.query;

  let q = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];

  if (is_read !== undefined) {
    q += ' AND is_read = ?';
    params.push(is_read === 'true' ? 1 : 0);
  }

  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  res.json(db.prepare(q).all(...params));
});

// 获取未读通知数量
app.get('/api/notifications/unread-count', (req, res) => {
  const { id: userId } = req.user;
  const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId);
  res.json({ count: result.count });
});

// 标记通知为已读
app.put('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;

  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  res.json({ success: true });
});

// 标记所有通知为已读
app.put('/api/notifications/read-all', (req, res) => {
  const { id: userId } = req.user;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
  res.json({ success: true });
});

// 删除通知
app.delete('/api/notifications/:id', (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;

  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
  res.json({ success: true });
});

// =========== 公司经营模块 API ===========
// 权限中间件：仅高管可访问
function requireExecutive(req, res, next) {
  const { executive_role, role } = req.user;
  const execRoles = ['ceo', 'coo', 'cto', 'cmo'];
  if (!execRoles.includes(executive_role) && !execRoles.includes(role)) {
    return res.status(403).json({ error: '仅高管可访问此模块' });
  }
  next();
}

// 获取高级人才列表
app.get('/api/executive/talents', requireExecutive, (req, res) => {
  const { potential_rating, recruit_status, intent_level } = req.query;
  const privacy = buildPersonPrivacyFilter(req.user.id, '');

  let query = `
    SELECT * FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND weight IN ('high', 'vip')
  `;
  const params = [...privacy.params];
  query += privacy.sql;

  if (potential_rating) {
    query += ' AND potential_level = ?';
    params.push(potential_rating);
  }
  if (recruit_status) {
    query += ' AND recruit_status = ?';
    params.push(recruit_status);
  }
  if (intent_level) {
    query += ' AND intent_level = ?';
    params.push(intent_level);
  }

  query += ' ORDER BY updated_at DESC';

  const talents = db.prepare(query).all(...params);
  res.json(decryptRows('persons', talents));
});

// 获取竞争公司动态
app.get('/api/executive/competitor-dynamics', requireExecutive, (req, res) => {
  const { company_id, limit = 20 } = req.query;

  let query = `
    SELECT
      cd.*,
      c.name as company_name,
      c.industry
    FROM company_dynamics cd
    LEFT JOIN companies c ON cd.company_id = c.id
    WHERE c.category = 'competitor'
      AND cd.importance = 'high'
  `;
  const params = [];

  if (company_id) {
    query += ' AND cd.company_id = ?';
    params.push(company_id);
  }

  query += ' ORDER BY cd.date DESC LIMIT ?';
  params.push(parseInt(limit));

  const dynamics = db.prepare(query).all(...params);
  // cd.* 走 company_dynamics 字段表；company_name 来自 companies.name 需单独解密
  const decrypted = decryptRows('company_dynamics', dynamics).map(r => ({
    ...r,
    company_name: decrypt(r.company_name),
  }));
  res.json(decrypted);
});

// 获取重点客户列表
app.get('/api/executive/key-customers', requireExecutive, (req, res) => {
  const privacy = buildPersonPrivacyFilter(req.user.id, 'p');
  const customers = db.prepare(`
    SELECT
      p.*,
      i.date as last_interaction_date,
      i.type as last_interaction_type,
      i.outcome as last_interaction_result,
      CAST(julianday('now') - julianday(i.date) AS INTEGER) as days_since_last_contact
    FROM persons p
    LEFT JOIN (
      SELECT person_id, MAX(date) as max_date
      FROM interactions
      GROUP BY person_id
    ) latest ON p.id = latest.person_id
    LEFT JOIN interactions i ON p.id = i.person_id AND i.date = latest.max_date
    WHERE p.person_category = 'business'
      AND p.relation_types LIKE '%customer_active%'
      AND p.weight IN ('high', 'vip')
      ${privacy.sql}
    ORDER BY days_since_last_contact DESC
  `).all(...privacy.params);

  // last_interaction_result 来自 interactions.outcome（加密），需单独解密
  res.json(decryptRows('persons', customers).map(r => ({
    ...r,
    last_interaction_result: decrypt(r.last_interaction_result),
  })));
});

// 获取经营概览数据
app.get('/api/executive/overview', requireExecutive, (req, res) => {
  const personPrivacy = buildPersonPrivacyFilter(req.user.id, '');
  const aliasedPersonPrivacy = buildPersonPrivacyFilter(req.user.id, 'p');
  // 高级人才数量
  const talentCount = db.prepare(`
    SELECT COUNT(*) as count FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND weight IN ('high', 'vip')
      ${personPrivacy.sql}
  `).get(...personPrivacy.params).count;

  // 招募中人才数量
  const recruitingCount = db.prepare(`
    SELECT COUNT(*) as count FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND recruit_status IN ('contacted', 'negotiating', 'offered')
      ${personPrivacy.sql}
  `).get(...personPrivacy.params).count;

  // 竞争动态数量（近30天）
  const dynamicsCount = db.prepare(`
    SELECT COUNT(*) as count FROM company_dynamics cd
    LEFT JOIN companies c ON cd.company_id = c.id
    WHERE c.category = 'competitor'
      AND cd.importance = 'high'
      AND cd.date >= date('now', '-30 days')
  `).get().count;

  // 重点客户数量
  const customerCount = db.prepare(`
    SELECT COUNT(*) as count FROM persons
    WHERE person_category = 'business'
      AND relation_types LIKE '%customer_active%'
      AND weight IN ('high', 'vip')
      ${personPrivacy.sql}
  `).get(...personPrivacy.params).count;

  // 高级人才最近动态（最近更新的5条）
  const recentTalents = decryptRows('persons', db.prepare(`
    SELECT id, name, current_company as company, current_position as position,
           potential_level as potential_rating, recruit_status, intent_level, updated_at
    FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND weight IN ('high', 'vip')
      ${personPrivacy.sql}
    ORDER BY updated_at DESC
    LIMIT 5
  `).all(...personPrivacy.params));

  // 竞争公司最新动态（最近5条）
  const recentDynamicsRaw = db.prepare(`
    SELECT
      cd.id, cd.title, cd.date, cd.type, cd.content, cd.impact,
      c.name as company_name
    FROM company_dynamics cd
    LEFT JOIN companies c ON cd.company_id = c.id
    WHERE c.category = 'competitor'
      AND cd.importance = 'high'
    ORDER BY cd.date DESC
    LIMIT 5
  `).all();
  const recentDynamics = decryptRows('company_dynamics', recentDynamicsRaw).map(r => ({
    ...r,
    company_name: decrypt(r.company_name),
  }));

  // 重点客户预警（超过30天未联系）
  const customersNeedFollowup = decryptRows('persons', db.prepare(`
    SELECT
      p.id, p.name, p.company, p.position,
      i.date as last_contact_date,
      i.type as last_contact_type,
      CAST(julianday('now') - julianday(i.date) AS INTEGER) as days_since_last_contact
    FROM persons p
    LEFT JOIN (
      SELECT person_id, MAX(date) as max_date
      FROM interactions
      GROUP BY person_id
    ) latest ON p.id = latest.person_id
    LEFT JOIN interactions i ON p.id = i.person_id AND i.date = latest.max_date
    WHERE p.person_category = 'business'
      AND p.relation_types LIKE '%customer_active%'
      AND p.weight IN ('high', 'vip')
      AND (i.date IS NULL OR julianday('now') - julianday(i.date) > 30)
      ${aliasedPersonPrivacy.sql}
    ORDER BY days_since_last_contact DESC
    LIMIT 5
  `).all(...aliasedPersonPrivacy.params));

  const alerts = [];
  const staleCustomers = customersNeedFollowup.filter(c => c.days_since_last_contact == null || c.days_since_last_contact > 30);
  if (staleCustomers.length > 0) {
    alerts.push(`${staleCustomers.length} 位重点客户超过 30 天未联系`);
  }

  res.json({
    stats: {
      high_potential_talents: talentCount,
      recruiting_talents: recruitingCount,
      recent_competitor_dynamics: dynamicsCount,
      customers_need_followup: customerCount,
    },
    alerts,
    recent_talents: recentTalents,
    recent_dynamics: recentDynamics,
    customers_need_followup: customersNeedFollowup,
  });
});

// 获取经营周报列表
app.get('/api/executive/reports', requireExecutive, (req, res) => {
  try {
    const { report_type, year, month } = req.query;

    let query = 'SELECT * FROM executive_reports WHERE 1=1';
    const params = [];

    if (report_type) {
      query += ' AND report_type = ?';
      params.push(report_type);
    }
    if (year) {
      query += ' AND year = ?';
      params.push(parseInt(year));
    }
    if (month) {
      query += ' AND month = ?';
      params.push(parseInt(month));
    }

    query += ' ORDER BY meeting_date DESC';

    const reports = db.prepare(query).all(...params);
    res.json(decryptRows('executive_reports', reports));
  } catch (err) {
    console.error('获取经营报表失败:', err);
    res.status(500).json({ error: '获取经营报表失败，请检查报表表结构或服务端日志' });
  }
});

// 获取单个经营周报
app.get('/api/executive/reports/:id', requireExecutive, (req, res) => {
  const { id } = req.params;
  const report = db.prepare('SELECT * FROM executive_reports WHERE id = ?').get(id);

  if (!report) {
    return res.status(404).json({ error: '报告不存在' });
  }

  res.json(decryptRow('executive_reports', report));
});

// 创建经营周报
app.post('/api/executive/reports', requireExecutive, (req, res) => {
  const { id: userId } = req.user;
  const {
    report_type, meeting_date, year, month,
    week = null,
    weekly_results = null, key_judgment = null, decision_needed = null, next_week_actions = null,
    key_issues = null, decisions = null,
    strategic_direction = null, key_focus = null, monthly_summary = null
  } = req.body;

  if (!report_type || !meeting_date || !year || !month) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  // 获取所有高管 ID
  const executives = db.prepare("SELECT id FROM users WHERE executive_role IS NOT NULL").all();
  const attendees = JSON.stringify(executives.map(e => e.id));

  const enc = encryptRow('executive_reports', {
    weekly_results, key_judgment, decision_needed, next_week_actions,
    key_issues, decisions,
    strategic_direction, key_focus, monthly_summary,
  });

  const result = db.prepare(`
    INSERT INTO executive_reports (
      report_type, meeting_date, year, month, week,
      weekly_results, key_judgment, decision_needed, next_week_actions,
      key_issues, decisions,
      strategic_direction, key_focus, monthly_summary,
      attendees, last_edited_by, last_edited_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    report_type, meeting_date, year, month, week,
    enc.weekly_results, enc.key_judgment, enc.decision_needed, enc.next_week_actions,
    enc.key_issues, enc.decisions,
    enc.strategic_direction, enc.key_focus, enc.monthly_summary,
    attendees, userId
  );

  res.json({ id: result.lastInsertRowid });
});

// 更新经营周报
app.put('/api/executive/reports/:id', requireExecutive, (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  const {
    meeting_date, year, month,
    week = null,
    weekly_results = null, key_judgment = null, decision_needed = null, next_week_actions = null,
    key_issues = null, decisions = null,
    strategic_direction = null, key_focus = null, monthly_summary = null
  } = req.body;

  const enc = encryptRow('executive_reports', {
    weekly_results, key_judgment, decision_needed, next_week_actions,
    key_issues, decisions,
    strategic_direction, key_focus, monthly_summary,
  });

  db.prepare(`
    UPDATE executive_reports SET
      meeting_date = ?, year = ?, month = ?, week = ?,
      weekly_results = ?, key_judgment = ?, decision_needed = ?, next_week_actions = ?,
      key_issues = ?, decisions = ?,
      strategic_direction = ?, key_focus = ?, monthly_summary = ?,
      last_edited_by = ?, last_edited_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    meeting_date, year, month, week,
    enc.weekly_results, enc.key_judgment, enc.decision_needed, enc.next_week_actions,
    enc.key_issues, enc.decisions,
    enc.strategic_direction, enc.key_focus, enc.monthly_summary,
    userId, id
  );

  res.json({ success: true });
});

// 删除经营周报
app.delete('/api/executive/reports/:id', requireExecutive, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM executive_reports WHERE id = ?').run(id);
  res.json({ success: true });
});

// SPA fallback - 必须放在所有 API 路由之后
// =========== 附件 API ===========
app.post('/api/attachments/upload', auth, uploadAttachments, (req, res) => {
  const { source_type, source_id } = req.body;
  if (!source_type || !source_id) return res.status(400).json({ error: '缺少 source_type 或 source_id' });
  if (!req.files?.length) return res.status(400).json({ error: '未收到文件' });

  const insert = db.prepare(`
    INSERT INTO attachments (source_type, source_id, filename, filepath, mimetype, size, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const results = req.files.map(f => {
    const filename = normalizeUploadedFilename(f.originalname);
    const r = insert.run(source_type, source_id, filename, f.filename, f.mimetype, f.size, req.user.id);
    return { id: r.lastInsertRowid, filename, filepath: f.filename, size: f.size, mimetype: f.mimetype };
  });
  res.json(results);
});

app.get('/api/attachments', auth, (req, res) => {
  const { source_type, source_id } = req.query;
  if (!source_type || !source_id) return res.status(400).json({ error: '缺少参数' });
  const rows = db.prepare(`
    SELECT a.*, u.display_name as creator_name
    FROM attachments a LEFT JOIN users u ON a.created_by = u.id
    WHERE a.source_type = ? AND a.source_id = ?
    ORDER BY a.created_at ASC
  `).all(source_type, source_id);
  res.json(rows.map(normalizeGenericAttachmentRow));
});

app.get('/api/attachments/:id/download', auth, (req, res) => {
  const row = normalizeGenericAttachmentRow(db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id));
  if (!row) return res.status(404).json({ error: '附件不存在' });
  const filePath = path.join(UPLOADS_DIR, row.filepath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

  res.setHeader('Content-Type', row.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  res.setHeader('Content-Length', row.size);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
  fileStream.on('error', (err) => {
    console.error('文件流错误:', err);
    if (!res.headersSent) res.status(500).json({ error: '文件读取失败' });
  });
});

app.delete('/api/attachments/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '附件不存在' });
  if (row.created_by !== req.user.id && !isAdmin(req.user.role)) {
    return res.status(403).json({ error: '只有创建人可以删除附件' });
  }
  try { fs.unlinkSync(path.join(UPLOADS_DIR, row.filepath)); } catch {}
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 跨团队访问权限 API ===========
// 获取跨团队权限列表
app.get('/api/cross-team-access', (req, res) => {
  const { role } = req.user;
  if (role !== 'admin') return res.status(403).json({ error: '仅管理员可访问' });

  const list = db.prepare(`
    SELECT cta.*,
      u.display_name as user_name,
      t.name as team_name,
      g.display_name as granted_by_name
    FROM cross_team_access cta
    LEFT JOIN users u ON cta.user_id = u.id
    LEFT JOIN teams t ON cta.target_team_id = t.id
    LEFT JOIN users g ON cta.granted_by = g.id
    ORDER BY cta.created_at DESC
  `).all();
  res.json(list);
});

// 创建跨团队权限
app.post('/api/cross-team-access', (req, res) => {
  const { role, id: grantedBy } = req.user;
  if (role !== 'admin') return res.status(403).json({ error: '仅管理员可配置' });

  const { user_id, target_team_id, module } = req.body;
  if (!user_id || !target_team_id || !module) {
    return res.status(400).json({ error: '用户、团队、模块必填' });
  }

  const validModules = ['strategies', 'dev_tasks', 'leads', 'product_assets', 'goals', 'weekly_reports'];
  if (!validModules.includes(module)) {
    return res.status(400).json({ error: '无效的模块名称' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO cross_team_access (user_id, target_team_id, module, granted_by)
      VALUES (?, ?, ?, ?)
    `).run(user_id, target_team_id, module, grantedBy);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '该权限已存在' });
    }
    throw err;
  }
});

// 删除跨团队权限
app.delete('/api/cross-team-access/:id', (req, res) => {
  const { role } = req.user;
  if (role !== 'admin') return res.status(403).json({ error: '仅管理员可删除' });

  db.prepare('DELETE FROM cross_team_access WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 招聘雷达模块（仅 CEO/COO/CTO/CMO 可访问）
const BOSS_ROLES = new Set(['ceo', 'coo', 'cto', 'cmo']);
function requireBoss(req, res, next) {
  const { role, executive_role } = req.user || {};
  if (BOSS_ROLES.has(role) || BOSS_ROLES.has(executive_role)) return next();
  return res.status(403).json({ error: '招聘雷达仅限老板访问' });
}
const bossWatcherRoutes = require('./boss-watcher/routes');
app.use('/api/boss-watcher', auth, requireBoss, bossWatcherRoutes);
const bossScheduler = require('./boss-watcher/scheduler');
bossScheduler.start();

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // 只有非 API 路由才返回 index.html
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'));
    } else {
      next();
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://[你的IP]:${PORT}`);
});
