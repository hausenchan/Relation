const { isDeepStrictEqual } = require('node:util');

const MAX_RULES_PER_COLLECTION = 500;
const MAX_ALLOWED_USERS_PER_RULE = 200;
const MAX_VALIDATION_VALUES = 200;
const MAX_RULE_ID_LENGTH = 128;
const MAX_RULE_TEXT_LENGTH = 512;
const MAX_RULE_MESSAGE_LENGTH = 120;
const CONDITIONAL_FORMAT_TYPES = new Set([
  'greater_than',
  'less_than',
  'between',
  'equal',
  'not_equal',
  'text_contains',
  'date_before',
  'date_after',
  'date_equal',
  'blank',
  'not_blank',
  'duplicate',
  'unique',
]);
const DATA_VALIDATION_TYPES = new Set([
  'list',
  'number',
  'date_time',
  'text_length',
  'checkbox',
  'rating',
  'progress',
  'id_card',
  'mobile',
  'landline',
  'email',
  'temperature',
  'custom_formula',
]);

function spreadsheetRuleError(message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function parseSpreadsheetWorkbookValue(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw spreadsheetRuleError('在线表格工作簿格式不合法');
  }
}

function normalizeRuleRange(range, sheet, label = '规则') {
  if (!range || typeof range !== 'object' || Array.isArray(range)) {
    throw spreadsheetRuleError(`${label}范围格式不合法`);
  }
  const values = {
    startRow: Number(range.startRow),
    endRow: Number(range.endRow),
    startColumn: Number(range.startColumn),
    endColumn: Number(range.endColumn),
  };
  if (!Object.values(values).every(Number.isInteger)
    || values.startRow < 0
    || values.startColumn < 0
    || values.endRow < values.startRow
    || values.endColumn < values.startColumn
    || values.endRow >= Number(sheet?.rowCount)
    || values.endColumn >= Number(sheet?.columnCount)) {
    throw spreadsheetRuleError(`${label}范围超出工作表边界`);
  }
  return values;
}

function rangesOverlap(left, right) {
  return Boolean(left && right
    && left.startRow <= right.endRow
    && left.endRow >= right.startRow
    && left.startColumn <= right.endColumn
    && left.endColumn >= right.startColumn);
}

function rangeLabel(range) {
  function columnLabel(index) {
    let value = Number(index) + 1;
    let label = '';
    while (value > 0) {
      label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }
  const start = `${columnLabel(range.startColumn)}${range.startRow + 1}`;
  const end = `${columnLabel(range.endColumn)}${range.endRow + 1}`;
  return start === end ? start : `${start}:${end}`;
}

function normalizeRuleId(rule, usedIds, label) {
  const id = String(rule?.id || '').trim();
  if (!id || id.length > MAX_RULE_ID_LENGTH) {
    throw spreadsheetRuleError(`${label} ID 不合法`);
  }
  if (usedIds.has(id)) throw spreadsheetRuleError(`${label} ID 不能重复`);
  usedIds.add(id);
  return id;
}

function validateRuleText(value, maxLength, label) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || Array.from(value).length > maxLength) {
    throw spreadsheetRuleError(`${label}格式不合法`);
  }
}

function validateRuleCollection(sheet, property, typeLabel) {
  const rules = sheet?.[property];
  if (rules === undefined) return;
  if (!Array.isArray(rules) || rules.length > MAX_RULES_PER_COLLECTION) {
    throw spreadsheetRuleError(`${typeLabel}数量或格式不合法`);
  }
  const usedIds = new Set();
  rules.forEach((rule, index) => {
    const label = `${typeLabel}第 ${index + 1} 条`;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw spreadsheetRuleError(`${label}格式不合法`);
    }
    normalizeRuleId(rule, usedIds, label);
    normalizeRuleRange(rule.range, sheet, label);
    if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
      throw spreadsheetRuleError(`${label}启用状态格式不合法`);
    }

    if (property === 'protectedRanges') {
      validateRuleText(rule.description, MAX_RULE_MESSAGE_LENGTH, `${label}说明`);
      const ownerUserId = rule.ownerUserId ?? rule.owner_user_id;
      if (ownerUserId !== undefined && ownerUserId !== null && (!Number.isInteger(Number(ownerUserId)) || Number(ownerUserId) <= 0)) {
        throw spreadsheetRuleError(`${label}创建人格式不合法`);
      }
      const allowedUserIds = rule.allowedUserIds ?? rule.allowed_user_ids ?? [];
      if (!Array.isArray(allowedUserIds) || allowedUserIds.length > MAX_ALLOWED_USERS_PER_RULE) {
        throw spreadsheetRuleError(`${label}可编辑成员格式不合法`);
      }
      const normalizedIds = allowedUserIds.map(Number);
      if (normalizedIds.some(id => !Number.isInteger(id) || id <= 0)
        || new Set(normalizedIds).size !== normalizedIds.length) {
        throw spreadsheetRuleError(`${label}可编辑成员格式不合法`);
      }
      return;
    }

    if (property === 'conditionalFormats') {
      const type = String(rule.type || '');
      if (!CONDITIONAL_FORMAT_TYPES.has(type)) {
        throw spreadsheetRuleError(`${label}类型不支持`);
      }
      if (rule.values !== undefined && (!Array.isArray(rule.values) || rule.values.length > 2
        || rule.values.some(value => Array.from(String(value ?? '')).length > MAX_RULE_TEXT_LENGTH))) {
        throw spreadsheetRuleError(`${label}条件值格式不合法`);
      }
      const expectedValueCount = ['blank', 'not_blank', 'duplicate', 'unique'].includes(type)
        ? 0
        : (type === 'between' ? 2 : 1);
      if ((rule.values || []).length !== expectedValueCount
        || (rule.values || []).some(value => !String(value ?? '').trim())) {
        throw spreadsheetRuleError(`${label}条件值数量不合法`);
      }
      if (!rule.style || typeof rule.style !== 'object' || Array.isArray(rule.style)) {
        throw spreadsheetRuleError(`${label}样式格式不合法`);
      }
      for (const color of [rule.style.color, rule.style.backgroundColor]) {
        if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(color))) {
          throw spreadsheetRuleError(`${label}颜色格式不合法`);
        }
      }
      if (rule.priority !== undefined && (!Number.isInteger(Number(rule.priority)) || Number(rule.priority) < 0)) {
        throw spreadsheetRuleError(`${label}优先级格式不合法`);
      }
      if (rule.stopIfTrue !== undefined && typeof rule.stopIfTrue !== 'boolean') {
        throw spreadsheetRuleError(`${label}停止策略格式不合法`);
      }
      return;
    }

    const validationType = String(rule.type || '');
    if (!DATA_VALIDATION_TYPES.has(validationType)) {
      throw spreadsheetRuleError(`${label}类型不支持`);
    }
    if (rule.values !== undefined && (!Array.isArray(rule.values) || rule.values.length > MAX_VALIDATION_VALUES
      || rule.values.some(value => Array.from(String(value ?? '')).length > MAX_RULE_TEXT_LENGTH))) {
      throw spreadsheetRuleError(`${label}候选值格式不合法`);
    }
    for (const boundary of ['min', 'max']) {
      if (rule[boundary] !== undefined && rule[boundary] !== null && !Number.isFinite(Number(rule[boundary]))) {
        throw spreadsheetRuleError(`${label}${boundary === 'min' ? '最小值' : '最大值'}格式不合法`);
      }
    }
    validateRuleText(rule.formula, MAX_RULE_TEXT_LENGTH, `${label}公式`);
    validateRuleText(rule.message, MAX_RULE_MESSAGE_LENGTH, `${label}提示`);
    if (rule.allowBlank !== undefined && typeof rule.allowBlank !== 'boolean') {
      throw spreadsheetRuleError(`${label}空值策略格式不合法`);
    }
    if (rule.invalidAction !== undefined && !['reject', 'warning'].includes(rule.invalidAction)) {
      throw spreadsheetRuleError(`${label}无效数据策略不支持`);
    }
    if (rule.priority !== undefined && (!Number.isInteger(Number(rule.priority)) || Number(rule.priority) < 0)) {
      throw spreadsheetRuleError(`${label}优先级格式不合法`);
    }
    if (validationType === 'list' && !(rule.values || []).length) {
      throw spreadsheetRuleError(`${label}至少需要一个列表选项`);
    }
    if (validationType === 'custom_formula' && !String(rule.formula || '').trim().startsWith('=')) {
      throw spreadsheetRuleError(`${label}自定义公式必须以 = 开头`);
    }
    if (rule.min !== undefined && rule.min !== null && rule.max !== undefined && rule.max !== null
      && Number(rule.min) > Number(rule.max)) {
      throw spreadsheetRuleError(`${label}最小值不能大于最大值`);
    }
  });
}

function validateSpreadsheetRuleCollections(workbookValue) {
  const workbook = parseSpreadsheetWorkbookValue(workbookValue);
  if (!workbook || !Array.isArray(workbook.sheets) || !workbook.sheets.length) {
    throw spreadsheetRuleError('在线表格工作簿格式不合法');
  }
  workbook.sheets.forEach((sheet, index) => {
    if (!Number.isInteger(Number(sheet?.rowCount)) || Number(sheet.rowCount) < 1
      || !Number.isInteger(Number(sheet?.columnCount)) || Number(sheet.columnCount) < 1) {
      throw spreadsheetRuleError(`第 ${index + 1} 个工作表行列数量格式不合法`);
    }
    validateRuleCollection(sheet, 'protectedRanges', '锁定规则');
    validateRuleCollection(sheet, 'conditionalFormats', '条件格式规则');
    validateRuleCollection(sheet, 'dataValidations', '数据验证规则');
  });
  return workbook;
}

function ruleAllowsActor(rule, actor = {}) {
  if (actor.canManage) return true;
  const userId = Number(actor.userId) || 0;
  if (!userId) return false;
  const ownerUserId = Number(rule.ownerUserId ?? rule.owner_user_id) || 0;
  const allowedUserIds = (rule.allowedUserIds ?? rule.allowed_user_ids ?? []).map(Number);
  return ownerUserId === userId || allowedUserIds.includes(userId);
}

function deniedRulesForRange(sheet, range, actor) {
  return (sheet?.protectedRanges || []).filter(rule => (
    rule?.enabled !== false
    && rangesOverlap(rule.range, range)
    && !ruleAllowsActor(rule, actor)
  ));
}

function throwProtectedRangeError(sheet, rule) {
  const protectedRange = normalizeRuleRange(rule.range, sheet, '锁定规则');
  throw spreadsheetRuleError(
    rule.description || `所选区域与锁定范围 ${rangeLabel(protectedRange)} 冲突`,
    403,
    {
      code: 'SPREADSHEET_PROTECTED_RANGE',
      sheetId: String(sheet.id || ''),
      protectedRange,
      ruleId: String(rule.id || ''),
    },
  );
}

function assertRangeEditable(sheet, range, actor) {
  const deniedRule = deniedRulesForRange(sheet, range, actor)[0];
  if (deniedRule) throwProtectedRangeError(sheet, deniedRule);
}

function parseCellKey(value) {
  const match = String(value || '').match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) return null;
  const columnIndex = match[1].split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  return { rowIndex: Number(match[2]) - 1, columnIndex };
}

function changedObjectKeys(before = {}, after = {}) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter(key => !isDeepStrictEqual(before?.[key], after?.[key]));
}

function changedRuleRanges(beforeRules = [], afterRules = []) {
  const beforeById = new Map((beforeRules || []).map(rule => [String(rule?.id || ''), rule]));
  const afterById = new Map((afterRules || []).map(rule => [String(rule?.id || ''), rule]));
  const result = [];
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    if (isDeepStrictEqual(before, after)) continue;
    if (before?.range) result.push(before.range);
    if (after?.range) result.push(after.range);
  }
  return result;
}

function assertSpreadsheetWorkbookMutationAllowed(previousValue, nextValue, actor = {}) {
  const previous = validateSpreadsheetRuleCollections(previousValue);
  const next = validateSpreadsheetRuleCollections(nextValue);
  const nextSheetsById = new Map(next.sheets.map(sheet => [String(sheet.id), sheet]));

  for (const previousSheet of previous.sheets) {
    const nextSheet = nextSheetsById.get(String(previousSheet.id));
    if (!nextSheet) {
      if (!actor.canManage && (previousSheet.protectedRanges || []).some(rule => rule?.enabled !== false)) {
        throwProtectedRangeError(previousSheet, previousSheet.protectedRanges.find(rule => rule?.enabled !== false));
      }
      continue;
    }

    if (!actor.canManage && !isDeepStrictEqual(previousSheet.protectedRanges || [], nextSheet.protectedRanges || [])) {
      throw spreadsheetRuleError('只有文档管理者可以新增、修改或解除单元格锁定', 403, {
        code: 'SPREADSHEET_PROTECTION_MANAGE_REQUIRED',
        sheetId: String(previousSheet.id || ''),
      });
    }
    if (actor.canManage) continue;

    for (const cellKey of changedObjectKeys(previousSheet.cells, nextSheet.cells)) {
      const cell = parseCellKey(cellKey);
      if (cell) assertRangeEditable(previousSheet, {
        startRow: cell.rowIndex,
        endRow: cell.rowIndex,
        startColumn: cell.columnIndex,
        endColumn: cell.columnIndex,
      }, actor);
    }

    for (const rowKey of changedObjectKeys(previousSheet.rowHeights, nextSheet.rowHeights)) {
      const rowIndex = Number(rowKey);
      if (Number.isInteger(rowIndex) && rowIndex >= 0) assertRangeEditable(previousSheet, {
        startRow: rowIndex,
        endRow: rowIndex,
        startColumn: 0,
        endColumn: Math.max(0, Number(previousSheet.columnCount) - 1),
      }, actor);
    }
    for (const columnKey of changedObjectKeys(previousSheet.columnWidths, nextSheet.columnWidths)) {
      const columnIndex = Number(columnKey);
      if (Number.isInteger(columnIndex) && columnIndex >= 0) assertRangeEditable(previousSheet, {
        startRow: 0,
        endRow: Math.max(0, Number(previousSheet.rowCount) - 1),
        startColumn: columnIndex,
        endColumn: columnIndex,
      }, actor);
    }

    if (Number(nextSheet.rowCount) < Number(previousSheet.rowCount)) {
      assertRangeEditable(previousSheet, {
        startRow: Number(nextSheet.rowCount),
        endRow: Number(previousSheet.rowCount) - 1,
        startColumn: 0,
        endColumn: Number(previousSheet.columnCount) - 1,
      }, actor);
    }
    if (Number(nextSheet.columnCount) < Number(previousSheet.columnCount)) {
      assertRangeEditable(previousSheet, {
        startRow: 0,
        endRow: Number(previousSheet.rowCount) - 1,
        startColumn: Number(nextSheet.columnCount),
        endColumn: Number(previousSheet.columnCount) - 1,
      }, actor);
    }

    for (const mergedRange of changedRuleRanges(
      (previousSheet.mergedCells || []).map((range, index) => ({ id: JSON.stringify(range) || String(index), range })),
      (nextSheet.mergedCells || []).map((range, index) => ({ id: JSON.stringify(range) || String(index), range })),
    )) assertRangeEditable(previousSheet, mergedRange, actor);

    for (const property of ['conditionalFormats', 'dataValidations']) {
      for (const changedRange of changedRuleRanges(previousSheet[property], nextSheet[property])) {
        assertRangeEditable(previousSheet, changedRange, actor);
      }
    }
  }

  for (const nextSheet of next.sheets) {
    if (previous.sheets.some(sheet => String(sheet.id) === String(nextSheet.id))) continue;
    if (!actor.canManage && (nextSheet.protectedRanges || []).some(rule => rule?.enabled !== false)) {
      throw spreadsheetRuleError('只有文档管理者可以在新增工作表中创建锁定规则', 403, {
        code: 'SPREADSHEET_PROTECTION_MANAGE_REQUIRED',
        sheetId: String(nextSheet.id || ''),
      });
    }
  }
  return next;
}

function cellRawValue(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell && typeof cell === 'object' && !Array.isArray(cell)) return cell.v ?? cell.value ?? '';
  return cell;
}

function validationRuleAcceptsValue(rule, value) {
  const text = String(value ?? '').trim();
  if (!text && rule.allowBlank !== false) return true;
  if (text.startsWith('=')) return true;
  const type = String(rule.type || 'list');
  const number = Number(text);
  const values = Array.isArray(rule.values) ? rule.values.map(item => String(item)) : [];
  if (type === 'list') return values.includes(text);
  if (type === 'number') return Number.isFinite(number)
    && (rule.min === undefined || rule.min === null || number >= Number(rule.min))
    && (rule.max === undefined || rule.max === null || number <= Number(rule.max));
  if (type === 'date_time') return Number.isFinite(new Date(text).getTime());
  if (type === 'text_length') {
    const length = Array.from(text).length;
    return (rule.min === undefined || rule.min === null || length >= Number(rule.min))
      && (rule.max === undefined || rule.max === null || length <= Number(rule.max));
  }
  if (type === 'checkbox') return /^(true|false|1|0|是|否)$/i.test(text);
  if (type === 'rating') return Number.isInteger(number) && number >= 1 && number <= 5;
  if (type === 'progress') return Number.isFinite(number) && number >= 0 && number <= 100;
  if (type === 'id_card') return /^(?:\d{15}|\d{17}[\dXx])$/.test(text);
  if (type === 'mobile') return /^1[3-9]\d{9}$/.test(text);
  if (type === 'landline') return /^(?:0\d{2,3}-?)?\d{7,8}$/.test(text);
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  if (type === 'temperature') return Number.isFinite(number) && number >= -273.15 && number <= 1000;
  return true;
}

function assertSpreadsheetChangedCellsPassValidation(previousValue, nextValue) {
  const previous = validateSpreadsheetRuleCollections(previousValue);
  const next = validateSpreadsheetRuleCollections(nextValue);
  const previousSheetsById = new Map(previous.sheets.map(sheet => [String(sheet.id), sheet]));
  for (const nextSheet of next.sheets) {
    const previousSheet = previousSheetsById.get(String(nextSheet.id));
    if (!previousSheet) continue;
    for (const cellKey of changedObjectKeys(previousSheet.cells, nextSheet.cells)) {
      const cell = parseCellKey(cellKey);
      if (!cell) continue;
      const rules = (nextSheet.dataValidations || [])
        .filter(rule => rule?.enabled !== false && rangesOverlap(rule.range, {
          startRow: cell.rowIndex,
          endRow: cell.rowIndex,
          startColumn: cell.columnIndex,
          endColumn: cell.columnIndex,
        }))
        .sort((left, right) => (Number(left.priority) || 0) - (Number(right.priority) || 0));
      const value = cellRawValue(nextSheet.cells?.[cellKey]);
      const rejectedRule = rules.find(rule => (
        rule.invalidAction !== 'warning' && !validationRuleAcceptsValue(rule, value)
      ));
      if (rejectedRule) {
        throw spreadsheetRuleError(
          rejectedRule.message || `${cellKey} 输入内容不符合数据验证规则`,
          400,
          {
            code: 'SPREADSHEET_DATA_VALIDATION_FAILED',
            sheetId: String(nextSheet.id || ''),
            cell: cellKey,
            ruleId: String(rejectedRule.id || ''),
          },
        );
      }
    }
  }
  return next;
}

module.exports = {
  assertSpreadsheetChangedCellsPassValidation,
  assertSpreadsheetWorkbookMutationAllowed,
  rangesOverlap,
  validateSpreadsheetRuleCollections,
};
