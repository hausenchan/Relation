const Database = require('better-sqlite3');
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
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshot_date_pos ON boss_watch_snapshot(snapshot_date, position_id);
  CREATE INDEX IF NOT EXISTS idx_snapshot_company ON boss_watch_snapshot(boss_company_id);
  CREATE INDEX IF NOT EXISTS idx_event_company ON boss_watch_event(boss_company_id);
  CREATE INDEX IF NOT EXISTS idx_event_created ON boss_watch_event(created_at);
`);

module.exports = db;
