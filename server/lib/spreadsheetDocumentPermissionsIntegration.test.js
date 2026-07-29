const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const mysql = require('mysql2/promise');
const {
  buildSpreadsheetWorkbookXlsx,
  parseSpreadsheetWorkbookBuffer,
} = require('./spreadsheetWorkbookFile');

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
    const timeout = setTimeout(() => reject(new Error(`server start timeout\n${output}`)), 30000);
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

async function requestJson(baseUrl, route, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

async function requestExport(baseUrl, documentId, token = '') {
  const response = await fetch(`${baseUrl}/api/documents/${documentId}/spreadsheet/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    return {
      status: response.status,
      contentType,
      payload: await response.json(),
      buffer: null,
    };
  }
  return {
    status: response.status,
    contentType,
    payload: null,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

async function requestImport(baseUrl, documentId, workbookBuffer, token = '') {
  const form = new FormData();
  form.append(
    'file',
    new Blob([workbookBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'spreadsheet-permission-fixture.xlsx',
  );
  const response = await fetch(`${baseUrl}/api/documents/${documentId}/spreadsheet/import`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

async function login(baseUrl, username, password) {
  const response = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload;
}

function createEventStreamReader(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const parseNextBufferedEvent = () => {
    const match = buffer.match(/\r?\n\r?\n/);
    if (!match) return null;
    const frame = buffer.slice(0, match.index);
    buffer = buffer.slice(match.index + match[0].length);
    let type = 'message';
    const dataLines = [];
    frame.split(/\r?\n/).forEach(line => {
      if (line.startsWith('event:')) type = line.slice(6).trim() || type;
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    });
    if (!dataLines.length) return { type: 'comment' };
    return { type, ...JSON.parse(dataLines.join('\n')) };
  };
  return {
    async next(expectedType) {
      while (true) {
        const event = parseNextBufferedEvent();
        if (event && event.type !== 'comment' && (!expectedType || event.type === expectedType)) return event;
        const { done, value } = await reader.read();
        assert.equal(done, false, `event stream ended before ${expectedType || 'next event'}`);
        buffer += decoder.decode(value, { stream: true });
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {}
    },
  };
}

function createWorkbook() {
  return {
    format: 'relation_spreadsheet_workbook_v1',
    version: 1,
    activeSheetId: 'sheet-1',
    sheets: [{
      id: 'sheet-1',
      name: '权限测试',
      rowCount: 20,
      columnCount: 10,
      cells: {
        A1: { v: '10' },
        A2: { v: '20' },
        B1: { v: '=SUM(A1:A2)' },
      },
    }],
  };
}

test('spreadsheet APIs enforce permissions and keep derived content text consistent', {
  skip: RUN_MYSQL_TESTS ? false : 'set RELATION_RUN_MYSQL_TESTS=1 to run isolated MySQL integration tests',
  timeout: 90000,
}, async t => {
  const mysqlConfig = getMysqlConfig();
  const databaseName = `relation_sheet_perm_${process.pid}_${Date.now()}`;
  const adminConnection = await mysql.createConnection(mysqlConfig);
  await adminConnection.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      DB_CLIENT: 'mysql',
      MYSQL_HOST: mysqlConfig.host,
      MYSQL_PORT: String(mysqlConfig.port),
      MYSQL_USER: mysqlConfig.user,
      MYSQL_PASSWORD: mysqlConfig.password,
      MYSQL_DATABASE: databaseName,
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      PORT: String(port),
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      const exitPromise = once(child, 'exit');
      child.kill('SIGTERM');
      const exited = await Promise.race([
        exitPromise.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 3000)),
      ]);
      if (!exited && child.exitCode === null) {
        const forcedExitPromise = once(child, 'exit');
        child.kill('SIGKILL');
        await forcedExitPromise;
      }
    }
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.end();
  });

  await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const admin = await login(baseUrl, 'admin', 'admin123');

  const readonlyPassword = 'spreadsheet-readonly-test-123';
  const readonlyUsername = `sheet_readonly_${Date.now()}`;
  const readonlyUser = await requestJson(baseUrl, '/api/users', {
    method: 'POST',
    token: admin.token,
    body: {
      username: readonlyUsername,
      password: readonlyPassword,
      display_name: '在线表格只读接口测试',
      role: 'readonly',
    },
  });
  assert.equal(readonlyUser.status, 200, JSON.stringify(readonlyUser.payload));
  const editorPassword = 'spreadsheet-editor-test-123';
  const editorUsername = `sheet_editor_${Date.now()}`;
  const editorUser = await requestJson(baseUrl, '/api/users', {
    method: 'POST',
    token: admin.token,
    body: {
      username: editorUsername,
      password: editorPassword,
      display_name: '在线表格锁定权限测试',
      role: 'member',
    },
  });
  assert.equal(editorUser.status, 200, JSON.stringify(editorUser.payload));

  const workbook = createWorkbook();
  const createdDocument = await requestJson(baseUrl, '/api/documents', {
    method: 'POST',
    token: admin.token,
    body: {
      title: '在线表格权限接口测试',
      document_kind: 'spreadsheet',
      content: workbook,
    },
  });
  assert.equal(createdDocument.status, 200, JSON.stringify(createdDocument.payload));
  const documentId = Number(createdDocument.payload.id);
  assert.match(createdDocument.payload.content_text, /权限测试/);
  assert.match(createdDocument.payload.content_text, /A1 10/);

  const operationDocument = await requestJson(baseUrl, '/api/documents', {
    method: 'POST',
    token: admin.token,
    body: {
      title: '在线表格单元格操作接口测试',
      document_kind: 'spreadsheet',
      content: workbook,
    },
  });
  assert.equal(operationDocument.status, 200, JSON.stringify(operationDocument.payload));
  const operationDocumentId = Number(operationDocument.payload.id);
  const anonymousEvents = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/events?session_id=anonymous_session`,
  );
  assert.equal(anonymousEvents.status, 401, JSON.stringify(anonymousEvents.payload));
  const collaborationAbortController = new AbortController();
  const collaborationResponse = await fetch(
    `${baseUrl}/api/documents/${operationDocumentId}/spreadsheet/events?session_id=admin_session_123`,
    {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${admin.token}`,
      },
      signal: collaborationAbortController.signal,
    },
  );
  assert.equal(collaborationResponse.status, 200);
  assert.match(collaborationResponse.headers.get('content-type') || '', /text\/event-stream/);
  const collaborationEvents = createEventStreamReader(collaborationResponse);
  t.after(async () => {
    collaborationAbortController.abort();
    await collaborationEvents.cancel();
  });
  const connectedEvent = await collaborationEvents.next('connected');
  assert.equal(connectedEvent.document_id, operationDocumentId);
  assert.equal(connectedEvent.session_id, 'admin_session_123');
  await collaborationEvents.next('presence');
  const adminPresence = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/presence`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        session_id: 'admin_session_123',
        sheet_id: 'sheet-1',
        selection: { startRow: 1, endRow: 2, startColumn: 3, endColumn: 4 },
      },
    },
  );
  assert.equal(adminPresence.status, 200, JSON.stringify(adminPresence.payload));
  assert.deepEqual(adminPresence.payload.collaborators[0].selection, {
    startRow: 1,
    endRow: 2,
    startColumn: 3,
    endColumn: 4,
  });
  assert.deepEqual(Object.keys(adminPresence.payload.collaborators[0]).sort(), [
    'color',
    'last_seen_at',
    'selection',
    'session_id',
    'sheet_id',
    'user_id',
    'user_name',
  ]);
  const presenceEvent = await collaborationEvents.next('presence');
  assert.equal(presenceEvent.collaborators[0].session_id, 'admin_session_123');
  const firstCellOperationBody = {
    base_updated_at: operationDocument.payload.updated_at,
    operations: [{
      id: 'admin-a1-first',
      type: 'set_cell',
      sheet_id: 'sheet-1',
      cell: 'A1',
      before: { v: '10' },
      after: { v: '11' },
    }],
  };
  const anonymousCellOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    { method: 'POST', body: firstCellOperationBody },
  );
  assert.equal(anonymousCellOperation.status, 401, JSON.stringify(anonymousCellOperation.payload));
  const firstCellOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    { method: 'POST', token: admin.token, body: firstCellOperationBody },
  );
  assert.equal(firstCellOperation.status, 200, JSON.stringify(firstCellOperation.payload));
  assert.equal(firstCellOperation.payload.operation_result.changed, true);
  assert.equal(firstCellOperation.payload.operation_result.merged_remote_update, false);
  assert.notEqual(firstCellOperation.payload.updated_at, operationDocument.payload.updated_at);
  const documentUpdatedEvent = await collaborationEvents.next('document_updated');
  assert.equal(documentUpdatedEvent.document_id, operationDocumentId);
  assert.equal(documentUpdatedEvent.updated_at, firstCellOperation.payload.updated_at);
  assert.equal(documentUpdatedEvent.action_type, 'spreadsheet_operations');
  collaborationAbortController.abort();
  await collaborationEvents.cancel();
  const adminPresenceCleanup = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/presence/admin_session_123`,
    { method: 'DELETE', token: admin.token },
  );
  assert.equal(adminPresenceCleanup.status, 200, JSON.stringify(adminPresenceCleanup.payload));
  await new Promise(resolve => setTimeout(resolve, 50));
  const [presenceOperationLogs] = await adminConnection.query(
    `SELECT COUNT(*) AS count FROM \`${databaseName}\`.operation_logs WHERE path LIKE '%/spreadsheet/presence%'`,
  );
  assert.equal(Number(presenceOperationLogs[0]?.count || 0), 0);
  const retriedCellOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    { method: 'POST', token: admin.token, body: firstCellOperationBody },
  );
  assert.equal(retriedCellOperation.status, 200, JSON.stringify(retriedCellOperation.payload));
  assert.equal(retriedCellOperation.payload.operation_result.changed, false);
  assert.equal(retriedCellOperation.payload.operation_result.merged_remote_update, true);
  assert.equal(retriedCellOperation.payload.updated_at, firstCellOperation.payload.updated_at);

  const styleOnlyOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: firstCellOperation.payload.updated_at,
        operations: [{
          id: 'admin-b1-style-only',
          type: 'set_cell',
          sheet_id: 'sheet-1',
          cell: 'B1',
          before: { v: '=SUM(A1:A2)' },
          after: { v: '=SUM(A1:A2)', style: { bold: true } },
        }],
      },
    },
  );
  assert.equal(styleOnlyOperation.status, 200, JSON.stringify(styleOnlyOperation.payload));
  assert.equal(styleOnlyOperation.payload.operation_result.changed, true);
  assert.equal(styleOnlyOperation.payload.content_text, firstCellOperation.payload.content_text);
  const documentAfterStyleOnlyOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}`,
    { token: admin.token },
  );
  assert.equal(
    documentAfterStyleOnlyOperation.status,
    200,
    JSON.stringify(documentAfterStyleOnlyOperation.payload),
  );
  const styleOnlyEditRecord = documentAfterStyleOnlyOperation.payload.edit_records.find(record => (
    record.action_type === 'spreadsheet_operations'
    && String(record.diff_text || '').includes('表格格式或结构已更新')
  ));
  assert.ok(styleOnlyEditRecord, JSON.stringify(documentAfterStyleOnlyOperation.payload.edit_records));
  assert.equal(styleOnlyEditRecord.can_restore, true);

  const differentCellStaleOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: operationDocument.payload.updated_at,
        operations: [{
          id: 'admin-a2-stale-base',
          type: 'set_cell',
          sheet_id: 'sheet-1',
          cell: 'A2',
          before: { v: '20' },
          after: { v: '21' },
        }],
      },
    },
  );
  assert.equal(differentCellStaleOperation.status, 200, JSON.stringify(differentCellStaleOperation.payload));
  assert.equal(differentCellStaleOperation.payload.operation_result.merged_remote_update, true);

  const mixedStructuralOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: differentCellStaleOperation.payload.updated_at,
        operations: [
          {
            id: 'admin-rename-sheet',
            type: 'set_sheet_property',
            sheet_id: 'sheet-1',
            property: 'name',
            before: '权限测试',
            after: '权限测试（协作）',
          },
          {
            id: 'admin-freeze-sheet',
            type: 'set_sheet_property',
            sheet_id: 'sheet-1',
            property: 'frozen',
            before: null,
            after: { rows: 1, columns: 1 },
          },
          {
            id: 'admin-b2-mixed',
            type: 'set_cell',
            sheet_id: 'sheet-1',
            cell: 'B2',
            before: null,
            after: { v: '结构操作' },
          },
        ],
      },
    },
  );
  assert.equal(mixedStructuralOperation.status, 200, JSON.stringify(mixedStructuralOperation.payload));
  assert.equal(mixedStructuralOperation.payload.operation_result.changed, true);
  const mixedStructuralWorkbook = JSON.parse(mixedStructuralOperation.payload.content);
  assert.equal(mixedStructuralWorkbook.sheets[0].name, '权限测试（协作）');
  assert.deepEqual(mixedStructuralWorkbook.sheets[0].frozen, { rows: 1, columns: 1 });
  assert.equal(mixedStructuralWorkbook.sheets[0].cells.B2.v, '结构操作');

  const stalePropertyOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: differentCellStaleOperation.payload.updated_at,
        operations: [
          {
            id: 'admin-c3-atomic-reject',
            type: 'set_cell',
            sheet_id: 'sheet-1',
            cell: 'C3',
            before: null,
            after: { v: '不应部分写入' },
          },
          {
            id: 'admin-rename-conflict',
            type: 'set_sheet_property',
            sheet_id: 'sheet-1',
            property: 'name',
            before: '权限测试',
            after: '冲突改名',
          },
        ],
      },
    },
  );
  assert.equal(stalePropertyOperation.status, 409, JSON.stringify(stalePropertyOperation.payload));
  assert.equal(stalePropertyOperation.payload.code, 'SPREADSHEET_OPERATION_CONFLICT');
  assert.deepEqual(stalePropertyOperation.payload.conflicts, [{
    operation_id: 'admin-rename-conflict',
    type: 'set_sheet_property',
    sheet_id: 'sheet-1',
    property: 'name',
    current: '权限测试（协作）',
  }]);

  const invalidPropertyOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: mixedStructuralOperation.payload.updated_at,
        operations: [{
          id: 'admin-invalid-property',
          type: 'set_sheet_property',
          sheet_id: 'sheet-1',
          property: 'cells',
          before: {},
          after: {},
        }],
      },
    },
  );
  assert.equal(invalidPropertyOperation.status, 400, JSON.stringify(invalidPropertyOperation.payload));
  assert.match(invalidPropertyOperation.payload.error, /工作表属性不支持/);

  const oversizedPropertyOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: mixedStructuralOperation.payload.updated_at,
        operations: [{
          id: 'admin-oversized-property',
          type: 'set_workbook_property',
          property: 'styles',
          before: {},
          after: { payload: 'X'.repeat(257 * 1024) },
        }],
      },
    },
  );
  assert.equal(oversizedPropertyOperation.status, 400, JSON.stringify(oversizedPropertyOperation.payload));
  assert.match(oversizedPropertyOperation.payload.error, /超过 256KB/);

  const sameCellStaleOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: operationDocument.payload.updated_at,
        operations: [{
          id: 'admin-a1-conflict',
          type: 'set_cell',
          sheet_id: 'sheet-1',
          cell: 'A1',
          before: { v: '10' },
          after: { v: '12' },
        }],
      },
    },
  );
  assert.equal(sameCellStaleOperation.status, 409, JSON.stringify(sameCellStaleOperation.payload));
  assert.equal(sameCellStaleOperation.payload.code, 'SPREADSHEET_OPERATION_CONFLICT');
  assert.deepEqual(sameCellStaleOperation.payload.conflicts, [{
    operation_id: 'admin-a1-conflict',
    type: 'set_cell',
    sheet_id: 'sheet-1',
    cell: 'A1',
    current: { v: '11' },
  }]);
  const operationDocumentAfterConflict = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}`,
    { token: admin.token },
  );
  assert.equal(operationDocumentAfterConflict.status, 200, JSON.stringify(operationDocumentAfterConflict.payload));
  const operationWorkbook = JSON.parse(operationDocumentAfterConflict.payload.content);
  assert.equal(operationDocumentAfterConflict.payload.updated_at, mixedStructuralOperation.payload.updated_at);
  assert.equal(operationWorkbook.sheets[0].name, '权限测试（协作）');
  assert.deepEqual(operationWorkbook.sheets[0].frozen, { rows: 1, columns: 1 });
  assert.equal(operationWorkbook.sheets[0].cells.A1.v, '11');
  assert.equal(operationWorkbook.sheets[0].cells.A2.v, '21');
  assert.equal(operationWorkbook.sheets[0].cells.B2.v, '结构操作');
  assert.equal(operationWorkbook.sheets[0].cells.C3, undefined);
  assert.match(operationDocumentAfterConflict.payload.content_text, /A1 11/);
  assert.match(operationDocumentAfterConflict.payload.content_text, /A2 21/);

  const structureWorkbook = createWorkbook();
  const structureSheet2 = {
    ...structuredClone(structureWorkbook.sheets[0]),
    id: 'sheet-2',
    name: '结构待删除',
    cells: { A1: { v: '待删除数据' } },
  };
  const structureSheet3 = {
    ...structuredClone(structureWorkbook.sheets[0]),
    id: 'sheet-3',
    name: '结构保留',
    cells: { B2: { v: '保留数据' } },
  };
  structureWorkbook.sheets.push(structureSheet2, structureSheet3);
  const structureDocument = await requestJson(baseUrl, '/api/documents', {
    method: 'POST',
    token: admin.token,
    body: {
      title: '在线表格结构操作接口测试',
      document_kind: 'spreadsheet',
      content: structureWorkbook,
    },
  });
  assert.equal(structureDocument.status, 200, JSON.stringify(structureDocument.payload));
  const structureDocumentId = Number(structureDocument.payload.id);
  const addedStructureSheet = {
    ...structuredClone(structureWorkbook.sheets[0]),
    id: 'sheet-4',
    name: '结构新增',
    cells: { C3: { v: '新增数据' } },
  };
  const invalidAddedStructureSheet = {
    ...structuredClone(addedStructureSheet),
    id: 'sheet-invalid',
    name: '结构非法',
    cells: { A100001: { v: '越界数据' } },
  };
  const invalidStructureOperation = await requestJson(
    baseUrl,
    `/api/documents/${structureDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: structureDocument.payload.updated_at,
        operations: [{
          id: 'reject-invalid-added-sheet',
          type: 'add_sheet',
          sheet_id: 'sheet-invalid',
          previous_sheet_id: 'sheet-3',
          next_sheet_id: '',
          index: 3,
          before: null,
          after: invalidAddedStructureSheet,
        }],
      },
    },
  );
  assert.equal(invalidStructureOperation.status, 400, JSON.stringify(invalidStructureOperation.payload));
  assert.match(invalidStructureOperation.payload.error, /工作表单元格坐标不合法/);
  const structureAfterInvalidOperation = await requestJson(
    baseUrl,
    `/api/documents/${structureDocumentId}`,
    { token: admin.token },
  );
  assert.equal(structureAfterInvalidOperation.status, 200, JSON.stringify(structureAfterInvalidOperation.payload));
  assert.equal(structureAfterInvalidOperation.payload.content, structureDocument.payload.content);
  assert.equal(structureAfterInvalidOperation.payload.updated_at, structureDocument.payload.updated_at);
  const structureOperation = await requestJson(
    baseUrl,
    `/api/documents/${structureDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: structureDocument.payload.updated_at,
        operations: [
          { id: 'delete-sheet-2', type: 'delete_sheet', sheet_id: 'sheet-2', before: structureSheet2, after: null },
          {
            id: 'add-sheet-4',
            type: 'add_sheet',
            sheet_id: 'sheet-4',
            previous_sheet_id: 'sheet-3',
            next_sheet_id: '',
            index: 2,
            before: null,
            after: addedStructureSheet,
          },
          {
            id: 'reorder-structure-sheets',
            type: 'reorder_sheets',
            before: ['sheet-1', 'sheet-3', 'sheet-4'],
            after: ['sheet-3', 'sheet-4', 'sheet-1'],
          },
          {
            id: 'activate-added-sheet',
            type: 'set_workbook_property',
            property: 'activeSheetId',
            before: 'sheet-1',
            after: 'sheet-4',
          },
        ],
      },
    },
  );
  assert.equal(structureOperation.status, 200, JSON.stringify(structureOperation.payload));
  assert.equal(structureOperation.payload.operation_result.changed, true);
  const structureOperationWorkbook = JSON.parse(structureOperation.payload.content);
  assert.deepEqual(structureOperationWorkbook.sheets.map(sheet => sheet.id), ['sheet-3', 'sheet-4', 'sheet-1']);
  assert.equal(structureOperationWorkbook.activeSheetId, 'sheet-4');
  assert.match(structureOperation.payload.content_text, /结构新增/);
  assert.match(structureOperation.payload.content_text, /C3 新增数据/);

  const remoteStructureEdit = await requestJson(
    baseUrl,
    `/api/documents/${structureDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: structureOperation.payload.updated_at,
        operations: [{
          id: 'remote-edit-sheet-3',
          type: 'set_cell',
          sheet_id: 'sheet-3',
          cell: 'C3',
          before: null,
          after: { v: '远端修改' },
        }],
      },
    },
  );
  assert.equal(remoteStructureEdit.status, 200, JSON.stringify(remoteStructureEdit.payload));
  const staleStructureDelete = await requestJson(
    baseUrl,
    `/api/documents/${structureDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: structureOperation.payload.updated_at,
        operations: [
          {
            id: 'stale-delete-sheet-3',
            type: 'delete_sheet',
            sheet_id: 'sheet-3',
            before: structureSheet3,
            after: null,
          },
          {
            id: 'must-not-write-d4',
            type: 'set_cell',
            sheet_id: 'sheet-1',
            cell: 'D4',
            before: null,
            after: { v: '不应部分落库' },
          },
        ],
      },
    },
  );
  assert.equal(staleStructureDelete.status, 409, JSON.stringify(staleStructureDelete.payload));
  assert.equal(staleStructureDelete.payload.code, 'SPREADSHEET_OPERATION_CONFLICT');
  assert.equal(staleStructureDelete.payload.conflicts[0].type, 'delete_sheet');
  assert.equal(staleStructureDelete.payload.conflicts[0].sheet_id, 'sheet-3');
  const structureAfterConflict = await requestJson(
    baseUrl,
    `/api/documents/${structureDocumentId}`,
    { token: admin.token },
  );
  assert.equal(structureAfterConflict.status, 200, JSON.stringify(structureAfterConflict.payload));
  const structureAfterConflictWorkbook = JSON.parse(structureAfterConflict.payload.content);
  assert.equal(structureAfterConflictWorkbook.sheets.find(sheet => sheet.id === 'sheet-3').cells.C3.v, '远端修改');
  assert.equal(structureAfterConflictWorkbook.sheets.find(sheet => sheet.id === 'sheet-1').cells.D4, undefined);
  assert.ok(structureAfterConflict.payload.edit_records.some(record => (
    record.action_type === 'spreadsheet_operations' && record.can_restore === true
  )));

  const staleMarker = `STALE_CONTENT_TEXT_${Date.now()}`;
  const markedWorkbook = structuredClone(workbook);
  markedWorkbook.sheets[0].cells.C3 = { v: staleMarker };
  const markedSave = await requestJson(baseUrl, `/api/documents/${documentId}/content`, {
    method: 'PUT',
    token: admin.token,
    body: {
      content: markedWorkbook,
      content_text: `权限测试\nA1 10\nC3 ${staleMarker}`,
      base_updated_at: createdDocument.payload.updated_at,
    },
  });
  assert.equal(markedSave.status, 200, JSON.stringify(markedSave.payload));
  assert.match(markedSave.payload.content_text, new RegExp(staleMarker));

  const cleanedWorkbook = structuredClone(markedWorkbook);
  delete cleanedWorkbook.sheets[0].cells.C3;
  const contentOnlySave = await requestJson(baseUrl, `/api/documents/${documentId}/content`, {
    method: 'PUT',
    token: admin.token,
    body: {
      content: cleanedWorkbook,
      base_updated_at: markedSave.payload.updated_at,
    },
  });
  assert.equal(contentOnlySave.status, 200, JSON.stringify(contentOnlySave.payload));
  assert.doesNotMatch(contentOnlySave.payload.content, new RegExp(staleMarker));
  assert.doesNotMatch(contentOnlySave.payload.content_text, new RegExp(staleMarker));
  assert.match(contentOnlySave.payload.content_text, /A1 10/);

  const documentAfterContentOnlySave = await requestJson(baseUrl, `/api/documents/${documentId}`, {
    token: admin.token,
  });
  assert.equal(documentAfterContentOnlySave.status, 200, JSON.stringify(documentAfterContentOnlySave.payload));
  assert.doesNotMatch(documentAfterContentOnlySave.payload.content, new RegExp(staleMarker));
  assert.doesNotMatch(documentAfterContentOnlySave.payload.content_text, new RegExp(staleMarker));
  const staleSearch = await requestJson(baseUrl, `/api/documents?search=${encodeURIComponent(staleMarker)}`, {
    token: admin.token,
  });
  assert.equal(staleSearch.status, 200, JSON.stringify(staleSearch.payload));
  assert.equal(staleSearch.payload.some(item => Number(item.id) === documentId), false);

  const fullUpdateMarker = `STALE_FULL_UPDATE_TEXT_${Date.now()}`;
  const fullUpdateWorkbook = structuredClone(cleanedWorkbook);
  fullUpdateWorkbook.sheets[0].cells.D4 = { v: fullUpdateMarker };
  const markedFullUpdate = await requestJson(baseUrl, `/api/documents/${documentId}`, {
    method: 'PUT',
    token: admin.token,
    body: {
      content: fullUpdateWorkbook,
      content_text: `权限测试\nD4 ${fullUpdateMarker}`,
      base_updated_at: contentOnlySave.payload.updated_at,
    },
  });
  assert.equal(markedFullUpdate.status, 200, JSON.stringify(markedFullUpdate.payload));
  const cleanedFullUpdate = await requestJson(baseUrl, `/api/documents/${documentId}`, {
    method: 'PUT',
    token: admin.token,
    body: {
      content: cleanedWorkbook,
      base_updated_at: markedFullUpdate.payload.updated_at,
    },
  });
  assert.equal(cleanedFullUpdate.status, 200, JSON.stringify(cleanedFullUpdate.payload));
  assert.doesNotMatch(cleanedFullUpdate.payload.content, new RegExp(fullUpdateMarker));
  assert.doesNotMatch(cleanedFullUpdate.payload.content_text, new RegExp(fullUpdateMarker));

  const staleHistoryMarker = `STALE_HISTORY_TEXT_${Date.now()}`;
  const staleHistorySave = await requestJson(baseUrl, `/api/documents/${documentId}/content`, {
    method: 'PUT',
    token: admin.token,
    body: {
      content: cleanedWorkbook,
      content_text: staleHistoryMarker,
      base_updated_at: cleanedFullUpdate.payload.updated_at,
    },
  });
  assert.equal(staleHistorySave.status, 200, JSON.stringify(staleHistorySave.payload));
  assert.equal(staleHistorySave.payload.content_text, staleHistoryMarker);
  const documentWithStaleHistory = await requestJson(baseUrl, `/api/documents/${documentId}`, {
    token: admin.token,
  });
  assert.equal(documentWithStaleHistory.status, 200, JSON.stringify(documentWithStaleHistory.payload));
  const staleHistoryRecord = documentWithStaleHistory.payload.edit_records.find(record => (
    record.diff_text === staleHistoryMarker
  ));
  assert.ok(staleHistoryRecord, JSON.stringify(documentWithStaleHistory.payload.edit_records));
  const restoredHistory = await requestJson(baseUrl, `/api/document-edit-records/${staleHistoryRecord.id}/restore`, {
    method: 'POST',
    token: admin.token,
    body: {},
  });
  assert.equal(restoredHistory.status, 200, JSON.stringify(restoredHistory.payload));
  assert.doesNotMatch(restoredHistory.payload.content_text, new RegExp(staleHistoryMarker));
  assert.match(restoredHistory.payload.content_text, /A1 10/);

  const duplicateIdWorkbook = structuredClone(workbook);
  duplicateIdWorkbook.sheets.push({
    ...structuredClone(duplicateIdWorkbook.sheets[0]),
    name: '重复 ID 明细',
  });
  const duplicateIdSave = await requestJson(baseUrl, `/api/documents/${documentId}/content`, {
    method: 'PUT',
    token: admin.token,
    body: {
      content: duplicateIdWorkbook,
      base_updated_at: restoredHistory.payload.updated_at,
    },
  });
  assert.equal(duplicateIdSave.status, 400, JSON.stringify(duplicateIdSave.payload));
  assert.match(duplicateIdSave.payload.error, /工作表 ID 不能重复/);
  const documentAfterRejectedSave = await requestJson(baseUrl, `/api/documents/${documentId}`, {
    token: admin.token,
  });
  assert.equal(documentAfterRejectedSave.status, 200, JSON.stringify(documentAfterRejectedSave.payload));
  assert.equal(documentAfterRejectedSave.payload.updated_at, restoredHistory.payload.updated_at);
  assert.equal(JSON.parse(documentAfterRejectedSave.payload.content).sheets.length, 1);

  const savedShares = await requestJson(baseUrl, `/api/documents/${documentId}/shares`, {
    method: 'PUT',
    token: admin.token,
    body: {
      shares: [{ target_type: 'user', target_id: Number(readonlyUser.payload.id) }],
    },
  });
  assert.equal(savedShares.status, 200, JSON.stringify(savedShares.payload));
  const savedOperationShares = await requestJson(baseUrl, `/api/documents/${operationDocumentId}/shares`, {
    method: 'PUT',
    token: admin.token,
    body: {
      shares: [
        { target_type: 'user', target_id: Number(readonlyUser.payload.id) },
        { target_type: 'user', target_id: Number(editorUser.payload.id) },
      ],
    },
  });
  assert.equal(savedOperationShares.status, 200, JSON.stringify(savedOperationShares.payload));

  const protectionBaseline = await requestJson(baseUrl, `/api/documents/${operationDocumentId}`, {
    token: admin.token,
  });
  assert.equal(protectionBaseline.status, 200, JSON.stringify(protectionBaseline.payload));
  const protectionWorkbook = JSON.parse(protectionBaseline.payload.content);
  const protectionSheet = protectionWorkbook.sheets.find(sheet => sheet.id === 'sheet-1');
  const protectedRanges = [{
    id: 'integration-lock-a1',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    ownerUserId: Number(admin.user.id),
    allowedUserIds: [],
    description: '接口锁定测试',
    enabled: true,
  }];
  const createProtection = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: admin.token,
      body: {
        base_updated_at: protectionBaseline.payload.updated_at,
        operations: [{
          id: 'integration-create-lock',
          type: 'set_sheet_property',
          sheet_id: 'sheet-1',
          property: 'protectedRanges',
          before: protectionSheet.protectedRanges || [],
          after: protectedRanges,
        }],
      },
    },
  );
  assert.equal(createProtection.status, 200, JSON.stringify(createProtection.payload));
  const editor = await login(baseUrl, editorUsername, editorPassword);
  const protectedDocument = await requestJson(baseUrl, `/api/documents/${operationDocumentId}`, {
    token: editor.token,
  });
  assert.equal(protectedDocument.status, 200, JSON.stringify(protectedDocument.payload));
  const protectedWorkbook = JSON.parse(protectedDocument.payload.content);
  const protectedSheet = protectedWorkbook.sheets.find(sheet => sheet.id === 'sheet-1');
  const protectedHistoryCount = protectedDocument.payload.edit_records.length;
  const deniedProtectedOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: editor.token,
      body: {
        base_updated_at: protectedDocument.payload.updated_at,
        operations: [{
          id: 'integration-denied-locked-cell',
          type: 'set_cell',
          sheet_id: 'sheet-1',
          cell: 'A1',
          before: protectedSheet.cells.A1,
          after: { v: '不应写入锁定区域' },
        }],
      },
    },
  );
  assert.equal(deniedProtectedOperation.status, 403, JSON.stringify(deniedProtectedOperation.payload));
  assert.equal(deniedProtectedOperation.payload.code, 'SPREADSHEET_PROTECTED_RANGE');

  const deniedFullWorkbook = structuredClone(protectedWorkbook);
  deniedFullWorkbook.sheets.find(sheet => sheet.id === 'sheet-1').cells.A1 = { v: '整本保存也不应写入' };
  const deniedFullSave = await requestJson(baseUrl, `/api/documents/${operationDocumentId}/content`, {
    method: 'PUT',
    token: editor.token,
    body: {
      content: deniedFullWorkbook,
      base_updated_at: protectedDocument.payload.updated_at,
    },
  });
  assert.equal(deniedFullSave.status, 403, JSON.stringify(deniedFullSave.payload));
  assert.equal(deniedFullSave.payload.code, 'SPREADSHEET_PROTECTED_RANGE');
  const afterDeniedProtectionWrites = await requestJson(baseUrl, `/api/documents/${operationDocumentId}`, {
    token: editor.token,
  });
  assert.equal(afterDeniedProtectionWrites.payload.updated_at, protectedDocument.payload.updated_at);
  assert.equal(afterDeniedProtectionWrites.payload.edit_records.length, protectedHistoryCount);
  assert.deepEqual(
    JSON.parse(afterDeniedProtectionWrites.payload.content).sheets.find(sheet => sheet.id === 'sheet-1').cells.A1,
    protectedSheet.cells.A1,
  );

  const unlockedCellOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: editor.token,
      body: {
        base_updated_at: protectedDocument.payload.updated_at,
        operations: [{
          id: 'integration-write-unlocked-cell',
          type: 'set_cell',
          sheet_id: 'sheet-1',
          cell: 'J20',
          before: null,
          after: { v: '可编辑' },
        }],
      },
    },
  );
  assert.equal(unlockedCellOperation.status, 200, JSON.stringify(unlockedCellOperation.payload));
  assert.equal(JSON.parse(unlockedCellOperation.payload.content).sheets
    .find(sheet => sheet.id === 'sheet-1').cells.J20.v, '可编辑');

  const readonly = await login(baseUrl, readonlyUsername, readonlyPassword);
  const readonlyPresence = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/presence`,
    {
      method: 'POST',
      token: readonly.token,
      body: {
        session_id: 'readonly_session_123',
        sheet_id: 'sheet-1',
        selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      },
    },
  );
  assert.equal(readonlyPresence.status, 200, JSON.stringify(readonlyPresence.payload));
  const readonlyCellOperation = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/operations`,
    {
      method: 'POST',
      token: readonly.token,
      body: {
        base_updated_at: operationDocumentAfterConflict.payload.updated_at,
        operations: [{
          id: 'readonly-denied',
          type: 'set_cell',
          sheet_id: 'sheet-1',
          cell: 'B2',
          before: null,
          after: { v: '不应写入' },
        }],
      },
    },
  );
  assert.equal(readonlyCellOperation.status, 403, JSON.stringify(readonlyCellOperation.payload));
  const readonlyPresenceCleanup = await requestJson(
    baseUrl,
    `/api/documents/${operationDocumentId}/spreadsheet/presence/readonly_session_123`,
    { method: 'DELETE', token: readonly.token },
  );
  assert.equal(readonlyPresenceCleanup.status, 200, JSON.stringify(readonlyPresenceCleanup.payload));
  const workbookFile = await buildSpreadsheetWorkbookXlsx(workbook);

  const anonymousExport = await requestExport(baseUrl, documentId);
  assert.equal(anonymousExport.status, 401, JSON.stringify(anonymousExport.payload));
  const anonymousImport = await requestImport(baseUrl, documentId, workbookFile);
  assert.equal(anonymousImport.status, 401, JSON.stringify(anonymousImport.payload));

  const adminExport = await requestExport(baseUrl, documentId, admin.token);
  assert.equal(adminExport.status, 200);
  assert.match(adminExport.contentType, /spreadsheetml\.sheet/);
  assert.ok(adminExport.buffer.length > 1000);
  const adminImport = await requestImport(baseUrl, documentId, workbookFile, admin.token);
  assert.equal(adminImport.status, 200, JSON.stringify(adminImport.payload));
  assert.equal(adminImport.payload.workbook.sheets[0].cells.B1.v, '=SUM(A1:A2)');

  const readonlyDocument = await requestJson(baseUrl, `/api/documents/${documentId}`, {
    token: readonly.token,
  });
  assert.equal(readonlyDocument.status, 200, JSON.stringify(readonlyDocument.payload));
  const readonlyExport = await requestExport(baseUrl, documentId, readonly.token);
  assert.equal(readonlyExport.status, 200);
  const readonlyWorkbook = await parseSpreadsheetWorkbookBuffer(readonlyExport.buffer);
  assert.equal(readonlyWorkbook.sheets[0].name, '权限测试');
  assert.equal(readonlyWorkbook.sheets[0].cells.B1.v, '=SUM(A1:A2)');
  const readonlyImport = await requestImport(baseUrl, documentId, workbookFile, readonly.token);
  assert.equal(readonlyImport.status, 403, JSON.stringify(readonlyImport.payload));
});
