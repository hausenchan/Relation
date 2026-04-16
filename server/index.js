const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|mp4|mov|avi)$/i;
    if (!allowed.test(file.originalname)) {
      cb(new Error('不支持的文件类型'));
      return;
    }
    cb(null, true);
  },
});

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

const ADMIN_ROLES = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);
const isAdmin = (role) => ADMIN_ROLES.has(role);

// 腾讯地图 Key（地理编码用）
const TMAP_KEY = 'BFBBZ-CNXC4-XEWUR-KQN7R-QOUGJ-Q4B66';

// 地理编码：城市+地址 → 经纬度
async function geocodeAddress(city, address) {
  try {
    const firstCity = (city || '').split(',')[0].trim();
    const fullAddress = (firstCity + (address || '')).trim();
    if (!fullAddress) return { lat: null, lng: null };
    const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(fullAddress)}&key=${TMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 0 && data.result?.location) {
      return { lat: data.result.location.lat, lng: data.result.location.lng };
    }
  } catch {}
  return { lat: null, lng: null };
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
    const user = db.prepare('SELECT password_version FROM users WHERE id = ?').get(decoded.id);
    if (!user || (user.password_version || 0) !== (decoded.pwv || 0)) {
      return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
    req.user = decoded;
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

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}
app.use('/uploads', express.static(UPLOADS_DIR));

const db = new Database(path.join(__dirname, 'data.db'));

// =========== 用户表 ===========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
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
    next_action TEXT,
    next_action_date TEXT,
    importance TEXT DEFAULT 'normal',
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
`);

// =========== 动态加列 ===========
const existingCols = db.prepare("PRAGMA table_info(persons)").all().map(c => c.name);
if (existingCols.length > 0) {
  const personColsToAdd = [
    ["city",          "TEXT"],
    ["resources",     "TEXT"],
    ["demands",       "TEXT"],
    ["potential_level","TEXT"],
    ["weight",        "TEXT DEFAULT 'medium'"],
    ["created_by",    "INTEGER DEFAULT NULL"],
    ["assigned_to",   "INTEGER DEFAULT NULL"],
    ["lat",           "REAL DEFAULT NULL"],
    ["lng",           "REAL DEFAULT NULL"],
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

const intCols = db.prepare("PRAGMA table_info(interactions)").all().map(c => c.name);
if (intCols.length > 0) {
  if (!intCols.includes('gift_name')) db.exec("ALTER TABLE interactions ADD COLUMN gift_name TEXT DEFAULT NULL");
  if (!intCols.includes('opportunity_title')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_title TEXT DEFAULT NULL");
  if (!intCols.includes('opportunity_status')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_status TEXT DEFAULT NULL");
  if (!intCols.includes('opportunity_assignee')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_assignee INTEGER DEFAULT NULL");
  if (!intCols.includes('opportunity_note')) db.exec("ALTER TABLE interactions ADD COLUMN opportunity_note TEXT DEFAULT NULL");
  if (!intCols.includes('created_by')) db.exec("ALTER TABLE interactions ADD COLUMN created_by INTEGER DEFAULT NULL");
}

const crCols = db.prepare("PRAGMA table_info(competitor_research)").all().map(c => c.name);
if (crCols.length > 0) {
  if (!crCols.includes('opportunity_title')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_title TEXT DEFAULT NULL");
  if (!crCols.includes('opportunity_status')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_status TEXT DEFAULT NULL");
  if (!crCols.includes('opportunity_assignee')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_assignee INTEGER DEFAULT NULL");
  if (!crCols.includes('opportunity_note')) db.exec("ALTER TABLE competitor_research ADD COLUMN opportunity_note TEXT DEFAULT NULL");
  if (!crCols.includes('created_by')) db.exec("ALTER TABLE competitor_research ADD COLUMN created_by INTEGER DEFAULT NULL");
}

// 回填历史数据 created_by
try {
  // interactions: 通过 person_id 关联 persons.created_by 回填
  db.exec(`
    UPDATE interactions SET created_by = (
      SELECT p.created_by FROM persons p WHERE p.id = interactions.person_id
    ) WHERE created_by IS NULL
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
}

// 补创建竞品研究商机对应的 follow_up_tasks（修复历史数据）
try {
  db.exec(`
    INSERT INTO follow_up_tasks (title, interaction_id, person_id, competitor_research_id, company_id, opportunity_title, assigned_to, assigned_by, status)
    SELECT c.name || ' - ' || cr.opportunity_title, 0, 0, cr.id, cr.company_id, cr.opportunity_title, cr.opportunity_assignee, 1, 'pending'
    FROM competitor_research cr
    LEFT JOIN companies c ON cr.company_id = c.id
    LEFT JOIN follow_up_tasks ft ON ft.competitor_research_id = cr.id
    WHERE cr.opportunity_title IS NOT NULL AND cr.opportunity_assignee IS NOT NULL AND ft.id IS NULL
  `);
} catch(e) { /* 表不存在时忽略 */ }

const companyCols = db.prepare("PRAGMA table_info(companies)").all().map(c => c.name);
if (companyCols.length > 0 && !companyCols.includes('created_by')) {
  db.exec("ALTER TABLE companies ADD COLUMN created_by INTEGER DEFAULT NULL");
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
`);

// tasks 表动态补全 result 字段
const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
if (taskCols.length > 0 && !taskCols.includes('result')) {
  db.exec("ALTER TABLE tasks ADD COLUMN result TEXT DEFAULT NULL");
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
    status TEXT DEFAULT 'active',
    source_type TEXT,
    source_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_strategies_owner_id ON strategies(owner_id);
  CREATE INDEX IF NOT EXISTS idx_strategies_dimension ON strategies(dimension);
  CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);
  CREATE INDEX IF NOT EXISTS idx_strategies_source ON strategies(source_type, source_id);
`);

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
    period      TEXT NOT NULL,
    parent_id   INTEGER DEFAULT NULL,
    owner_id    INTEGER NOT NULL,
    department  TEXT,
    deadline    TEXT,
    progress    INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'active',
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
  if (!goalCols.includes('parent_id')) {
    db.exec("ALTER TABLE goals ADD COLUMN parent_id INTEGER DEFAULT NULL");
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
  if (!userCols.includes('executive_role')) {
    db.exec("ALTER TABLE users ADD COLUMN executive_role TEXT DEFAULT NULL");
  }
  if (!userCols.includes('password_version')) {
    db.exec("ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 0");
  }
}

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
    feedback TEXT,
    rating INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// =========== 送礼模块 API ===========

// 礼品库
app.get('/api/gifts', (req, res) => {
  res.json(db.prepare('SELECT * FROM gifts ORDER BY category, name').all());
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
  db.prepare('DELETE FROM gifts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 送礼计划
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
  res.json(db.prepare(q).all(...params));
});

app.post('/api/gift_requests', canWrite, (req, res) => {
  const { plan_id, person_id, gift_id, quantity, notes } = req.body;
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
  const { status } = req.query;
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
  const visibleIds2 = getVisibleUserIds(req.user.id, req.user.role);
  if (visibleIds2 !== null) {
    q += ` AND gr.sender_id IN (${visibleIds2.map(() => '?').join(',')})`;
    params.push(...visibleIds2);
  }
  if (status) { q += ' AND gr.status = ?'; params.push(status); }
  q += ' ORDER BY gr.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.put('/api/gift_records/:id', (req, res) => {
  const { status, feedback, rating, send_date } = req.body;
  const record = db.prepare('SELECT * FROM gift_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '未找到' });
  if (record.sender_id !== req.user.id && !isAdmin(req.user.role) && req.user.role !== 'leader') {
    return res.status(403).json({ error: '无权操作' });
  }

  const updateAndLog = db.transaction(() => {
    db.prepare(`UPDATE gift_records SET status=?, feedback=?, rating=?, send_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(status, feedback, rating || null, send_date, req.params.id);

    // 状态变为「已接收」且之前不是「已接收」时，自动生成互动记录
    if (status === 'received' && record.status !== 'received') {
      const gift = db.prepare('SELECT name FROM gifts WHERE id = ?').get(record.gift_id);
      const giftName = gift ? gift.name : '礼品';
      const interactionDate = send_date || new Date().toISOString().slice(0, 10);
      const description = `送出礼品：${giftName} × ${record.quantity}${feedback ? `\n收礼反馈：${feedback}` : ''}`;
      db.prepare(`
        INSERT INTO interactions (person_id, type, date, description, importance, created_at)
        VALUES (?, 'gift', ?, ?, 'normal', CURRENT_TIMESTAMP)
      `).run(record.person_id, interactionDate, description);
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

// 只读校验（readonly/guest 不能写）
function canWrite(req, res, next) {
  if (req.user.role === 'readonly') return res.status(403).json({ error: '只读账号无法操作' });
  if (req.user.role === 'guest') return res.status(403).json({ error: '访客无法操作' });
  next();
}

// 获取当前用户可见的所有用户ID列表（用于数据过滤）
function getVisibleUserIds(userId, role) {
  if (isAdmin(role)) return null; // null 表示不限制，看全部

  if (role === 'sales_director') {
    // 自己 + 自己带的组的成员 + 下辖所有leader带的组的成员
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    // 自己带的组（自己作为leader的组）
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length === 0) return [userId];
    const members = db.prepare(
      `SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`
    ).all(...allTeamIds).map(u => u.id);
    return [...new Set([userId, ...members])];
  }

  if (role === 'leader') {
    // 自己 + 本组所有成员
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (!myUser?.team_id) return [userId];
    const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
    return [...new Set([userId, ...members])];
  }

  // member / readonly / guest
  return [userId];
}

// 构建用户可见ID的 SQL 片段
function buildUserFilter(userId, role, tableAlias) {
  const ids = getVisibleUserIds(userId, role);
  if (ids === null) return { sql: '', params: [] }; // admin，不过滤
  const col = tableAlias ? `${tableAlias}.` : '';
  return {
    sql: ` AND (${col}created_by IN (${ids.map(() => '?').join(',')}) OR ${col}assigned_to IN (${ids.map(() => '?').join(',')}))`,
    params: [...ids, ...ids],
  };
}

// =========== 认证 API ===========
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
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
  res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, executive_role: user.executive_role, modulePerms } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, executive_role, last_login FROM users WHERE id = ?').get(req.user.id);
  const modulePerms = db.prepare('SELECT * FROM user_module_perms WHERE user_id = ?').all(req.user.id);
  const menuPerms = db.prepare('SELECT menu_key FROM user_menu_perms WHERE user_id = ?').all(req.user.id).map(r => r.menu_key);
  res.json({ ...user, modulePerms, menuPerms });
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
  const users = db.prepare('SELECT id, username, display_name, role, team_id FROM users WHERE role != ? ORDER BY display_name ASC').all('readonly');
  res.json(users);
});

// =========== 用户管理 API（admin only）===========
app.get('/api/users', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, department, team_id, created_at, last_login FROM users ORDER BY created_at ASC').all();
  const perms = db.prepare('SELECT * FROM user_module_perms').all();
  const teams = db.prepare('SELECT * FROM teams').all();
  res.json(users.map(u => ({
    ...u,
    modulePerms: perms.filter(p => p.user_id === u.id),
    team_name: teams.find(t => t.id === u.team_id)?.name || null,
  })));
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, display_name, role, modulePerms, leader_id, department, team_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = db.prepare("INSERT INTO users (username, password_hash, display_name, role, leader_id, department, team_id) VALUES (?,?,?,?,?,?,?)").run(username, hash, display_name, role || 'member', leader_id || null, department || null, team_id || null);
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
  const { display_name, role, password, modulePerms, leader_id, department, team_id } = req.body;
  if (password) {
    db.prepare('UPDATE users SET display_name=?, role=?, password_hash=?, leader_id=?, department=?, team_id=? WHERE id=?').run(display_name, role, bcrypt.hashSync(password, 10), leader_id || null, department || null, team_id || null, req.params.id);
  } else {
    db.prepare('UPDATE users SET display_name=?, role=?, leader_id=?, department=?, team_id=? WHERE id=?').run(display_name, role, leader_id || null, department || null, team_id || null, req.params.id);
  }
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
  // 解绑该小组的用户
  db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?').run(req.params.id);
  db.prepare('DELETE FROM director_teams WHERE team_id = ?').run(req.params.id);
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
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
  const { search, person_category, relation_type, potential_level, recruit_status, intent_level, city, weight } = req.query;
  const { id: me, role } = req.user;
  let query = 'SELECT p.*, u1.display_name as created_by_name, u2.display_name as assigned_to_name FROM persons p LEFT JOIN users u1 ON p.created_by = u1.id LEFT JOIN users u2 ON p.assigned_to = u2.id WHERE 1=1';
  const params = [];

  // 按角色过滤可见数据
  const filter = buildUserFilter(me, role, 'p');
  if (filter.sql) {
    query += filter.sql;
    params.push(...filter.params);
  }

  if (search) {
    query += ' AND (p.name LIKE ? OR p.company LIKE ? OR p.current_company LIKE ? OR p.phone LIKE ? OR p.tags LIKE ? OR p.skills LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
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

  query += ' ORDER BY p.updated_at DESC';
  res.json(db.prepare(query).all(...params));
});

// 人脉地图数据（精简字段 + 上次联系时间）
app.get('/api/persons/map', (req, res) => {
  const { city, person_category, relationship_level, weight } = req.query;
  const { id: me, role } = req.user;
  let query = `SELECT p.id, p.name, p.company, p.city, p.address, p.lat, p.lng, p.person_category, p.relationship_level, p.weight, p.phone,
    (SELECT MAX(i.date) FROM interactions i WHERE i.person_id = p.id) as last_interaction_date,
    CAST(julianday('now') - julianday((SELECT MAX(i.date) FROM interactions i WHERE i.person_id = p.id)) AS INTEGER) as days_since_contact
    FROM persons p WHERE p.city IS NOT NULL AND p.city != ''`;
  const params = [];

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

  query += ' ORDER BY p.city, p.name';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/persons/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const p = db.prepare('SELECT p.*, u1.display_name as created_by_name, u2.display_name as assigned_to_name FROM persons p LEFT JOIN users u1 ON p.created_by = u1.id LEFT JOIN users u2 ON p.assigned_to = u2.id WHERE p.id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '未找到' });
  res.json(p);
});

app.post('/api/persons', canWrite, async (req, res) => {
  const {
    name, person_category, relation_types, city, company, position, industry,
    phone, email, wechat, birthday, address, tags, notes, resources, demands,
    relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight
  } = req.body;
  const { lat, lng } = await geocodeAddress(city, address);
  const result = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, city, company, position, industry,
      phone, email, wechat, birthday, address, tags, notes, resources, demands,
      relationship_level, client_status,
      talent_type, current_company, current_position, target_position,
      skills, experience_years, education, recruit_status, intent_level,
      potential_level, expected_salary, source, heart, brain, mouth, hand, weight, lat, lng, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, person_category || 'social', relation_types || '', city,
    company, position, industry, phone, email, wechat, birthday, address, tags, notes,
    resources, demands, relationship_level || 'normal', client_status || 'active',
    talent_type || 'external', current_company, current_position, target_position,
    skills, experience_years, education, recruit_status || 'potential', intent_level || 'low',
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight || 'medium', lat, lng, req.user.id
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/persons/:id', canWrite, async (req, res) => {
  // member / readonly 只能改自己录入的 或 被指派给自己的
  if (req.user.role === 'member' || req.user.role === 'readonly') {
    const p = db.prepare('SELECT created_by, assigned_to FROM persons WHERE id = ?').get(req.params.id);
    const isOwner = p?.created_by === req.user.id;
    const isAssigned = p?.assigned_to === req.user.id;
    if (!isOwner && !isAssigned) return res.status(403).json({ error: '无权修改此数据' });
  }
  const {
    name, person_category, relation_types, city, company, position, industry,
    phone, email, wechat, birthday, address, tags, notes, resources, demands,
    relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight
  } = req.body;
  const { lat, lng } = await geocodeAddress(city, address);
  db.prepare(`
    UPDATE persons SET name=?, person_category=?, relation_types=?, city=?, company=?, position=?, industry=?,
      phone=?, email=?, wechat=?, birthday=?, address=?, tags=?, notes=?, resources=?, demands=?,
      relationship_level=?, client_status=?,
      talent_type=?, current_company=?, current_position=?, target_position=?,
      skills=?, experience_years=?, education=?, recruit_status=?, intent_level=?,
      potential_level=?, expected_salary=?, source=?, heart=?, brain=?, mouth=?, hand=?, weight=?,
      lat=?, lng=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name, person_category, relation_types || '', city,
    company, position, industry, phone, email, wechat, birthday, address, tags, notes,
    resources, demands, relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight || 'medium',
    lat, lng, req.params.id
  );
  res.json({ success: true });
});

app.delete('/api/persons/:id', canWrite, (req, res) => {
  if (req.user.role === 'member') {
    const p = db.prepare('SELECT created_by FROM persons WHERE id = ?').get(req.params.id);
    if (p && p.created_by && p.created_by !== req.user.id) return res.status(403).json({ error: '无权删除他人录入的数据' });
  }
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
  const { assigned_to } = req.body;
  db.prepare('UPDATE persons SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(assigned_to || null, req.params.id);
  res.json({ success: true });
});

// 批量导入
app.post('/api/persons/import', (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: '数据为空' });
  }
  const insert = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, city, company, position, industry,
      phone, email, wechat, birthday, address, tags, notes, resources, demands,
      relationship_level, client_status,
      talent_type, current_company, current_position, target_position,
      skills, experience_years, education, recruit_status, intent_level,
      potential_level, expected_salary, source, weight)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const importMany = db.transaction((list) => {
    let ok = 0, skip = 0;
    for (const r of list) {
      if (!r.name) { skip++; continue; }
      insert.run(
        r.name, r.person_category || 'social', r.relation_types || '',
        r.city, r.company, r.position, r.industry,
        r.phone, r.email, r.wechat, r.birthday, r.address, r.tags, r.notes,
        r.resources, r.demands,
        r.relationship_level || 'normal', r.client_status || 'active',
        r.talent_type || 'external', r.current_company, r.current_position, r.target_position,
        r.skills, r.experience_years || null, r.education,
        r.recruit_status || 'potential', r.intent_level || 'low',
        r.potential_level, r.expected_salary, r.source, r.weight || 'medium'
      );
      ok++;
    }
    return { ok, skip };
  });
  const result = importMany(rows);
  res.json(result);
});

// =========== 互动记录 API ===========
app.get('/api/interactions', (req, res) => {
  const { person_id, type, city, weight, importance, date_start, date_end } = req.query;
  let query = `
    SELECT i.*, p.name as person_name, p.person_category, p.company, p.current_company, p.city, p.weight
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (person_id) { query += ' AND i.person_id = ?'; params.push(person_id); }
  if (type) { query += ' AND i.type = ?'; params.push(type); }
  if (city) { query += ' AND p.city LIKE ?'; params.push(`%${city}%`); }
  if (weight) { query += ' AND p.weight = ?'; params.push(weight); }
  if (importance) { query += ' AND i.importance = ?'; params.push(importance); }
  if (date_start) { query += ' AND i.date >= ?'; params.push(date_start); }
  if (date_end) { query += ' AND i.date <= ?'; params.push(date_end); }
  query += ' ORDER BY i.date DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/interactions', (req, res) => {
  const { person_id, type, date, amount, description, outcome, next_action, next_action_date, importance, gift_name,
    opportunity_title, opportunity_status, opportunity_assignee, opportunity_note } = req.body;
  const createdBy = req.user?.id || null;
  const result = db.prepare(`
    INSERT INTO interactions (person_id, type, date, amount, description, outcome, next_action, next_action_date, importance, gift_name,
      opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(person_id, type, date, amount, description, outcome, next_action, next_action_date, importance || 'normal', gift_name || null,
    opportunity_title || null, opportunity_status || null, opportunity_assignee || null, opportunity_note || null, createdBy);

  const interactionId = result.lastInsertRowid;

  // 自动创建跟进提醒
  if (next_action_date && next_action) {
    const remindDate = new Date(next_action_date);
    remindDate.setDate(remindDate.getDate() - 3);
    const remindDateStr = remindDate.toISOString().split('T')[0];
    const title = `跟进: ${next_action}`;
    const existing = db.prepare(`
      SELECT id FROM reminders WHERE person_id=? AND actual_date=? AND title=? AND done=0
    `).get(person_id, next_action_date, title);
    if (existing) {
      db.prepare('UPDATE reminders SET remind_date=?, note=? WHERE id=?').run(remindDateStr, description, existing.id);
    } else {
      db.prepare(`INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note) VALUES (?,?,?,?,'follow_up',?)`)
        .run(person_id, title, remindDateStr, next_action_date, description);
    }
  }

  // 自动创建待跟进任务
  if (opportunity_title && opportunity_assignee) {
    const person = db.prepare('SELECT name FROM persons WHERE id = ?').get(person_id);
    const taskTitle = `${person?.name || '未知人脉'} - ${opportunity_title}`;
    db.prepare(`
      INSERT INTO follow_up_tasks (title, interaction_id, person_id, opportunity_title, opportunity_note, assigned_to, assigned_by)
      VALUES (?,?,?,?,?,?,?)
    `).run(taskTitle, interactionId, person_id, opportunity_title, opportunity_note || null,
      opportunity_assignee, createdBy || 0);
  }

  res.json({ id: interactionId });
});

app.put('/api/interactions/:id', (req, res) => {
  const { type, date, amount, description, outcome, next_action, next_action_date, importance, gift_name,
    opportunity_title, opportunity_status, opportunity_assignee, opportunity_note } = req.body;
  const original = db.prepare('SELECT person_id FROM interactions WHERE id=?').get(req.params.id);
  db.prepare(`
    UPDATE interactions SET type=?, date=?, amount=?, description=?, outcome=?, next_action=?, next_action_date=?, importance=?, gift_name=?,
      opportunity_title=?, opportunity_status=?, opportunity_assignee=?, opportunity_note=?
    WHERE id=?
  `).run(type, date, amount, description, outcome, next_action, next_action_date, importance || 'normal', gift_name || null,
    opportunity_title || null, opportunity_status || null, opportunity_assignee || null, opportunity_note || null,
    req.params.id);

  if (next_action_date && next_action && original) {
    const remindDate = new Date(next_action_date);
    remindDate.setDate(remindDate.getDate() - 3);
    const remindDateStr = remindDate.toISOString().split('T')[0];
    const title = `跟进: ${next_action}`;
    const existing = db.prepare(`
      SELECT id FROM reminders WHERE person_id=? AND actual_date=? AND title=? AND done=0
    `).get(original.person_id, next_action_date, title);
    if (existing) {
      db.prepare('UPDATE reminders SET remind_date=?, note=? WHERE id=?').run(remindDateStr, description, existing.id);
    } else {
      db.prepare(`INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note) VALUES (?,?,?,?,'follow_up',?)`)
        .run(original.person_id, title, remindDateStr, next_action_date, description);
    }
  }
  res.json({ success: true });
});

app.delete('/api/interactions/:id', (req, res) => {
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
      (SELECT COUNT(*) FROM attachments WHERE source_type='interaction' AND source_id=i.id) as attachment_count
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    LEFT JOIN users u ON i.opportunity_assignee = u.id
    LEFT JOIN users ub ON i.created_by = ub.id
    WHERE i.opportunity_title IS NOT NULL AND i.opportunity_title != ''
  `;
  const params1 = [];

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
      NULL as created_by, NULL as created_by_name,
      (SELECT COUNT(*) FROM attachments WHERE source_type='competitor_research' AND source_id=cr.id) as attachment_count
    FROM competitor_research cr
    LEFT JOIN companies c ON cr.company_id = c.id
    LEFT JOIN users u ON cr.opportunity_assignee = u.id
    WHERE cr.opportunity_title IS NOT NULL AND cr.opportunity_title != ''
  `;
  const params2 = [];

  if (status) { query2 += ' AND cr.opportunity_status = ?'; params2.push(status); }
  if (assignee) { query2 += ' AND cr.opportunity_assignee = ?'; params2.push(assignee); }

  try {
    const results1 = db.prepare(query1).all(...params1);
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
  const { opportunity_status, opportunity_assignee, opportunity_note, opportunity_title, source_type } = req.body;

  // 根据来源类型更新不同的表
  if (source_type === 'competitor_research') {
    const original = db.prepare('SELECT * FROM competitor_research WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: '未找到' });

    db.prepare(`
      UPDATE competitor_research SET opportunity_title=?, opportunity_status=?, opportunity_assignee=?, opportunity_note=?
      WHERE id=?
    `).run(
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

    db.prepare(`
      UPDATE interactions SET opportunity_title=?, opportunity_status=?, opportunity_assignee=?, opportunity_note=?
      WHERE id=?
    `).run(
      opportunity_title ?? original.opportunity_title,
      opportunity_status ?? original.opportunity_status,
      opportunity_assignee ?? original.opportunity_assignee,
      opportunity_note ?? original.opportunity_note,
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

  res.json({ success: true });
});

// =========== 待跟进任务 API ===========
app.get('/api/follow-up-tasks', (req, res) => {
  const { status } = req.query;
  const { id: me } = req.user;
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
    WHERE (f.assigned_to = ? OR f.assigned_by = ?)
  `;
  const params = [me, me];
  if (status) { query += ' AND f.status = ?'; params.push(status); }
  query += ' ORDER BY f.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/follow-up-tasks/count', (req, res) => {
  const { id: me } = req.user;
  const cnt = db.prepare(`
    SELECT COUNT(*) as cnt FROM follow_up_tasks WHERE assigned_to = ? AND status != 'done'
  `).get(me).cnt;
  res.json({ count: cnt });
});

app.put('/api/follow-up-tasks/:id', (req, res) => {
  const { status, done_note, due_date } = req.body;
  const task = db.prepare('SELECT * FROM follow_up_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '未找到' });
  if (task.assigned_to !== req.user.id && !isAdmin(req.user.role)) {
    return res.status(403).json({ error: '无权操作' });
  }
  const doneAt = status === 'done' ? new Date().toISOString() : task.done_at;
  db.prepare(`
    UPDATE follow_up_tasks SET status=?, done_note=?, due_date=?, done_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(status ?? task.status, done_note ?? task.done_note, due_date ?? task.due_date, doneAt, req.params.id);
  res.json({ success: true });
});

// =========== 商务任务 API ===========

// 获取可见任务（按角色过滤）
app.get('/api/tasks', (req, res) => {
  const { date, assigned_to, team_id, status, parent_id, mine } = req.query;
  const { id: me, role } = req.user;

  let q = `
    SELECT t.*,
      uc.display_name as created_by_name,
      ua.display_name as assigned_to_name,
      tm.name as team_name,
      p.title as parent_title
    FROM tasks t
    LEFT JOIN users uc ON t.created_by = uc.id
    LEFT JOIN users ua ON t.assigned_to = ua.id
    LEFT JOIN teams tm ON t.team_id = tm.id
    LEFT JOIN tasks p ON t.parent_id = p.id
    WHERE 1=1
  `;
  const params = [];

  // 角色数据过滤
  if (role === 'member') {
    q += ' AND (t.assigned_to = ? OR t.created_by = ?)';
    params.push(me, me);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(me);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      const ids = [...new Set([me, ...members])];
      q += ` AND (t.assigned_to IN (${ids.map(() => '?').join(',')}) OR t.created_by IN (${ids.map(() => '?').join(',')}))`;
      params.push(...ids, ...ids);
    } else {
      q += ' AND (t.assigned_to = ? OR t.created_by = ?)';
      params.push(me, me);
    }
  } else if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(me).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(me).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      const ids = [...new Set([me, ...members])];
      q += ` AND (t.assigned_to IN (${ids.map(() => '?').join(',')}) OR t.created_by IN (${ids.map(() => '?').join(',')}))`;
      params.push(...ids, ...ids);
    }
  }
  // admin: 不过滤

  if (mine === '1') { q += ' AND t.assigned_to = ?'; params.push(me); }
  if (date) { q += ' AND t.date = ?'; params.push(date); }
  if (assigned_to) { q += ' AND t.assigned_to = ?'; params.push(assigned_to); }
  if (team_id) { q += ' AND t.team_id = ?'; params.push(team_id); }
  if (status) { q += ' AND t.status = ?'; params.push(status); }
  if (parent_id === 'null') { q += ' AND t.parent_id IS NULL'; }
  else if (parent_id) { q += ' AND t.parent_id = ?'; params.push(parent_id); }

  q += ' ORDER BY CASE t.priority WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, t.created_at ASC';
  res.json(db.prepare(q).all(...params));
});

// 今日未完成任务数（用于Badge）
app.get('/api/tasks/count', (req, res) => {
  const { id: me } = req.user;
  const today = new Date().toISOString().slice(0, 10);
  const cnt = db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE assigned_to = ? AND date = ? AND status != 'done'
  `).get(me, today).cnt;
  res.json({ count: cnt });
});

// 看板数据（按成员分组，供leader/sales_director使用）
app.get('/api/tasks/board', (req, res) => {
  const { id: me, role } = req.user;
  if (!['leader', 'sales_director', 'admin'].includes(role)) {
    return res.status(403).json({ error: '无权访问看板' });
  }
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // 获取可见成员
  let visibleIds;
  if (isAdmin(role)) {
    visibleIds = db.prepare('SELECT id FROM users WHERE role != ?').all('readonly').map(u => u.id);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(me);
    visibleIds = myUser?.team_id
      ? db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id)
      : [me];
  } else {
    // sales_director
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(me).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(me).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    visibleIds = allTeamIds.length > 0
      ? db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id)
      : [me];
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
  const tasks = db.prepare(`
    SELECT t.*, uc.display_name as created_by_name, p.title as parent_title
    FROM tasks t
    LEFT JOIN users uc ON t.created_by = uc.id
    LEFT JOIN tasks p ON t.parent_id = p.id
    WHERE t.assigned_to IN (${visibleIds.map(() => '?').join(',')}) AND t.date = ?
    ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at ASC
  `).all(...visibleIds, targetDate);

  // 按成员组装
  const board = members.map(m => ({
    ...m,
    tasks: tasks.filter(t => t.assigned_to === m.id),
  }));

  res.json(board);
});

// 创建任务
app.post('/api/tasks', (req, res) => {
  const { title, description, date, priority, assigned_to, team_id, parent_id } = req.body;
  const { id: me, role } = req.user;
  if (!title || !date || !assigned_to) return res.status(400).json({ error: '标题、日期、被指派人必填' });

  // 权限校验：member只能指派给自己
  if (role === 'member' && parseInt(assigned_to) !== me) {
    return res.status(403).json({ error: '普通商务只能给自己创建任务' });
  }
  // leader只能指派给本组成员
  if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(me);
    if (myUser?.team_id) {
      const memberIds = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      if (!memberIds.includes(parseInt(assigned_to)) && parseInt(assigned_to) !== me) {
        return res.status(403).json({ error: '组长只能指派本组成员' });
      }
    }
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

  const r = db.prepare(`
    INSERT INTO tasks (title, description, date, status, priority, created_by, assigned_to, team_id, parent_id, depth)
    VALUES (?,?,?,'pending',?,?,?,?,?,?)
  `).run(title, description || null, date, priority || 'medium', me, assigned_to, resolvedTeamId, parent_id || null, depth);

  res.json({ id: r.lastInsertRowid });
});

// 更新任务
app.put('/api/tasks/:id', (req, res) => {
  const { title, description, status, priority, date, result } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '未找到' });

  const { id: me, role } = req.user;
  // 只有被指派人或创建人可修改
  if (task.assigned_to !== me && task.created_by !== me && !isAdmin(role) && role !== 'sales_director') {
    return res.status(403).json({ error: '无权修改此任务' });
  }

  const doneAt = status === 'done' ? new Date().toISOString() : (status && status !== 'done' ? null : task.done_at);
  db.prepare(`
    UPDATE tasks SET title=?, description=?, status=?, priority=?, date=?, done_at=?, result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(
    title ?? task.title,
    description ?? task.description,
    status ?? task.status,
    priority ?? task.priority,
    date ?? task.date,
    doneAt,
    result !== undefined ? result : task.result,
    req.params.id
  );
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
  db.prepare('DELETE FROM tasks WHERE parent_id = ?').run(req.params.id);
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
  let query = `
    SELECT r.*, p.name as person_name, p.company as person_company, p.current_company
    FROM reminders r
    LEFT JOIN persons p ON r.person_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (done !== undefined && done !== '') { query += ' AND r.done = ?'; params.push(parseInt(done)); }
  if (person_id) { query += ' AND r.person_id = ?'; params.push(person_id); }
  query += ' ORDER BY r.remind_date ASC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/reminders', (req, res) => {
  const { person_id, title, remind_date, actual_date, type, note } = req.body;
  const result = db.prepare(`
    INSERT INTO reminders (person_id, title, remind_date, actual_date, type, note)
    VALUES (?,?,?,?,?,?)
  `).run(person_id, title, remind_date, actual_date, type || 'follow_up', note);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/reminders/:id/done', (req, res) => {
  db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// =========== 统计 API ===========
app.get('/api/stats', (req, res) => {
  const { id: me, role } = req.user;
  const filter = buildUserFilter(me, role, 'p');
  const personCountSql = `SELECT COUNT(*) as cnt FROM persons p WHERE 1=1${filter.sql}`;
  const personCount = db.prepare(personCountSql).get(...filter.params).cnt;
  const categoryStats = db.prepare(`
    SELECT person_category, COUNT(*) as cnt FROM persons GROUP BY person_category
  `).all();
  const userId = req.user?.id;
  const monthlyInteractions = db.prepare(
    "SELECT COUNT(*) as cnt FROM interactions WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now') AND created_by = ?"
  ).get(userId).cnt;
  const monthlyResearch = db.prepare(
    "SELECT COUNT(*) as cnt FROM competitor_research WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now') AND created_by = ?"
  ).get(userId).cnt;
  const monthlyTotal = monthlyInteractions + monthlyResearch;
  const pendingReminders = db.prepare("SELECT COUNT(*) as cnt FROM reminders WHERE done=0 AND remind_date <= date('now', '+7 days')").get().cnt;
  const recentInteractions = db.prepare(`
    SELECT i.*, p.name as person_name, p.person_category
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    ORDER BY i.date DESC LIMIT 5
  `).all();
  res.json({ personCount, categoryStats, monthlyInteractions: monthlyTotal, pendingReminders, recentInteractions });
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
    name TEXT NOT NULL,
    category TEXT,
    status TEXT DEFAULT 'active',
    launch_date TEXT,
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

// =========== 公司研究 API ===========

// 公司
app.get('/api/companies', (req, res) => {
  const { search, category } = req.query;
  let q = 'SELECT * FROM companies WHERE 1=1';
  const p = [];
  if (search) {
    q += ' AND (name LIKE ? OR industry LIKE ? OR tags LIKE ? OR business LIKE ?)';
    const s = `%${search}%`;
    p.push(s, s, s, s);
  }
  if (category) { q += ' AND category = ?'; p.push(category); }
  q += ' ORDER BY updated_at DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/companies/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '未找到' });
  res.json(c);
});

app.post('/api/companies', canWrite, (req, res) => {
  const { name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes } = req.body;
  const r = db.prepare(`
    INSERT INTO companies (name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, category || 'competitor', industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes, req.user.id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/companies/:id', canWrite, (req, res) => {
  const { name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes } = req.body;
  db.prepare(`
    UPDATE companies SET name=?, category=?, industry=?, scale=?, founded_year=?, hq_city=?, website=?,
      business=?, business_model=?, revenue_scale=?, tags=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes, req.params.id);
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
  const recentDynamics = db.prepare(`SELECT * FROM company_dynamics WHERE company_id = ? AND date >= ${since30} ORDER BY date DESC`).all(id);
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
  const r = db.prepare(`
    INSERT INTO company_entities (company_id, name, reg_name, city, business, notes, sort_order)
    VALUES (?,?,?,?,?,?,?)
  `).run(company_id, name, reg_name, city, business, notes, sort_order || 0);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_entities/:id', (req, res) => {
  const { name, reg_name, city, business, notes, sort_order } = req.body;
  db.prepare(`
    UPDATE company_entities SET name=?, reg_name=?, city=?, business=?, notes=?, sort_order=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(name, reg_name, city, business, notes, sort_order || 0, req.params.id);
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
  let q = `SELECT cp.*, p.name as linked_person_name FROM company_personnel cp
    LEFT JOIN persons p ON cp.person_id = p.id WHERE 1=1`;
  const params = [];
  if (company_id) { q += ' AND cp.company_id = ?'; params.push(company_id); }
  if (entity_id === 'null') { q += ' AND cp.entity_id IS NULL'; }
  else if (entity_id) { q += ' AND cp.entity_id = ?'; params.push(entity_id); }
  q += ' ORDER BY cp.importance DESC, cp.level DESC, cp.name ASC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/company_personnel', (req, res) => {
  const { company_id, name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id, notes, manager_id, entity_id } = req.body;
  const r = db.prepare(`
    INSERT INTO company_personnel (company_id, name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id, notes, manager_id, entity_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, name, title, department, level || 'mid', status || 'active', join_date, leave_date, background, skills, importance || 'normal', person_id || null, notes, manager_id || null, entity_id || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_personnel/:id', (req, res) => {
  const { name, title, department, level, status, join_date, leave_date, background, skills, importance, person_id, notes, manager_id, entity_id } = req.body;
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
  const r = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, company, position,
      skills, notes, talent_type, current_company, current_position, recruit_status, intent_level)
    VALUES (?, 'talent', 'talent_external', ?, ?, ?, ?, 'external', ?, ?, 'potential', 'low')
  `).run(cp.name, cp.company_name, cp.title, cp.skills, cp.notes || cp.background, cp.company_name, cp.title);
  // 回写 person_id
  db.prepare('UPDATE company_personnel SET person_id = ? WHERE id = ?').run(r.lastInsertRowid, cp.id);
  res.json({ id: r.lastInsertRowid });
});

// 产品
app.get('/api/company_products', (req, res) => {
  const { company_id, entity_id } = req.query;
  let q = 'SELECT * FROM company_products WHERE 1=1';
  const params = [];
  if (company_id) { q += ' AND company_id = ?'; params.push(company_id); }
  if (entity_id === 'null') { q += ' AND entity_id IS NULL'; }
  else if (entity_id) { q += ' AND entity_id = ?'; params.push(entity_id); }
  q += ' ORDER BY launch_date DESC, created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/company_products', (req, res) => {
  const { company_id, name, category, status, launch_date, description, target_users, core_features, notes, entity_id } = req.body;
  const r = db.prepare(`
    INSERT INTO company_products (company_id, name, category, status, launch_date, description, target_users, core_features, notes, entity_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, name, category, status || 'active', launch_date, description, target_users, core_features, notes, entity_id || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_products/:id', (req, res) => {
  const { name, category, status, launch_date, description, target_users, core_features, notes, entity_id } = req.body;
  db.prepare(`
    UPDATE company_products SET name=?, category=?, status=?, launch_date=?, description=?, target_users=?, core_features=?, notes=?, entity_id=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, category, status, launch_date, description, target_users, core_features, notes, entity_id || null, req.params.id);
  res.json({ success: true });
});

app.delete('/api/company_products/:id', (req, res) => {
  db.prepare('DELETE FROM company_products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 动向
app.get('/api/company_dynamics', (req, res) => {
  const { company_id, type } = req.query;
  let q = 'SELECT * FROM company_dynamics WHERE 1=1';
  const params = [];
  if (company_id) { q += ' AND company_id = ?'; params.push(company_id); }
  if (type) { q += ' AND type = ?'; params.push(type); }
  q += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/company_dynamics', (req, res) => {
  const { company_id, type, title, date, importance, content, source, impact, personnel_id, product_id } = req.body;
  const r = db.prepare(`
    INSERT INTO company_dynamics (company_id, type, title, date, importance, content, source, impact, personnel_id, product_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, type || 'talent', title, date, importance || 'normal', content, source, impact, personnel_id || null, product_id || null);
  // 更新公司 updated_at
  db.prepare('UPDATE companies SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(company_id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/company_dynamics/:id', (req, res) => {
  const { type, title, date, importance, content, source, impact, personnel_id, product_id } = req.body;
  db.prepare(`
    UPDATE company_dynamics SET type=?, title=?, date=?, importance=?, content=?, source=?, impact=?, personnel_id=?, product_id=?
    WHERE id=?
  `).run(type, title, date, importance, content, source, impact, personnel_id || null, product_id || null, req.params.id);
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
  q += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/competitor_research', (req, res) => {
  const { company_id, date, title, importance, content, source, impact, amount, outcome, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee, opportunity_note } = req.body;
  const createdBy = req.user?.id || null;
  const r = db.prepare(`
    INSERT INTO competitor_research (company_id, date, title, importance, content, source, impact, amount, outcome, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee, opportunity_note, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(company_id, date, title, importance || 'normal', content, source, impact, amount || null, outcome, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee || null, opportunity_note, createdBy);
  db.prepare('UPDATE companies SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(company_id);

  // 自动创建待跟进任务（商机指派）
  if (opportunity_title && opportunity_assignee) {
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(company_id);
    const taskTitle = `${company?.name || '未知公司'} - ${opportunity_title}`;
    db.prepare(`
      INSERT INTO follow_up_tasks (title, interaction_id, person_id, competitor_research_id, company_id, opportunity_title, opportunity_note, assigned_to, assigned_by)
      VALUES (?,0,0,?,?,?,?,?,?)
    `).run(taskTitle, r.lastInsertRowid, company_id, opportunity_title, opportunity_note || null,
      opportunity_assignee, req.user.id);
  }

  res.json({ id: r.lastInsertRowid });
});

app.put('/api/competitor_research/:id', (req, res) => {
  const { date, title, importance, content, source, impact, amount, outcome, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee, opportunity_note } = req.body;
  db.prepare(`
    UPDATE competitor_research SET date=?, title=?, importance=?, content=?, source=?, impact=?, amount=?, outcome=?, next_action=?, next_action_date=?, opportunity_title=?, opportunity_status=?, opportunity_assignee=?, opportunity_note=?
    WHERE id=?
  `).run(date, title, importance, content, source, impact, amount || null, outcome, next_action, next_action_date, opportunity_title, opportunity_status, opportunity_assignee || null, opportunity_note, req.params.id);

  // 同步更新待跟进任务
  if (opportunity_title && opportunity_assignee) {
    const existing = db.prepare('SELECT id FROM follow_up_tasks WHERE competitor_research_id = ? AND status != ?').get(req.params.id, 'done');
    if (existing) {
      db.prepare('UPDATE follow_up_tasks SET assigned_to=?, opportunity_title=?, opportunity_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(opportunity_assignee, opportunity_title, opportunity_note || null, existing.id);
    } else {
      const cr = db.prepare('SELECT company_id FROM competitor_research WHERE id = ?').get(req.params.id);
      const company = cr ? db.prepare('SELECT name FROM companies WHERE id = ?').get(cr.company_id) : null;
      const taskTitle = `${company?.name || '未知公司'} - ${opportunity_title}`;
      db.prepare(`
        INSERT INTO follow_up_tasks (title, interaction_id, person_id, competitor_research_id, company_id, opportunity_title, opportunity_note, assigned_to, assigned_by)
        VALUES (?,0,0,?,?,?,?,?,?)
      `).run(taskTitle, req.params.id, cr?.company_id || 0, opportunity_title, opportunity_note || null,
        opportunity_assignee, req.user.id);
    }
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
  res.json(db.prepare(q).all(...params));
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
  const expenses = db.prepare('SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY date ASC').all(req.params.id);
  const report = db.prepare('SELECT * FROM expense_reports WHERE trip_id = ?').get(req.params.id);
  res.json({ ...t, expenses, report });
});

app.post('/api/trips', (req, res) => {
  const { destinations, start_date, end_date, purpose, related_persons, estimated_cost } = req.body;
  const user = db.prepare('SELECT group_id FROM users WHERE id=?').get(req.user.id);
  const r = db.prepare(`
    INSERT INTO business_trips (user_id, group_id, destinations, start_date, end_date, purpose, related_persons, estimated_cost, status)
    VALUES (?,?,?,?,?,?,?,?,'draft')
  `).run(req.user.id, user?.group_id || null, destinations, start_date, end_date, purpose, related_persons || '', estimated_cost || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/trips/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到' });
  if (t.user_id !== req.user.id && !isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  if (!['draft', 'rejected'].includes(t.status)) return res.status(400).json({ error: '当前状态不可编辑' });
  const { destinations, start_date, end_date, purpose, related_persons, estimated_cost } = req.body;
  db.prepare(`
    UPDATE business_trips SET destinations=?, start_date=?, end_date=?, purpose=?, related_persons=?, estimated_cost=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(destinations, start_date, end_date, purpose, related_persons || '', estimated_cost || null, req.params.id);
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
  db.prepare(`
    UPDATE business_trips SET status=?, approve_note=?, approved_by=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(action, note || '', req.user.id, req.params.id);
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
  res.json(db.prepare('SELECT * FROM trip_expenses WHERE trip_id=? ORDER BY date ASC').all(req.params.id));
});

app.post('/api/trips/:id/expenses', (req, res) => {
  const t = db.prepare('SELECT * FROM business_trips WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到' });
  if (!['approved', 'completed'].includes(t.status)) return res.status(400).json({ error: '出差审批通过后才能录入费用' });
  const { type, date, amount, description } = req.body;
  const r = db.prepare('INSERT INTO trip_expenses (trip_id, type, date, amount, description) VALUES (?,?,?,?,?)')
    .run(req.params.id, type, date, amount, description);
  // 更新报销单总额
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM trip_expenses WHERE trip_id=?').get(req.params.id).t;
  db.prepare('UPDATE expense_reports SET total_amount=?, updated_at=CURRENT_TIMESTAMP WHERE trip_id=?').run(total, req.params.id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/trip_expenses/:id', (req, res) => {
  const { type, date, amount, description } = req.body;
  const exp = db.prepare('SELECT trip_id FROM trip_expenses WHERE id=?').get(req.params.id);
  db.prepare('UPDATE trip_expenses SET type=?, date=?, amount=?, description=? WHERE id=?').run(type, date, amount, description, req.params.id);
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
  const alerts = db.prepare(`
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
    GROUP BY p.id
    HAVING last_trip_date IS NULL OR days_since > 60
    ORDER BY days_since DESC
    LIMIT 20
  `).all();

  res.json({ monthly, byType, byUser, byGroup, alerts });
});

// =========== 目标管理 API ===========
// 获取目标列表
app.get('/api/goals', (req, res) => {
  const { department, quarter, status, goal_type, period, parent_id } = req.query;
  const { id: userId, role } = req.user;

  let q = 'SELECT g.*, u.display_name as owner_name FROM goals g LEFT JOIN users u ON g.owner_id = u.id WHERE 1=1';
  const params = [];

  // 角色过滤：member 只看自己的，leader 看本组的，sales_director 看辖区的，admin 看全部
  if (role === 'member') {
    q += ' AND g.owner_id = ?';
    params.push(userId);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      q += ` AND g.owner_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    } else {
      q += ' AND g.owner_id = ?';
      params.push(userId);
    }
  } else if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      q += ` AND g.owner_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    }
  }

  if (department) { q += ' AND g.department = ?'; params.push(department); }
  if (quarter) { q += ' AND g.quarter = ?'; params.push(quarter); }
  if (status) { q += ' AND g.status = ?'; params.push(status); }
  if (goal_type) { q += ' AND g.goal_type = ?'; params.push(goal_type); }
  if (period) { q += ' AND g.period = ?'; params.push(period); }
  if (parent_id !== undefined) {
    if (parent_id === 'null') {
      q += ' AND g.parent_id IS NULL';
    } else {
      q += ' AND g.parent_id = ?';
      params.push(parent_id);
    }
  }

  q += ' ORDER BY g.period DESC, g.created_at DESC';
  const goals = db.prepare(q).all(...params);

  // 为每个目标加载子目标数量
  goals.forEach(g => {
    const childCount = db.prepare('SELECT COUNT(*) as cnt FROM goals WHERE parent_id = ?').get(g.id);
    g.child_count = childCount.cnt;
  });

  res.json(goals);
});

// 创建目标
app.post('/api/goals', (req, res) => {
  const { title, description, owner_id, department, deadline, goal_type, period, parent_id } = req.body;
  if (!title || !owner_id || !goal_type || !period) {
    return res.status(400).json({ error: '标题、负责人、目标类型、周期必填' });
  }

  const result = db.prepare(`
    INSERT INTO goals (title, description, owner_id, department, deadline, goal_type, period, parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description, owner_id, department, deadline, goal_type, period, parent_id || null);

  res.json({ id: result.lastInsertRowid });
});

// 更新目标
app.put('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, owner_id, department, deadline, progress, status, goal_type, period } = req.body;

  db.prepare(`
    UPDATE goals SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      owner_id = COALESCE(?, owner_id),
      department = COALESCE(?, department),
      deadline = COALESCE(?, deadline),
      progress = COALESCE(?, progress),
      status = COALESCE(?, status),
      goal_type = COALESCE(?, goal_type),
      period = COALESCE(?, period),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, owner_id, department, deadline, progress, status, goal_type, period, id);

  res.json({ success: true });
});

// 删除目标（级联删除子目标）
app.delete('/api/goals/:id', (req, res) => {
  const { id } = req.params;
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
    // 普通成员只能看自己的
    q += ' AND wr.user_id = ?';
    params.push(userId);
  } else if (role === 'leader') {
    // 组长看本组成员的周报
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      q += ` AND wr.user_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    } else {
      q += ' AND wr.user_id = ?';
      params.push(userId);
    }
  } else if (role === 'sales_director') {
    // 总监看辖区内的周报
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      q += ` AND wr.user_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    }
  }
  // admin 看全部，不加过滤

  if (week_start) { q += ' AND wr.week_start = ?'; params.push(week_start); }
  if (department) { q += ' AND u.department = ?'; params.push(department); }

  q += ' ORDER BY wr.week_start DESC, u.display_name ASC';
  res.json(db.prepare(q).all(...params));
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
    `).run(week_end, completed, next_week_plan, risks, existing.id);
    res.json({ id: existing.id, updated: true });
  } else {
    // 新建
    const result = db.prepare(`
      INSERT INTO weekly_reports (user_id, week_start, week_end, completed, next_week_plan, risks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id, week_start, week_end, completed, next_week_plan, risks);
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
    q += ' AND (l.assignee_id = ? OR l.created_by = ?)';
    params.push(userId, userId);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      q += ` AND (l.assignee_id IN (${members.map(() => '?').join(',')}) OR l.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    } else {
      q += ' AND (l.assignee_id = ? OR l.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      q += ` AND (l.assignee_id IN (${members.map(() => '?').join(',')}) OR l.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    }
  }

  if (status) { q += ' AND l.status = ?'; params.push(status); }
  if (assignee_id) { q += ' AND l.assignee_id = ?'; params.push(assignee_id); }
  if (priority) { q += ' AND l.priority = ?'; params.push(priority); }
  if (source_type) { q += ' AND l.source_type = ?'; params.push(source_type); }

  q += ' ORDER BY l.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

// 获取可关联的线索列表（用于研发任务来源选择）
app.get('/api/leads/simple', (req, res) => {
  const leads = db.prepare('SELECT id, title, status FROM leads WHERE status != ? ORDER BY created_at DESC LIMIT 100').all('closed');
  res.json(leads);
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
    SELECT s.*, u.display_name as owner_name
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

  res.json({ ...lead, strategies, devTasks });
});

// 创建线索
app.post('/api/leads', (req, res) => {
  const { title, source, source_type, contact_person, contact_company, contact_info, description, assignee_id, priority } = req.body;
  const { id: userId } = req.user;

  if (!title) return res.status(400).json({ error: '线索标题必填' });

  const result = db.prepare(`
    INSERT INTO leads (title, source, source_type, contact_person, contact_company, contact_info, description, assignee_id, priority, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, source, source_type, contact_person, contact_company, contact_info, description, assignee_id, priority, userId);

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
  const { title, source, source_type, contact_person, contact_company, contact_info, description, status, assignee_id, priority } = req.body;

  db.prepare(`
    UPDATE leads SET
      title = COALESCE(?, title),
      source = COALESCE(?, source),
      source_type = COALESCE(?, source_type),
      contact_person = COALESCE(?, contact_person),
      contact_company = COALESCE(?, contact_company),
      contact_info = COALESCE(?, contact_info),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      assignee_id = COALESCE(?, assignee_id),
      priority = COALESCE(?, priority),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, source, source_type, contact_person, contact_company, contact_info, description, status, assignee_id, priority, id);

  res.json({ success: true });
});

// 删除线索
app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  res.json({ success: true });
});

// =========== 策略管理 API ===========
// 获取策略列表
app.get('/api/strategies', (req, res) => {
  const { dimension, role_type, budget_group_type, status } = req.query;
  const { id: userId, role } = req.user;

  let q = `
    SELECT s.*, u.display_name as owner_name,
      CASE
        WHEN s.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = s.source_id)
        ELSE NULL
      END as source_title
    FROM strategies s
    LEFT JOIN users u ON s.owner_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // 角色过滤
  if (role === 'member') {
    q += ' AND s.owner_id = ?';
    params.push(userId);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      q += ` AND s.owner_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    } else {
      q += ' AND s.owner_id = ?';
      params.push(userId);
    }
  } else if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      q += ` AND s.owner_id IN (${members.map(() => '?').join(',')})`;
      params.push(...members);
    }
  }

  if (dimension) { q += ' AND s.dimension = ?'; params.push(dimension); }
  if (role_type) { q += ' AND s.role_type = ?'; params.push(role_type); }
  if (budget_group_type) { q += ' AND s.budget_group_type = ?'; params.push(budget_group_type); }
  if (status) { q += ' AND s.status = ?'; params.push(status); }

  q += ' ORDER BY s.created_at DESC';
  res.json(db.prepare(q).all(...params));
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
        WHEN s.source_type = 'lead' THEN (SELECT title FROM leads WHERE id = s.source_id)
        ELSE NULL
      END as source_title
    FROM strategies s
    LEFT JOIN users u ON s.owner_id = u.id
    WHERE s.id = ?
  `).get(id);

  if (!strategy) return res.status(404).json({ error: '策略不存在' });

  // 获取关联的研发任务
  const devTasks = db.prepare(`
    SELECT dt.*, u.display_name as assignee_name
    FROM dev_tasks dt
    LEFT JOIN users u ON dt.assignee_id = u.id
    WHERE dt.source_type = 'strategy' AND dt.source_id = ?
    ORDER BY dt.created_at DESC
  `).all(id);

  res.json({ ...strategy, devTasks });
});

// 创建策略
app.post('/api/strategies', (req, res) => {
  const { title, dimension, role_type, budget_group_type, description, owner_id, source_type, source_id } = req.body;
  if (!title || !dimension) return res.status(400).json({ error: '标题和维度必填' });

  const result = db.prepare(`
    INSERT INTO strategies (title, dimension, role_type, budget_group_type, description, owner_id, source_type, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, dimension, role_type, budget_group_type, description, owner_id, source_type, source_id);

  res.json({ id: result.lastInsertRowid });
});

// 更新策略
app.put('/api/strategies/:id', (req, res) => {
  const { id } = req.params;
  const { title, dimension, role_type, budget_group_type, description, owner_id, status, source_type, source_id } = req.body;

  db.prepare(`
    UPDATE strategies SET
      title = COALESCE(?, title),
      dimension = COALESCE(?, dimension),
      role_type = COALESCE(?, role_type),
      budget_group_type = COALESCE(?, budget_group_type),
      description = COALESCE(?, description),
      owner_id = COALESCE(?, owner_id),
      status = COALESCE(?, status),
      source_type = COALESCE(?, source_type),
      source_id = COALESCE(?, source_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, dimension, role_type, budget_group_type, description, owner_id, status, source_type, source_id, id);

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
  const { status, assignee_id, priority, source_type } = req.query;
  const { id: userId, role } = req.user;

  let q = `
    SELECT dt.*,
      u.display_name as assignee_name,
      c.display_name as creator_name,
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
  if (role === 'member') {
    q += ' AND (dt.assignee_id = ? OR dt.created_by = ?)';
    params.push(userId, userId);
  } else if (role === 'leader') {
    const myUser = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId);
    if (myUser?.team_id) {
      const members = db.prepare('SELECT id FROM users WHERE team_id = ?').all(myUser.team_id).map(u => u.id);
      q += ` AND (dt.assignee_id IN (${members.map(() => '?').join(',')}) OR dt.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    } else {
      q += ' AND (dt.assignee_id = ? OR dt.created_by = ?)';
      params.push(userId, userId);
    }
  } else if (role === 'sales_director') {
    const myTeams = db.prepare('SELECT team_id FROM director_teams WHERE director_id = ?').all(userId).map(r => r.team_id);
    const ledTeams = db.prepare('SELECT id FROM teams WHERE leader_id = ?').all(userId).map(r => r.id);
    const allTeamIds = [...new Set([...myTeams, ...ledTeams])];
    if (allTeamIds.length > 0) {
      const members = db.prepare(`SELECT id FROM users WHERE team_id IN (${allTeamIds.map(() => '?').join(',')})`).all(...allTeamIds).map(u => u.id);
      q += ` AND (dt.assignee_id IN (${members.map(() => '?').join(',')}) OR dt.created_by IN (${members.map(() => '?').join(',')}))`;
      params.push(...members, ...members);
    }
  }

  if (status) { q += ' AND dt.status = ?'; params.push(status); }
  if (assignee_id) { q += ' AND dt.assignee_id = ?'; params.push(assignee_id); }
  if (priority) { q += ' AND dt.priority = ?'; params.push(priority); }
  if (source_type) { q += ' AND dt.source_type = ?'; params.push(source_type); }

  q += ' ORDER BY dt.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

// 创建研发任务
app.post('/api/dev-tasks', (req, res) => {
  const { title, description, source_type, source_id, assignee_id, priority, estimated_hours, start_date, due_date } = req.body;
  const { id: userId } = req.user;

  if (!title) return res.status(400).json({ error: '任务标题必填' });

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
  const { title, description, source_type, source_id, assignee_id, status, priority, estimated_hours, actual_hours, start_date, due_date, completed_date } = req.body;
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
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, source_type, source_id, assignee_id, status, priority, estimated_hours, actual_hours, start_date, due_date, completed_date, id);

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

  let query = `
    SELECT * FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND importance IN ('high', 'vip')
  `;
  const params = [];

  if (potential_rating) {
    query += ' AND potential_rating = ?';
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
  res.json(talents);
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
  res.json(dynamics);
});

// 获取重点客户列表
app.get('/api/executive/key-customers', requireExecutive, (req, res) => {
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
      AND p.importance IN ('high', 'vip')
    ORDER BY days_since_last_contact DESC
  `).all();

  res.json(customers);
});

// 获取经营概览数据
app.get('/api/executive/overview', requireExecutive, (req, res) => {
  // 高级人才数量
  const talentCount = db.prepare(`
    SELECT COUNT(*) as count FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND importance IN ('high', 'vip')
  `).get().count;

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
      AND importance IN ('high', 'vip')
  `).get().count;

  // 高级人才最近动态（最近更新的5条）
  const recentTalents = db.prepare(`
    SELECT name, current_company, current_position, recruit_status, intent_level, updated_at
    FROM persons
    WHERE person_category = 'talent'
      AND relation_types LIKE '%talent_external%'
      AND importance IN ('high', 'vip')
    ORDER BY updated_at DESC
    LIMIT 5
  `).all();

  // 竞争公司最新动态（最近5条）
  const recentDynamics = db.prepare(`
    SELECT
      cd.title, cd.date, cd.type, cd.impact_analysis,
      c.name as company_name
    FROM company_dynamics cd
    LEFT JOIN companies c ON cd.company_id = c.id
    WHERE c.category = 'competitor'
      AND cd.importance = 'high'
    ORDER BY cd.date DESC
    LIMIT 5
  `).all();

  // 重点客户预警（超过30天未联系）
  const customerAlerts = db.prepare(`
    SELECT
      p.name, p.company,
      i.date as last_interaction_date,
      i.type as last_interaction_type,
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
      AND p.importance IN ('high', 'vip')
      AND (i.date IS NULL OR julianday('now') - julianday(i.date) > 30)
    ORDER BY days_since_last_contact DESC
    LIMIT 5
  `).all();

  res.json({
    talentCount,
    dynamicsCount,
    customerCount,
    recentTalents,
    recentDynamics,
    customerAlerts
  });
});

// 获取经营周报列表
app.get('/api/executive/reports', requireExecutive, (req, res) => {
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
  res.json(reports);
});

// 获取单个经营周报
app.get('/api/executive/reports/:id', requireExecutive, (req, res) => {
  const { id } = req.params;
  const report = db.prepare('SELECT * FROM executive_reports WHERE id = ?').get(id);

  if (!report) {
    return res.status(404).json({ error: '报告不存在' });
  }

  res.json(report);
});

// 创建经营周报
app.post('/api/executive/reports', requireExecutive, (req, res) => {
  const { id: userId } = req.user;
  const {
    report_type, meeting_date, year, month, week,
    weekly_results, key_judgment, decision_needed, next_week_actions,
    key_issues, decisions,
    strategic_direction, key_focus, monthly_summary
  } = req.body;

  if (!report_type || !meeting_date || !year || !month) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  // 获取所有高管 ID
  const executives = db.prepare("SELECT id FROM users WHERE executive_role IS NOT NULL").all();
  const attendees = JSON.stringify(executives.map(e => e.id));

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
    weekly_results, key_judgment, decision_needed, next_week_actions,
    key_issues, decisions,
    strategic_direction, key_focus, monthly_summary,
    attendees, userId
  );

  res.json({ id: result.lastInsertRowid });
});

// 更新经营周报
app.put('/api/executive/reports/:id', requireExecutive, (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  const {
    meeting_date, year, month, week,
    weekly_results, key_judgment, decision_needed, next_week_actions,
    key_issues, decisions,
    strategic_direction, key_focus, monthly_summary
  } = req.body;

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
    weekly_results, key_judgment, decision_needed, next_week_actions,
    key_issues, decisions,
    strategic_direction, key_focus, monthly_summary,
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
    const r = insert.run(source_type, source_id, f.originalname, f.filename, f.mimetype, f.size, req.user.id);
    return { id: r.lastInsertRowid, filename: f.originalname, filepath: f.filename, size: f.size, mimetype: f.mimetype };
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
  res.json(rows);
});

app.get('/api/attachments/:id/download', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
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

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // 只有非 API 路由才返回 index.html
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    } else {
      next();
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://[你的IP]:${PORT}`);
});
