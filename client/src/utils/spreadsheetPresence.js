import { normalizeSpreadsheetRange } from './spreadsheetWorkbook';

export function createSpreadsheetPresenceSessionId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `sheet_${uuid.replace(/-/g, '')}`;
  return `sheet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function buildSpreadsheetPresencePayload({ sessionId, selectedCell, selectionState }) {
  const selectionSheetId = String(selectionState?.sheetId || '').trim();
  const sheetId = selectionSheetId || String(selectedCell?.sheetId || '').trim();
  if (!sessionId || !sheetId) return null;
  const selectedRow = Math.max(0, Number(selectedCell?.rowIndex) || 0);
  const selectedColumn = Math.max(0, Number(selectedCell?.columnIndex) || 0);
  const sameSheetSelection = selectionSheetId === sheetId
    ? normalizeSpreadsheetRange(selectionState.selection)
    : null;
  const selection = sameSheetSelection || normalizeSpreadsheetRange({
    rowIndex: selectedRow,
    columnIndex: selectedColumn,
  });
  if (!selection) return null;
  return {
    session_id: sessionId,
    sheet_id: sheetId,
    selection,
  };
}

export function filterRemoteSpreadsheetCollaborators(collaborators, ownSessionId) {
  return (Array.isArray(collaborators) ? collaborators : [])
    .filter(item => item?.session_id && item.session_id !== ownSessionId && item?.user_name)
    .slice(0, 50);
}
