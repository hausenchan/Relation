export const SPREADSHEET_WORKBOOK_FORMAT = 'relation_spreadsheet_workbook_v1';

const DEFAULT_ROW_COUNT = 1000;
const DEFAULT_COLUMN_COUNT = 26;
const MAX_FORMULA_LENGTH = 10000;
const MAX_FORMULA_RANGE_CELLS = 100000;
const MAX_FORMULA_DEPTH = 256;
const MAX_FROZEN_ROWS = 100;
const MAX_FROZEN_COLUMNS = 50;
const MAX_SHEET_NAME_LENGTH = 31;
const INVALID_SHEET_NAME_CHARACTERS = /[\\/*?:\[\]]/;
const FORMULA_ERROR_CODES = new Set([
  '#CYCLE!',
  '#DIV/0!',
  '#NAME?',
  '#REF!',
  '#VALUE!',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJsonValue(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function spreadsheetColumnLabel(index) {
  let value = Math.max(0, Number(index) || 0) + 1;
  let label = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    label = String.fromCharCode(65 + mod) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label || 'A';
}

export function spreadsheetColumnIndex(label) {
  const normalized = String(label || '').replace(/\$/g, '').toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return -1;
  return normalized.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function parseSpreadsheetCellKey(key) {
  const match = String(key || '').toUpperCase().match(/^\$?([A-Z]+)\$?([1-9]\d*)$/);
  if (!match) return null;
  return {
    columnIndex: spreadsheetColumnIndex(match[1]),
    rowIndex: Number(match[2]) - 1,
  };
}

export function buildSpreadsheetCellKey(rowIndex, columnIndex) {
  return `${spreadsheetColumnLabel(columnIndex)}${Math.max(0, Number(rowIndex) || 0) + 1}`;
}

const FORMULA_REFERENCE_PATTERN = /^(?:(?:'((?:''|[^'])+)'|([A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*))!)?(\$?)([A-Z]+)(\$?)([1-9]\d*)(?:\s*:\s*(?:(?:'((?:''|[^'])+)'|([A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*))!)?(\$?)([A-Z]+)(\$?)([1-9]\d*))?/i;

export function extractSpreadsheetFormulaReferences(formula, formulaSheetName = '') {
  const source = String(formula || '');
  if (!source.startsWith('=')) return [];
  const expression = source.slice(1);
  const references = [];
  let index = 0;
  while (index < expression.length) {
    if (expression[index] === '"') {
      index += 1;
      while (index < expression.length) {
        if (expression[index] === '"' && expression[index + 1] === '"') index += 2;
        else if (expression[index] === '"') {
          index += 1;
          break;
        } else index += 1;
      }
      continue;
    }
    const previous = index > 0 ? expression[index - 1] : '';
    if (previous && /[A-Za-z0-9_.$\u3400-\u9fff]/.test(previous)) {
      index += 1;
      continue;
    }
    const match = expression.slice(index).match(FORMULA_REFERENCE_PATTERN);
    if (!match) {
      index += 1;
      continue;
    }
    const nextCharacter = expression[index + match[0].length] || '';
    if (nextCharacter && /[A-Za-z0-9_.$\u3400-\u9fff]/.test(nextCharacter)) {
      index += 1;
      continue;
    }
    const startSheetName = (match[1]?.replace(/''/g, "'") || match[2] || formulaSheetName);
    const endSheetName = (match[7]?.replace(/''/g, "'") || match[8] || startSheetName);
    const startColumn = spreadsheetColumnIndex(match[4]);
    const startRow = Number(match[6]) - 1;
    const endColumn = match[10] ? spreadsheetColumnIndex(match[10]) : startColumn;
    const endRow = match[12] ? Number(match[12]) - 1 : startRow;
    if (startColumn >= 0 && startRow >= 0 && endColumn >= 0 && endRow >= 0) {
      references.push({
        token: match[0],
        startOffset: index + 1,
        endOffset: index + match[0].length + 1,
        sheetName: startSheetName,
        endSheetName,
        startRow: Math.min(startRow, endRow),
        endRow: Math.max(startRow, endRow),
        startColumn: Math.min(startColumn, endColumn),
        endColumn: Math.max(startColumn, endColumn),
        absoluteStartColumn: Boolean(match[3]),
        absoluteStartRow: Boolean(match[5]),
        absoluteEndColumn: Boolean(match[9]),
        absoluteEndRow: Boolean(match[11]),
      });
    }
    index += match[0].length;
  }
  return references;
}

function translateFormulaCoordinate(columnLabel, rowText, absoluteColumn, absoluteRow, rowDelta, columnDelta) {
  const rowIndex = Number(rowText) - 1 + (absoluteRow ? 0 : rowDelta);
  const columnIndex = spreadsheetColumnIndex(columnLabel) + (absoluteColumn ? 0 : columnDelta);
  if (rowIndex < 0 || columnIndex < 0) return '#REF!';
  return `${absoluteColumn}${spreadsheetColumnLabel(columnIndex)}${absoluteRow}${rowIndex + 1}`;
}

function translateFormulaReferenceToken(token, rowDelta, columnDelta) {
  const match = String(token || '').match(FORMULA_REFERENCE_PATTERN);
  if (!match) return token;
  const startPrefix = token.match(/^(?:'(?:''|[^'])+'|[A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*)!/)?.[0] || '';
  const startCoordinate = translateFormulaCoordinate(match[4], match[6], match[3], match[5], rowDelta, columnDelta);
  if (!match[10]) return `${startPrefix}${startCoordinate}`;
  const colonIndex = token.indexOf(':', startPrefix.length);
  const endPart = colonIndex >= 0 ? token.slice(colonIndex + 1).trim() : '';
  const endBangIndex = endPart.lastIndexOf('!');
  const endPrefix = endBangIndex >= 0 ? endPart.slice(0, endBangIndex + 1) : '';
  const endCoordinate = translateFormulaCoordinate(match[10], match[12], match[9], match[11], rowDelta, columnDelta);
  return `${startPrefix}${startCoordinate}:${endPrefix}${endCoordinate}`;
}

export function translateSpreadsheetFormulaForPaste(formula, rowDelta = 0, columnDelta = 0) {
  const references = extractSpreadsheetFormulaReferences(formula);
  if (!references.length || (!rowDelta && !columnDelta)) return formula;
  let result = String(formula);
  references.slice().reverse().forEach(reference => {
    const replacement = translateFormulaReferenceToken(reference.token, rowDelta, columnDelta);
    result = `${result.slice(0, reference.startOffset)}${replacement}${result.slice(reference.endOffset)}`;
  });
  return result;
}

function remapSpreadsheetFormulaToken(token, reference, mapper) {
  const match = String(token || '').match(FORMULA_REFERENCE_PATTERN);
  if (!match) return token;
  const mappedStart = mapper(reference.startRow, reference.startColumn);
  const mappedEnd = mapper(reference.endRow, reference.endColumn);
  if (!mappedStart || !mappedEnd) return '#REF!';
  const startPrefix = token.match(/^(?:'(?:''|[^'])+'|[A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*)!/)?.[0] || '';
  const startCoordinate = `${match[3]}${spreadsheetColumnLabel(mappedStart.columnIndex)}${match[5]}${mappedStart.rowIndex + 1}`;
  if (!match[10]) return `${startPrefix}${startCoordinate}`;
  const colonIndex = token.indexOf(':', startPrefix.length);
  const endPart = colonIndex >= 0 ? token.slice(colonIndex + 1).trim() : '';
  const endBangIndex = endPart.lastIndexOf('!');
  const endPrefix = endBangIndex >= 0 ? endPart.slice(0, endBangIndex + 1) : '';
  const endCoordinate = `${match[9]}${spreadsheetColumnLabel(mappedEnd.columnIndex)}${match[11]}${mappedEnd.rowIndex + 1}`;
  return `${startPrefix}${startCoordinate}:${endPrefix}${endCoordinate}`;
}

function remapWorkbookFormulaReferences(workbook, targetSheetName, mapper) {
  if (!workbook?.sheets?.length) return;
  const targetKey = spreadsheetSheetNameKey(targetSheetName);
  workbook.sheets.forEach(sheet => {
    Object.entries(sheet.cells || {}).forEach(([cellKey, cell]) => {
      const raw = cell && typeof cell === 'object' ? (cell.v ?? cell.value) : cell;
      if (typeof raw !== 'string' || !raw.startsWith('=')) return;
      const references = extractSpreadsheetFormulaReferences(raw, sheet.name)
        .filter(reference => (
          spreadsheetSheetNameKey(reference.sheetName) === targetKey
          && spreadsheetSheetNameKey(reference.endSheetName) === targetKey
        ));
      if (!references.length) return;
      let next = raw;
      references.slice().reverse().forEach(reference => {
        const replacement = remapSpreadsheetFormulaToken(reference.token, reference, mapper);
        next = `${next.slice(0, reference.startOffset)}${replacement}${next.slice(reference.endOffset)}`;
      });
      if (cell && typeof cell === 'object') {
        if (Object.prototype.hasOwnProperty.call(cell, 'v')) cell.v = next;
        else cell.value = next;
        delete cell.computed;
      } else sheet.cells[cellKey] = next;
    });
  });
}

function spreadsheetSheetNameLength(value) {
  return Array.from(String(value || '')).length;
}

function truncateSpreadsheetSheetName(value, maxLength = MAX_SHEET_NAME_LENGTH) {
  return Array.from(String(value || '')).slice(0, maxLength).join('');
}

function spreadsheetSheetNameKey(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-CN');
}

function sanitizeSpreadsheetSheetName(value, fallback) {
  const sanitized = String(value || '')
    .replace(/[\\/*?:\[\]]/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .trim();
  return truncateSpreadsheetSheetName(sanitized || fallback || '工作表');
}

function makeUniqueSpreadsheetSheetName(preferredName, usedNames, fallback = '工作表') {
  const base = sanitizeSpreadsheetSheetName(preferredName, fallback);
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(spreadsheetSheetNameKey(candidate))) {
    const tail = ` (${suffix})`;
    candidate = `${truncateSpreadsheetSheetName(base, MAX_SHEET_NAME_LENGTH - spreadsheetSheetNameLength(tail))}${tail}`;
    suffix += 1;
  }
  usedNames.add(spreadsheetSheetNameKey(candidate));
  return candidate;
}

export function validateSpreadsheetSheetName(value, sheets = [], currentSheetId = null) {
  const name = String(value ?? '').trim();
  if (!name) return { valid: false, name, error: '工作表名称不能为空' };
  if (spreadsheetSheetNameLength(name) > MAX_SHEET_NAME_LENGTH) {
    return { valid: false, name, error: `工作表名称不能超过 ${MAX_SHEET_NAME_LENGTH} 个字符` };
  }
  if (INVALID_SHEET_NAME_CHARACTERS.test(name)) {
    return { valid: false, name, error: '工作表名称不能包含 \\ / ? * [ ] :' };
  }
  if (name.startsWith("'") || name.endsWith("'")) {
    return { valid: false, name, error: '工作表名称不能以英文单引号开头或结尾' };
  }
  const duplicate = (Array.isArray(sheets) ? sheets : []).some(sheet => (
    String(sheet?.id) !== String(currentSheetId)
    && spreadsheetSheetNameKey(sheet?.name) === spreadsheetSheetNameKey(name)
  ));
  if (duplicate) return { valid: false, name, error: '工作表名称不能重复' };
  return { valid: true, name, error: '' };
}

export function getNextSpreadsheetSheetName(sheets = []) {
  const usedNames = new Set((Array.isArray(sheets) ? sheets : []).map(sheet => spreadsheetSheetNameKey(sheet?.name)));
  let index = 1;
  while (usedNames.has(spreadsheetSheetNameKey(`工作表${index}`))) index += 1;
  return `工作表${index}`;
}

function spreadsheetFormulaSheetName(name) {
  const value = String(name || '');
  return /^[A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*$/.test(value)
    ? value
    : `'${value.replace(/'/g, "''")}'`;
}

function replaceSpreadsheetFormulaSheetReferences(formula, previousName, nextName) {
  if (typeof formula !== 'string' || !formula.startsWith('=')) return formula;
  const previousKey = spreadsheetSheetNameKey(previousName);
  const nextReference = spreadsheetFormulaSheetName(nextName);
  let result = '';
  let index = 0;
  while (index < formula.length) {
    if (formula[index] === '"') {
      const start = index;
      index += 1;
      while (index < formula.length) {
        if (formula[index] === '"' && formula[index + 1] === '"') index += 2;
        else if (formula[index] === '"') {
          index += 1;
          break;
        } else index += 1;
      }
      result += formula.slice(start, index);
      continue;
    }
    if (formula[index] === "'") {
      const start = index;
      let decoded = '';
      index += 1;
      while (index < formula.length) {
        if (formula[index] === "'" && formula[index + 1] === "'") {
          decoded += "'";
          index += 2;
        } else if (formula[index] === "'") {
          index += 1;
          break;
        } else {
          decoded += formula[index];
          index += 1;
        }
      }
      if (formula[index] === '!' && spreadsheetSheetNameKey(decoded) === previousKey) {
        result += `${nextReference}!`;
        index += 1;
      } else result += formula.slice(start, index);
      continue;
    }
    const bareReference = formula.slice(index).match(/^([A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*)!/);
    if (bareReference) {
      result += spreadsheetSheetNameKey(bareReference[1]) === previousKey
        ? `${nextReference}!`
        : bareReference[0];
      index += bareReference[0].length;
      continue;
    }
    result += formula[index];
    index += 1;
  }
  return result;
}

export function renameSpreadsheetSheet(workbook, sheetId, nextName) {
  const sheet = workbook?.sheets?.find(item => String(item.id) === String(sheetId));
  if (!sheet) return workbook;
  const validation = validateSpreadsheetSheetName(nextName, workbook.sheets, sheet.id);
  if (!validation.valid) throw new Error(validation.error);
  const previousName = sheet.name;
  if (previousName === validation.name) {
    sheet.name = validation.name;
    return workbook;
  }
  workbook.sheets.forEach(item => {
    Object.entries(item.cells || {}).forEach(([key, cell]) => {
      const rawValue = cell && typeof cell === 'object' ? (cell.v ?? cell.value) : cell;
      const nextValue = replaceSpreadsheetFormulaSheetReferences(rawValue, previousName, validation.name);
      if (nextValue === rawValue) return;
      if (cell && typeof cell === 'object') {
        if (Object.prototype.hasOwnProperty.call(cell, 'v')) cell.v = nextValue;
        else cell.value = nextValue;
        delete cell.computed;
      } else item.cells[key] = nextValue;
    });
  });
  sheet.name = validation.name;
  return workbook;
}

export function createDefaultSpreadsheetSheet(index = 0, existingSheets = []) {
  return {
    id: `sheet_${index + 1}`,
    name: existingSheets.length ? getNextSpreadsheetSheetName(existingSheets) : `工作表${index + 1}`,
    rowCount: DEFAULT_ROW_COUNT,
    columnCount: DEFAULT_COLUMN_COUNT,
    cells: {},
    rowHeights: {},
    columnWidths: {},
    mergedCells: [],
    filters: [],
    frozen: null,
    protectedRanges: [],
    conditionalFormats: [],
    dataValidations: [],
  };
}

export function createDefaultSpreadsheetWorkbook() {
  const sheet = createDefaultSpreadsheetSheet(0);
  return {
    format: SPREADSHEET_WORKBOOK_FORMAT,
    activeSheetId: sheet.id,
    sheets: [sheet],
    styles: {},
    definedNames: {},
  };
}

export function getDocumentContentSignature(content) {
  return typeof content === 'string' ? content : JSON.stringify(content || {});
}

export function spreadsheetClipboardMatrixHasMultipleCells(matrix) {
  return Array.isArray(matrix) && (
    matrix.length > 1
    || matrix.some(row => Array.isArray(row) && row.length > 1)
  );
}

export function normalizeSpreadsheetRange(range, fallback = null) {
  if (!range) return fallback;
  const startRow = Number(range.startRow ?? range.rowIndex ?? range.row ?? 0);
  const endRow = Number(range.endRow ?? range.rowIndex ?? range.row ?? startRow);
  const startColumn = Number(range.startColumn ?? range.columnIndex ?? range.column ?? 0);
  const endColumn = Number(range.endColumn ?? range.columnIndex ?? range.column ?? startColumn);
  if (![startRow, endRow, startColumn, endColumn].every(Number.isFinite)) return fallback;
  return {
    startRow: Math.max(0, Math.min(startRow, endRow)),
    endRow: Math.max(0, Math.max(startRow, endRow)),
    startColumn: Math.max(0, Math.min(startColumn, endColumn)),
    endColumn: Math.max(0, Math.max(startColumn, endColumn)),
  };
}

function normalizeMergedCells(mergedCells, rowCount, columnCount) {
  const result = [];
  (Array.isArray(mergedCells) ? mergedCells : []).forEach(range => {
    const normalized = normalizeSpreadsheetRange(range);
    if (!normalized) return;
    normalized.endRow = Math.min(rowCount - 1, normalized.endRow);
    normalized.endColumn = Math.min(columnCount - 1, normalized.endColumn);
    if (normalized.endRow === normalized.startRow && normalized.endColumn === normalized.startColumn) return;
    if (result.some(item => spreadsheetRangesOverlap(item, normalized))) return;
    result.push(normalized);
  });
  return result;
}

function normalizeSpreadsheetRuleRanges(rules, rowCount, columnCount, prefix) {
  const usedIds = new Set();
  return (Array.isArray(rules) ? rules : []).flatMap((rule, index) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return [];
    const range = normalizeSpreadsheetRange(rule.range || rule);
    if (!range) return [];
    range.endRow = Math.min(rowCount - 1, range.endRow);
    range.endColumn = Math.min(columnCount - 1, range.endColumn);
    if (range.startRow >= rowCount || range.startColumn >= columnCount) return [];
    const baseId = String(rule.id || `${prefix}_${index + 1}`).trim().slice(0, 128) || `${prefix}_${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`.slice(0, 128);
      suffix += 1;
    }
    usedIds.add(id);
    return [{ ...rule, id, range, enabled: rule.enabled !== false }];
  });
}

export function normalizeSpreadsheetWorkbook(content) {
  const parsed = parseJsonValue(content, null);
  const source = parsed?.format === SPREADSHEET_WORKBOOK_FORMAT ? parsed : createDefaultSpreadsheetWorkbook();
  const sourceSheets = Array.isArray(source.sheets) && source.sheets.length
    ? source.sheets
    : createDefaultSpreadsheetWorkbook().sheets;
  const usedIds = new Set();
  const usedNames = new Set();
  const sheets = sourceSheets.map((sourceSheet, index) => {
    let id = String(sourceSheet?.id || `sheet_${index + 1}`);
    while (usedIds.has(id)) id = `${id}_${index + 1}`;
    usedIds.add(id);
    const cells = sourceSheet?.cells && typeof sourceSheet.cells === 'object' ? sourceSheet.cells : {};
    let maxRowIndex = 0;
    let maxColumnIndex = 0;
    Object.keys(cells).forEach(key => {
      const parsedKey = parseSpreadsheetCellKey(key);
      if (!parsedKey) return;
      maxRowIndex = Math.max(maxRowIndex, parsedKey.rowIndex);
      maxColumnIndex = Math.max(maxColumnIndex, parsedKey.columnIndex);
    });
    const rowCount = Math.max(20, Number(sourceSheet?.rowCount) || DEFAULT_ROW_COUNT, maxRowIndex + 1);
    const columnCount = Math.max(10, Number(sourceSheet?.columnCount) || DEFAULT_COLUMN_COUNT, maxColumnIndex + 1);
    const frozenRows = Math.max(0, Math.min(rowCount, MAX_FROZEN_ROWS, Number(sourceSheet?.frozen?.rows) || 0));
    const frozenColumns = Math.max(0, Math.min(columnCount, MAX_FROZEN_COLUMNS, Number(sourceSheet?.frozen?.columns) || 0));
    return {
      ...sourceSheet,
      id,
      name: makeUniqueSpreadsheetSheetName(sourceSheet?.name, usedNames, `工作表${index + 1}`),
      rowCount,
      columnCount,
      cells,
      rowHeights: sourceSheet?.rowHeights && typeof sourceSheet.rowHeights === 'object' ? sourceSheet.rowHeights : {},
      columnWidths: sourceSheet?.columnWidths && typeof sourceSheet.columnWidths === 'object' ? sourceSheet.columnWidths : {},
      mergedCells: normalizeMergedCells(sourceSheet?.mergedCells, rowCount, columnCount),
      filters: Array.isArray(sourceSheet?.filters) ? sourceSheet.filters.filter(Boolean) : [],
      frozen: frozenRows || frozenColumns ? { rows: frozenRows, columns: frozenColumns } : null,
      protectedRanges: normalizeSpreadsheetRuleRanges(sourceSheet?.protectedRanges, rowCount, columnCount, 'lock'),
      conditionalFormats: normalizeSpreadsheetRuleRanges(sourceSheet?.conditionalFormats, rowCount, columnCount, 'condition'),
      dataValidations: normalizeSpreadsheetRuleRanges(sourceSheet?.dataValidations, rowCount, columnCount, 'validation'),
    };
  });
  const activeSheetId = sheets.some(sheet => sheet.id === source.activeSheetId)
    ? source.activeSheetId
    : sheets[0].id;
  return {
    ...source,
    format: SPREADSHEET_WORKBOOK_FORMAT,
    activeSheetId,
    sheets,
    styles: source.styles && typeof source.styles === 'object' ? source.styles : {},
    definedNames: source.definedNames && typeof source.definedNames === 'object' ? source.definedNames : {},
  };
}

function spreadsheetSnapshotState(record, key) {
  const present = Boolean(record) && Object.prototype.hasOwnProperty.call(record, key);
  return { present, value: present ? record[key] : undefined };
}

function cloneSpreadsheetSnapshotValue(value) {
  return value === undefined ? undefined : clone(value);
}

function spreadsheetSnapshotStatesEqual(left, right) {
  if (left.present !== right.present) return false;
  if (!left.present) return true;
  return JSON.stringify(left.value) === JSON.stringify(right.value);
}

function mergeSpreadsheetSnapshotState(base, local, remote) {
  if (spreadsheetSnapshotStatesEqual(local, remote)) return { ...local, conflict: false };
  if (spreadsheetSnapshotStatesEqual(local, base)) return { ...remote, conflict: false };
  if (spreadsheetSnapshotStatesEqual(remote, base)) return { ...local, conflict: false };
  return { ...local, conflict: true };
}

function mergeSpreadsheetSnapshotRecord(base = {}, local = {}, remote = {}) {
  const value = {};
  let hadConflicts = false;
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  keys.forEach(key => {
    const merged = mergeSpreadsheetSnapshotState(
      spreadsheetSnapshotState(base, key),
      spreadsheetSnapshotState(local, key),
      spreadsheetSnapshotState(remote, key),
    );
    hadConflicts = hadConflicts || merged.conflict;
    if (merged.present) value[key] = cloneSpreadsheetSnapshotValue(merged.value);
  });
  return { value, hadConflicts };
}

function mergeSpreadsheetSheetSnapshot(baseSheet, localSheet, remoteSheet) {
  const baseState = { present: Boolean(baseSheet), value: baseSheet };
  const localState = { present: Boolean(localSheet), value: localSheet };
  const remoteState = { present: Boolean(remoteSheet), value: remoteSheet };
  if (!localSheet || !remoteSheet) {
    const merged = mergeSpreadsheetSnapshotState(baseState, localState, remoteState);
    const value = merged.conflict && !localSheet && remoteSheet ? remoteSheet : merged.value;
    return {
      sheet: (merged.present || value) ? cloneSpreadsheetSnapshotValue(value) : null,
      hadConflicts: merged.conflict,
    };
  }

  const sheet = { id: String(localSheet.id || remoteSheet.id) };
  let hadConflicts = false;
  const keys = new Set([
    ...Object.keys(baseSheet || {}),
    ...Object.keys(localSheet || {}),
    ...Object.keys(remoteSheet || {}),
  ]);
  keys.delete('id');
  keys.forEach(key => {
    if (['cells', 'rowHeights', 'columnWidths'].includes(key)) {
      const mergedRecord = mergeSpreadsheetSnapshotRecord(
        baseSheet?.[key],
        localSheet?.[key],
        remoteSheet?.[key],
      );
      sheet[key] = mergedRecord.value;
      hadConflicts = hadConflicts || mergedRecord.hadConflicts;
      return;
    }
    const merged = mergeSpreadsheetSnapshotState(
      spreadsheetSnapshotState(baseSheet, key),
      spreadsheetSnapshotState(localSheet, key),
      spreadsheetSnapshotState(remoteSheet, key),
    );
    hadConflicts = hadConflicts || merged.conflict;
    if (merged.present) sheet[key] = cloneSpreadsheetSnapshotValue(merged.value);
  });
  return { sheet, hadConflicts };
}

export function mergeSpreadsheetWorkbookSnapshots(baseValue, localValue, remoteValue) {
  const normalized = value => normalizeSpreadsheetWorkbook(
    typeof value === 'string' ? value : cloneSpreadsheetSnapshotValue(value) ?? null,
  );
  const base = normalized(baseValue);
  const local = normalized(localValue);
  const remote = normalized(remoteValue);
  const baseSheets = new Map(base.sheets.map(sheet => [String(sheet.id), sheet]));
  const localSheets = new Map(local.sheets.map(sheet => [String(sheet.id), sheet]));
  const remoteSheets = new Map(remote.sheets.map(sheet => [String(sheet.id), sheet]));
  const orderedSheetIds = [];
  const seenSheetIds = new Set();
  [base.sheets, local.sheets, remote.sheets].forEach(sheets => {
    sheets.forEach(sheet => {
      const id = String(sheet.id);
      if (seenSheetIds.has(id)) return;
      seenSheetIds.add(id);
      orderedSheetIds.push(id);
    });
  });

  let hadConflicts = false;
  const sheets = orderedSheetIds.map(id => {
    const merged = mergeSpreadsheetSheetSnapshot(
      baseSheets.get(id),
      localSheets.get(id),
      remoteSheets.get(id),
    );
    hadConflicts = hadConflicts || merged.hadConflicts;
    return merged.sheet;
  }).filter(Boolean);

  const workbook = { format: SPREADSHEET_WORKBOOK_FORMAT, sheets };
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  keys.delete('format');
  keys.delete('sheets');
  keys.delete('activeSheetId');
  keys.forEach(key => {
    if (['styles', 'definedNames'].includes(key)) {
      const mergedRecord = mergeSpreadsheetSnapshotRecord(base[key], local[key], remote[key]);
      workbook[key] = mergedRecord.value;
      hadConflicts = hadConflicts || mergedRecord.hadConflicts;
      return;
    }
    const merged = mergeSpreadsheetSnapshotState(
      spreadsheetSnapshotState(base, key),
      spreadsheetSnapshotState(local, key),
      spreadsheetSnapshotState(remote, key),
    );
    hadConflicts = hadConflicts || merged.conflict;
    if (merged.present) workbook[key] = cloneSpreadsheetSnapshotValue(merged.value);
  });
  const survivingSheetIds = new Set(sheets.map(sheet => String(sheet.id)));
  workbook.activeSheetId = [local.activeSheetId, remote.activeSheetId, base.activeSheetId, sheets[0]?.id]
    .find(id => survivingSheetIds.has(String(id))) || sheets[0]?.id;

  return {
    workbook: normalizeSpreadsheetWorkbook(workbook),
    hadRemoteChanges: getDocumentContentSignature(base) !== getDocumentContentSignature(remote),
    hadConflicts,
  };
}

export function getSpreadsheetCellObject(sheet, rowIndex, columnIndex) {
  const raw = sheet?.cells?.[buildSpreadsheetCellKey(rowIndex, columnIndex)];
  if (raw && typeof raw === 'object') return raw;
  return raw === undefined || raw === null || raw === '' ? {} : { v: raw };
}

export function getSpreadsheetCellRawValue(sheet, rowIndex, columnIndex) {
  const cell = getSpreadsheetCellObject(sheet, rowIndex, columnIndex);
  return cell.v ?? cell.value ?? '';
}

function spreadsheetDateFromValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (Number.isFinite(Number(value)) && String(value ?? '').trim() !== '') {
    const serial = Number(value);
    const milliseconds = Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date : null;
}

function fractionFromNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  const sign = number < 0 ? '-' : '';
  const absolute = Math.abs(number);
  const whole = Math.floor(absolute);
  const decimal = absolute - whole;
  if (!decimal) return `${sign}${whole}`;
  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Infinity;
  for (let denominator = 1; denominator <= 100; denominator += 1) {
    const numerator = Math.round(decimal * denominator);
    const error = Math.abs(decimal - numerator / denominator);
    if (error < bestError) {
      bestNumerator = numerator;
      bestDenominator = denominator;
      bestError = error;
    }
  }
  return `${sign}${whole ? `${whole} ` : ''}${bestNumerator}/${bestDenominator}`;
}

export function formatSpreadsheetDisplayValue(value, numberFormat) {
  if (!numberFormat || numberFormat === 'general' || typeof value === 'boolean') return value;
  const config = typeof numberFormat === 'string' ? { type: numberFormat } : numberFormat;
  const type = String(config?.type || 'general');
  if (type === 'general' || type === 'text' || String(value ?? '').startsWith('#')) return value;
  if (type === 'date' || type === 'time') {
    const date = spreadsheetDateFromValue(value);
    if (!date) return value;
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      ...(type === 'date'
        ? { year: 'numeric', month: '2-digit', day: '2-digit' }
        : {
          hour: '2-digit',
          minute: '2-digit',
          ...(config.showSeconds === false ? {} : { second: '2-digit' }),
          hourCycle: 'h23',
        }),
    }).format(date);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || String(value ?? '').trim() === '') return value;
  const decimals = Math.max(0, Math.min(10, Number(config.decimals) || 0));
  if (type === 'fraction') return fractionFromNumber(number);
  if (type === 'scientific') return number.toExponential(decimals || 2);
  let formatted;
  if (type === 'percentage') {
    formatted = new Intl.NumberFormat('zh-CN', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(number);
  } else if (type === 'currency' || type === 'accounting') {
    formatted = new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: config.currency || 'CNY',
      currencyDisplay: type === 'accounting' ? 'code' : 'symbol',
      minimumFractionDigits: decimals || 2,
      maximumFractionDigits: decimals || 2,
      useGrouping: config.useGrouping !== false,
    }).format(number);
  } else {
    formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: config.useGrouping !== false,
    }).format(number);
  }
  if (number < 0 && config.negativeStyle === 'parentheses') {
    return `(${formatted.replace('-', '')})`;
  }
  return formatted;
}

function cloneSpreadsheetCellStyle(style) {
  if (!style || typeof style !== 'object') return {};
  const next = clone(style);
  Object.keys(next).forEach(name => {
    if (next[name] === null || next[name] === undefined || next[name] === '') delete next[name];
  });
  return next;
}

export function createSpreadsheetFormatPattern(sheet, range) {
  const bounds = normalizeSpreadsheetRange(range);
  if (!bounds) return null;
  const rowCount = bounds.endRow - bounds.startRow + 1;
  const columnCount = bounds.endColumn - bounds.startColumn + 1;
  return {
    rowCount,
    columnCount,
    styles: Array.from({ length: rowCount }, (_, rowOffset) => (
      Array.from({ length: columnCount }, (_, columnOffset) => (
        cloneSpreadsheetCellStyle(getSpreadsheetCellObject(
          sheet,
          bounds.startRow + rowOffset,
          bounds.startColumn + columnOffset,
        ).style)
      ))
    )),
  };
}

export function applySpreadsheetFormatPattern(sheet, range, pattern) {
  const bounds = normalizeSpreadsheetRange(range);
  const rowCount = Math.max(0, Number(pattern?.rowCount) || 0);
  const columnCount = Math.max(0, Number(pattern?.columnCount) || 0);
  if (!bounds || !rowCount || !columnCount || !Array.isArray(pattern?.styles)) return sheet;
  if (!sheet.cells || typeof sheet.cells !== 'object') sheet.cells = {};

  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      const sourceRow = (row - bounds.startRow) % rowCount;
      const sourceColumn = (column - bounds.startColumn) % columnCount;
      const sourceStyle = cloneSpreadsheetCellStyle(pattern.styles[sourceRow]?.[sourceColumn]);
      const key = buildSpreadsheetCellKey(row, column);
      const next = { ...getSpreadsheetCellObject(sheet, row, column) };
      if (Object.keys(sourceStyle).length) next.style = sourceStyle;
      else delete next.style;
      if ((next.v ?? next.value ?? '') === '' && !next.style) delete sheet.cells[key];
      else sheet.cells[key] = next;
    }
  }
  sheet.rowCount = Math.max(Number(sheet.rowCount) || DEFAULT_ROW_COUNT, bounds.endRow + 1);
  sheet.columnCount = Math.max(Number(sheet.columnCount) || DEFAULT_COLUMN_COUNT, bounds.endColumn + 1);
  return sheet;
}

export function setSpreadsheetCellValue(sheet, rowIndex, columnIndex, value) {
  if (!sheet.cells || typeof sheet.cells !== 'object') sheet.cells = {};
  const key = buildSpreadsheetCellKey(rowIndex, columnIndex);
  const previous = getSpreadsheetCellObject(sheet, rowIndex, columnIndex);
  const nextValue = String(value ?? '');
  const nextCell = { ...previous };
  delete nextCell.value;
  delete nextCell.computed;
  if (nextValue !== '') nextCell.v = nextValue;
  else delete nextCell.v;
  if (nextCell.v === undefined && !Object.keys(nextCell.style || {}).length) delete sheet.cells[key];
  else sheet.cells[key] = nextCell;
  sheet.rowCount = Math.max(Number(sheet.rowCount) || DEFAULT_ROW_COUNT, rowIndex + 1);
  sheet.columnCount = Math.max(Number(sheet.columnCount) || DEFAULT_COLUMN_COUNT, columnIndex + 1);
  return sheet;
}

export function updateSpreadsheetRangeStyle(sheet, range, stylePatch) {
  const bounds = normalizeSpreadsheetRange(range);
  if (!bounds) return sheet;
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      const key = buildSpreadsheetCellKey(row, column);
      const previous = getSpreadsheetCellObject(sheet, row, column);
      const style = { ...(previous.style || {}), ...(stylePatch || {}) };
      Object.keys(style).forEach(name => {
        if (style[name] === null || style[name] === undefined || style[name] === '') delete style[name];
      });
      const next = { ...previous };
      if (Object.keys(style).length) next.style = style;
      else delete next.style;
      if ((next.v ?? next.value ?? '') === '' && !next.style) delete sheet.cells[key];
      else sheet.cells[key] = next;
    }
  }
  return sheet;
}

export function spreadsheetRangesOverlap(left, right) {
  const a = normalizeSpreadsheetRange(left);
  const b = normalizeSpreadsheetRange(right);
  if (!a || !b) return false;
  return a.startRow <= b.endRow && a.endRow >= b.startRow
    && a.startColumn <= b.endColumn && a.endColumn >= b.startColumn;
}

export function spreadsheetRangeContainsCell(range, rowIndex, columnIndex) {
  const normalized = normalizeSpreadsheetRange(range);
  return Boolean(normalized
    && rowIndex >= normalized.startRow
    && rowIndex <= normalized.endRow
    && columnIndex >= normalized.startColumn
    && columnIndex <= normalized.endColumn);
}

export function getSpreadsheetProtectedRangeAccess(sheet, range, options = {}) {
  const target = normalizeSpreadsheetRange(range);
  if (!target) return { allowed: true, rules: [], deniedRules: [] };
  const userId = Number(options.userId) || 0;
  const rules = (sheet?.protectedRanges || []).filter(rule => (
    rule?.enabled !== false && spreadsheetRangesOverlap(rule.range, target)
  ));
  if (options.canManage) return { allowed: true, rules, deniedRules: [] };
  const deniedRules = rules.filter(rule => {
    const ownerUserId = Number(rule.ownerUserId || rule.owner_user_id) || 0;
    const allowedUserIds = (rule.allowedUserIds || rule.allowed_user_ids || []).map(Number);
    return !userId || (ownerUserId !== userId && !allowedUserIds.includes(userId));
  });
  return { allowed: deniedRules.length === 0, rules, deniedRules };
}

function compareConditionalValues(actual, operator, expected, secondExpected) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  const secondNumber = Number(secondExpected);
  const numeric = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);
  const left = numeric ? actualNumber : String(actual ?? '');
  const right = numeric ? expectedNumber : String(expected ?? '');
  if (operator === 'greater_than') return left > right;
  if (operator === 'less_than') return left < right;
  if (operator === 'between') {
    if (numeric && Number.isFinite(secondNumber)) return left >= right && left <= secondNumber;
    return left >= right && left <= String(secondExpected ?? '');
  }
  if (operator === 'not_equal') return left !== right;
  return left === right;
}

function conditionalRuleMatches(sheet, rule, value, getValue) {
  const type = String(rule.type || rule.operator || 'equal');
  const values = Array.isArray(rule.values) ? rule.values : [rule.value, rule.secondValue];
  const text = String(value ?? '');
  if (type === 'blank') return text.trim() === '';
  if (type === 'not_blank') return text.trim() !== '';
  if (type === 'text_contains') return text.includes(String(values[0] ?? ''));
  if (type === 'date_before' || type === 'date_after' || type === 'date_equal') {
    const actualTime = new Date(text).getTime();
    const expectedTime = new Date(String(values[0] ?? '')).getTime();
    if (!Number.isFinite(actualTime) || !Number.isFinite(expectedTime)) return false;
    if (type === 'date_before') return actualTime < expectedTime;
    if (type === 'date_after') return actualTime > expectedTime;
    return actualTime === expectedTime;
  }
  if (type === 'duplicate' || type === 'unique') {
    const range = normalizeSpreadsheetRange(rule.range);
    if (!range || typeof getValue !== 'function') return false;
    let occurrences = 0;
    let scanned = 0;
    for (let row = range.startRow; row <= range.endRow && scanned < 10000; row += 1) {
      for (let column = range.startColumn; column <= range.endColumn && scanned < 10000; column += 1) {
        scanned += 1;
        if (String(getValue(sheet.id, row, column) ?? '') === text) occurrences += 1;
      }
    }
    return type === 'duplicate' ? occurrences > 1 : occurrences === 1;
  }
  return compareConditionalValues(value, type, values[0], values[1]);
}

export function getSpreadsheetConditionalStyle(sheet, rowIndex, columnIndex, value, getValue) {
  const rules = (sheet?.conditionalFormats || [])
    .filter(rule => rule?.enabled !== false && spreadsheetRangeContainsCell(rule.range, rowIndex, columnIndex))
    .sort((left, right) => (Number(left.priority) || 0) - (Number(right.priority) || 0));
  const style = {};
  for (const rule of rules) {
    if (!conditionalRuleMatches(sheet, rule, value, getValue)) continue;
    Object.assign(style, cloneSpreadsheetCellStyle(rule.style));
    if (rule.stopIfTrue) break;
  }
  return style;
}

function spreadsheetValidationMessage(rule) {
  return String(rule.message || rule.prompt || '输入内容不符合当前单元格的数据验证规则');
}

export function validateSpreadsheetCellInput(sheet, rowIndex, columnIndex, value, options = {}) {
  const rules = (sheet?.dataValidations || [])
    .filter(rule => rule?.enabled !== false && spreadsheetRangeContainsCell(rule.range, rowIndex, columnIndex))
    .sort((left, right) => (Number(left.priority) || 0) - (Number(right.priority) || 0));
  const text = String(value ?? '').trim();
  for (const rule of rules) {
    if (!text && rule.allowBlank !== false) continue;
    const type = String(rule.type || 'list');
    const values = Array.isArray(rule.values) ? rule.values.map(item => String(item)) : [];
    const number = Number(text);
    let valid = true;
    if (type === 'list') valid = values.includes(text);
    else if (type === 'number') {
      valid = Number.isFinite(number)
        && (rule.min === undefined || number >= Number(rule.min))
        && (rule.max === undefined || number <= Number(rule.max));
    } else if (type === 'date_time') valid = Number.isFinite(new Date(text).getTime());
    else if (type === 'text_length') {
      const length = Array.from(text).length;
      valid = (rule.min === undefined || length >= Number(rule.min))
        && (rule.max === undefined || length <= Number(rule.max));
    } else if (type === 'checkbox') valid = /^(true|false|1|0|是|否)$/i.test(text);
    else if (type === 'rating') valid = Number.isInteger(number) && number >= 1 && number <= 5;
    else if (type === 'progress') valid = Number.isFinite(number) && number >= 0 && number <= 100;
    else if (type === 'id_card') valid = /^(?:\d{15}|\d{17}[\dXx])$/.test(text);
    else if (type === 'mobile') valid = /^1[3-9]\d{9}$/.test(text);
    else if (type === 'landline') valid = /^(?:0\d{2,3}-?)?\d{7,8}$/.test(text);
    else if (type === 'email') valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
    else if (type === 'temperature') valid = Number.isFinite(number) && number >= -273.15 && number <= 1000;
    else if (type === 'custom_formula' && typeof options.evaluateCustomFormula === 'function') {
      valid = Boolean(options.evaluateCustomFormula(rule, { rowIndex, columnIndex, value }));
    }
    if (!valid) {
      return {
        valid: false,
        action: rule.invalidAction === 'warning' ? 'warning' : 'reject',
        message: spreadsheetValidationMessage(rule),
        rule,
      };
    }
  }
  return { valid: true, action: '', message: '', rule: null };
}

export function findSpreadsheetMergedRange(sheet, rowIndex, columnIndex) {
  return (sheet?.mergedCells || []).find(range => spreadsheetRangeContainsCell(range, rowIndex, columnIndex)) || null;
}

export function mergeSpreadsheetCells(sheet, range) {
  const normalized = normalizeSpreadsheetRange(range);
  if (!normalized || (normalized.startRow === normalized.endRow && normalized.startColumn === normalized.endColumn)) return sheet;
  const nextRanges = (sheet.mergedCells || []).filter(item => !spreadsheetRangesOverlap(item, normalized));
  const anchorKey = buildSpreadsheetCellKey(normalized.startRow, normalized.startColumn);
  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
      const key = buildSpreadsheetCellKey(row, column);
      if (key !== anchorKey) delete sheet.cells[key];
    }
  }
  sheet.mergedCells = [...nextRanges, normalized];
  return sheet;
}

export function unmergeSpreadsheetCells(sheet, range) {
  const normalized = normalizeSpreadsheetRange(range);
  if (!normalized) return sheet;
  sheet.mergedCells = (sheet.mergedCells || []).filter(item => !spreadsheetRangesOverlap(item, normalized));
  return sheet;
}

export function getSpreadsheetUsedRange(sheet) {
  let maxRow = 0;
  let maxColumn = 0;
  let found = false;
  Object.entries(sheet?.cells || {}).forEach(([key, value]) => {
    const parsed = parseSpreadsheetCellKey(key);
    const raw = value && typeof value === 'object' ? (value.v ?? value.value ?? '') : value;
    if (!parsed || (raw === '' && !value?.style)) return;
    found = true;
    maxRow = Math.max(maxRow, parsed.rowIndex);
    maxColumn = Math.max(maxColumn, parsed.columnIndex);
  });
  (sheet?.mergedCells || []).forEach(range => {
    const normalized = normalizeSpreadsheetRange(range);
    if (!normalized) return;
    found = true;
    maxRow = Math.max(maxRow, normalized.endRow);
    maxColumn = Math.max(maxColumn, normalized.endColumn);
  });
  return found
    ? { startRow: 0, endRow: maxRow, startColumn: 0, endColumn: maxColumn }
    : { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 };
}

class FormulaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function formulaError(code) {
  throw new FormulaError(code);
}

function tokenizeFormula(expression) {
  const tokens = [];
  let index = 0;
  const source = String(expression || '');
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    if (rest[0] === '"') {
      let value = '';
      index += 1;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') {
          value += '"';
          index += 2;
        } else if (source[index] === '"') {
          index += 1;
          break;
        } else {
          value += source[index];
          index += 1;
        }
      }
      tokens.push({ type: 'string', value });
      continue;
    }
    if (rest[0] === "'") {
      let value = '';
      index += 1;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") {
          value += "'";
          index += 2;
        } else if (source[index] === "'") {
          index += 1;
          break;
        } else {
          value += source[index];
          index += 1;
        }
      }
      tokens.push({ type: 'identifier', value });
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*/);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const operator = rest.match(/^(<=|>=|<>|[+\-*/^&=<>(),:!%])/);
    if (operator) {
      tokens.push({ type: 'operator', value: operator[0] });
      index += operator[0].length;
      continue;
    }
    formulaError('#NAME?');
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function flattenFormulaValues(value) {
  return Array.isArray(value) ? value.flat(Infinity) : [value];
}

function propagateFormulaError(value) {
  const errorCode = flattenFormulaValues(value).find(item => FORMULA_ERROR_CODES.has(item));
  if (errorCode) formulaError(errorCode);
}

function toFormulaNumber(value) {
  propagateFormulaError(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : formulaError('#VALUE!');
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) formulaError('#VALUE!');
  return number;
}

function toFormulaText(value) {
  propagateFormulaError(value);
  if (value === null || value === undefined) return '';
  return String(value);
}

function compareFormulaValues(left, operator, right) {
  propagateFormulaError([left, right]);
  const numeric = Number.isFinite(Number(left)) && Number.isFinite(Number(right));
  const a = numeric ? Number(left) : String(left ?? '');
  const b = numeric ? Number(right) : String(right ?? '');
  if (operator === '=') return a === b;
  if (operator === '<>') return a !== b;
  if (operator === '<') return a < b;
  if (operator === '>') return a > b;
  if (operator === '<=') return a <= b;
  if (operator === '>=') return a >= b;
  return false;
}

function formulaValueIsTruthy(value) {
  propagateFormulaError(value);
  if (Array.isArray(value)) return formulaValueIsTruthy(flattenFormulaValues(value)[0]);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (/^false$/i.test(text)) return false;
  if (/^true$/i.test(text)) return true;
  const number = Number(text);
  return Number.isFinite(number) ? number !== 0 : true;
}

function getFormulaMatrix(value) {
  propagateFormulaError(value);
  if (Array.isArray(value)) return value.map(row => Array.isArray(row) ? row : [row]);
  return [[value]];
}

function getFormulaCriteriaMatcher(criteria) {
  propagateFormulaError(criteria);
  const raw = Array.isArray(criteria) ? flattenFormulaValues(criteria)[0] : criteria;
  const text = String(raw ?? '');
  const match = text.match(/^(<=|>=|<>|=|<|>)(.*)$/);
  if (match) {
    const operator = match[1];
    const expectedText = match[2];
    return actual => compareFormulaValues(actual, operator, expectedText);
  }
  return actual => compareFormulaValues(actual, '=', raw);
}

function getFormulaLookupComparable(value) {
  propagateFormulaError(value);
  if (Array.isArray(value)) return getFormulaLookupComparable(flattenFormulaValues(value)[0]);
  const number = Number(value);
  return Number.isFinite(number) && String(value ?? '').trim() !== '' ? number : String(value ?? '');
}

function formulaLookupValuesEqual(left, right) {
  return compareFormulaValues(left, '=', right);
}

function formatSpreadsheetBusinessDate(date, includeTime = false) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    } : {}),
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return includeTime ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}

function runFormulaFunction(name, args) {
  const values = args.flatMap(flattenFormulaValues);
  propagateFormulaError(values);
  const numericValues = values
    .filter(value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  switch (String(name || '').toUpperCase()) {
    case 'SUM': return numericValues.reduce((sum, value) => sum + value, 0);
    case 'AVERAGE': return numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : formulaError('#DIV/0!');
    case 'MIN': return numericValues.length ? Math.min(...numericValues) : 0;
    case 'MAX': return numericValues.length ? Math.max(...numericValues) : 0;
    case 'COUNT': return numericValues.length;
    case 'COUNTA': return values.filter(value => value !== '' && value !== null && value !== undefined).length;
    case 'IF': return formulaValueIsTruthy(args[0]) ? (args[1] ?? true) : (args[2] ?? false);
    case 'AND': return args.every(formulaValueIsTruthy);
    case 'OR': return args.some(formulaValueIsTruthy);
    case 'ROUND': return Number(toFormulaNumber(args[0]).toFixed(Math.max(0, Number(args[1]) || 0)));
    case 'ABS': return Math.abs(toFormulaNumber(args[0]));
    case 'TODAY': return formatSpreadsheetBusinessDate(new Date());
    case 'NOW': return formatSpreadsheetBusinessDate(new Date(), true);
    case 'LEN': return Array.from(toFormulaText(args[0])).length;
    case 'LEFT': {
      const text = toFormulaText(args[0]);
      const count = Math.max(0, Math.floor(args[1] === undefined ? 1 : toFormulaNumber(args[1])));
      return Array.from(text).slice(0, count).join('');
    }
    case 'RIGHT': {
      const text = toFormulaText(args[0]);
      const count = Math.max(0, Math.floor(args[1] === undefined ? 1 : toFormulaNumber(args[1])));
      return Array.from(text).slice(-count).join('');
    }
    case 'MID': {
      const text = Array.from(toFormulaText(args[0]));
      const start = Math.max(1, Math.floor(toFormulaNumber(args[1])));
      const count = Math.max(0, Math.floor(toFormulaNumber(args[2])));
      return text.slice(start - 1, start - 1 + count).join('');
    }
    case 'CONCAT': return values.map(value => toFormulaText(value)).join('');
    case 'COUNTIF': {
      const matcher = getFormulaCriteriaMatcher(args[1]);
      return flattenFormulaValues(args[0]).filter(value => matcher(value)).length;
    }
    case 'SUMIF': {
      const criteriaValues = flattenFormulaValues(args[0]);
      const sumValues = args[2] === undefined ? criteriaValues : flattenFormulaValues(args[2]);
      const matcher = getFormulaCriteriaMatcher(args[1]);
      return criteriaValues.reduce((sum, value, index) => (
        matcher(value) ? sum + toFormulaNumber(sumValues[index] ?? 0) : sum
      ), 0);
    }
    case 'VLOOKUP': {
      const lookupValue = args[0];
      const table = getFormulaMatrix(args[1]);
      const columnIndex = Math.floor(toFormulaNumber(args[2])) - 1;
      if (columnIndex < 0) formulaError('#VALUE!');
      const approximate = args[3] === undefined ? true : formulaValueIsTruthy(args[3]);
      let approximateRow = null;
      table.forEach(row => {
        const firstValue = row[0];
        if (formulaLookupValuesEqual(firstValue, lookupValue)) approximateRow = row;
        if (approximate && compareFormulaValues(firstValue, '<=', lookupValue)) approximateRow = row;
      });
      const row = approximateRow || (!approximate ? table.find(item => formulaLookupValuesEqual(item[0], lookupValue)) : null);
      if (!row) formulaError('#VALUE!');
      if (columnIndex >= row.length) formulaError('#REF!');
      return row[columnIndex] ?? '';
    }
    case 'XLOOKUP': {
      const lookupValue = args[0];
      const lookupValues = flattenFormulaValues(args[1]);
      const returnValues = flattenFormulaValues(args[2]);
      const notFound = args[3];
      const matchMode = args[4] === undefined ? 0 : toFormulaNumber(args[4]);
      const searchMode = args[5] === undefined ? 1 : toFormulaNumber(args[5]);
      const indexes = lookupValues.map((_, index) => index);
      if (searchMode === -1) indexes.reverse();
      let matchIndex = indexes.find(index => formulaLookupValuesEqual(lookupValues[index], lookupValue));
      if (matchIndex === undefined && matchMode !== 0) {
        const comparableLookup = getFormulaLookupComparable(lookupValue);
        const candidates = indexes
          .map(index => ({ index, value: getFormulaLookupComparable(lookupValues[index]) }))
          .filter(item => typeof item.value === typeof comparableLookup);
        if (matchMode === -1) {
          matchIndex = candidates
            .filter(item => item.value <= comparableLookup)
            .sort((left, right) => left.value > right.value ? -1 : 1)[0]?.index;
        } else if (matchMode === 1) {
          matchIndex = candidates
            .filter(item => item.value >= comparableLookup)
            .sort((left, right) => left.value < right.value ? -1 : 1)[0]?.index;
        }
      }
      if (matchIndex === undefined) return notFound ?? formulaError('#VALUE!');
      return returnValues[matchIndex] ?? '';
    }
    default: return formulaError('#NAME?');
  }
}

function evaluateFormulaExpression(expression, context) {
  if (String(expression || '').length > MAX_FORMULA_LENGTH) formulaError('#VALUE!');
  const tokens = tokenizeFormula(expression);
  let cursor = 0;
  const current = () => tokens[cursor];
  const consume = value => {
    const token = current();
    if (value !== undefined && token.value !== value) formulaError('#VALUE!');
    cursor += 1;
    return token;
  };
  const parseReference = (identifier, explicitSheetName = '') => {
    const parsed = parseSpreadsheetCellKey(identifier);
    if (!parsed) return null;
    const sheet = explicitSheetName
      ? context.workbook.sheets.find(item => String(item.name).toLowerCase() === String(explicitSheetName).toLowerCase())
      : context.sheet;
    if (!sheet) formulaError('#REF!');
    return { sheet, ...parsed };
  };
  const parsePrimary = () => {
    const token = current();
    if (token.type === 'number' || token.type === 'string') {
      consume();
      return token.value;
    }
    if (token.value === '(') {
      consume('(');
      const value = parseComparison();
      consume(')');
      return value;
    }
    if (token.type !== 'identifier') formulaError('#VALUE!');
    consume();
    const identifier = token.value;
    if (current().value === '(') {
      consume('(');
      const args = [];
      if (current().value !== ')') {
        while (true) {
          args.push(parseComparison());
          if (current().value !== ',') break;
          consume(',');
        }
      }
      consume(')');
      return runFormulaFunction(identifier, args);
    }
    let sheetName = '';
    let referenceText = identifier;
    if (current().value === '!') {
      consume('!');
      sheetName = identifier;
      referenceText = consume().value;
    } else if (/^(TRUE|FALSE)$/i.test(identifier)) {
      return /^TRUE$/i.test(identifier);
    }
    const reference = parseReference(referenceText, sheetName);
    if (!reference) formulaError('#NAME?');
    if (current().value === ':') {
      consume(':');
      let endSheetName = sheetName;
      let endReferenceText = consume().value;
      if (current().value === '!') {
        consume('!');
        endSheetName = endReferenceText;
        endReferenceText = consume().value;
      }
      const endReference = parseReference(endReferenceText, endSheetName);
      if (!endReference || endReference.sheet.id !== reference.sheet.id) formulaError('#REF!');
      const bounds = normalizeSpreadsheetRange({
        startRow: reference.rowIndex,
        endRow: endReference.rowIndex,
        startColumn: reference.columnIndex,
        endColumn: endReference.columnIndex,
      });
      const rangeCellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endColumn - bounds.startColumn + 1);
      if (rangeCellCount > MAX_FORMULA_RANGE_CELLS) formulaError('#VALUE!');
      const values = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        const line = [];
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          line.push(context.evaluateCell(reference.sheet, row, column));
        }
        values.push(line);
      }
      return values;
    }
    return context.evaluateCell(reference.sheet, reference.rowIndex, reference.columnIndex);
  };
  const parseUnary = () => {
    if (current().type === 'operator' && current().value === '+') {
      consume('+');
      return toFormulaNumber(parseUnary());
    }
    if (current().type === 'operator' && current().value === '-') {
      consume('-');
      return -toFormulaNumber(parseUnary());
    }
    return parsePrimary();
  };
  const parsePower = () => {
    let value = parseUnary();
    while (current().value === '^') {
      consume('^');
      value = Math.pow(toFormulaNumber(value), toFormulaNumber(parseUnary()));
    }
    return value;
  };
  const parseProduct = () => {
    let value = parsePower();
    while (['*', '/'].includes(current().value)) {
      const operator = consume().value;
      const right = toFormulaNumber(parsePower());
      if (operator === '/' && right === 0) formulaError('#DIV/0!');
      value = operator === '*' ? toFormulaNumber(value) * right : toFormulaNumber(value) / right;
    }
    return value;
  };
  const parseSum = () => {
    let value = parseProduct();
    while (['+', '-', '&'].includes(current().value)) {
      const operator = consume().value;
      const right = parseProduct();
      if (operator === '&') {
        propagateFormulaError([value, right]);
        value = `${value ?? ''}${right ?? ''}`;
      }
      else if (operator === '+') value = toFormulaNumber(value) + toFormulaNumber(right);
      else value = toFormulaNumber(value) - toFormulaNumber(right);
    }
    return value;
  };
  function parseComparison() {
    let value = parseSum();
    if (['=', '<>', '<', '>', '<=', '>='].includes(current().value)) {
      const operator = consume().value;
      value = compareFormulaValues(value, operator, parseSum());
    }
    return value;
  }
  const result = parseComparison();
  if (current().type !== 'eof') formulaError('#VALUE!');
  return result;
}

export function createSpreadsheetFormulaEvaluator(workbookValue) {
  const workbook = normalizeSpreadsheetWorkbook(workbookValue);
  const cache = new Map();
  const evaluating = new Set();
  const evaluateCell = (sheet, rowIndex, columnIndex) => {
    const key = `${sheet.id}!${buildSpreadsheetCellKey(rowIndex, columnIndex)}`;
    if (cache.has(key)) return cache.get(key);
    if (evaluating.has(key)) return '#CYCLE!';
    if (evaluating.size >= MAX_FORMULA_DEPTH) return '#VALUE!';
    evaluating.add(key);
    const raw = getSpreadsheetCellRawValue(sheet, rowIndex, columnIndex);
    let result = raw;
    if (typeof raw === 'string' && raw.startsWith('=')) {
      try {
        result = evaluateFormulaExpression(raw.slice(1), { workbook, sheet, evaluateCell });
        if (Array.isArray(result)) result = result.flat(Infinity)[0] ?? '';
        if (typeof result === 'number' && !Number.isFinite(result)) result = '#VALUE!';
      } catch (error) {
        result = error instanceof FormulaError ? error.code : '#VALUE!';
      }
    }
    evaluating.delete(key);
    cache.set(key, result);
    return result;
  };
  return {
    workbook,
    getValue(sheetId, rowIndex, columnIndex) {
      const sheet = workbook.sheets.find(item => item.id === sheetId) || workbook.sheets[0];
      return evaluateCell(sheet, rowIndex, columnIndex);
    },
    isError(value) {
      return FORMULA_ERROR_CODES.has(value);
    },
    evaluateFormula(sheetId, formula) {
      const sheet = workbook.sheets.find(item => item.id === sheetId) || workbook.sheets[0];
      const source = String(formula || '').trim();
      if (!source.startsWith('=')) return '#VALUE!';
      try {
        const result = evaluateFormulaExpression(source.slice(1), { workbook, sheet, evaluateCell });
        if (Array.isArray(result)) return result.flat(Infinity)[0] ?? '';
        if (typeof result === 'number' && !Number.isFinite(result)) return '#VALUE!';
        return result;
      } catch (error) {
        return error instanceof FormulaError ? error.code : '#VALUE!';
      }
    },
  };
}

function compareSpreadsheetSortValues(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function spreadsheetSortValueIsEmpty(value) {
  return value === '' || value === null || value === undefined;
}

export function sortSpreadsheetRange(sheet, range, columnIndex, direction = 'asc', getValue = null, options = {}) {
  const bounds = normalizeSpreadsheetRange(range) || getSpreadsheetUsedRange(sheet);
  const sortColumn = Math.max(bounds.startColumn, Math.min(bounds.endColumn, Number(columnIndex) || 0));
  if (bounds.endRow <= bounds.startRow) return sheet;
  const firstRowHasText = Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }).some((_, offset) => {
    const value = getSpreadsheetCellRawValue(sheet, bounds.startRow, bounds.startColumn + offset);
    return String(value || '').trim() && !Number.isFinite(Number(value));
  });
  const hasHeader = options.hasHeader === undefined ? firstRowHasText : Boolean(options.hasHeader);
  const dataStartRow = hasHeader ? bounds.startRow + 1 : bounds.startRow;
  const rows = [];
  for (let row = dataStartRow; row <= bounds.endRow; row += 1) rows.push(row);
  rows.sort((leftRow, rightRow) => {
    const left = getValue ? getValue(leftRow, sortColumn) : getSpreadsheetCellRawValue(sheet, leftRow, sortColumn);
    const right = getValue ? getValue(rightRow, sortColumn) : getSpreadsheetCellRawValue(sheet, rightRow, sortColumn);
    const leftEmpty = spreadsheetSortValueIsEmpty(left);
    const rightEmpty = spreadsheetSortValueIsEmpty(right);
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? leftRow - rightRow : (leftEmpty ? 1 : -1);
    const result = compareSpreadsheetSortValues(left, right);
    return (direction === 'desc' ? -result : result) || leftRow - rightRow;
  });
  const original = clone(sheet.cells || {});
  rows.forEach((sourceRow, offset) => {
    const targetRow = dataStartRow + offset;
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      const sourceKey = buildSpreadsheetCellKey(sourceRow, column);
      const targetKey = buildSpreadsheetCellKey(targetRow, column);
      if (Object.prototype.hasOwnProperty.call(original, sourceKey)) sheet.cells[targetKey] = original[sourceKey];
      else delete sheet.cells[targetKey];
    }
  });
  return sheet;
}

export function setSpreadsheetColumnFilter(sheet, columnIndex, value, operator = 'equals') {
  const filters = (sheet.filters || []).filter(item => Number(item.columnIndex) !== Number(columnIndex));
  const normalizedValue = String(value ?? '');
  if (operator || normalizedValue) filters.push({ columnIndex: Number(columnIndex), operator, value: normalizedValue });
  sheet.filters = filters;
  return sheet;
}

export function getSpreadsheetVisibleRows(workbookValue, sheetId) {
  const evaluator = createSpreadsheetFormulaEvaluator(workbookValue);
  const workbook = evaluator.workbook;
  const sheet = workbook.sheets.find(item => item.id === sheetId) || workbook.sheets[0];
  const filters = Array.isArray(sheet.filters) ? sheet.filters : [];
  const rows = [];
  for (let row = 0; row < sheet.rowCount; row += 1) {
    if (row === 0 && filters.length) {
      rows.push(row);
      continue;
    }
    const visible = filters.every(filter => {
      const actual = evaluator.getValue(sheet.id, row, Number(filter.columnIndex) || 0);
      const expected = String(filter.value ?? '');
      if (filter.operator === 'contains') return String(actual ?? '').includes(expected);
      if (filter.operator === 'not_empty') return String(actual ?? '').trim() !== '';
      return String(actual ?? '') === expected;
    });
    if (visible) rows.push(row);
  }
  return rows;
}

function shiftIndexedObject(source, startIndex, delta) {
  const result = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    const index = Number(key);
    if (!Number.isFinite(index)) return;
    if (delta < 0 && index === startIndex) return;
    const nextIndex = index >= startIndex ? index + delta : index;
    if (nextIndex >= 0) result[nextIndex] = value;
  });
  return result;
}

function adjustFormulaReferences(value, axis, startIndex, delta, options = {}) {
  if (typeof value !== 'string' || !value.startsWith('=')) return value;
  const formulaSheetKey = spreadsheetSheetNameKey(options.formulaSheetName);
  const targetSheetKey = spreadsheetSheetNameKey(options.targetSheetName || options.formulaSheetName);
  const referencePattern = /^(?:(?:'((?:''|[^'])+)'|([A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*))!)?(\$?)([A-Z]+)(\$?)([1-9]\d*)/i;
  let result = '';
  let index = 0;
  let previousReferenceEnd = -1;
  let previousReferenceTargetsSheet = false;
  while (index < value.length) {
    if (value[index] === '"') {
      const start = index;
      index += 1;
      while (index < value.length) {
        if (value[index] === '"' && value[index + 1] === '"') index += 2;
        else if (value[index] === '"') {
          index += 1;
          break;
        } else index += 1;
      }
      result += value.slice(start, index);
      continue;
    }
    const match = value.slice(index).match(referencePattern);
    if (match) {
      const explicitSheetName = match[1]?.replace(/''/g, "'") || match[2] || '';
      const betweenReferences = previousReferenceEnd >= 0
        ? value.slice(previousReferenceEnd, index)
        : '';
      const inheritsRangeSheet = !explicitSheetName
        && previousReferenceTargetsSheet
        && /^\s*:\s*$/.test(betweenReferences);
      const targetsSheet = explicitSheetName
        ? spreadsheetSheetNameKey(explicitSheetName) === targetSheetKey
        : (inheritsRangeSheet || formulaSheetKey === targetSheetKey);
      let replacement = match[0];
      if (targetsSheet) {
        let rowIndex = Number(match[6]) - 1;
        let columnIndex = spreadsheetColumnIndex(match[4]);
        if (axis === 'row' && rowIndex >= startIndex) rowIndex += delta;
        if (axis === 'column' && columnIndex >= startIndex) columnIndex += delta;
        const referencePrefixLength = match[0].length
          - match[3].length
          - match[4].length
          - match[5].length
          - match[6].length;
        const prefix = match[0].slice(0, referencePrefixLength);
        replacement = rowIndex < 0 || columnIndex < 0
          ? `${prefix}#REF!`
          : `${prefix}${match[3]}${spreadsheetColumnLabel(columnIndex)}${match[5]}${rowIndex + 1}`;
      }
      result += replacement;
      index += match[0].length;
      previousReferenceEnd = index;
      previousReferenceTargetsSheet = targetsSheet;
      continue;
    }
    if (value[index] === "'") {
      const start = index;
      index += 1;
      while (index < value.length) {
        if (value[index] === "'" && value[index + 1] === "'") index += 2;
        else if (value[index] === "'") {
          index += 1;
          break;
        } else index += 1;
      }
      result += value.slice(start, index);
      continue;
    }
    result += value[index];
    index += 1;
  }
  return result;
}

function adjustSheetFormulaCells(sheet, axis, startIndex, delta, targetSheetName) {
  Object.entries(sheet.cells || {}).forEach(([key, cell]) => {
    const rawValue = cell && typeof cell === 'object' ? (cell.v ?? cell.value) : cell;
    const nextValue = adjustFormulaReferences(rawValue, axis, startIndex, delta, {
      formulaSheetName: sheet.name,
      targetSheetName,
    });
    if (nextValue === rawValue) return;
    if (cell && typeof cell === 'object') {
      if (Object.prototype.hasOwnProperty.call(cell, 'v')) cell.v = nextValue;
      else cell.value = nextValue;
      delete cell.computed;
    } else sheet.cells[key] = nextValue;
  });
}

function shiftMergedRange(range, axis, startIndex, delta) {
  const next = { ...normalizeSpreadsheetRange(range) };
  const startKey = axis === 'row' ? 'startRow' : 'startColumn';
  const endKey = axis === 'row' ? 'endRow' : 'endColumn';
  if (delta < 0 && startIndex >= next[startKey] && startIndex <= next[endKey]) next[endKey] -= 1;
  else {
    if (next[startKey] >= startIndex) next[startKey] += delta;
    if (next[endKey] >= startIndex) next[endKey] += delta;
  }
  if (next[startKey] < 0 || next[endKey] <= next[startKey] && next.endRow === next.startRow && next.endColumn === next.startColumn) return null;
  return next;
}

function shiftSpreadsheetRuleRanges(rules, axis, startIndex, delta) {
  return (rules || []).flatMap(rule => {
    const range = shiftMergedRange(rule.range, axis, startIndex, delta);
    return range ? [{ ...rule, range }] : [];
  });
}

function mapSpreadsheetRuleRanges(rules, mapper) {
  return (rules || []).flatMap(rule => {
    const range = normalizeSpreadsheetRange(rule.range);
    if (!range) return [];
    const start = mapper(range.startRow, range.startColumn);
    const end = mapper(range.endRow, range.endColumn);
    if (!start || !end) return [];
    return [{
      ...rule,
      range: normalizeSpreadsheetRange({
        startRow: start.rowIndex,
        endRow: end.rowIndex,
        startColumn: start.columnIndex,
        endColumn: end.columnIndex,
      }),
    }];
  });
}

export function shiftSpreadsheetCells(sheet, range, direction, workbook = null) {
  const bounds = normalizeSpreadsheetRange(range);
  if (!sheet || !bounds || !['insert-right', 'insert-down', 'delete-left', 'delete-up'].includes(direction)) {
    return sheet;
  }
  const rowSpan = bounds.endRow - bounds.startRow + 1;
  const columnSpan = bounds.endColumn - bounds.startColumn + 1;
  const mapPosition = (rowIndex, columnIndex) => {
    if (direction === 'insert-right') {
      return rowIndex >= bounds.startRow && rowIndex <= bounds.endRow && columnIndex >= bounds.startColumn
        ? { rowIndex, columnIndex: columnIndex + columnSpan }
        : { rowIndex, columnIndex };
    }
    if (direction === 'insert-down') {
      return columnIndex >= bounds.startColumn && columnIndex <= bounds.endColumn && rowIndex >= bounds.startRow
        ? { rowIndex: rowIndex + rowSpan, columnIndex }
        : { rowIndex, columnIndex };
    }
    if (direction === 'delete-left' && rowIndex >= bounds.startRow && rowIndex <= bounds.endRow) {
      if (columnIndex >= bounds.startColumn && columnIndex <= bounds.endColumn) return null;
      return columnIndex > bounds.endColumn
        ? { rowIndex, columnIndex: columnIndex - columnSpan }
        : { rowIndex, columnIndex };
    }
    if (direction === 'delete-up' && columnIndex >= bounds.startColumn && columnIndex <= bounds.endColumn) {
      if (rowIndex >= bounds.startRow && rowIndex <= bounds.endRow) return null;
      return rowIndex > bounds.endRow
        ? { rowIndex: rowIndex - rowSpan, columnIndex }
        : { rowIndex, columnIndex };
    }
    return { rowIndex, columnIndex };
  };
  const nextCells = {};
  Object.entries(sheet.cells || {}).forEach(([key, cell]) => {
    const parsed = parseSpreadsheetCellKey(key);
    if (!parsed) return;
    const mapped = mapPosition(parsed.rowIndex, parsed.columnIndex);
    if (!mapped) return;
    nextCells[buildSpreadsheetCellKey(mapped.rowIndex, mapped.columnIndex)] = clone(cell);
  });
  sheet.cells = nextCells;
  sheet.protectedRanges = mapSpreadsheetRuleRanges(sheet.protectedRanges, mapPosition);
  sheet.conditionalFormats = mapSpreadsheetRuleRanges(sheet.conditionalFormats, mapPosition);
  sheet.dataValidations = mapSpreadsheetRuleRanges(sheet.dataValidations, mapPosition);
  if (direction === 'insert-right') {
    sheet.columnCount = Math.max(1, (Number(sheet.columnCount) || DEFAULT_COLUMN_COUNT) + columnSpan);
  } else if (direction === 'insert-down') {
    sheet.rowCount = Math.max(1, (Number(sheet.rowCount) || DEFAULT_ROW_COUNT) + rowSpan);
  }
  remapWorkbookFormulaReferences(workbook || { sheets: [sheet] }, sheet.name, mapPosition);
  return sheet;
}

export function shiftSpreadsheetRows(sheet, startRowIndex, delta, workbook = null) {
  const cells = {};
  Object.entries(sheet.cells || {}).forEach(([key, cell]) => {
    const parsed = parseSpreadsheetCellKey(key);
    if (!parsed) return;
    if (delta < 0 && parsed.rowIndex === startRowIndex) return;
    const rowIndex = parsed.rowIndex >= startRowIndex ? parsed.rowIndex + delta : parsed.rowIndex;
    if (rowIndex < 0) return;
    const nextCell = cell && typeof cell === 'object' ? { ...cell } : { v: cell };
    if (nextCell.v !== undefined) nextCell.v = adjustFormulaReferences(nextCell.v, 'row', startRowIndex, delta, {
      formulaSheetName: sheet.name,
      targetSheetName: sheet.name,
    });
    cells[buildSpreadsheetCellKey(rowIndex, parsed.columnIndex)] = nextCell;
  });
  sheet.cells = cells;
  sheet.rowHeights = shiftIndexedObject(sheet.rowHeights, startRowIndex, delta);
  sheet.mergedCells = (sheet.mergedCells || []).map(range => shiftMergedRange(range, 'row', startRowIndex, delta)).filter(Boolean);
  sheet.protectedRanges = shiftSpreadsheetRuleRanges(sheet.protectedRanges, 'row', startRowIndex, delta);
  sheet.conditionalFormats = shiftSpreadsheetRuleRanges(sheet.conditionalFormats, 'row', startRowIndex, delta);
  sheet.dataValidations = shiftSpreadsheetRuleRanges(sheet.dataValidations, 'row', startRowIndex, delta);
  sheet.rowCount = Math.max(1, (Number(sheet.rowCount) || DEFAULT_ROW_COUNT) + delta);
  (workbook?.sheets || []).filter(item => item !== sheet).forEach(item => {
    adjustSheetFormulaCells(item, 'row', startRowIndex, delta, sheet.name);
  });
  return sheet;
}

export function shiftSpreadsheetColumns(sheet, startColumnIndex, delta, workbook = null) {
  const cells = {};
  Object.entries(sheet.cells || {}).forEach(([key, cell]) => {
    const parsed = parseSpreadsheetCellKey(key);
    if (!parsed) return;
    if (delta < 0 && parsed.columnIndex === startColumnIndex) return;
    const columnIndex = parsed.columnIndex >= startColumnIndex ? parsed.columnIndex + delta : parsed.columnIndex;
    if (columnIndex < 0) return;
    const nextCell = cell && typeof cell === 'object' ? { ...cell } : { v: cell };
    if (nextCell.v !== undefined) nextCell.v = adjustFormulaReferences(nextCell.v, 'column', startColumnIndex, delta, {
      formulaSheetName: sheet.name,
      targetSheetName: sheet.name,
    });
    cells[buildSpreadsheetCellKey(parsed.rowIndex, columnIndex)] = nextCell;
  });
  sheet.cells = cells;
  sheet.columnWidths = shiftIndexedObject(sheet.columnWidths, startColumnIndex, delta);
  sheet.mergedCells = (sheet.mergedCells || []).map(range => shiftMergedRange(range, 'column', startColumnIndex, delta)).filter(Boolean);
  sheet.protectedRanges = shiftSpreadsheetRuleRanges(sheet.protectedRanges, 'column', startColumnIndex, delta);
  sheet.conditionalFormats = shiftSpreadsheetRuleRanges(sheet.conditionalFormats, 'column', startColumnIndex, delta);
  sheet.dataValidations = shiftSpreadsheetRuleRanges(sheet.dataValidations, 'column', startColumnIndex, delta);
  sheet.filters = (sheet.filters || []).flatMap(filter => {
    const index = Number(filter.columnIndex) || 0;
    if (delta < 0 && index === startColumnIndex) return [];
    return [{ ...filter, columnIndex: index >= startColumnIndex ? index + delta : index }];
  });
  sheet.columnCount = Math.max(1, (Number(sheet.columnCount) || DEFAULT_COLUMN_COUNT) + delta);
  (workbook?.sheets || []).filter(item => item !== sheet).forEach(item => {
    adjustSheetFormulaCells(item, 'column', startColumnIndex, delta, sheet.name);
  });
  return sheet;
}

export function spreadsheetWorkbookToText(workbookValue) {
  const evaluator = createSpreadsheetFormulaEvaluator(workbookValue);
  const parts = [];
  evaluator.workbook.sheets.forEach(sheet => {
    if (sheet.name) parts.push(sheet.name);
    Object.keys(sheet.cells || {}).sort((left, right) => {
      const a = parseSpreadsheetCellKey(left);
      const b = parseSpreadsheetCellKey(right);
      return (a?.rowIndex - b?.rowIndex) || (a?.columnIndex - b?.columnIndex);
    }).forEach(cellKey => {
      const parsed = parseSpreadsheetCellKey(cellKey);
      if (!parsed) return;
      const value = evaluator.getValue(sheet.id, parsed.rowIndex, parsed.columnIndex);
      if (String(value ?? '').trim()) parts.push(`${cellKey} ${value}`);
    });
  });
  return parts.join('\n').slice(0, 20000);
}
