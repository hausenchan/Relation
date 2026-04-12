const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

const db = new Database(path.join(__dirname, 'data.db'));

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
if (!existingCols.includes('weight')) {
  db.exec("ALTER TABLE persons ADD COLUMN weight TEXT DEFAULT 'medium'");
}

const cpCols = db.prepare("PRAGMA table_info(company_personnel)").all().map(c => c.name);
if (!cpCols.includes('manager_id')) {
  db.exec("ALTER TABLE company_personnel ADD COLUMN manager_id INTEGER DEFAULT NULL");
}
if (!cpCols.includes('entity_id')) {
  db.exec("ALTER TABLE company_personnel ADD COLUMN entity_id INTEGER DEFAULT NULL");
}

const prCols = db.prepare("PRAGMA table_info(company_products)").all().map(c => c.name);
if (!prCols.includes('entity_id')) {
  db.exec("ALTER TABLE company_products ADD COLUMN entity_id INTEGER DEFAULT NULL");
}

// =========== 人脉 API ===========
app.get('/api/persons', (req, res) => {
  const { search, person_category, relation_type, potential_level, recruit_status, intent_level } = req.query;
  let query = 'SELECT * FROM persons WHERE 1=1';
  const params = [];

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

  query += ' ORDER BY updated_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/persons/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '未找到' });
  res.json(p);
});

app.post('/api/persons', (req, res) => {
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
      potential_level, expected_salary, source, heart, brain, mouth, hand, weight)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, person_category || 'social', relation_types || '', city,
    company, position, industry, phone, email, wechat, birthday, address, tags, notes,
    resources, demands, relationship_level || 'normal', client_status || 'active',
    talent_type || 'external', current_company, current_position, target_position,
    skills, experience_years, education, recruit_status || 'potential', intent_level || 'low',
    potential_level, expected_salary, source, heart, brain, mouth, hand, weight || 'medium'
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/persons/:id', (req, res) => {
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

app.delete('/api/persons/:id', (req, res) => {
  db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM interactions WHERE person_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reminders WHERE person_id = ?').run(req.params.id);
  // 解除公司人员的人脉库关联
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
  const { person_id, type } = req.query;
  let query = `
    SELECT i.*, p.name as person_name, p.person_category, p.company, p.current_company
    FROM interactions i
    LEFT JOIN persons p ON i.person_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (person_id) { query += ' AND i.person_id = ?'; params.push(person_id); }
  if (type) { query += ' AND i.type = ?'; params.push(type); }
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

app.post('/api/companies', (req, res) => {
  const { name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes } = req.body;
  const r = db.prepare(`
    INSERT INTO companies (name, category, industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, category || 'competitor', industry, scale, founded_year, hq_city, website, business, business_model, revenue_scale, tags, notes);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/companies/:id', (req, res) => {
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
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://[你的IP]:${PORT}`);
});
