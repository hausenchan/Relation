const { isDeepStrictEqual } = require('node:util');

const { validateSpreadsheetWorkbookSheetNames } = require('./spreadsheetWorkbookFile');

const MAX_OPERATIONS_PER_REQUEST = 500;
const MAX_CELL_SNAPSHOT_BYTES = 16 * 1024;
const MAX_PROPERTY_SNAPSHOT_BYTES = 256 * 1024;
const MAX_SHEET_ID_LENGTH = 128;
const MAX_OPERATION_ID_LENGTH = 128;
const MAX_ROWS = 100000;
const MAX_COLUMNS = 2000;
const DEFAULT_ROWS = 1000;
const DEFAULT_COLUMNS = 26;
const SHEET_OPERATION_PROPERTIES = new Set([
  'name',
  'rowCount',
  'columnCount',
  'rowHeights',
  'columnWidths',
  'mergedCells',
  'filters',
  'filterRange',
  'frozen',
]);
const WORKBOOK_OPERATION_PROPERTIES = new Set(['activeSheetId', 'styles', 'definedNames']);
const ADD_SHEET_SNAPSHOT_KEYS = new Set(['id', 'cells', ...SHEET_OPERATION_PROPERTIES]);

function spreadsheetOperationValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cloneJsonValue(value) {
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function parseCellKey(value) {
  const text = String(value || '').trim().toUpperCase();
  const match = text.match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) return null;
  const columnIndex = match[1].split('').reduce((sum, char) => (
    sum * 26 + char.charCodeAt(0) - 64
  ), 0) - 1;
  const rowIndex = Number(match[2]) - 1;
  if (rowIndex < 0 || rowIndex >= MAX_ROWS || columnIndex < 0 || columnIndex >= MAX_COLUMNS) return null;
  return { key: `${match[1]}${rowIndex + 1}`, rowIndex, columnIndex };
}

function normalizeOperationSnapshot(value, label, maxBytes, kindLabel) {
  if (value === null) return null;
  const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);
  const isObject = value && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  if (!isPrimitive && !isObject && !isArray) {
    throw spreadsheetOperationValidationError(`${label} ${kindLabel}快照格式不合法`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw spreadsheetOperationValidationError(`${label} ${kindLabel}快照格式不合法`);
  }
  const serialized = JSON.stringify(value);
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw spreadsheetOperationValidationError(`${label} ${kindLabel}快照超过 ${Math.round(maxBytes / 1024)}KB 限制`);
  }
  return JSON.parse(serialized);
}

function normalizeCellSnapshot(value, label) {
  const normalized = normalizeOperationSnapshot(value, label, MAX_CELL_SNAPSHOT_BYTES, '单元格');
  if (Array.isArray(normalized)) throw spreadsheetOperationValidationError(`${label} 单元格快照格式不合法`);
  return normalized;
}

function normalizePropertySnapshot(value, label) {
  return normalizeOperationSnapshot(value, label, MAX_PROPERTY_SNAPSHOT_BYTES, '属性');
}

function normalizeSheetId(value, label, { optional = false } = {}) {
  const sheetId = String(value ?? '').trim();
  if (!sheetId && optional) return '';
  if (!sheetId || sheetId.length > MAX_SHEET_ID_LENGTH) {
    throw spreadsheetOperationValidationError(`${label}工作表 ID 不合法`);
  }
  return sheetId;
}

function validateSheetSnapshot(value, sheetId, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw spreadsheetOperationValidationError(`${label}工作表快照格式不合法`);
  }
  if (String(value.id ?? '') !== sheetId) {
    throw spreadsheetOperationValidationError(`${label}工作表快照 ID 不一致`);
  }
  validateSpreadsheetWorkbookSheetNames({
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: sheetId,
    sheets: [value],
  });
}

function validateAddedSheetSnapshot(value, sheetId, label) {
  validateSheetSnapshot(value, sheetId, label);
  const unsupportedKey = Object.keys(value).find(key => !ADD_SHEET_SNAPSHOT_KEYS.has(key));
  if (unsupportedKey) {
    throw spreadsheetOperationValidationError(`${label}工作表字段不支持：${unsupportedKey}`);
  }
  if (String(value.name ?? '') !== String(value.name ?? '').trim()) {
    throw spreadsheetOperationValidationError(`${label}工作表名称前后不能包含空格`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'cells')) value.cells = {};
  if (!value.cells || typeof value.cells !== 'object' || Array.isArray(value.cells)) {
    throw spreadsheetOperationValidationError(`${label}工作表单元格格式不合法`);
  }
  const parsedCells = Object.entries(value.cells).map(([cellKey, cellValue]) => {
    const cell = parseCellKey(cellKey);
    if (!cell || cell.key !== cellKey) {
      throw spreadsheetOperationValidationError(`${label}工作表单元格坐标不合法：${cellKey}`);
    }
    normalizeCellSnapshot(cellValue, `${label}${cellKey}`);
    return cell;
  });
  const maxRowIndex = parsedCells.reduce((max, cell) => Math.max(max, cell.rowIndex), 0);
  const maxColumnIndex = parsedCells.reduce((max, cell) => Math.max(max, cell.columnIndex), 0);
  if (!Object.prototype.hasOwnProperty.call(value, 'rowCount')) {
    value.rowCount = Math.max(DEFAULT_ROWS, maxRowIndex + 1);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'columnCount')) {
    value.columnCount = Math.max(DEFAULT_COLUMNS, maxColumnIndex + 1);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'rowHeights')) value.rowHeights = {};
  if (!Object.prototype.hasOwnProperty.call(value, 'columnWidths')) value.columnWidths = {};
  if (!Object.prototype.hasOwnProperty.call(value, 'mergedCells')) value.mergedCells = [];
  if (!Object.prototype.hasOwnProperty.call(value, 'filters')) value.filters = [];
  if (!Object.prototype.hasOwnProperty.call(value, 'frozen')) value.frozen = null;
  for (const property of SHEET_OPERATION_PROPERTIES) {
    if (property === 'filterRange' && !Object.prototype.hasOwnProperty.call(value, property)) continue;
    validateSheetPropertySnapshot(property, value[property], label.trim());
  }
  if (parsedCells.some(cell => cell.rowIndex >= value.rowCount || cell.columnIndex >= value.columnCount)) {
    throw spreadsheetOperationValidationError(`${label}工作表单元格超出声明行列范围`);
  }
}

function normalizeSheetOrderSnapshot(value, label) {
  const order = normalizePropertySnapshot(value, label);
  if (!Array.isArray(order) || !order.length) {
    throw spreadsheetOperationValidationError(`${label}工作表顺序格式不合法`);
  }
  const normalized = order.map((sheetId, index) => normalizeSheetId(
    sheetId,
    `${label}第 ${index + 1} 个`,
  ));
  if (new Set(normalized).size !== normalized.length) {
    throw spreadsheetOperationValidationError(`${label}工作表顺序不能包含重复 ID`);
  }
  return normalized;
}

function validateSheetPropertySnapshot(property, value, label) {
  if (property === 'name' && typeof value !== 'string') {
    throw spreadsheetOperationValidationError(`${label} 工作表名称格式不合法`);
  }
  if (property === 'rowCount' && (!Number.isInteger(value) || value < 1 || value > MAX_ROWS)) {
    throw spreadsheetOperationValidationError(`${label} 工作表行数不合法`);
  }
  if (property === 'columnCount' && (!Number.isInteger(value) || value < 1 || value > MAX_COLUMNS)) {
    throw spreadsheetOperationValidationError(`${label} 工作表列数不合法`);
  }
  if (['rowHeights', 'columnWidths'].includes(property) && (
    !value || typeof value !== 'object' || Array.isArray(value)
  )) {
    throw spreadsheetOperationValidationError(`${label} 工作表尺寸属性格式不合法`);
  }
  if (['mergedCells', 'filters'].includes(property) && !Array.isArray(value)) {
    throw spreadsheetOperationValidationError(`${label} 工作表数组属性格式不合法`);
  }
  if (['filterRange', 'frozen'].includes(property) && value !== null && (
    typeof value !== 'object' || Array.isArray(value)
  )) {
    throw spreadsheetOperationValidationError(`${label} 工作表视图属性格式不合法`);
  }
}

function validateWorkbookPropertySnapshot(property, value, label) {
  if (property === 'activeSheetId' && typeof value !== 'string') {
    throw spreadsheetOperationValidationError(`${label} 活动工作表 ID 格式不合法`);
  }
  if (['styles', 'definedNames'].includes(property) && (
    !value || typeof value !== 'object' || Array.isArray(value)
  )) {
    throw spreadsheetOperationValidationError(`${label} 工作簿属性格式不合法`);
  }
}

function normalizeSpreadsheetOperations(operations) {
  if (!Array.isArray(operations) || !operations.length) {
    throw spreadsheetOperationValidationError('请提交至少一个表格操作');
  }
  if (operations.length > MAX_OPERATIONS_PER_REQUEST) {
    throw spreadsheetOperationValidationError(`单次最多提交 ${MAX_OPERATIONS_PER_REQUEST} 个表格操作`);
  }
  const usedOperationIds = new Set();
  return operations.map((operation, index) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      throw spreadsheetOperationValidationError(`第 ${index + 1} 个表格操作格式不合法`);
    }
    const operationId = String(operation.id || '').trim();
    if (!operationId || operationId.length > MAX_OPERATION_ID_LENGTH) {
      throw spreadsheetOperationValidationError(`第 ${index + 1} 个操作 ID 不合法`);
    }
    if (usedOperationIds.has(operationId)) {
      throw spreadsheetOperationValidationError('同一批次的操作 ID 不能重复');
    }
    usedOperationIds.add(operationId);
    if (!Object.prototype.hasOwnProperty.call(operation, 'before')) {
      throw spreadsheetOperationValidationError(`第 ${index + 1} 个操作缺少 before 快照`);
    }
    if (!Object.prototype.hasOwnProperty.call(operation, 'after')) {
      throw spreadsheetOperationValidationError(`第 ${index + 1} 个操作缺少 after 快照`);
    }
    if (operation.type === 'add_sheet') {
      const sheetId = normalizeSheetId(operation.sheet_id, `第 ${index + 1} 个操作的`);
      const before = normalizePropertySnapshot(operation.before, 'before');
      const after = normalizePropertySnapshot(operation.after, 'after');
      if (before !== null) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个新增工作表操作的 before 必须为空`);
      }
      validateAddedSheetSnapshot(after, sheetId, 'after ');
      const previousSheetId = normalizeSheetId(
        operation.previous_sheet_id,
        `第 ${index + 1} 个操作的前置`,
        { optional: true },
      );
      const nextSheetId = normalizeSheetId(
        operation.next_sheet_id,
        `第 ${index + 1} 个操作的后置`,
        { optional: true },
      );
      if (previousSheetId === sheetId || nextSheetId === sheetId || (
        previousSheetId && previousSheetId === nextSheetId
      )) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个新增工作表操作的相邻 ID 不合法`);
      }
      const targetIndex = Number(operation.index);
      if (!Number.isInteger(targetIndex) || targetIndex < 0) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个新增工作表操作的位置不合法`);
      }
      return {
        id: operationId,
        type: operation.type,
        sheetId,
        before,
        after,
        previousSheetId,
        nextSheetId,
        targetIndex,
      };
    }
    if (operation.type === 'delete_sheet') {
      const sheetId = normalizeSheetId(operation.sheet_id, `第 ${index + 1} 个操作的`);
      const before = normalizePropertySnapshot(operation.before, 'before');
      const after = normalizePropertySnapshot(operation.after, 'after');
      validateSheetSnapshot(before, sheetId, 'before ');
      if (after !== null) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个删除工作表操作的 after 必须为空`);
      }
      return { id: operationId, type: operation.type, sheetId, before, after };
    }
    if (operation.type === 'reorder_sheets') {
      const before = normalizeSheetOrderSnapshot(operation.before, 'before ');
      const after = normalizeSheetOrderSnapshot(operation.after, 'after ');
      if (before.length !== after.length || before.some(sheetId => !after.includes(sheetId))) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个重排工作表操作的前后 ID 集合必须一致`);
      }
      return { id: operationId, type: operation.type, before, after };
    }
    if (operation.type === 'set_cell') {
      const sheetId = normalizeSheetId(operation.sheet_id, `第 ${index + 1} 个操作的`);
      const cell = parseCellKey(operation.cell);
      if (!cell) throw spreadsheetOperationValidationError(`第 ${index + 1} 个操作的单元格坐标不合法`);
      return {
        id: operationId,
        type: 'set_cell',
        sheetId,
        cellKey: cell.key,
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        before: normalizeCellSnapshot(operation.before, 'before'),
        after: normalizeCellSnapshot(operation.after, 'after'),
      };
    }
    if (operation.type === 'set_sheet_property') {
      const sheetId = normalizeSheetId(operation.sheet_id, `第 ${index + 1} 个操作的`);
      const property = String(operation.property || '').trim();
      if (!SHEET_OPERATION_PROPERTIES.has(property)) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个操作的工作表属性不支持`);
      }
      const before = normalizePropertySnapshot(operation.before, 'before');
      const after = normalizePropertySnapshot(operation.after, 'after');
      validateSheetPropertySnapshot(property, before, 'before');
      validateSheetPropertySnapshot(property, after, 'after');
      return { id: operationId, type: operation.type, sheetId, property, before, after };
    }
    if (operation.type === 'set_workbook_property') {
      const property = String(operation.property || '').trim();
      if (!WORKBOOK_OPERATION_PROPERTIES.has(property)) {
        throw spreadsheetOperationValidationError(`第 ${index + 1} 个操作的工作簿属性不支持`);
      }
      const before = normalizePropertySnapshot(operation.before, 'before');
      const after = normalizePropertySnapshot(operation.after, 'after');
      validateWorkbookPropertySnapshot(property, before, 'before');
      validateWorkbookPropertySnapshot(property, after, 'after');
      return { id: operationId, type: operation.type, property, before, after };
    }
    throw spreadsheetOperationValidationError(`第 ${index + 1} 个表格操作类型不支持`);
  });
}

function parseWorkbook(workbookValue) {
  let workbook;
  try {
    workbook = typeof workbookValue === 'string' ? JSON.parse(workbookValue) : workbookValue;
  } catch {
    throw spreadsheetOperationValidationError('在线表格工作簿格式不合法');
  }
  validateSpreadsheetWorkbookSheetNames(workbook);
  return workbook;
}

function getMissingOperationTargetValue(operation, sheet) {
  if (operation.type === 'set_cell') return null;
  if (operation.type === 'set_workbook_property') {
    if (['styles', 'definedNames'].includes(operation.property)) return {};
    return null;
  }
  if (['rowHeights', 'columnWidths'].includes(operation.property)) return {};
  if (['mergedCells', 'filters'].includes(operation.property)) return [];
  if (['filterRange', 'frozen'].includes(operation.property)) return null;
  if (['rowCount', 'columnCount'].includes(operation.property)) {
    let maxRowIndex = 0;
    let maxColumnIndex = 0;
    Object.keys(sheet?.cells || {}).forEach(key => {
      const parsed = parseCellKey(key);
      if (!parsed) return;
      maxRowIndex = Math.max(maxRowIndex, parsed.rowIndex);
      maxColumnIndex = Math.max(maxColumnIndex, parsed.columnIndex);
    });
    return operation.property === 'rowCount'
      ? Math.max(DEFAULT_ROWS, maxRowIndex + 1)
      : Math.max(DEFAULT_COLUMNS, maxColumnIndex + 1);
  }
  return null;
}

function spreadsheetSheetNameKey(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-CN');
}

function spreadsheetFormulaSheetName(name) {
  const value = String(name || '');
  return /^[A-Za-z_$\u3400-\u9fff][A-Za-z0-9_.$\u3400-\u9fff]*$/.test(value)
    ? value
    : `'${value.replace(/'/g, "''")}'`;
}

function replaceFormulaSheetReferences(formula, previousName, nextName) {
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

function migrateWorkbookFormulaSheetReferences(workbook, previousName, nextName) {
  if (previousName === nextName) return;
  workbook.sheets.forEach(sheet => {
    Object.entries(sheet.cells || {}).forEach(([key, cell]) => {
      const rawValue = cell && typeof cell === 'object' ? (cell.v ?? cell.value) : cell;
      const nextValue = replaceFormulaSheetReferences(rawValue, previousName, nextName);
      if (nextValue === rawValue) return;
      if (cell && typeof cell === 'object') {
        if (Object.prototype.hasOwnProperty.call(cell, 'v')) cell.v = nextValue;
        else cell.value = nextValue;
        delete cell.computed;
      } else sheet.cells[key] = nextValue;
    });
  });
}

function appendOperationConflict(conflicts, operation, current, details = {}) {
  conflicts.push({
    operation_id: operation.id,
    type: operation.type,
    ...details,
    current: cloneJsonValue(current),
  });
}

function insertSheetAtAnchoredPosition(workbook, operation) {
  const previousIndex = operation.previousSheetId
    ? workbook.sheets.findIndex(sheet => String(sheet.id) === operation.previousSheetId)
    : -1;
  const nextIndex = operation.nextSheetId
    ? workbook.sheets.findIndex(sheet => String(sheet.id) === operation.nextSheetId)
    : -1;
  if (previousIndex >= 0 && nextIndex >= 0 && previousIndex >= nextIndex) return -1;
  if (previousIndex >= 0) return previousIndex + 1;
  if (nextIndex >= 0) return nextIndex;
  if (operation.previousSheetId || operation.nextSheetId) return -1;
  return Math.min(operation.targetIndex, workbook.sheets.length);
}

function applySheetOrder(workbook, order) {
  const orderedIds = new Set(order);
  const sheetsById = new Map(workbook.sheets.map(sheet => [String(sheet.id), sheet]));
  let orderIndex = 0;
  workbook.sheets = workbook.sheets.map(sheet => (
    orderedIds.has(String(sheet.id)) ? sheetsById.get(order[orderIndex++]) : sheet
  ));
}

function applySpreadsheetOperations(workbookValue, operations) {
  const original = parseWorkbook(workbookValue);
  const normalizedOperations = normalizeSpreadsheetOperations(operations);
  const workbook = cloneJsonValue(original);
  const sheetsById = new Map(workbook.sheets.map(sheet => [String(sheet.id), sheet]));
  const plannedSheetNames = new Map(normalizedOperations
    .filter(operation => operation.type === 'set_sheet_property' && operation.property === 'name')
    .map(operation => [operation.sheetId, operation.after]));
  const conflicts = [];
  let changed = false;

  for (const operation of normalizedOperations) {
    if (operation.type === 'add_sheet') {
      const existingSheet = sheetsById.get(operation.sheetId);
      if (existingSheet) {
        if (!isDeepStrictEqual(existingSheet, operation.after)) {
          appendOperationConflict(conflicts, operation, existingSheet, { sheet_id: operation.sheetId });
        }
        continue;
      }
      const duplicateNameSheet = workbook.sheets.find(sheet => (
        spreadsheetSheetNameKey(sheet.name) === spreadsheetSheetNameKey(operation.after.name)
      ));
      const duplicateNameWillBeReleased = duplicateNameSheet && (
        plannedSheetNames.has(String(duplicateNameSheet.id))
        && spreadsheetSheetNameKey(plannedSheetNames.get(String(duplicateNameSheet.id)))
          !== spreadsheetSheetNameKey(operation.after.name)
      );
      if (duplicateNameSheet && !duplicateNameWillBeReleased) {
        appendOperationConflict(conflicts, operation, {
          sheet_id: String(duplicateNameSheet.id),
          name: duplicateNameSheet.name,
        }, { sheet_id: operation.sheetId, property: 'name' });
        continue;
      }
      const insertionIndex = insertSheetAtAnchoredPosition(workbook, operation);
      if (insertionIndex < 0) {
        appendOperationConflict(
          conflicts,
          operation,
          workbook.sheets.map(sheet => String(sheet.id)),
          { sheet_id: operation.sheetId, property: 'position' },
        );
        continue;
      }
      const nextSheet = cloneJsonValue(operation.after);
      workbook.sheets.splice(insertionIndex, 0, nextSheet);
      sheetsById.set(operation.sheetId, nextSheet);
      changed = true;
      continue;
    }
    if (operation.type === 'delete_sheet') {
      const currentSheet = sheetsById.get(operation.sheetId);
      if (!currentSheet) continue;
      if (!isDeepStrictEqual(currentSheet, operation.before)) {
        appendOperationConflict(conflicts, operation, currentSheet, { sheet_id: operation.sheetId });
        continue;
      }
      workbook.sheets = workbook.sheets.filter(sheet => String(sheet.id) !== operation.sheetId);
      sheetsById.delete(operation.sheetId);
      changed = true;
      continue;
    }
    if (operation.type === 'reorder_sheets') {
      const affectedIds = new Set(operation.after);
      const currentOrder = workbook.sheets
        .map(sheet => String(sheet.id))
        .filter(sheetId => affectedIds.has(sheetId));
      if (isDeepStrictEqual(currentOrder, operation.after)) continue;
      if (!isDeepStrictEqual(currentOrder, operation.before)) {
        appendOperationConflict(conflicts, operation, currentOrder, { property: 'sheetOrder' });
        continue;
      }
      applySheetOrder(workbook, operation.after);
      changed = true;
      continue;
    }
    const sheet = operation.sheetId ? sheetsById.get(operation.sheetId) : null;
    if (operation.sheetId && !sheet) throw spreadsheetOperationValidationError(`工作表不存在：${operation.sheetId}`);
    if (operation.type === 'set_cell' && (!sheet.cells || typeof sheet.cells !== 'object' || Array.isArray(sheet.cells))) {
      sheet.cells = {};
    }
    const target = operation.type === 'set_cell' ? sheet.cells : (operation.type === 'set_sheet_property' ? sheet : workbook);
    const targetKey = operation.type === 'set_cell' ? operation.cellKey : operation.property;
    const current = Object.prototype.hasOwnProperty.call(target, targetKey)
      ? cloneJsonValue(target[targetKey])
      : getMissingOperationTargetValue(operation, sheet);
    if (!isDeepStrictEqual(current, operation.before)) {
      if (isDeepStrictEqual(current, operation.after)) continue;
      const details = {};
      if (operation.sheetId) details.sheet_id = operation.sheetId;
      if (operation.type === 'set_cell') details.cell = operation.cellKey;
      else details.property = operation.property;
      appendOperationConflict(conflicts, operation, current, details);
      continue;
    }
    if (isDeepStrictEqual(current, operation.after)) continue;
    changed = true;
    if (operation.type === 'set_cell' && (operation.after === null || (
      operation.after && typeof operation.after === 'object' && !Object.keys(operation.after).length
    ))) {
      delete sheet.cells[operation.cellKey];
    } else if (operation.type === 'set_cell') {
      sheet.cells[operation.cellKey] = cloneJsonValue(operation.after);
      sheet.rowCount = Math.max(Number(sheet.rowCount) || 1, operation.rowIndex + 1);
      sheet.columnCount = Math.max(Number(sheet.columnCount) || 1, operation.columnIndex + 1);
    } else {
      if (operation.type === 'set_sheet_property' && operation.property === 'name') {
        migrateWorkbookFormulaSheetReferences(workbook, current, operation.after);
      }
      target[targetKey] = cloneJsonValue(operation.after);
    }
  }

  if (!conflicts.length) validateSpreadsheetWorkbookSheetNames(workbook);

  return {
    workbook: conflicts.length ? cloneJsonValue(original) : workbook,
    conflicts,
    changed: conflicts.length ? false : changed,
    operationIds: normalizedOperations.map(operation => operation.id),
  };
}

module.exports = {
  MAX_OPERATIONS_PER_REQUEST,
  MAX_PROPERTY_SNAPSHOT_BYTES,
  SHEET_OPERATION_PROPERTIES,
  WORKBOOK_OPERATION_PROPERTIES,
  applySpreadsheetCellOperations: applySpreadsheetOperations,
  applySpreadsheetOperations,
  normalizeSpreadsheetCellOperations: normalizeSpreadsheetOperations,
  normalizeSpreadsheetOperations,
  parseCellKey,
};
