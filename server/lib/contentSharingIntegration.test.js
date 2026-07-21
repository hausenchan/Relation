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

async function login(baseUrl, username, password) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload;
}

async function createUser(baseUrl, token, input) {
  const response = await request(baseUrl, '/api/users', {
    method: 'POST',
    token,
    body: {
      password: 'share-test-123',
      role: 'member',
      ...input,
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return Number(response.payload.id);
}

function documentBody(id, content) {
  return JSON.stringify({
    format: 'relation_document_blocks_v1',
    blocks: [{ id, type: 'paragraph', content, meta: {} }],
  });
}

test('goal and weekly report sharing supports user, department, team, and project group access', { timeout: 45000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-content-sharing-'));
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
  const admin = await login(baseUrl, 'admin', 'admin123');
  const adminToken = admin.token;
  const adminId = Number(admin.user.id);

  const teamResponse = await request(baseUrl, '/api/teams', {
    method: 'POST',
    token: adminToken,
    body: { name: '共享测试小组', department: 'commercial' },
  });
  assert.equal(teamResponse.status, 200, JSON.stringify(teamResponse.payload));
  const teamId = Number(teamResponse.payload.id);

  const projectResponse = await request(baseUrl, '/api/project-groups', {
    method: 'POST',
    token: adminToken,
    body: { name: '共享测试项目组', code: 'SHARE_TEST' },
  });
  assert.equal(projectResponse.status, 200, JSON.stringify(projectResponse.payload));
  const projectGroupId = Number(projectResponse.payload.id);

  const actors = [
    {
      key: 'user',
      username: 'share_direct',
      display_name: '个人共享成员',
      department: 'general',
      share: userId => ({ target_type: 'user', target_id: userId }),
    },
    {
      key: 'department',
      username: 'share_department',
      display_name: '部门共享成员',
      department: 'rd',
      share: () => ({ target_type: 'department', target_key: 'rd' }),
    },
    {
      key: 'team',
      username: 'share_team',
      display_name: '小组共享成员',
      department: 'commercial',
      team_ids: [teamId],
      share: () => ({ target_type: 'team', target_id: teamId }),
    },
    {
      key: 'project_group',
      username: 'share_project',
      display_name: '项目组共享成员',
      department: 'general',
      project_group_ids: [projectGroupId],
      share: () => ({ target_type: 'project_group', target_id: projectGroupId }),
    },
  ];

  for (const actor of actors) {
    actor.id = await createUser(baseUrl, adminToken, actor);
    actor.token = (await login(baseUrl, actor.username, 'share-test-123')).token;
  }
  const outsiderId = await createUser(baseUrl, adminToken, {
    username: 'share_outsider',
    display_name: '未共享成员',
    department: 'hr',
  });
  const outsiderToken = (await login(baseUrl, 'share_outsider', 'share-test-123')).token;

  const goals = [];
  for (let index = 0; index < actors.length; index += 1) {
    const actor = actors[index];
    const created = await request(baseUrl, '/api/goals', {
      method: 'POST',
      token: adminToken,
      body: {
        title: `${actor.key} 共享目标`,
        description: documentBody(`goal-${actor.key}`, '目标内容'),
        result: documentBody(`goal-result-${actor.key}`, ''),
        owner_id: adminId,
        scope_type: 'company',
        goal_type: 'quarter',
        period: `2027-Q${index + 1}`,
        shares: [actor.share(actor.id)],
      },
    });
    assert.equal(created.status, 200, JSON.stringify(created.payload));
    goals.push(created.payload);

    const actorGoals = await request(baseUrl, '/api/goals', { token: actor.token });
    assert.equal(actorGoals.status, 200, JSON.stringify(actorGoals.payload));
    assert.ok(actorGoals.payload.some(goal => Number(goal.id) === Number(created.payload.id)));
    const sharedGoal = actorGoals.payload.find(goal => Number(goal.id) === Number(created.payload.id));
    assert.equal(sharedGoal.can_edit, 1);
    assert.equal(sharedGoal.can_share, 1);
    assert.equal(sharedGoal.can_delete, 0);
  }

  const outsiderGoalsBefore = await request(baseUrl, '/api/goals', { token: outsiderToken });
  assert.equal(outsiderGoalsBefore.status, 200);
  assert.equal(outsiderGoalsBefore.payload.some(goal => goals.some(item => Number(item.id) === Number(goal.id))), false);

  const directGoal = goals[0];
  const sharedGoalManagementUpdate = await request(baseUrl, `/api/goals/${directGoal.id}`, {
    method: 'PUT',
    token: actors[0].token,
    body: {
      period: '2028-Q1',
      base_updated_at: directGoal.updated_at,
    },
  });
  assert.equal(sharedGoalManagementUpdate.status, 403);

  const updatedGoal = await request(baseUrl, `/api/goals/${directGoal.id}`, {
    method: 'PUT',
    token: actors[0].token,
    body: {
      title: '个人共享成员已编辑',
      base_updated_at: directGoal.updated_at,
    },
  });
  assert.equal(updatedGoal.status, 200, JSON.stringify(updatedGoal.payload));
  assert.equal(updatedGoal.payload.title, '个人共享成员已编辑');

  const adminManagementUpdate = await request(baseUrl, `/api/goals/${directGoal.id}`, {
    method: 'PUT',
    token: adminToken,
    body: {
      period: '2028-Q1',
      base_updated_at: updatedGoal.payload.updated_at,
    },
  });
  assert.equal(adminManagementUpdate.status, 200, JSON.stringify(adminManagementUpdate.payload));
  const goalHistory = await request(baseUrl, `/api/goals/${directGoal.id}/history`, {
    token: actors[0].token,
  });
  assert.equal(goalHistory.status, 200, JSON.stringify(goalHistory.payload));
  const originalGoalRevision = goalHistory.payload.revisions.at(-1);
  const sharedGoalManagementRestore = await request(
    baseUrl,
    `/api/goals/${directGoal.id}/history/${originalGoalRevision.id}/restore`,
    { method: 'POST', token: actors[0].token },
  );
  assert.equal(sharedGoalManagementRestore.status, 403);

  const sharedGoalDelete = await request(baseUrl, `/api/goals/${directGoal.id}`, {
    method: 'DELETE',
    token: actors[0].token,
  });
  assert.equal(sharedGoalDelete.status, 403);

  const goalShareUpdate = await request(baseUrl, `/api/goals/${directGoal.id}/shares`, {
    method: 'PUT',
    token: actors[0].token,
    body: {
      shares: [
        actors[0].share(actors[0].id),
        { target_type: 'user', target_id: outsiderId },
      ],
    },
  });
  assert.equal(goalShareUpdate.status, 200, JSON.stringify(goalShareUpdate.payload));
  const outsiderGoal = await request(baseUrl, `/api/goals/${directGoal.id}`, { token: outsiderToken });
  assert.equal(outsiderGoal.status, 200, JSON.stringify(outsiderGoal.payload));
  assert.equal(outsiderGoal.payload.can_edit, 1);

  const weeklyReports = [];
  for (let index = 0; index < actors.length; index += 1) {
    const actor = actors[index];
    const weekStart = `2027-0${index + 1}-04`;
    const weekEnd = `2027-0${index + 1}-10`;
    const created = await request(baseUrl, '/api/weekly-reports', {
      method: 'POST',
      token: adminToken,
      body: {
        user_id: adminId,
        week_start: weekStart,
        week_end: weekEnd,
        completed: documentBody(`weekly-${actor.key}`, '本周完成'),
        next_week_plan: documentBody(`weekly-plan-${actor.key}`, '下周计划'),
        risks: documentBody(`weekly-risk-${actor.key}`, ''),
        shares: [actor.share(actor.id)],
      },
    });
    assert.equal(created.status, 200, JSON.stringify(created.payload));
    weeklyReports.push(created.payload);

    const actorReports = await request(baseUrl, '/api/weekly-reports', { token: actor.token });
    assert.equal(actorReports.status, 200, JSON.stringify(actorReports.payload));
    const sharedReport = actorReports.payload.find(report => Number(report.id) === Number(created.payload.id));
    assert.ok(sharedReport, `${actor.key} shared report is missing`);
    assert.equal(sharedReport.can_edit, 1);
    assert.equal(sharedReport.can_share, 1);
    assert.equal(sharedReport.can_delete, 0);
  }

  const outsiderReportsBefore = await request(baseUrl, '/api/weekly-reports', { token: outsiderToken });
  assert.equal(outsiderReportsBefore.status, 200);
  assert.equal(outsiderReportsBefore.payload.some(report => weeklyReports.some(item => Number(item.id) === Number(report.id))), false);

  const directReport = weeklyReports[0];
  const updatedReport = await request(baseUrl, '/api/weekly-reports', {
    method: 'POST',
    token: actors[0].token,
    body: {
      user_id: adminId,
      week_start: directReport.week_start,
      week_end: directReport.week_end,
      completed: documentBody('weekly-user', '共享成员已编辑'),
      next_week_plan: directReport.next_week_plan,
      risks: directReport.risks,
      base_updated_at: directReport.updated_at,
    },
  });
  assert.equal(updatedReport.status, 200, JSON.stringify(updatedReport.payload));

  const weeklyShareUpdate = await request(baseUrl, `/api/weekly-reports/${directReport.id}/shares`, {
    method: 'PUT',
    token: actors[0].token,
    body: {
      shares: [
        actors[0].share(actors[0].id),
        { target_type: 'user', target_id: outsiderId },
      ],
    },
  });
  assert.equal(weeklyShareUpdate.status, 200, JSON.stringify(weeklyShareUpdate.payload));
  const outsiderReportsAfter = await request(baseUrl, '/api/weekly-reports', { token: outsiderToken });
  assert.ok(outsiderReportsAfter.payload.some(report => Number(report.id) === Number(directReport.id)));

  const sharedReportDelete = await request(baseUrl, `/api/weekly-reports/${directReport.id}`, {
    method: 'DELETE',
    token: actors[0].token,
  });
  assert.equal(sharedReportDelete.status, 403);

  const db = new Database(databasePath, { readonly: true });
  const targetTypes = db.prepare(`
    SELECT DISTINCT target_type
    FROM content_shares
    ORDER BY target_type
  `).all().map(row => row.target_type);
  db.close();
  assert.deepEqual(targetTypes, ['department', 'project_group', 'team', 'user']);
});
