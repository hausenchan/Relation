const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

function createModelAgendaFixture() {
  return {
    meeting_goals: ['目标一', '目标二', '目标三', '目标四'],
    business_modules: [{
      title: '经营准备汇总',
      progress: ['已完成本周准备内容汇总。'],
      judgment: ['关键判断需要结合会上讨论确认。'],
      discussion: ['请确认业务优先级、资源安排和风险边界。'],
    }],
    decision_topics: Array.from({ length: 5 }, (_, index) => ({
      title: `核心议题${index + 1}`,
      background: ['准备材料提出了需要管理层统一判断的事项。'],
      discussion: ['讨论优先级、资源投入和验证周期。'],
      conclusions: ['Owner、时间、指标和暂停条件待会上确认。'],
    })),
    agenda: [
      { minutes: 10, topic: '经营总览', scope: '同步关键变化。' },
      { minutes: 80, topic: '核心议题', scope: '讨论分歧和资源排序。' },
      { minutes: 30, topic: '决策确认', scope: '确认Owner、时间和指标。' },
    ],
    next_actions: [{
      module: '经营准备汇总',
      actions: ['按会上确定的优先级推进关键动作。'],
      to_confirm: ['Owner、完成时间和验证指标。'],
    }],
    preparation_questions: ['问题一', '问题二', '问题三', '问题四', '问题五'],
  };
}

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

async function waitForAgendaGenerationJob(baseUrl, meetingId, jobId, token) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(
      baseUrl,
      `/api/operational-meetings/${meetingId}/agenda/generate/${jobId}`,
      { token },
    );
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    if (['completed', 'failed'].includes(response.payload.status)) return response;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('agenda generation job did not finish');
}

function seedUsers(databasePath) {
  const db = new Database(databasePath);
  const hash = bcrypt.hashSync('test123456', 4);
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, executive_role, account_status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);
  const ceoId = Number(insertUser.run('meeting_ceo', hash, 'Meeting CEO', 'member', 'ceo').lastInsertRowid);
  const cooId = Number(insertUser.run('meeting_coo', hash, 'Meeting COO', 'member', 'coo').lastInsertRowid);
  const designatedId = Number(insertUser.run('meeting_member', hash, 'Meeting Member', 'member', null).lastInsertRowid);
  const outsiderId = Number(insertUser.run('meeting_outsider', hash, 'Meeting Outsider', 'member', null).lastInsertRowid);
  const insertSensitive = db.prepare(`
    INSERT INTO sensitive_module_members (module_key, user_id, permission_level, created_by)
    VALUES ('operational_meeting', ?, 'manage', 1)
  `);
  const insertMenu = db.prepare(`
    INSERT INTO user_menu_perms (user_id, menu_key)
    VALUES (?, '/executive/operational')
  `);
  [ceoId, cooId, designatedId, outsiderId].forEach(userId => {
    insertSensitive.run(userId);
    insertMenu.run(userId);
  });
  db.close();
  return { ceoId, cooId, designatedId, outsiderId };
}

async function login(baseUrl, username, password = 'test123456') {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload.token;
}

test('operational meeting APIs enforce preparation and meeting visibility', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-operational-meeting-'));
  const databasePath = path.join(tempDir, 'data.db');
  let latestModelRequest = null;
  const modelServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      latestModelRequest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          model: 'test-agenda-model',
          choices: [{ message: { content: JSON.stringify(createModelAgendaFixture()) } }],
          usage: { total_tokens: 100 },
        }));
      }, 250);
    });
  });
  modelServer.listen(0, '127.0.0.1');
  await once(modelServer, 'listening');
  const modelPort = modelServer.address().port;
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
    modelServer.close();
    await once(modelServer, 'close');
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(child);
  const users = seedUsers(databasePath);
  const baseUrl = `http://127.0.0.1:${port}`;
  const [ceoToken, cooToken, designatedToken, outsiderToken, adminToken] = await Promise.all([
    login(baseUrl, 'meeting_ceo'),
    login(baseUrl, 'meeting_coo'),
    login(baseUrl, 'meeting_member'),
    login(baseUrl, 'meeting_outsider'),
    login(baseUrl, 'admin', 'admin123'),
  ]);
  const configureModel = await request(baseUrl, '/api/system/settings/ai-model', {
    method: 'PUT',
    token: adminToken,
    body: {
      provider: 'openai_compatible',
      base_url: `http://127.0.0.1:${modelPort}/v1`,
      model: 'test-agenda-model',
      api_key: 'test-api-key',
      enabled: true,
      timeout_ms: 5000,
    },
  });
  assert.equal(configureModel.status, 200, JSON.stringify(configureModel.payload));

  const templates = await request(baseUrl, '/api/operational-meeting-templates', { token: ceoToken });
  assert.equal(templates.status, 200);
  assert.ok(templates.payload[0]?.id);
  assert.deepEqual(
    templates.payload[0].sections[0].default_blocks.blocks.map(block => ({
      type: block.type,
      content: block.content,
      indent: block.meta?.indent,
    })),
    [
      { type: 'fold-list', content: '本周核心结果', indent: 0 },
      { type: 'numbered', content: '', indent: 1 },
      { type: 'fold-list', content: '一个最重要的判断', indent: 0 },
      { type: 'numbered', content: '', indent: 1 },
      { type: 'fold-list', content: '需要会上决策的问题', indent: 0 },
      { type: 'numbered', content: '', indent: 1 },
      { type: 'fold-list', content: '下周建议动作', indent: 0 },
      { type: 'numbered', content: '', indent: 1 },
    ],
  );

  const created = await request(baseUrl, '/api/operational-meetings', {
    method: 'POST',
    token: ceoToken,
    body: {
      week_start: '2026-07-13',
      week_end: '2026-07-19',
      template_id: templates.payload[0].id,
      participant_user_ids: [users.designatedId],
    },
  });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  const meetingId = Number(created.payload.id);

  const [ceoList, designatedList, outsiderList, adminList] = await Promise.all([
    request(baseUrl, '/api/operational-meetings', { token: ceoToken }),
    request(baseUrl, '/api/operational-meetings', { token: designatedToken }),
    request(baseUrl, '/api/operational-meetings', { token: outsiderToken }),
    request(baseUrl, '/api/operational-meetings', { token: adminToken }),
  ]);
  assert.equal(ceoList.payload.length, 1);
  assert.equal(designatedList.payload.length, 1);
  assert.equal(outsiderList.payload.length, 1);
  assert.equal(adminList.payload.length, 1);
  assert.equal(designatedList.payload[0].can_view_preparation, 1);
  assert.equal(outsiderList.payload[0].can_view_preparation, 0);
  assert.equal(outsiderList.payload[0].required_sections, 0);
  assert.equal(outsiderList.payload[0].submitted_required_sections, 0);

  const [ceoDetail, designatedDetail, outsiderDetail] = await Promise.all([
    request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: ceoToken }),
    request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: designatedToken }),
    request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: outsiderToken }),
  ]);
  assert.equal(ceoDetail.status, 200);
  assert.ok(ceoDetail.payload.sections.length > designatedDetail.payload.sections.length);
  assert.equal(designatedDetail.status, 200);
  assert.equal(designatedDetail.payload.sections.length, 1);
  assert.equal(Number(designatedDetail.payload.sections[0].owner_user_id), users.designatedId);
  assert.equal(designatedDetail.payload.can_view_preparation, 1);
  assert.equal(designatedDetail.payload.can_edit_agenda, 1);
  assert.equal(designatedDetail.payload.can_generate_agenda, 0);
  assert.equal(designatedDetail.payload.can_edit_decision, 1);
  assert.equal(outsiderDetail.status, 200);
  assert.equal(outsiderDetail.payload.sections.length, 0);
  assert.equal(outsiderDetail.payload.can_view_preparation, 0);
  assert.equal(outsiderDetail.payload.can_edit_agenda, 1);
  assert.equal(outsiderDetail.payload.can_generate_agenda, 0);
  assert.equal(outsiderDetail.payload.can_edit_decision, 1);
  assert.equal(outsiderDetail.payload.participants.length, 0);

  const designatedSectionId = designatedDetail.payload.sections[0].id;
  const emptyPreparationSubmission = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}/submit`,
    { method: 'POST', token: designatedToken },
  );
  assert.equal(emptyPreparationSubmission.status, 400);
  assert.equal(emptyPreparationSubmission.payload.error, '请填写好内容再提交');

  const preparationContent = {
    format: 'relation_document_body_v1',
    blocks: [{ id: 'prep-1', type: 'paragraph', content: '本周准备内容', meta: {} }],
  };
  const cxoEditsDesignatedPreparation = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}`,
    {
      method: 'PUT',
      token: ceoToken,
      body: {
        content: preparationContent,
      },
    },
  );
  assert.equal(cxoEditsDesignatedPreparation.status, 200, JSON.stringify(cxoEditsDesignatedPreparation.payload));
  const preparationAfterEdit = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: designatedToken });
  assert.deepEqual(preparationAfterEdit.payload.sections[0].content, preparationContent);
  assert.equal(preparationAfterEdit.payload.sections[0].content_ciphertext, undefined);
  assert.equal(preparationAfterEdit.payload.sections[0].my_record_key, undefined);

  const submitPreparation = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}/submit`,
    { method: 'POST', token: designatedToken },
  );
  assert.equal(submitPreparation.status, 200, JSON.stringify(submitPreparation.payload));
  const submittedDetail = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: designatedToken });
  assert.equal(submittedDetail.payload.sections[0].status, 'submitted');
  assert.ok(submittedDetail.payload.sections[0].submitted_at);
  const submittedAt = submittedDetail.payload.sections[0].submitted_at;

  const repeatSubmittedPreparation = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}`,
    {
      method: 'PUT',
      token: designatedToken,
      body: { content: preparationContent, base_updated_at: 'stale-retry-baseline' },
    },
  );
  assert.equal(repeatSubmittedPreparation.status, 200, JSON.stringify(repeatSubmittedPreparation.payload));
  assert.equal(repeatSubmittedPreparation.payload.status, 'submitted');
  assert.equal(repeatSubmittedPreparation.payload.submission_changed, 0);
  assert.equal(repeatSubmittedPreparation.payload.changed, false);

  const collapseOnlyPreparation = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}`,
    {
      method: 'PUT',
      token: designatedToken,
      body: {
        content: {
          ...preparationContent,
          blocks: preparationContent.blocks.map(block => ({
            ...block,
            meta: { ...block.meta, collapsed: true },
          })),
        },
      },
    },
  );
  assert.equal(collapseOnlyPreparation.status, 200, JSON.stringify(collapseOnlyPreparation.payload));
  assert.equal(collapseOnlyPreparation.payload.status, 'submitted');
  assert.equal(collapseOnlyPreparation.payload.submission_changed, 0);
  const detailAfterEquivalentSaves = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}`,
    { token: designatedToken },
  );
  assert.equal(detailAfterEquivalentSaves.payload.sections[0].status, 'submitted');
  assert.equal(detailAfterEquivalentSaves.payload.sections[0].submitted_at, submittedAt);

  const editSubmittedPreparation = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}`,
    {
      method: 'PUT',
      token: designatedToken,
      body: {
        content: {
          ...preparationContent,
          blocks: [{ id: 'prep-2', type: 'paragraph', content: '提交后重新编辑', meta: {} }],
        },
      },
    },
  );
  assert.equal(editSubmittedPreparation.status, 200, JSON.stringify(editSubmittedPreparation.payload));
  assert.equal(editSubmittedPreparation.payload.status, 'draft');
  assert.equal(editSubmittedPreparation.payload.submission_changed, 1);
  const editedDetail = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: designatedToken });
  assert.equal(editedDetail.payload.sections[0].status, 'draft');
  assert.equal(editedDetail.payload.sections[0].submitted_at, null);

  const invalidPreparationContent = await request(
    baseUrl,
    `/api/operational-meeting-sections/${designatedSectionId}`,
    {
      method: 'PUT',
      token: designatedToken,
      body: {
        content: 'not-an-object',
      },
    },
  );
  assert.equal(invalidPreparationContent.status, 400);

  const forbiddenGenerate = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda/generate`, {
    method: 'POST',
    token: designatedToken,
    body: { sections: [{ title: 'own', content: 'safe' }] },
  });
  assert.equal(forbiddenGenerate.status, 403);

  const incompleteGenerate = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda/generate`, {
    method: 'POST',
    token: ceoToken,
    body: { sections: [{ title: '伪造准备内容', content: '不应被服务端采信' }] },
  });
  assert.equal(incompleteGenerate.status, 409, JSON.stringify(incompleteGenerate.payload));
  assert.equal(incompleteGenerate.payload.code, 'PREPARATION_INCOMPLETE');

  for (const [index, section] of ceoDetail.payload.sections.entries()) {
    const updatePreparation = await request(
      baseUrl,
      `/api/operational-meeting-sections/${section.id}`,
      {
        method: 'PUT',
        token: ceoToken,
        body: {
          content: {
            format: 'relation_document_blocks_v1',
            blocks: [{
              id: `completed-preparation-${index + 1}`,
              type: 'paragraph',
              content: `${section.title}本周准备内容完整`,
              meta: {},
            }],
          },
        },
      },
    );
    assert.equal(updatePreparation.status, 200, JSON.stringify(updatePreparation.payload));
    const submitCompletedPreparation = await request(
      baseUrl,
      `/api/operational-meeting-sections/${section.id}/submit`,
      { method: 'POST', token: ceoToken },
    );
    assert.equal(submitCompletedPreparation.status, 200, JSON.stringify(submitCompletedPreparation.payload));
  }

  const asyncGenerationStartedAt = Date.now();
  const startedAgendaGeneration = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda/generate`, {
    method: 'POST',
    token: ceoToken,
    body: {
      async: true,
      sections: [{ title: '伪造准备内容', content: '不应被服务端采信' }],
    },
  });
  assert.equal(startedAgendaGeneration.status, 202, JSON.stringify(startedAgendaGeneration.payload));
  assert.ok(Date.now() - asyncGenerationStartedAt < 1000);
  assert.ok(startedAgendaGeneration.payload.job_id);
  assert.equal(startedAgendaGeneration.payload.status, 'pending');
  assert.equal(startedAgendaGeneration.payload.poll_after_ms, 1500);

  const duplicateAgendaGeneration = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/agenda/generate`,
    { method: 'POST', token: ceoToken, body: { async: true } },
  );
  assert.equal(duplicateAgendaGeneration.status, 202, JSON.stringify(duplicateAgendaGeneration.payload));
  assert.equal(duplicateAgendaGeneration.payload.reused, true);
  assert.equal(duplicateAgendaGeneration.payload.job_id, startedAgendaGeneration.payload.job_id);

  const anonymousJobPoll = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/agenda/generate/${startedAgendaGeneration.payload.job_id}`,
  );
  assert.equal(anonymousJobPoll.status, 401);
  const designatedJobPoll = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/agenda/generate/${startedAgendaGeneration.payload.job_id}`,
    { token: designatedToken },
  );
  assert.equal(designatedJobPoll.status, 403);
  const otherCxoJobPoll = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/agenda/generate/${startedAgendaGeneration.payload.job_id}`,
    { token: cooToken },
  );
  assert.equal(otherCxoJobPoll.status, 404);
  assert.equal(otherCxoJobPoll.payload.code, 'AGENDA_GENERATION_JOB_EXPIRED');

  const completedAgendaJob = await waitForAgendaGenerationJob(
    baseUrl,
    meetingId,
    startedAgendaGeneration.payload.job_id,
    ceoToken,
  );
  assert.equal(completedAgendaJob.payload.status, 'completed');
  const generatedAgenda = { status: 200, payload: completedAgendaJob.payload.result };
  assert.equal(generatedAgenda.status, 200, JSON.stringify(generatedAgenda.payload));
  assert.equal(generatedAgenda.payload.agenda?.format, 'relation_document_blocks_v1');
  assert.ok(generatedAgenda.payload.agenda?.blocks?.some(block => block.type === 'heading2'));
  assert.ok(generatedAgenda.payload.agenda?.blocks?.some(block => block.type === 'bullet'));
  assert.equal(
    generatedAgenda.payload.agenda.blocks.some(block => String(block.content).includes('伪造准备内容')),
    false,
  );
  assert.equal(generatedAgenda.payload.prompt_version, 'operational-meeting-agenda-v3');
  assert.equal(generatedAgenda.payload.saved, true);
  assert.ok(generatedAgenda.payload.updated_at);
  assert.equal(generatedAgenda.payload.runtime?.mode, 'llm');
  assert.ok(latestModelRequest?.messages?.[1]?.content);
  assert.equal(latestModelRequest.messages[1].content.includes('伪造准备内容'), false);

  const detailImmediatelyAfterGenerate = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}`,
    { token: ceoToken },
  );
  assert.equal(detailImmediatelyAfterGenerate.status, 200);
  assert.deepEqual(
    detailImmediatelyAfterGenerate.payload.agenda?.agenda_content,
    generatedAgenda.payload.agenda,
  );
  assert.equal(detailImmediatelyAfterGenerate.payload.meeting.agenda_status, 'generated');
  assert.equal(detailImmediatelyAfterGenerate.payload.meeting.status, 'agenda_generated');

  const historyImmediatelyAfterGenerate = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/history?scope=agenda`,
    { token: ceoToken },
  );
  assert.equal(historyImmediatelyAfterGenerate.status, 200);
  assert.equal(historyImmediatelyAfterGenerate.payload.revisions.length, 1);

  const disableModel = await request(baseUrl, '/api/system/settings/ai-model', {
    method: 'PUT',
    token: adminToken,
    body: { enabled: false },
  });
  assert.equal(disableModel.status, 200, JSON.stringify(disableModel.payload));

  const startedUnavailableRegenerate = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/agenda/generate`,
    {
      method: 'POST',
      token: ceoToken,
      body: { async: true, base_updated_at: generatedAgenda.payload.updated_at },
    },
  );
  assert.equal(startedUnavailableRegenerate.status, 202, JSON.stringify(startedUnavailableRegenerate.payload));
  const failedRegenerateJob = await waitForAgendaGenerationJob(
    baseUrl,
    meetingId,
    startedUnavailableRegenerate.payload.job_id,
    ceoToken,
  );
  assert.equal(failedRegenerateJob.payload.status, 'failed');
  assert.equal(failedRegenerateJob.payload.http_status, 503);
  assert.equal(failedRegenerateJob.payload.code, 'AI_MODEL_UNAVAILABLE');

  const unavailableRegenerate = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/agenda/generate`,
    {
      method: 'POST',
      token: ceoToken,
      body: { base_updated_at: generatedAgenda.payload.updated_at },
    },
  );
  assert.equal(unavailableRegenerate.status, 503, JSON.stringify(unavailableRegenerate.payload));
  assert.equal(unavailableRegenerate.payload.code, 'AI_MODEL_UNAVAILABLE');

  const detailAfterUnavailableRegenerate = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}`,
    { token: ceoToken },
  );
  assert.deepEqual(
    detailAfterUnavailableRegenerate.payload.agenda?.agenda_content,
    generatedAgenda.payload.agenda,
  );

  const agendaContent = generatedAgenda.payload.agenda;
  const sensitiveAgenda = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda`, {
    method: 'PUT',
    token: ceoToken,
    body: {
      agenda: {
        format: 'relation_document_blocks_v1',
        blocks: [{ id: 'sensitive-agenda', type: 'paragraph', content: '本周利润为100万元', meta: {} }],
      },
    },
  });
  assert.equal(sensitiveAgenda.status, 422, JSON.stringify(sensitiveAgenda.payload));

  const staleGeneratedAgenda = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda`, {
    method: 'PUT',
    token: ceoToken,
    body: {
      agenda: agendaContent,
      source_hash: 'stale-source-hash',
      revision_action: 'generate',
    },
  });
  assert.equal(staleGeneratedAgenda.status, 409, JSON.stringify(staleGeneratedAgenda.payload));
  assert.equal(staleGeneratedAgenda.payload.code, 'PREPARATION_CHANGED');

  const saveAgenda = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda`, {
    method: 'PUT',
    token: ceoToken,
    body: {
      agenda: agendaContent,
      source_hash: generatedAgenda.payload.source_hash,
      model_provider: 'rule',
      prompt_version: generatedAgenda.payload.prompt_version,
      safety_scan_status: 'passed',
      revision_action: 'generate',
    },
  });
  assert.equal(saveAgenda.status, 200, JSON.stringify(saveAgenda.payload));
  assert.equal(saveAgenda.payload.changed, false);
  assert.equal(saveAgenda.payload.updated_at, generatedAgenda.payload.updated_at);

  const historyAfterIdempotentSave = await request(
    baseUrl,
    `/api/operational-meetings/${meetingId}/history?scope=agenda`,
    { token: ceoToken },
  );
  assert.equal(historyAfterIdempotentSave.status, 200);
  assert.equal(historyAfterIdempotentSave.payload.revisions.length, 1);

  const outsiderSavesAgenda = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda`, {
    method: 'PUT',
    token: outsiderToken,
    body: {
      agenda: agendaContent,
      model_provider: 'edited',
      base_updated_at: 'stale-retry-baseline',
    },
  });
  assert.equal(outsiderSavesAgenda.status, 200, JSON.stringify(outsiderSavesAgenda.payload));
  assert.equal(outsiderSavesAgenda.payload.changed, false);

  const decisionContent = {
    format: 'relation_document_body_v1',
    blocks: [{ id: 'decision-1', type: 'paragraph', content: '本周会议结论', meta: {} }],
  };
  const saveDecision = await request(baseUrl, `/api/operational-meetings/${meetingId}/decision`, {
    method: 'PUT',
    token: ceoToken,
    body: { decision: decisionContent, status: 'saved' },
  });
  assert.equal(saveDecision.status, 200, JSON.stringify(saveDecision.payload));

  const retrySavedDecision = await request(baseUrl, `/api/operational-meetings/${meetingId}/decision`, {
    method: 'PUT',
    token: ceoToken,
    body: {
      decision: decisionContent,
      status: 'saved',
      base_updated_at: 'stale-retry-baseline',
    },
  });
  assert.equal(retrySavedDecision.status, 200, JSON.stringify(retrySavedDecision.payload));
  assert.equal(retrySavedDecision.payload.changed, false);
  assert.equal(retrySavedDecision.payload.updated_at, saveDecision.payload.updated_at);

  const outsiderSavesDecision = await request(baseUrl, `/api/operational-meetings/${meetingId}/decision`, {
    method: 'PUT',
    token: outsiderToken,
    body: { decision: decisionContent, status: 'saved' },
  });
  assert.equal(outsiderSavesDecision.status, 200, JSON.stringify(outsiderSavesDecision.payload));

  const meetingContentDetail = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: designatedToken });
  assert.deepEqual(meetingContentDetail.payload.agenda.agenda_content, agendaContent);
  assert.deepEqual(meetingContentDetail.payload.decision.decision_content, decisionContent);
  assert.equal(meetingContentDetail.payload.agenda.agenda_ciphertext, undefined);
  assert.equal(meetingContentDetail.payload.decision.decision_ciphertext, undefined);

  const [designatedAnnual, outsiderAnnual] = await Promise.all([
    request(baseUrl, '/api/operational-meetings/annual-summary?year=2026', { token: designatedToken }),
    request(baseUrl, '/api/operational-meetings/annual-summary?year=2026', { token: outsiderToken }),
  ]);
  assert.equal(designatedAnnual.payload.meetings.length, 1);
  assert.equal(outsiderAnnual.payload.meetings.length, 1);
  assert.deepEqual(designatedAnnual.payload.meetings[0].agenda.agenda_content, agendaContent);
  assert.deepEqual(designatedAnnual.payload.meetings[0].decision.decision_content, decisionContent);
  assert.deepEqual(outsiderAnnual.payload.meetings[0].agenda.agenda_content, agendaContent);
  assert.deepEqual(outsiderAnnual.payload.meetings[0].decision.decision_content, decisionContent);

  const addOutsider = await request(baseUrl, `/api/operational-meetings/${meetingId}/participants`, {
    method: 'PUT',
    token: ceoToken,
    body: { participant_user_ids: [users.designatedId, users.outsiderId] },
  });
  assert.equal(addOutsider.status, 200, JSON.stringify(addOutsider.payload));
  assert.equal(addOutsider.payload.requires_rekey, undefined);
  const outsiderAfterAdd = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: outsiderToken });
  assert.equal(outsiderAfterAdd.status, 200);
  assert.equal(outsiderAfterAdd.payload.sections.length, 1);
  assert.equal(Number(outsiderAfterAdd.payload.sections[0].owner_user_id), users.outsiderId);
  assert.deepEqual(outsiderAfterAdd.payload.agenda.agenda_content, agendaContent);
  assert.deepEqual(outsiderAfterAdd.payload.decision.decision_content, decisionContent);

  const removeDesignated = await request(baseUrl, `/api/operational-meetings/${meetingId}/participants`, {
    method: 'PUT',
    token: ceoToken,
    body: { participant_user_ids: [users.outsiderId] },
  });
  assert.equal(removeDesignated.status, 200);
  const designatedAfterRemove = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: designatedToken });
  assert.equal(designatedAfterRemove.status, 200);
  assert.equal(designatedAfterRemove.payload.sections.length, 0);
  assert.equal(designatedAfterRemove.payload.can_view_preparation, 0);
  assert.deepEqual(designatedAfterRemove.payload.agenda.agenda_content, agendaContent);
  assert.deepEqual(designatedAfterRemove.payload.decision.decision_content, decisionContent);
  const cxoAfterRemove = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: ceoToken });
  const removedPreparation = cxoAfterRemove.payload.sections.find(
    section => Number(section.owner_user_id) === users.designatedId,
  );
  assert.ok(removedPreparation);
  assert.equal(removedPreparation.authorized_user_ids, undefined);
});
