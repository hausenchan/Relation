import {
  SPREADSHEET_WORKBOOK_FORMAT,
  normalizeSpreadsheetWorkbook,
  parseSpreadsheetCellKey,
} from './spreadsheetWorkbook';

export const MAX_SPREADSHEET_OPERATIONS = 500;
export const MAX_SPREADSHEET_CELL_OPERATIONS = MAX_SPREADSHEET_OPERATIONS;
export const MAX_SPREADSHEET_CELL_SNAPSHOT_BYTES = 16 * 1024;
export const MAX_SPREADSHEET_PROPERTY_SNAPSHOT_BYTES = 256 * 1024;

const SHEET_OPERATION_PROPERTIES = [
  'name',
  'rowCount',
  'columnCount',
  'rowHeights',
  'columnWidths',
  'mergedCells',
  'filters',
  'filterRange',
  'frozen',
  'protectedRanges',
  'conditionalFormats',
  'dataValidations',
];
const WORKBOOK_OPERATION_PROPERTIES = ['activeSheetId', 'styles', 'definedNames'];
const KNOWN_SHEET_KEYS = new Set(['id', 'cells', ...SHEET_OPERATION_PROPERTIES]);
const KNOWN_WORKBOOK_KEYS = new Set(['format', 'sheets', ...WORKBOOK_OPERATION_PROPERTIES]);

function parseRawWorkbook(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || parsed.format !== SPREADSHEET_WORKBOOK_FORMAT || !Array.isArray(parsed.sheets) || !parsed.sheets.length) {
      return null;
    }
    const sheetIds = parsed.sheets.map(sheet => String(sheet?.id ?? '').trim());
    if (sheetIds.some(sheetId => !sheetId) || new Set(sheetIds).size !== sheetIds.length) return null;
    return cloneJsonValue(parsed);
  } catch {
    return null;
  }
}

function parseWorkbook(value) {
  const parsed = parseRawWorkbook(value);
  return parsed ? normalizeSpreadsheetWorkbook(parsed) : null;
}

function cloneJsonValue(value) {
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function normalizeCellAfterSnapshot(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return null;
  return value;
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getSnapshot(record, key) {
  return Object.prototype.hasOwnProperty.call(record || {}, key)
    ? cloneJsonValue(record[key])
    : null;
}

function hasUnsupportedDifferences(base, local, knownKeys) {
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {})]);
  return [...keys].some(key => !knownKeys.has(key) && !jsonEqual(getSnapshot(base, key), getSnapshot(local, key)));
}

function jsonSnapshotByteLength(value) {
  const serialized = JSON.stringify(value);
  if (!serialized) return Infinity;
  let bytes = 0;
  for (const char of serialized) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function operationSnapshotsFit(operation) {
  const limit = operation.type === 'set_cell'
    ? MAX_SPREADSHEET_CELL_SNAPSHOT_BYTES
    : MAX_SPREADSHEET_PROPERTY_SNAPSHOT_BYTES;
  return jsonSnapshotByteLength(operation.before) <= limit
    && jsonSnapshotByteLength(operation.after) <= limit;
}

function compareCellKeys(left, right) {
  const a = parseSpreadsheetCellKey(left);
  const b = parseSpreadsheetCellKey(right);
  if (!a || !b) return String(left).localeCompare(String(right));
  return (a.rowIndex - b.rowIndex) || (a.columnIndex - b.columnIndex);
}

function defaultOperationId({ type, sheetId, cell, property }, index) {
  const scope = sheetId ? String(sheetId).slice(0, 24) : 'workbook';
  const target = cell || property || 'value';
  return `${type}_${Date.now().toString(36)}_${index.toString(36)}_${scope}_${target}`.slice(0, 128);
}

function insertSheetIdAtAnchoredPosition(order, operation) {
  const previousIndex = operation.previous_sheet_id
    ? order.indexOf(String(operation.previous_sheet_id))
    : -1;
  const nextIndex = operation.next_sheet_id
    ? order.indexOf(String(operation.next_sheet_id))
    : -1;
  let targetIndex;
  if (previousIndex >= 0) targetIndex = previousIndex + 1;
  else if (nextIndex >= 0) targetIndex = nextIndex;
  else targetIndex = Math.min(Number(operation.index) || 0, order.length);
  order.splice(targetIndex, 0, String(operation.sheet_id));
}

export function buildSpreadsheetOperationSavePlan({
  baseWorkbook,
  localWorkbook,
  titleChanged = false,
  maxOperations = MAX_SPREADSHEET_OPERATIONS,
  operationIdFactory = defaultOperationId,
} = {}) {
  const baseRaw = parseRawWorkbook(baseWorkbook);
  const localRaw = parseRawWorkbook(localWorkbook);
  const base = parseWorkbook(baseWorkbook);
  const local = parseWorkbook(localWorkbook);
  if (!baseRaw || !localRaw || !base || !local) {
    return { mode: 'document', reason: 'invalid_workbook', operations: [] };
  }
  if (titleChanged) return { mode: 'document', reason: 'title_changed', operations: [] };
  if (hasUnsupportedDifferences(base, local, KNOWN_WORKBOOK_KEYS)) {
    return { mode: 'document', reason: 'unsupported_structure_changed', operations: [] };
  }

  const operations = [];
  const appendOperation = (operation, idContext) => {
    if (!operationSnapshotsFit(operation)) return 'snapshot_limit';
    if (operations.length >= maxOperations) return 'operation_limit';
    operation.id = String(operationIdFactory(idContext, operations.length));
    operations.push(operation);
    return '';
  };

  const baseSheetsById = new Map(base.sheets.map(sheet => [String(sheet.id), sheet]));
  const localSheetsById = new Map(local.sheets.map(sheet => [String(sheet.id), sheet]));
  const baseRawSheetsById = new Map(baseRaw.sheets.map(sheet => [String(sheet.id), sheet]));
  const localRawSheetsById = new Map(localRaw.sheets.map(sheet => [String(sheet.id), sheet]));
  const baseSheetIds = base.sheets.map(sheet => String(sheet.id));
  const localSheetIds = local.sheets.map(sheet => String(sheet.id));
  const removedSheetIds = baseSheetIds.filter(sheetId => !localSheetsById.has(sheetId));
  const addedSheetIds = localSheetIds.filter(sheetId => !baseSheetsById.has(sheetId));

  for (const sheetId of removedSheetIds) {
    const before = cloneJsonValue(baseRawSheetsById.get(sheetId) || baseSheetsById.get(sheetId));
    const operation = {
      id: '',
      type: 'delete_sheet',
      sheet_id: sheetId,
      before,
      after: null,
    };
    const reason = appendOperation(operation, {
      type: operation.type,
      sheetId,
      property: 'sheet',
      before,
      after: null,
    });
    if (reason) return { mode: 'document', reason, operations: [] };
  }

  const simulatedOrder = baseSheetIds.filter(sheetId => localSheetsById.has(sheetId));
  for (const sheetId of addedSheetIds) {
    const localIndex = localSheetIds.indexOf(sheetId);
    const localSheet = localRawSheetsById.get(sheetId) || localSheetsById.get(sheetId);
    if (hasUnsupportedDifferences({}, localSheet, KNOWN_SHEET_KEYS)) {
      return { mode: 'document', reason: 'unsupported_structure_changed', operations: [] };
    }
    const previousSheetId = localIndex > 0 ? localSheetIds[localIndex - 1] : '';
    const nextSheetId = previousSheetId
      ? ''
      : (localSheetIds.slice(localIndex + 1).find(candidateId => baseSheetsById.has(candidateId)) || '');
    const after = cloneJsonValue(localSheet);
    const operation = {
      id: '',
      type: 'add_sheet',
      sheet_id: sheetId,
      previous_sheet_id: previousSheetId,
      next_sheet_id: nextSheetId,
      index: localIndex,
      before: null,
      after,
    };
    const reason = appendOperation(operation, {
      type: operation.type,
      sheetId,
      property: 'sheet',
      before: null,
      after,
    });
    if (reason) return { mode: 'document', reason, operations: [] };
    insertSheetIdAtAnchoredPosition(simulatedOrder, operation);
  }

  if (!jsonEqual(simulatedOrder, localSheetIds)) {
    const operation = {
      id: '',
      type: 'reorder_sheets',
      before: simulatedOrder,
      after: localSheetIds,
    };
    const reason = appendOperation(operation, {
      type: operation.type,
      property: 'sheetOrder',
      before: simulatedOrder,
      after: localSheetIds,
    });
    if (reason) return { mode: 'document', reason, operations: [] };
  }

  for (const localSheet of local.sheets) {
    const sheetId = String(localSheet.id);
    const baseSheet = baseSheetsById.get(sheetId);
    if (!baseSheet) continue;
    if (hasUnsupportedDifferences(baseSheet, localSheet, KNOWN_SHEET_KEYS)) {
      return { mode: 'document', reason: 'unsupported_structure_changed', operations: [] };
    }

    // Apply dimensions before cells because set_cell may expand rowCount or columnCount on the server.
    for (const property of SHEET_OPERATION_PROPERTIES) {
      const before = getSnapshot(baseSheet, property);
      const after = getSnapshot(localSheet, property);
      if (jsonEqual(before, after)) continue;
      const operation = {
        id: '',
        type: 'set_sheet_property',
        sheet_id: sheetId,
        property,
        before,
        after,
      };
      const reason = appendOperation(operation, {
        type: operation.type,
        sheetId,
        property,
        before,
        after,
      });
      if (reason) return { mode: 'document', reason, operations: [] };
    }

    const cellKeys = [...new Set([
      ...Object.keys(baseSheet.cells || {}),
      ...Object.keys(localSheet.cells || {}),
    ])].sort(compareCellKeys);
    for (const cell of cellKeys) {
      const before = getSnapshot(baseSheet.cells, cell);
      const after = Object.prototype.hasOwnProperty.call(localSheet.cells || {}, cell)
        ? normalizeCellAfterSnapshot(getSnapshot(localSheet.cells, cell))
        : null;
      if (jsonEqual(before, after)) continue;
      if (!parseSpreadsheetCellKey(cell)) {
        return { mode: 'document', reason: 'invalid_cell', operations: [] };
      }
      const operation = {
        id: '',
        type: 'set_cell',
        sheet_id: sheetId,
        cell,
        before,
        after,
      };
      const reason = appendOperation(operation, {
        type: operation.type,
        sheetId,
        cell,
        before,
        after,
      });
      if (reason) return { mode: 'document', reason, operations: [] };
    }
  }

  for (const property of WORKBOOK_OPERATION_PROPERTIES) {
    const before = getSnapshot(base, property);
    const after = getSnapshot(local, property);
    if (jsonEqual(before, after)) continue;
    const operation = {
      id: '',
      type: 'set_workbook_property',
      property,
      before,
      after,
    };
    const reason = appendOperation(operation, {
      type: operation.type,
      property,
      before,
      after,
    });
    if (reason) return { mode: 'document', reason, operations: [] };
  }

  return { mode: 'operations', reason: '', operations };
}

export function spreadsheetOperationsAreApplied(workbookValue, operations = []) {
  const workbook = parseWorkbook(workbookValue);
  if (!workbook) return false;
  const sheets = new Map(workbook.sheets.map(sheet => [String(sheet.id), sheet]));
  return operations.every(operation => {
    let target;
    let key;
    if (operation.type === 'add_sheet') {
      const sheet = sheets.get(String(operation.sheet_id));
      return Boolean(sheet) && jsonEqual(sheet, normalizeSpreadsheetWorkbook({
        format: SPREADSHEET_WORKBOOK_FORMAT,
        activeSheetId: operation.sheet_id,
        sheets: [operation.after],
      }).sheets[0]);
    }
    if (operation.type === 'delete_sheet') {
      return !sheets.has(String(operation.sheet_id));
    }
    if (operation.type === 'reorder_sheets') {
      const affectedIds = new Set(operation.after.map(String));
      const currentOrder = workbook.sheets
        .map(sheet => String(sheet.id))
        .filter(sheetId => affectedIds.has(sheetId));
      return jsonEqual(currentOrder, operation.after.map(String));
    }
    if (operation.type === 'set_cell') {
      const sheet = sheets.get(String(operation.sheet_id));
      if (!sheet) return false;
      target = sheet.cells || {};
      key = operation.cell;
    } else if (operation.type === 'set_sheet_property') {
      const sheet = sheets.get(String(operation.sheet_id));
      if (!sheet) return false;
      target = sheet;
      key = operation.property;
    } else if (operation.type === 'set_workbook_property') {
      target = workbook;
      key = operation.property;
    } else return false;
    return jsonEqual(getSnapshot(target, key), operation.after);
  });
}
