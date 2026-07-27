const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
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

async function login(baseUrl) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload;
}

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

  const personResponse = await request(baseUrl, '/api/persons', {
    method: 'POST',
    token,
    body: { name: `商机类型人脉 ${suffix}`, person_category: 'business' },
  });
  assert.equal(personResponse.status, 200, JSON.stringify(personResponse.payload));
  const personId = Number(personResponse.payload.id);

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
    opportunity_assignee: adminId,
    opportunity_note: '待补选类型',
  };
  const interaction = await request(baseUrl, '/api/interactions', {
    method: 'POST',
    token,
    body: interactionPayload,
  });
  assert.equal(interaction.status, 200, JSON.stringify(interaction.payload));
  const interactionId = Number(interaction.payload.id);

  let opportunities = await request(baseUrl, '/api/opportunities', { token });
  assert.equal(opportunities.status, 200, JSON.stringify(opportunities.payload));
  assert.equal(opportunities.payload.find(item => item.source_type === 'interaction' && Number(item.id) === interactionId)?.opportunity_type, null);

  let followUps = await request(baseUrl, '/api/follow-up-tasks?all=1', { token });
  assert.equal(followUps.status, 200, JSON.stringify(followUps.payload));
  assert.equal(followUps.payload.find(item => Number(item.interaction_id) === interactionId)?.task_type, null);

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
