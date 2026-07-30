const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

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
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('服务器启动在')) {
        clearTimeout(timeout);
        resolve();
      }
    });
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
  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`${method} ${route} returned ${response.status}: ${responseText.slice(0, 200)}`);
  }
  return { status: response.status, payload };
}

async function login(baseUrl, username = 'admin', password = 'admin123') {
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
      password: input.password,
      role: 'member',
      ...input,
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return Number(response.payload.id);
}

async function stopServer(child) {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
  }
}

async function startServer(databasePath) {
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
  await waitForServer(child);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test('legacy opportunity records backfill follow-up task descriptions and assigner notifications', { timeout: 60000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-legacy-opportunity-'));
  const databasePath = path.join(tempDir, 'data.db');
  const children = [];

  t.after(async () => {
    await Promise.all(children.map(stopServer));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let server = await startServer(databasePath);
  children.push(server.child);
  let baseUrl = server.baseUrl;
  const admin = await login(baseUrl);
  const suffix = `${process.pid}_${Date.now()}`;
  const password = 'legacy-opportunity-123';
  const creatorUsername = `legacy_creator_${suffix}`;
  const workerUsername = `legacy_worker_${suffix}`;
  const creatorId = await createUser(baseUrl, admin.token, {
    username: creatorUsername,
    display_name: '旧商机创建人',
    password,
  });
  const workerId = await createUser(baseUrl, admin.token, {
    username: workerUsername,
    display_name: '旧商机执行人',
    password,
  });
  const creator = await login(baseUrl, creatorUsername, password);

  const person = await request(baseUrl, '/api/persons', {
    method: 'POST',
    token: creator.token,
    body: { name: `旧互动商机人脉 ${suffix}`, company: `旧互动商机公司 ${suffix}`, person_category: 'business' },
  });
  assert.equal(person.status, 200, JSON.stringify(person.payload));

  const interaction = await request(baseUrl, '/api/interactions', {
    method: 'POST',
    token: creator.token,
    body: {
      person_id: Number(person.payload.id),
      type: 'meeting',
      date: '2026-07-30',
      importance: 'normal',
      description: '旧互动描述',
      outcome: '旧互动结果',
      opportunity_title: '旧互动商机',
      opportunity_status: 'new',
      opportunity_assignee: workerId,
    },
  });
  assert.equal(interaction.status, 200, JSON.stringify(interaction.payload));
  const interactionId = Number(interaction.payload.id);

  const company = await request(baseUrl, '/api/companies', {
    method: 'POST',
    token: creator.token,
    body: { name: `旧公司研究客户 ${suffix}`, category: 'client' },
  });
  assert.equal(company.status, 200, JSON.stringify(company.payload));
  const competitor = await request(baseUrl, '/api/competitor_research', {
    method: 'POST',
    token: creator.token,
    body: {
      company_id: Number(company.payload.id),
      date: '2026-07-30',
      title: '旧公司研究记录',
      importance: 'normal',
      content: '旧公司研究描述',
      source: '测试',
      outcome: '旧公司研究结果',
      opportunity_title: '旧公司研究商机',
      opportunity_status: 'following',
      opportunity_assignee: workerId,
      opportunity_type: '增长-客户',
    },
  });
  assert.equal(competitor.status, 200, JSON.stringify(competitor.payload));
  const competitorId = Number(competitor.payload.id);

  await stopServer(server.child);

  const legacyDb = new Database(databasePath);
  legacyDb.prepare('DELETE FROM follow_up_tasks WHERE interaction_id = ?').run(interactionId);
  legacyDb.prepare(`
    UPDATE follow_up_tasks
    SET assigned_by = 1, opportunity_note = NULL
    WHERE competitor_research_id = ?
  `).run(competitorId);
  legacyDb.close();

  server = await startServer(databasePath);
  children.push(server.child);
  baseUrl = server.baseUrl;
  const restartedAdmin = await login(baseUrl);
  const restartedWorker = await login(baseUrl, workerUsername, password);
  const restartedCreator = await login(baseUrl, creatorUsername, password);

  const followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token: restartedAdmin.token });
  assert.equal(followUps.status, 200, JSON.stringify(followUps.payload));
  const legacyInteractionTask = followUps.payload.find(item => Number(item.interaction_id) === interactionId);
  assert.equal(legacyInteractionTask?.opportunity_note, '描述：旧互动描述\n结果：旧互动结果');
  assert.equal(Number(legacyInteractionTask?.assigned_by), creatorId);
  assert.equal(Number(legacyInteractionTask?.assigned_to), workerId);

  const legacyCompetitorTask = followUps.payload.find(item => Number(item.competitor_research_id) === competitorId);
  assert.equal(legacyCompetitorTask?.opportunity_note, '描述：旧公司研究描述\n结果：旧公司研究结果');
  assert.equal(Number(legacyCompetitorTask?.assigned_by), creatorId);
  assert.equal(Number(legacyCompetitorTask?.assigned_to), workerId);
  assert.equal(legacyCompetitorTask?.task_type, '增长-客户');

  for (const task of [legacyInteractionTask, legacyCompetitorTask]) {
    const statusUpdate = await request(baseUrl, `/api/follow-up-tasks/${task.id}`, {
      method: 'PUT',
      token: restartedWorker.token,
      body: { status: 'in_progress' },
    });
    assert.equal(statusUpdate.status, 200, JSON.stringify(statusUpdate.payload));
  }

  const creatorNotifications = await request(baseUrl, '/api/notifications', { token: restartedCreator.token });
  assert.equal(creatorNotifications.status, 200, JSON.stringify(creatorNotifications.payload));
  assert.equal(
    creatorNotifications.payload.some(item => item.type === 'task_status_updated' && item.title.includes('旧互动商机')),
    true,
  );
  assert.equal(
    creatorNotifications.payload.some(item => item.type === 'task_status_updated' && item.title.includes('旧公司研究商机')),
    true,
  );
});

test('opportunity type stays in sync with interaction and competitor follow-up tasks', { timeout: 45000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-opportunity-type-'));
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
  const admin = await login(baseUrl);
  const token = admin.token;
  const adminId = Number(admin.user.id);
  const suffix = `${process.pid}_${Date.now()}`;
  const workerUsername = `opportunity_worker_${suffix}`;
  const workerPassword = 'opportunity-worker-123';
  const workerId = await createUser(baseUrl, token, {
    username: workerUsername,
    display_name: '商机任务执行人',
    password: workerPassword,
  });
  const worker = await login(baseUrl, workerUsername, workerPassword);
  const personCompany = `互动搜索公司 ${suffix}`;

  const personResponse = await request(baseUrl, '/api/persons', {
    method: 'POST',
    token,
    body: { name: `商机类型人脉 ${suffix}`, company: personCompany, person_category: 'business' },
  });
  assert.equal(personResponse.status, 200, JSON.stringify(personResponse.payload));
  const personId = Number(personResponse.payload.id);

  const personsByCompany = await request(baseUrl, `/api/persons?search=${encodeURIComponent(personCompany)}`, { token });
  assert.equal(personsByCompany.status, 200, JSON.stringify(personsByCompany.payload));
  assert.equal(personsByCompany.payload.length, 1);
  assert.equal(personsByCompany.payload[0].company_name, personCompany);

  const invalidInteraction = await request(baseUrl, '/api/interactions', {
    method: 'POST',
    token,
    body: {
      person_id: personId,
      type: 'meeting',
      date: '2026-07-27',
      opportunity_title: '非法类型不应落库',
      opportunity_assignee: adminId,
      opportunity_type: '其他',
    },
  });
  assert.equal(invalidInteraction.status, 400, JSON.stringify(invalidInteraction.payload));
  assert.match(invalidInteraction.payload.error, /商机类型必须是/);

  const interactionPayload = {
    person_id: personId,
    type: 'meeting',
    date: '2026-07-27',
    importance: 'normal',
    description: '存量商机先保持空类型',
    outcome: '',
    next_action: '',
    opportunity_title: '存量互动商机',
    opportunity_status: 'new',
    opportunity_assignee: workerId,
    opportunity_note: '待补选类型',
  };
  const interaction = await request(baseUrl, '/api/interactions', {
    method: 'POST',
    token,
    body: interactionPayload,
  });
  assert.equal(interaction.status, 200, JSON.stringify(interaction.payload));
  const interactionId = Number(interaction.payload.id);

  const interactionsByCompany = await request(baseUrl, `/api/interactions?search=${encodeURIComponent(personCompany)}`, { token });
  assert.equal(interactionsByCompany.status, 200, JSON.stringify(interactionsByCompany.payload));
  assert.equal(interactionsByCompany.payload.length, 1);
  assert.equal(Number(interactionsByCompany.payload[0].id), interactionId);
  assert.equal(interactionsByCompany.payload[0].company_name, personCompany);
  assert.equal(interactionsByCompany.payload[0].created_by_name, admin.user.display_name);

  let opportunities = await request(baseUrl, '/api/opportunities', { token });
  assert.equal(opportunities.status, 200, JSON.stringify(opportunities.payload));
  assert.equal(opportunities.payload.find(item => item.source_type === 'interaction' && Number(item.id) === interactionId)?.opportunity_type, null);

  let followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.status, 200, JSON.stringify(followUps.payload));
  const interactionFollowUp = followUps.payload.find(item => Number(item.interaction_id) === interactionId);
  assert.equal(interactionFollowUp?.task_type, null);
  assert.equal(interactionFollowUp?.opportunity_note, '描述：存量商机先保持空类型\n结果：-');

  const workerNotifications = await request(baseUrl, '/api/notifications', { token: worker.token });
  assert.equal(workerNotifications.status, 200, JSON.stringify(workerNotifications.payload));
  assert.equal(
    workerNotifications.payload.some(item => item.type === 'opportunity_task_assigned' && item.title.includes('存量互动商机')),
    true,
  );

  const workerStartsOpportunityTask = await request(baseUrl, `/api/follow-up-tasks/${interactionFollowUp.id}`, {
    method: 'PUT',
    token: worker.token,
    body: { status: 'in_progress' },
  });
  assert.equal(workerStartsOpportunityTask.status, 200, JSON.stringify(workerStartsOpportunityTask.payload));
  const adminNotificationsAfterOpportunityStatus = await request(baseUrl, '/api/notifications', { token });
  assert.equal(adminNotificationsAfterOpportunityStatus.status, 200, JSON.stringify(adminNotificationsAfterOpportunityStatus.payload));
  assert.equal(
    adminNotificationsAfterOpportunityStatus.payload.some(item => item.type === 'task_status_updated' && item.title.includes('存量互动商机')),
    true,
  );

  const classifyLegacyInteraction = await request(baseUrl, `/api/opportunities/${interactionId}`, {
    method: 'PUT',
    token,
    body: { source_type: 'interaction', opportunity_type: '组织' },
  });
  assert.equal(classifyLegacyInteraction.status, 200, JSON.stringify(classifyLegacyInteraction.payload));

  followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.payload.find(item => Number(item.interaction_id) === interactionId)?.task_type, '组织');

  const clearInteractionType = await request(baseUrl, `/api/interactions/${interactionId}`, {
    method: 'PUT',
    token,
    body: { ...interactionPayload, opportunity_type: null },
  });
  assert.equal(clearInteractionType.status, 200, JSON.stringify(clearInteractionType.payload));
  followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.payload.find(item => Number(item.interaction_id) === interactionId)?.task_type, null);

  const companyResponse = await request(baseUrl, '/api/companies', {
    method: 'POST',
    token,
    body: { name: `商机类型公司 ${suffix}`, category: 'client' },
  });
  assert.equal(companyResponse.status, 200, JSON.stringify(companyResponse.payload));
  const companyId = Number(companyResponse.payload.id);
  const competitorPayload = {
    company_id: companyId,
    date: '2026-07-27',
    title: '竞品商机记录',
    importance: 'normal',
    content: '竞品商机正文',
    source: '测试',
    impact: '',
    outcome: '',
    next_action: '',
    opportunity_title: '增长客户商机',
    opportunity_status: 'following',
    opportunity_assignee: adminId,
    opportunity_note: '竞品来源',
    opportunity_type: '增长-客户',
  };
  const competitor = await request(baseUrl, '/api/competitor_research', {
    method: 'POST',
    token,
    body: competitorPayload,
  });
  assert.equal(competitor.status, 200, JSON.stringify(competitor.payload));
  const competitorId = Number(competitor.payload.id);

  followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.payload.find(item => Number(item.competitor_research_id) === competitorId)?.task_type, '增长-客户');

  const invalidCompetitorUpdate = await request(baseUrl, `/api/competitor_research/${competitorId}`, {
    method: 'PUT',
    token,
    body: { ...competitorPayload, opportunity_type: '无效分类' },
  });
  assert.equal(invalidCompetitorUpdate.status, 400, JSON.stringify(invalidCompetitorUpdate.payload));
  followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.payload.find(item => Number(item.competitor_research_id) === competitorId)?.task_type, '增长-客户');

  const updateCompetitor = await request(baseUrl, `/api/competitor_research/${competitorId}`, {
    method: 'PUT',
    token,
    body: { ...competitorPayload, opportunity_type: '增长-产品' },
  });
  assert.equal(updateCompetitor.status, 200, JSON.stringify(updateCompetitor.payload));

  opportunities = await request(baseUrl, '/api/opportunities', { token });
  assert.equal(opportunities.payload.find(item => item.source_type === 'competitor_research' && Number(item.id) === competitorId)?.opportunity_type, '增长-产品');
  followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.payload.find(item => Number(item.competitor_research_id) === competitorId)?.task_type, '增长-产品');

  const clearCompetitorType = await request(baseUrl, `/api/opportunities/${competitorId}`, {
    method: 'PUT',
    token,
    body: { source_type: 'competitor_research', opportunity_type: null },
  });
  assert.equal(clearCompetitorType.status, 200, JSON.stringify(clearCompetitorType.payload));
  followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.payload.find(item => Number(item.competitor_research_id) === competitorId)?.task_type, null);
});

test('interactions default to newest created records first', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-interactions-sort-'));
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
  const admin = await login(baseUrl);
  const token = admin.token;
  const suffix = `${process.pid}_${Date.now()}`;
  const personCompany = `互动排序公司 ${suffix}`;

  const personResponse = await request(baseUrl, '/api/persons', {
    method: 'POST',
    token,
    body: { name: `互动排序人脉 ${suffix}`, company: personCompany, person_category: 'business' },
  });
  assert.equal(personResponse.status, 200, JSON.stringify(personResponse.payload));
  const personId = Number(personResponse.payload.id);

  const olderInteraction = await request(baseUrl, '/api/interactions', {
    method: 'POST',
    token,
    body: {
      person_id: personId,
      type: 'meeting',
      date: '2026-07-29',
      importance: 'normal',
      description: '先创建的互动',
    },
  });
  assert.equal(olderInteraction.status, 200, JSON.stringify(olderInteraction.payload));

  const newerInteraction = await request(baseUrl, '/api/interactions', {
    method: 'POST',
    token,
    body: {
      person_id: personId,
      type: 'meeting',
      date: '2026-07-29',
      importance: 'normal',
      description: '后创建的互动',
    },
  });
  assert.equal(newerInteraction.status, 200, JSON.stringify(newerInteraction.payload));

  const list = await request(baseUrl, `/api/interactions?search=${encodeURIComponent(personCompany)}`, { token });
  assert.equal(list.status, 200, JSON.stringify(list.payload));
  assert.deepEqual(
    list.payload.map(item => Number(item.id)),
    [Number(newerInteraction.payload.id), Number(olderInteraction.payload.id)]
  );
});
