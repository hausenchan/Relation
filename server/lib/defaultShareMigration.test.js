const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeLegacyDefaultSharesBulk,
  normalizeDefaultUserIds,
} = require('./defaultShareMigration');

function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function createRecordingMysqlDatabase(runChanges) {
  const calls = [];
  let runIndex = 0;
  return {
    calls,
    prepare(sql) {
      const statement = compactSql(sql);
      return {
        run(...params) {
          calls.push({ statement, params });
          const changes = Number(runChanges[runIndex] || 0);
          runIndex += 1;
          return { changes };
        },
      };
    },
    transaction(callback) {
      return (...args) => callback(...args);
    },
  };
}

test('normalizes unique default user share ids', () => {
  assert.deepEqual(normalizeDefaultUserIds([
    { target_type: 'user', target_id: 13 },
    { target_type: 'team', target_id: 2 },
    { target_type: 'user', target_id: '13' },
    { target_type: 'user', target_id: 16 },
  ]), [13, 16]);
});

test('bulk migration uses a fixed number of MySQL set operations', () => {
  const db = createRecordingMysqlDatabase([
    249, 250, 250,
    249, 250, 250,
    250, 250, 250,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
  ]);
  const options = {
    db,
    defaultShares: [
      { target_type: 'user', target_id: 13 },
      { target_type: 'user', target_id: 16 },
    ],
    documentVersion: 2,
    contentVersion: 1,
    contentEntityTables: {
      goal: 'goals',
      weekly_report: 'weekly_reports',
    },
  };
  const first = initializeLegacyDefaultSharesBulk(options);
  assert.deepEqual(first, {
    documentSharesAdded: 499,
    documentsInitialized: 250,
    contentSharesAdded: 999,
    contentEntitiesInitialized: 500,
  });
  assert.deepEqual(initializeLegacyDefaultSharesBulk(options), {
    documentSharesAdded: 0,
    documentsInitialized: 0,
    contentSharesAdded: 0,
    contentEntitiesInitialized: 0,
  });

  assert.equal(db.calls.length, 18);
  const firstRunCalls = db.calls.slice(0, 9);
  assert.equal(firstRunCalls.filter(call => call.statement.startsWith('INSERT INTO document_shares')).length, 2);
  assert.equal(firstRunCalls.filter(call => call.statement.startsWith('INSERT INTO content_shares')).length, 4);
  assert.ok(firstRunCalls.every(call => !call.statement.startsWith('SELECT id FROM')));
  firstRunCalls
    .filter(call => call.statement.startsWith('INSERT INTO'))
    .forEach(call => {
      assert.match(call.statement, /INSERT INTO .* SELECT /);
      assert.match(call.statement, /NOT EXISTS/);
    });
});

test('rejects content migration targets outside the fixed MySQL tables', () => {
  const db = createRecordingMysqlDatabase([0, 0, 0]);
  assert.throws(() => initializeLegacyDefaultSharesBulk({
    db,
    defaultShares: [{ target_type: 'user', target_id: 13 }],
    documentVersion: 2,
    contentVersion: 1,
    contentEntityTables: { goal: 'users' },
  }), /Unsupported default-share migration target/);
});
