const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server start timeout\n${output}`)), 15000);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('服务器启动在')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}\n${output}`));
    });
  });
}

async function request(baseUrl, route, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

function body(id, content) {
  return {
    format: 'relation_document_blocks_v1',
    blocks: [{ id, type: 'paragraph', content, meta: {} }],
  };
}

test('goal and weekly report APIs preserve large content, conflicts, and encrypted history', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-document-capabilities-'));
  const databasePath = path.join(tempDir, 'data.db');
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      RELATION_DB_PATH: databasePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  const token = login.payload.token;
  const adminId = Number(login.payload.user.id);
  const initialDescription = body('goal-a', '初始目标内容');
  const updatedDescription = body('goal-a', '协作者更新后的目标内容');

  const createdGoal = await request(baseUrl, '/api/goals', {
    method: 'POST',
    token,
    body: {
      title: '初始目标',
      description: JSON.stringify(initialDescription),
      result: JSON.stringify(body('goal-result', '')),
      owner_id: adminId,
      scope_type: 'company',
      goal_type: 'quarter',
      period: '2026-Q3',
      progress: 0,
      status: 'pending',
    },
  });
  assert.equal(createdGoal.status, 200, JSON.stringify(createdGoal.payload));
  const goalId = Number(createdGoal.payload.id);

  const updatedGoal = await request(baseUrl, `/api/goals/${goalId}`, {
    method: 'PUT',
    token,
    body: {
      title: '更新后的目标',
      description: JSON.stringify(updatedDescription),
      base_updated_at: createdGoal.payload.updated_at,
    },
  });
  assert.equal(updatedGoal.status, 200, JSON.stringify(updatedGoal.payload));

  const staleGoalSave = await request(baseUrl, `/api/goals/${goalId}`, {
    method: 'PUT',
    token,
    body: {
      title: '过期客户端覆盖',
      base_updated_at: createdGoal.payload.updated_at,
    },
  });
  assert.equal(staleGoalSave.status, 409);
  assert.equal(staleGoalSave.payload.code, 'CONTENT_CONFLICT');
  assert.equal(staleGoalSave.payload.latest.title, '更新后的目标');

  const goalHistory = await request(baseUrl, `/api/goals/${goalId}/history`, { token });
  assert.equal(goalHistory.status, 200, JSON.stringify(goalHistory.payload));
  assert.equal(goalHistory.payload.can_restore, 1);
  assert.ok(goalHistory.payload.revisions.length >= 2);
  assert.equal('snapshot_json' in goalHistory.payload.revisions[0], false);
  assert.deepEqual(
    goalHistory.payload.revisions[0].change_items.map(item => item.label),
    ['目标标题', '目标描述'],
  );
  const initialGoalRevision = goalHistory.payload.revisions.at(-1);
  const restoredGoal = await request(
    baseUrl,
    `/api/goals/${goalId}/history/${initialGoalRevision.id}/restore`,
    { method: 'POST', token },
  );
  assert.equal(restoredGoal.status, 200, JSON.stringify(restoredGoal.payload));
  assert.equal(restoredGoal.payload.title, '初始目标');
  assert.equal(restoredGoal.payload.description, JSON.stringify(initialDescription));

  const largeText = '大内容'.repeat(50000);
  const initialWeeklyBody = body('weekly-a', largeText);
  const createdWeeklyReport = await request(baseUrl, '/api/weekly-reports', {
    method: 'POST',
    token,
    body: {
      user_id: adminId,
      week_start: '2026-07-20',
      week_end: '2026-07-26',
      completed: JSON.stringify(initialWeeklyBody),
      next_week_plan: JSON.stringify(body('weekly-plan', '下周计划')),
      risks: JSON.stringify(body('weekly-risk', '')),
    },
  });
  assert.equal(createdWeeklyReport.status, 200, JSON.stringify(createdWeeklyReport.payload));
  assert.equal(createdWeeklyReport.payload.completed, JSON.stringify(initialWeeklyBody));
  const weeklyReportId = Number(createdWeeklyReport.payload.id);

  const collidingWeeklyCreate = await request(baseUrl, '/api/weekly-reports', {
    method: 'POST',
    token,
    body: {
      user_id: adminId,
      week_start: '2026-07-20',
      week_end: '2026-07-26',
      completed: JSON.stringify(body('weekly-collision', '并发新建内容')),
      next_week_plan: createdWeeklyReport.payload.next_week_plan,
      risks: createdWeeklyReport.payload.risks,
      base_updated_at: null,
    },
  });
  assert.equal(collidingWeeklyCreate.status, 409);
  assert.equal(collidingWeeklyCreate.payload.code, 'CONTENT_CONFLICT');

  const updatedWeeklyReport = await request(baseUrl, '/api/weekly-reports', {
    method: 'POST',
    token,
    body: {
      user_id: adminId,
      week_start: '2026-07-20',
      week_end: '2026-07-26',
      completed: JSON.stringify(body('weekly-a', '第二版周报')),
      next_week_plan: createdWeeklyReport.payload.next_week_plan,
      risks: createdWeeklyReport.payload.risks,
      base_updated_at: createdWeeklyReport.payload.updated_at,
    },
  });
  assert.equal(updatedWeeklyReport.status, 200, JSON.stringify(updatedWeeklyReport.payload));

  const staleWeeklySave = await request(baseUrl, '/api/weekly-reports', {
    method: 'POST',
    token,
    body: {
      user_id: adminId,
      week_start: '2026-07-20',
      week_end: '2026-07-26',
      completed: JSON.stringify(body('weekly-a', '过期客户端覆盖')),
      next_week_plan: createdWeeklyReport.payload.next_week_plan,
      risks: createdWeeklyReport.payload.risks,
      base_updated_at: createdWeeklyReport.payload.updated_at,
    },
  });
  assert.equal(staleWeeklySave.status, 409);
  assert.equal(staleWeeklySave.payload.code, 'CONTENT_CONFLICT');

  const weeklyHistory = await request(baseUrl, `/api/weekly-reports/${weeklyReportId}/history`, { token });
  assert.equal(weeklyHistory.status, 200, JSON.stringify(weeklyHistory.payload));
  assert.ok(weeklyHistory.payload.revisions.length >= 2);
  assert.ok(weeklyHistory.payload.revisions[0].change_items.some(item => (
    item.label === '本周完成' && item.after === '第二版周报'
  )));
  const initialWeeklyRevision = weeklyHistory.payload.revisions.at(-1);
  const restoredWeeklyReport = await request(
    baseUrl,
    `/api/weekly-reports/${weeklyReportId}/history/${initialWeeklyRevision.id}/restore`,
    { method: 'POST', token },
  );
  assert.equal(restoredWeeklyReport.status, 200, JSON.stringify(restoredWeeklyReport.payload));
  assert.equal(restoredWeeklyReport.payload.completed, JSON.stringify(initialWeeklyBody));

  const db = new Database(databasePath, { readonly: true });
  const revisionRows = db.prepare('SELECT snapshot_json FROM content_revisions').all();
  db.close();
  assert.ok(revisionRows.length >= 6);
  assert.ok(revisionRows.every(row => String(row.snapshot_json).startsWith('enc:v1:')));
});
