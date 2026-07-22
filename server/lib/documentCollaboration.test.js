const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDocumentCollaborationHub,
  normalizePresencePayload,
} = require('./documentCollaboration');

test('normalizes spreadsheet presence without exposing unrelated user fields', () => {
  const payload = normalizePresencePayload({
    session_id: 'session_12345678',
    sheet_id: 'sheet-1',
    selection: { startRow: 5, endRow: 2, startColumn: 4, endColumn: 1 },
  });
  assert.deepEqual(payload, {
    sessionId: 'session_12345678',
    sheetId: 'sheet-1',
    selection: { startRow: 2, endRow: 5, startColumn: 1, endColumn: 4 },
  });
  assert.throws(() => normalizePresencePayload({
    session_id: '../bad',
    sheet_id: 'sheet-1',
    selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
  }), /协作会话 ID 不合法/);
  assert.throws(() => normalizePresencePayload({
    session_id: 'session_12345678',
    sheet_id: 'sheet-1',
    selection: { startRow: 100000, endRow: 100000, startColumn: 0, endColumn: 0 },
  }), /选区起始行不合法/);
});

test('publishes presence and document updates while pruning stale sessions', () => {
  let currentTime = 1000;
  const hub = createDocumentCollaborationHub({
    now: () => currentTime,
    staleAfterMs: 20000,
  });
  const events = [];
  const unsubscribe = hub.subscribe(9, event => events.push(event));

  const collaborators = hub.updatePresence(9, {
    id: 7,
    display_name: '协作者甲',
    role: 'admin',
    password_hash: 'must-not-leak',
  }, {
    session_id: 'session_12345678',
    sheet_id: 'sheet-1',
    selection: { startRow: 1, endRow: 2, startColumn: 3, endColumn: 4 },
  });
  assert.equal(collaborators.length, 1);
  assert.deepEqual(Object.keys(collaborators[0]).sort(), [
    'color',
    'last_seen_at',
    'selection',
    'session_id',
    'sheet_id',
    'user_id',
    'user_name',
  ]);
  assert.equal(events[0].type, 'presence');

  hub.publishDocumentUpdated(9, {
    updated_at: '2026-07-22 15:00:00',
    updated_by: 7,
    updated_by_name: '协作者甲',
    action_type: 'spreadsheet_operations',
    content: 'must-not-leak',
  });
  assert.deepEqual(events[1], {
    type: 'document_updated',
    document_id: 9,
    updated_at: '2026-07-22 15:00:00',
    updated_by: 7,
    updated_by_name: '协作者甲',
    action_type: 'spreadsheet_operations',
  });

  currentTime += 20001;
  assert.equal(hub.prunePresence(9), true);
  assert.deepEqual(hub.listPresence(9), []);
  unsubscribe();
});

test('removes only the matching user session', () => {
  const hub = createDocumentCollaborationHub();
  const selection = { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 };
  hub.updatePresence(3, { id: 1, display_name: '甲' }, {
    session_id: 'shared_session', sheet_id: 'sheet-1', selection,
  });
  hub.updatePresence(3, { id: 2, display_name: '乙' }, {
    session_id: 'shared_session', sheet_id: 'sheet-1', selection,
  });

  assert.equal(hub.removePresence(3, 1, 'shared_session'), true);
  assert.deepEqual(hub.listPresence(3).map(item => item.user_id), [2]);
  assert.equal(hub.removePresence(3, 1, 'shared_session'), false);
});
