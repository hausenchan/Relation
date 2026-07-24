const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const Database = require('./database');
const {
  TASK_COMPLETION_REPAIR_MIGRATION_KEY,
  applyTaskCompletionRepairMigration,
} = require('./taskCompletion');

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

test('MySQL repairs only completion times backed by status-transition logs', {
  skip: RUN_MYSQL_TESTS ? false : 'set RELATION_RUN_MYSQL_TESTS=1 to run isolated MySQL integration tests',
  timeout: 30000,
}, async t => {
  const mysqlConfig = getMysqlConfig();
  const databaseName = `relation_task_completion_${process.pid}_${Date.now()}`;
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
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      done_at DATETIME,
      updated_at DATETIME
    );
    CREATE TABLE follow_up_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      done_at DATETIME,
      updated_at DATETIME
    );
    CREATE TABLE operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type TEXT NOT NULL,
      business_id TEXT,
      target_table TEXT,
      status_before TEXT,
      status_after TEXT,
      details_json TEXT,
      success INTEGER DEFAULT 1,
      created_at DATETIME
    );
  `);

  db.prepare("INSERT INTO tasks (id, status, done_at, updated_at) VALUES (1, 'done', '2026-07-24 10:00:00', '2026-07-24 10:00:00')").run();
  db.prepare("INSERT INTO tasks (id, status, done_at, updated_at) VALUES (2, 'done', '2026-07-24 11:00:00', '2026-07-24 11:00:00')").run();
  db.prepare("INSERT INTO tasks (id, status, done_at, updated_at) VALUES (3, 'done', '2026-07-24 12:00:00', '2026-07-24 12:00:00')").run();
  db.prepare("INSERT INTO follow_up_tasks (id, status, done_at, updated_at) VALUES (4, 'done', '2026-07-24 13:00:00', '2026-07-24 13:00:00')").run();

  const insertLog = db.prepare(`
    INSERT INTO operation_logs (
      business_type, business_id, target_table, status_before, status_after, details_json, success, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);
  insertLog.run('商务任务', '1', 'tasks', 'status: in_progress', 'status: done', null, '2026-06-19 18:30:00');
  insertLog.run('商务任务', '1', 'tasks', null, null, JSON.stringify({ body: { title: '改名', status: 'done' } }), '2026-07-24 10:00:00');
  insertLog.run('商务任务', '2', 'tasks', 'status: pending', 'status: done', null, '2026-07-24 11:00:00');
  insertLog.run('待跟进任务', '4', 'follow_up_tasks', 'status: in_progress', 'status: done', null, '2026-06-20 17:00:00');
  insertLog.run('待跟进任务', '4', 'follow_up_tasks', null, null, JSON.stringify({ body: { status: 'done', done_note: '改备注' } }), '2026-07-24 13:00:02');

  const result = applyTaskCompletionRepairMigration({ db, isMysql: true, logger: () => {} });
  assert.equal(result.skipped, false);
  assert.deepEqual(result.corrections, {
    tasks: 1,
    follow_up_tasks: 1,
    evidence_transitions: 3,
    rewrite_evidence: 2,
  });
  assert.deepEqual(db.prepare('SELECT done_at, updated_at FROM tasks WHERE id = 1').get(), {
    done_at: '2026-06-19 18:30:00',
    updated_at: '2026-07-24 10:00:00',
  });
  assert.equal(db.prepare('SELECT done_at FROM tasks WHERE id = 2').get().done_at, '2026-07-24 11:00:00');
  assert.equal(db.prepare('SELECT done_at FROM tasks WHERE id = 3').get().done_at, '2026-07-24 12:00:00');
  assert.equal(
    db.prepare('SELECT done_at FROM follow_up_tasks WHERE id = 4').get().done_at,
    '2026-06-20 17:00:00',
  );

  const marker = db.prepare('SELECT migration_key FROM relation_migrations WHERE migration_key = ?')
    .get(TASK_COMPLETION_REPAIR_MIGRATION_KEY);
  assert.equal(marker.migration_key, TASK_COMPLETION_REPAIR_MIGRATION_KEY);
  assert.equal(
    applyTaskCompletionRepairMigration({ db, isMysql: true, logger: () => {} }).reason,
    'already-applied',
  );
});
