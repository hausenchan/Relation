const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'relation-app-secret-2026';

app.use(cors());
app.use(express.json());

// 除登录接口外，所有 /api 路由都需要 JWT 鉴权
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  return auth(req, res, next);
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

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

const companyCols = db.prepare("PRAGMA table_info(companies)").all().map(c => c.name);
if (companyCols.length > 0 && !companyCols.includes('created_by')) {
  db.exec("ALTER TABLE companies ADD COLUMN created_by INTEGER DEFAULT NULL");
}

// users 表加 leader_id
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (userCols.length > 0 && !userCols.includes('leader_id')) {
  db.exec("ALTER TABLE users ADD COLUMN leader_id INTEGER DEFAULT NULL");
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
  // member 只看自己的申请；leader 看自己组员的申请；admin 看全部
  if (req.user.role === 'member') {
    q += ' AND gr.requester_id = ?'; params.push(req.user.id);
  } else if (req.user.role === 'leader') {
    // 找该 leader 下的所有 member id
    const members = db.prepare('SELECT id FROM users WHERE leader_id = ?').all(req.user.id).map(u => u.id);
    members.push(req.user.id);
    q += ` AND gr.requester_id IN (${members.map(() => '?').join(',')})`;
    params.push(...members);
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
  if (req_.requester_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  db.prepare('DELETE FROM gift_requests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 审核申请（leader / admin）
app.post('/api/gift_requests/:id/review', (req, res) => {
  if (req.user.role !== 'leader' && req.user.role !== 'admin') return res.status(403).json({ error: '无审核权限' });
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
  if (req.user.role === 'member') {
    q += ' AND gr.sender_id = ?'; params.push(req.user.id);
  } else if (req.user.role === 'leader') {
    const members = db.prepare('SELECT id FROM users WHERE leader_id = ?').all(req.user.id).map(u => u.id);
    members.push(req.user.id);
    q += ` AND gr.sender_id IN (${members.map(() => '?').join(',')})`;
    params.push(...members);
  }
  if (status) { q += ' AND gr.status = ?'; params.push(status); }
  q += ' ORDER BY gr.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.put('/api/gift_records/:id', (req, res) => {
  const { status, feedback, rating, send_date } = req.body;
  const record = db.prepare('SELECT * FROM gift_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '未找到' });
  if (record.sender_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'leader') {
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

// =========== JWT 鉴权中间件 ===========
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: '未登录' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

// 仅 admin 可访问
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}

// 只读校验（readonly/guest 不能写）
function canWrite(req, res, next) {
  if (req.user.role === 'readonly') return res.status(403).json({ error: '只读账号无法操作' });
  if (req.user.role === 'guest') return res.status(403).json({ error: '访客无法操作' });
  next();
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
    { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  // 查模块权限
  const modulePerms = db.prepare('SELECT * FROM user_module_perms WHERE user_id = ?').all(user.id);
  res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, modulePerms } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, last_login FROM users WHERE id = ?').get(req.user.id);
  const modulePerms = db.prepare('SELECT * FROM user_module_perms WHERE user_id = ?').all(req.user.id);
  res.json({ ...user, modulePerms });
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
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ success: true });
});

// =========== 用户管理 API（admin only）===========
app.get('/api/users', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, created_at, last_login FROM users ORDER BY created_at ASC').all();
  const perms = db.prepare('SELECT * FROM user_module_perms').all();
  res.json(users.map(u => ({ ...u, modulePerms: perms.filter(p => p.user_id === u.id) })));
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, display_name, role, modulePerms, leader_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = db.prepare("INSERT INTO users (username, password_hash, display_name, role, leader_id) VALUES (?,?,?,?,?)").run(username, hash, display_name, role || 'member', leader_id || null);
    if (role === 'guest' && modulePerms?.length) {
      const ins = db.prepare("INSERT OR REPLACE INTO user_module_perms (user_id, module, can_read, can_write) VALUES (?,?,?,?)");
      modulePerms.forEach(p => ins.run(r.lastInsertRowid, p.module, p.can_read ? 1 : 0, p.can_write ? 1 : 0));
    }
    res.json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: '用户名已存在' });
  }
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const { display_name, role, password, modulePerms, leader_id } = req.body;
  if (password) {
    db.prepare('UPDATE users SET display_name=?, role=?, password_hash=?, leader_id=? WHERE id=?').run(display_name, role, bcrypt.hashSync(password, 10), leader_id || null, req.params.id);
  } else {
    db.prepare('UPDATE users SET display_name=?, role=?, leader_id=? WHERE id=?').run(display_name, role, leader_id || null, req.params.id);
  }
  if (role === 'guest') {
    db.prepare('DELETE FROM user_module_perms WHERE user_id = ?').run(req.params.id);
    if (modulePerms?.length) {
      const ins = db.prepare("INSERT OR REPLACE INTO user_module_perms (user_id, module, can_read, can_write) VALUES (?,?,?,?)");
      modulePerms.forEach(p => ins.run(req.params.id, p.module, p.can_read ? 1 : 0, p.can_write ? 1 : 0));
    }
  }
  res.json({ success: true });
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM user_module_perms WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========== 人脉 API ===========
app.get('/api/persons', (req, res) => {
  const { search, person_category, relation_type, potential_level, recruit_status, intent_level, city, weight } = req.query;
  let query = 'SELECT * FROM persons WHERE 1=1';
  const params = [];

  // member 只能看自己录入的
  if (req.user.role === 'member') {
    query += ' AND (created_by = ? OR created_by IS NULL)';
    params.push(req.user.id);
  }

  if (search) {
    query += ' AND (name LIKE ? OR company LIKE ? OR current_company LIKE ? OR phone LIKE ? OR tags LIKE ? OR skills LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }
  if (person_category) { query += ' AND person_category = ?'; params.push(person_category); }
  if (relation_type) { query += ' AND (relation_types = ? OR relation_types LIKE ? OR relation_types LIKE ? OR relation_types LIKE ?)'; params.push(relation_type, `${relation_type},%`, `%,${relation_type}`, `%,${relation_type},%`); }
  if (potential_level) { query += ' AND potential_level = ?'; params.push(potential_level); }
  if (recruit_status) { query += ' AND recruit_status = ?'; params.push(recruit_status); }
  if (intent_level) { query += ' AND intent_level = ?'; params.push(intent_level); }
  if (city) { query += ' AND city LIKE ?'; params.push(`%${city}%`); }
  if (weight) { query += ' AND weight = ?'; params.push(weight); }

  query += ' ORDER BY updated_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/persons/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '未找到' });
  res.json(p);
});

app.post('/api/persons', canWrite, (req, res) => {
  const {
    name, person_category, relation_types, city, company, position, industry,
    phone, email, wechat, birthday, address, tags, notes, resources, demands,
    relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight
  } = req.body;
  const result = db.prepare(`
    INSERT INTO persons (name, person_category, relation_types, city, company, position, industry,
      phone, email, wechat, birthday, address, tags, notes, resources, demands,
      relationship_level, client_status,
      talent_type, current_company, current_position, target_position,
      skills, experience_years, education, recruit_status, intent_level,
      potential_level, expected_salary, source, heart, brain, mouth, hand, weight, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, person_category || 'social', relation_types || '', city,
    company, position, industry, phone, email, wechat, birthday, address, tags, notes,
    resources, demands, relationship_level || 'normal', client_status || 'active',
    talent_type || 'external', current_company, current_position, target_position,
    skills, experience_years, education, recruit_status || 'potential', intent_level || 'low',
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight || 'medium', req.user.id
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/persons/:id', canWrite, (req, res) => {
  // member 只能改自己录入的
  if (req.user.role === 'member') {
    const p = db.prepare('SELECT created_by FROM persons WHERE id = ?').get(req.params.id);
    if (p && p.created_by && p.created_by !== req.user.id) return res.status(403).json({ error: '无权修改他人录入的数据' });
  }
  const {
    name, person_category, relation_types, city, company, position, industry,
    phone, email, wechat, birthday, address, tags, notes, resources, demands,
    relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight
  } = req.body;
  db.prepare(`
    UPDATE persons SET name=?, person_category=?, relation_types=?, city=?, company=?, position=?, industry=?,
      phone=?, email=?, wechat=?, birthday=?, address=?, tags=?, notes=?, resources=?, demands=?,
      relationship_level=?, client_status=?,
      talent_type=?, current_company=?, current_position=?, target_position=?,
      skills=?, experience_years=?, education=?, recruit_status=?, intent_level=?,
      potential_level=?, expected_salary=?, source=?, heart=?, brain=?, mouth=?, hand=?, weight=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name, person_category, relation_types || '', city,
    company, position, industry, phone, email, wechat, birthday, address, tags, notes,
    resources, demands, relationship_level, client_status,
    talent_type, current_company, current_position, target_position,
    skills, experience_years, education, recruit_status, intent_level,
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight || 'medium',
    req.params.id
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
  const { person_id, type, date, amount, description, outcome, next_action, next_action_date, importance } = req.body;
  const result = db.prepare(`
    INSERT INTO interactions (person_id, type, date, amount, description, outcome, next_action, next_action_date, importance)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(person_id, type, date, amount, description, outcome, next_action, next_action_date, importance || 'normal');

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
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/interactions/:id', (req, res) => {
  const { type, date, amount, description, outcome, next_action, next_action_date, importance } = req.body;
  const original = db.prepare('SELECT person_id FROM interactions WHERE id=?').get(req.params.id);
  db.prepare(`
    UPDATE interactions SET type=?, date=?, amount=?, description=?, outcome=?, next_action=?, next_action_date=?, importance=?
    WHERE id=?
  `).run(type, date, amount, description, outcome, next_action, next_action_date, importance || 'normal', req.params.id);

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
  const personCount = db.prepare('SELECT COUNT(*) as cnt FROM persons').get().cnt;
  const categoryStats = db.prepare(`
    SELECT person_category, COUNT(*) as cnt FROM persons GROUP BY person_category
  `).all();
  const interactionCount = db.prepare('SELECT COUNT(*) as cnt FROM interactions').get().cnt;
  const pendingReminders = db.prepare("SELECT COUNT(*) as cnt FROM reminders WHERE done=0 AND remind_date <= date('now', '+7 days')").get().cnt;
  const recentInteractions = db.prepare(`
    SELECT i.*, p.name as person_name, p.person_category
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    ORDER BY i.date DESC LIMIT 5
  `).all();
  res.json({ personCount, categoryStats, interactionCount, pendingReminders, recentInteractions });
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

if (process.env.NODE_ENV === 'production') {
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://[你的IP]:${PORT}`);
});
