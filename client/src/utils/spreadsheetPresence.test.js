import {
  buildSpreadsheetPresencePayload,
  filterRemoteSpreadsheetCollaborators,
} from './spreadsheetPresence';

test('builds presence from the complete same-sheet selection', () => {
  expect(buildSpreadsheetPresencePayload({
    sessionId: 'sheet-session',
    selectedCell: { sheetId: 'sheet-1', rowIndex: 4, columnIndex: 3 },
    selectionState: {
      sheetId: 'sheet-1',
      selection: { startRow: 2, endRow: 4, startColumn: 1, endColumn: 3 },
    },
  })).toEqual({
    session_id: 'sheet-session',
    sheet_id: 'sheet-1',
    selection: { startRow: 2, endRow: 4, startColumn: 1, endColumn: 3 },
  });
});

test('prefers the emitted selection sheet, falls back to the selected cell, and removes the current session', () => {
  expect(buildSpreadsheetPresencePayload({
    sessionId: 'sheet-session',
    selectedCell: { sheetId: 'sheet-2', rowIndex: 8, columnIndex: 5 },
    selectionState: {
      sheetId: 'sheet-1',
      selection: { startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 },
    },
  })).toMatchObject({
    sheet_id: 'sheet-1',
    selection: { startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 },
  });
  expect(buildSpreadsheetPresencePayload({
    sessionId: 'sheet-session',
    selectedCell: { sheetId: 'sheet-2', rowIndex: 8, columnIndex: 5 },
    selectionState: null,
  }).selection).toEqual({ startRow: 8, endRow: 8, startColumn: 5, endColumn: 5 });

  expect(filterRemoteSpreadsheetCollaborators([
    { session_id: 'sheet-session', user_name: '自己' },
    { session_id: 'remote-session', user_name: '协作者' },
    { session_id: '', user_name: '无效' },
  ], 'sheet-session')).toEqual([
    { session_id: 'remote-session', user_name: '协作者' },
  ]);
});
