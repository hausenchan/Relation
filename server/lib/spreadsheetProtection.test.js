const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertSpreadsheetChangedCellsPassValidation,
  assertSpreadsheetWorkbookMutationAllowed,
  validateSpreadsheetRuleCollections,
} = require('./spreadsheetProtection');

function createWorkbook() {
  return {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'sheet_1',
    sheets: [{
      id: 'sheet_1',
      name: '工作表1',
      rowCount: 20,
      columnCount: 10,
      cells: { A1: { v: '保留' } },
      rowHeights: {},
      columnWidths: {},
      mergedCells: [],
      filters: [],
      frozen: null,
      protectedRanges: [{
        id: 'lock-a1-b2',
        range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
        ownerUserId: 1,
        allowedUserIds: [2],
        description: '核心数据',
        enabled: true,
      }],
      conditionalFormats: [],
      dataValidations: [],
    }],
    styles: {},
    definedNames: {},
  };
}

test('validates persisted spreadsheet rule structures and bounds', () => {
  const workbook = createWorkbook();
  assert.equal(validateSpreadsheetRuleCollections(workbook), workbook);

  const outOfBounds = structuredClone(workbook);
  outOfBounds.sheets[0].protectedRanges[0].range.endRow = 20;
  assert.throws(() => validateSpreadsheetRuleCollections(outOfBounds), /超出工作表边界/);

  const duplicateIds = structuredClone(workbook);
  duplicateIds.sheets[0].conditionalFormats = [{
    id: 'same',
    range: { startRow: 2, endRow: 2, startColumn: 2, endColumn: 2 },
    type: 'greater_than',
    values: ['1'],
    style: { color: '#dc2626' },
  }, {
    id: 'same',
    range: { startRow: 3, endRow: 3, startColumn: 2, endColumn: 2 },
    type: 'less_than',
    values: ['10'],
    style: { backgroundColor: '#fee2e2' },
  }];
  assert.throws(() => validateSpreadsheetRuleCollections(duplicateIds), /ID 不能重复/);
});

test('allows authorized cell edits but rejects unauthorized content and structural mutations', () => {
  const previous = createWorkbook();
  const allowed = structuredClone(previous);
  allowed.sheets[0].cells.A1 = { v: '允许修改' };
  assert.doesNotThrow(() => assertSpreadsheetWorkbookMutationAllowed(previous, allowed, {
    userId: 2,
    canManage: false,
  }));

  const denied = structuredClone(previous);
  denied.sheets[0].cells.B2 = { v: '越权修改' };
  assert.throws(() => assertSpreadsheetWorkbookMutationAllowed(previous, denied, {
    userId: 3,
    canManage: false,
  }), error => error.statusCode === 403 && error.code === 'SPREADSHEET_PROTECTED_RANGE');

  const resized = structuredClone(previous);
  resized.sheets[0].columnWidths[0] = 180;
  assert.throws(() => assertSpreadsheetWorkbookMutationAllowed(previous, resized, {
    userId: 3,
    canManage: false,
  }), error => error.statusCode === 403 && error.code === 'SPREADSHEET_PROTECTED_RANGE');

  assert.doesNotThrow(() => assertSpreadsheetWorkbookMutationAllowed(previous, denied, {
    userId: 9,
    canManage: true,
  }));
});

test('rejects protection tampering by editors and protected sheet deletion', () => {
  const previous = createWorkbook();
  const unlocked = structuredClone(previous);
  unlocked.sheets[0].protectedRanges = [];
  assert.throws(() => assertSpreadsheetWorkbookMutationAllowed(previous, unlocked, {
    userId: 2,
    canManage: false,
  }), error => error.statusCode === 403 && error.code === 'SPREADSHEET_PROTECTION_MANAGE_REQUIRED');

  const replacement = structuredClone(previous);
  replacement.sheets = [{
    ...replacement.sheets[0],
    id: 'sheet_2',
    name: '替换表',
    protectedRanges: [],
  }];
  replacement.activeSheetId = 'sheet_2';
  assert.throws(() => assertSpreadsheetWorkbookMutationAllowed(previous, replacement, {
    userId: 2,
    canManage: false,
  }), error => error.statusCode === 403 && error.code === 'SPREADSHEET_PROTECTED_RANGE');
});

test('enforces reject validations on changed literals while allowing warning and formulas', () => {
  const previous = createWorkbook();
  previous.sheets[0].dataValidations = [{
    id: 'number-c1',
    range: { startRow: 0, endRow: 0, startColumn: 2, endColumn: 2 },
    type: 'number',
    min: 1,
    max: 10,
    allowBlank: false,
    invalidAction: 'reject',
    message: '请输入 1 到 10',
    enabled: true,
  }];

  const invalid = structuredClone(previous);
  invalid.sheets[0].cells.C1 = { v: '20' };
  assert.throws(() => assertSpreadsheetChangedCellsPassValidation(previous, invalid), error => (
    error.statusCode === 400
    && error.code === 'SPREADSHEET_DATA_VALIDATION_FAILED'
    && error.cell === 'C1'
  ));

  const valid = structuredClone(previous);
  valid.sheets[0].cells.C1 = { v: '5' };
  assert.doesNotThrow(() => assertSpreadsheetChangedCellsPassValidation(previous, valid));

  const formula = structuredClone(previous);
  formula.sheets[0].cells.C1 = { v: '=1+1' };
  assert.doesNotThrow(() => assertSpreadsheetChangedCellsPassValidation(previous, formula));

  const warningWorkbook = structuredClone(previous);
  warningWorkbook.sheets[0].dataValidations[0].invalidAction = 'warning';
  warningWorkbook.sheets[0].cells.C1 = { v: '20' };
  assert.doesNotThrow(() => assertSpreadsheetChangedCellsPassValidation(previous, warningWorkbook));
});
