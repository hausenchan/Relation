const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
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

function seedUsers(databasePath) {
  const db = new Database(databasePath);
  const hash = bcrypt.hashSync('test123456', 4);
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, executive_role, account_status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);
  const ceoId = Number(insertUser.run('meeting_ceo', hash, 'Meeting CEO', 'member', 'ceo').lastInsertRowid);
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
  [ceoId, designatedId, outsiderId].forEach(userId => {
    insertSensitive.run(userId);
    insertMenu.run(userId);
  });
  db.close();
  return { ceoId, designatedId, outsiderId };
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
  const users = seedUsers(databasePath);
  const baseUrl = `http://127.0.0.1:${port}`;
  const [ceoToken, designatedToken, outsiderToken, adminToken] = await Promise.all([
    login(baseUrl, 'meeting_ceo'),
    login(baseUrl, 'meeting_member'),
    login(baseUrl, 'meeting_outsider'),
    login(baseUrl, 'admin', 'admin123'),
  ]);

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
  assert.equal(outsiderList.payload.length, 0);
  assert.equal(adminList.payload.length, 0);

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
  assert.equal(designatedDetail.payload.can_generate_agenda, 0);
  assert.equal(designatedDetail.payload.can_edit_decision, 0);
  assert.equal(outsiderDetail.status, 404);

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

  const earlyGenerate = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda/generate`, {
    method: 'POST',
    token: ceoToken,
    body: { sections: [{ title: '当前准备内容', content: '仅部分负责人完成填写' }] },
  });
  assert.equal(earlyGenerate.status, 200, JSON.stringify(earlyGenerate.payload));
  assert.ok(earlyGenerate.payload.agenda?.meeting_goal);

  const agendaContent = {
    format: 'relation_document_body_v1',
    blocks: [{ id: 'agenda-1', type: 'paragraph', content: '本次会议提纲', meta: {} }],
  };
  const saveAgenda = await request(baseUrl, `/api/operational-meetings/${meetingId}/agenda`, {
    method: 'PUT',
    token: ceoToken,
    body: {
      agenda: agendaContent,
      source_hash: earlyGenerate.payload.source_hash,
      model_provider: 'rule',
      prompt_version: earlyGenerate.payload.prompt_version,
      safety_scan_status: 'passed',
    },
  });
  assert.equal(saveAgenda.status, 200, JSON.stringify(saveAgenda.payload));

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
  assert.equal(outsiderAnnual.payload.meetings.length, 0);
  assert.deepEqual(designatedAnnual.payload.meetings[0].agenda.agenda_content, agendaContent);
  assert.deepEqual(designatedAnnual.payload.meetings[0].decision.decision_content, decisionContent);

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
  assert.equal(designatedAfterRemove.status, 404);
  const cxoAfterRemove = await request(baseUrl, `/api/operational-meetings/${meetingId}`, { token: ceoToken });
  const removedPreparation = cxoAfterRemove.payload.sections.find(
    section => Number(section.owner_user_id) === users.designatedId,
  );
  assert.ok(removedPreparation);
  assert.equal(removedPreparation.authorized_user_ids, undefined);
});
