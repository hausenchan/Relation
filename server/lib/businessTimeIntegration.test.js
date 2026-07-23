const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const Database = require('./database');
const {
  BUSINESS_TIME_MIGRATION_KEY,
  applyBusinessTimeMigration,
} = require('./businessTimeMigration');

const RUN_MYSQL_TESTS = process.env.RELATION_RUN_MYSQL_TESTS === '1';

function getMysqlConfig() {
  return {
    host: process.env.RELATION_TEST_MYSQL_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.RELATION_TEST_MYSQL_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.RELATION_TEST_MYSQL_USER || process.env.MYSQL_USER || 'root',
    password: process.env.RELATION_TEST_MYSQL_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
    connectTimeout: 5000,
  };
}

test('MySQL writes business time consistently and repairs only evidence-backed UTC rows', {
  skip: RUN_MYSQL_TESTS ? false : 'set RELATION_RUN_MYSQL_TESTS=1 to run isolated MySQL integration tests',
  timeout: 30000,
}, async t => {
  const mysqlConfig = getMysqlConfig();
  const databaseName = `relation_business_time_${process.pid}_${Date.now()}`;
  const admin = await mysql.createConnection(mysqlConfig);
  await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const envKeys = ['DB_CLIENT', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE', 'MYSQL_TIMEZONE'];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    DB_CLIENT: 'mysql',
    MYSQL_HOST: mysqlConfig.host,
    MYSQL_PORT: String(mysqlConfig.port),
    MYSQL_USER: mysqlConfig.user,
    MYSQL_PASSWORD: mysqlConfig.password,
    MYSQL_DATABASE: databaseName,
    MYSQL_TIMEZONE: '+08:00',
  });
  const db = new Database();

  t.after(async () => {
    db.close();
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
    envKeys.forEach(key => {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    });
  });

  db.exec(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE document_edit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      edited_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT,
      target_table TEXT,
      status_after TEXT,
      success INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME,
      done_at DATETIME
    );
    CREATE TABLE follow_up_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME,
      done_at DATETIME
    );
    CREATE TABLE goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE weekly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE content_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      scope_key TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE operational_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE operational_meeting_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE operational_meeting_agendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE operational_meeting_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE document_change_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      changed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE mobile_task_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collected_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE time_probe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      default_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      explicit_at DATETIME
    );
  `);

  db.prepare('INSERT INTO time_probe (explicit_at) VALUES (?)')
    .run('2026-07-23T02:29:00Z');
  const probe = db.prepare('SELECT default_at, explicit_at, @@session.time_zone AS session_timezone FROM time_probe').get();
  assert.equal(probe.explicit_at, '2026-07-23 10:29:00');
  assert.equal(probe.session_timezone, '+08:00');

  db.prepare("INSERT INTO documents (id, updated_at) VALUES (1, '2026-07-23 02:29:00')").run();
  db.prepare("INSERT INTO document_edit_records (document_id, edited_at, created_at) VALUES (1, '2026-07-23 10:29:00', '2026-07-23 10:29:00')").run();
  db.prepare("INSERT INTO media_assets (id, created_at, updated_at) VALUES (1, '2026-07-22 20:00:00', '2026-07-23 02:29:00')").run();
  db.prepare("INSERT INTO media_assets (id, created_at, updated_at) VALUES (2, '2026-07-23 10:20:00', '2026-07-23 10:20:00')").run();
  db.prepare("INSERT INTO operation_logs (business_id, target_table, success, created_at) VALUES ('1', 'media_assets', 1, '2026-07-23 10:29:00')").run();
  db.prepare("INSERT INTO tasks (id, started_at, done_at) VALUES (1, '2026-07-23 02:20:00', '2026-07-23 02:29:00')").run();
  db.prepare("INSERT INTO follow_up_tasks (id, started_at, done_at) VALUES (1, '2026-07-23 02:20:00', '2026-07-23 02:29:00')").run();
  ['tasks', 'follow_up_tasks'].forEach(table => {
    db.prepare('INSERT INTO operation_logs (business_id, target_table, status_after, success, created_at) VALUES (?, ?, ?, 1, ?)')
      .run('1', table, 'in_progress', '2026-07-23 10:20:00');
    db.prepare('INSERT INTO operation_logs (business_id, target_table, status_after, success, created_at) VALUES (?, ?, ?, 1, ?)')
      .run('1', table, 'done', '2026-07-23 10:29:00');
  });

  const revisionFixtures = [
    ['goals', 'goal', 1, 'main'],
    ['weekly_reports', 'weekly_report', 1, 'main'],
    ['operational_meetings', 'operational_meeting', 1, 'agenda'],
  ];
  revisionFixtures.forEach(([table, entityType, id, scope]) => {
    db.prepare(`INSERT INTO ${table} (id, updated_at) VALUES (?, ?)`).run(id, '2026-07-23 02:29:00');
    db.prepare('INSERT INTO content_revisions (entity_type, entity_id, scope_key, created_at) VALUES (?, ?, ?, ?)')
      .run(entityType, id, scope, '2026-07-23 10:29:00');
  });
  db.prepare("INSERT INTO operational_meeting_sections (id, updated_at) VALUES (5, '2026-07-23 02:29:00')").run();
  db.prepare("INSERT INTO content_revisions (entity_type, entity_id, scope_key, created_at) VALUES ('operational_meeting', 1, 'section:5', '2026-07-23 10:29:00')").run();
  db.prepare("INSERT INTO operational_meeting_agendas (id, meeting_id, updated_at) VALUES (1, 1, '2026-07-23 02:29:00')").run();
  db.prepare("INSERT INTO operational_meeting_decisions (id, meeting_id, updated_at) VALUES (1, 1, '2026-07-23 02:29:00')").run();
  db.prepare("INSERT INTO content_revisions (entity_type, entity_id, scope_key, created_at) VALUES ('operational_meeting', 1, 'decision', '2026-07-23 10:29:00')").run();
  db.prepare("INSERT INTO document_change_logs (changed_at, created_at) VALUES ('2026-07-23 02:29:00', '2026-07-23 10:29:00')").run();
  db.prepare("INSERT INTO mobile_task_records (collected_at, created_at) VALUES ('2026-07-23 02:29:00', '2026-07-23 10:29:00')").run();

  const result = applyBusinessTimeMigration({ db, isMysql: true, logger: () => {} });
  assert.equal(result.skipped, false);
  assert.equal(db.prepare('SELECT updated_at FROM documents WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM media_assets WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM media_assets WHERE id = 2').get().updated_at, '2026-07-23 10:20:00');
  assert.deepEqual(
    db.prepare('SELECT started_at, done_at FROM tasks WHERE id = 1').get(),
    { started_at: '2026-07-23 10:20:00', done_at: '2026-07-23 10:29:00' },
  );
  assert.deepEqual(
    db.prepare('SELECT started_at, done_at FROM follow_up_tasks WHERE id = 1').get(),
    { started_at: '2026-07-23 10:20:00', done_at: '2026-07-23 10:29:00' },
  );
  assert.equal(db.prepare('SELECT updated_at FROM goals WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM weekly_reports WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM operational_meetings WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM operational_meeting_sections WHERE id = 5').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM operational_meeting_agendas WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT updated_at FROM operational_meeting_decisions WHERE id = 1').get().updated_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT changed_at FROM document_change_logs WHERE id = 1').get().changed_at, '2026-07-23 10:29:00');
  assert.equal(db.prepare('SELECT collected_at FROM mobile_task_records WHERE id = 1').get().collected_at, '2026-07-23 10:29:00');

  const marker = db.prepare('SELECT migration_key FROM relation_migrations WHERE migration_key = ?')
    .get(BUSINESS_TIME_MIGRATION_KEY);
  assert.equal(marker.migration_key, BUSINESS_TIME_MIGRATION_KEY);
  assert.equal(applyBusinessTimeMigration({ db, isMysql: true, logger: () => {} }).reason, 'already-applied');
});
