const Database = require('../lib/database');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS boss_watch_target (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boss_company_id TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    keyword_memo TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS boss_watch_position (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boss_position_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    city TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    synced_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS boss_watch_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    position_id TEXT NOT NULL,
    boss_company_id TEXT NOT NULL,
    candidates_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS boss_watch_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    boss_company_id TEXT NOT NULL,
    company_name TEXT DEFAULT '',
    position_id TEXT DEFAULT '',
    position_title TEXT DEFAULT '',
    candidate_name TEXT DEFAULT '',
    candidate_title TEXT DEFAULT '',
    candidate_city TEXT DEFAULT '',
    candidate_status TEXT DEFAULT '',
    detail_json TEXT DEFAULT '{}',
    pushed INTEGER DEFAULT 0,
    handle_status TEXT DEFAULT 'new',
    handled_by INTEGER,
    handled_at TEXT,
    person_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS boss_watch_job_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'running',
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    started_at TEXT DEFAULT (datetime('now', 'localtime')),
    finished_at TEXT,
    total_count INTEGER DEFAULT 0,
    matched_count INTEGER DEFAULT 0,
    event_count INTEGER DEFAULT 0,
    error TEXT DEFAULT '',
    progress TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS boss_watch_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_id INTEGER,
    action TEXT NOT NULL,
    extra TEXT,
    at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshot_date_pos ON boss_watch_snapshot(snapshot_date, position_id);
  CREATE INDEX IF NOT EXISTS idx_snapshot_company ON boss_watch_snapshot(boss_company_id);
  CREATE INDEX IF NOT EXISTS idx_event_company ON boss_watch_event(boss_company_id);
  CREATE INDEX IF NOT EXISTS idx_event_created ON boss_watch_event(created_at);
  CREATE INDEX IF NOT EXISTS idx_job_log_started ON boss_watch_job_log(started_at);
  CREATE INDEX IF NOT EXISTS idx_access_log_event ON boss_watch_access_log(event_id);
  CREATE INDEX IF NOT EXISTS idx_access_log_at ON boss_watch_access_log(at);
`);

// 兼容老数据库：补字段
try {
  const cols = db.prepare("PRAGMA table_info(boss_watch_event)").all().map(c => c.name);
  if (!cols.includes('handle_status')) {
    db.exec("ALTER TABLE boss_watch_event ADD COLUMN handle_status TEXT DEFAULT 'new'");
  }
  if (!cols.includes('handled_by')) {
    db.exec("ALTER TABLE boss_watch_event ADD COLUMN handled_by INTEGER");
  }
  if (!cols.includes('handled_at')) {
    db.exec("ALTER TABLE boss_watch_event ADD COLUMN handled_at TEXT");
  }
  if (!cols.includes('person_id')) {
    db.exec("ALTER TABLE boss_watch_event ADD COLUMN person_id INTEGER");
  }
  if (!cols.includes('alert_hit')) {
    db.exec("ALTER TABLE boss_watch_event ADD COLUMN alert_hit INTEGER DEFAULT 0");
  }
  if (!cols.includes('alert_keywords')) {
    db.exec("ALTER TABLE boss_watch_event ADD COLUMN alert_keywords TEXT DEFAULT ''");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_event_handle_status ON boss_watch_event(handle_status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_event_alert_hit ON boss_watch_event(alert_hit)');
} catch (e) {
  console.error('[boss-watcher] migrate handle_status failed:', e.message);
}

module.exports = db;
