const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSpreadsheetWorkbookXlsx,
  parseSpreadsheetWorkbookBuffer,
  spreadsheetWorkbookToSearchText,
  validateSpreadsheetWorkbookSheetNames,
} = require('./spreadsheetWorkbookFile');

test('exports and imports a Relation spreadsheet workbook as xlsx', async () => {
  const workbook = {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'budget',
    sheets: [
      {
        id: 'summary',
        name: '汇总',
        rowCount: 1000,
        columnCount: 26,
        cells: {
          A1: { v: '项目', style: { bold: true, backgroundColor: '#fef3c7' } },
          B1: { v: '金额', style: { bold: true } },
          A2: { v: '收入' },
          B2: { v: '100' },
          B3: { v: '=SUM(B2:B2)', computed: '100' },
        },
        rowHeights: { 0: 36 },
        columnWidths: { 0: 180 },
        mergedCells: [{ startRow: 3, endRow: 3, startColumn: 0, endColumn: 1 }],
        filters: [{ columnIndex: 0, operator: 'equals', value: '收入' }],
        frozen: { rows: 1, columns: 1 },
      },
      {
        id: 'budget',
        name: '预算明细',
        rowCount: 1000,
        columnCount: 26,
        cells: { A1: { v: '预算' }, A2: { v: '200' } },
        rowHeights: {},
        columnWidths: {},
        mergedCells: [],
        filters: [],
        frozen: null,
      },
    ],
    styles: {},
    definedNames: {},
  };

  const buffer = await buildSpreadsheetWorkbookXlsx(workbook);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const imported = await parseSpreadsheetWorkbookBuffer(buffer);

  assert.equal(imported.format, 'relation_spreadsheet_workbook_v1');
  assert.equal(imported.activeSheetId, 'sheet_2');
  assert.equal(imported.sheets[0].name, '汇总');
  assert.equal(imported.sheets[0].cells.A1.v, '项目');
  assert.equal(imported.sheets[0].cells.A1.style.bold, true);
  assert.equal(imported.sheets[0].cells.A1.style.backgroundColor, '#FEF3C7');
  assert.equal(imported.sheets[0].cells.B3.v, '=SUM(B2:B2)');
  assert.equal(imported.sheets[0].rowHeights[0], 36);
  assert.equal(imported.sheets[0].columnWidths[0], 180);
  assert.deepEqual(imported.sheets[0].mergedCells[0], { startRow: 3, endRow: 3, startColumn: 0, endColumn: 1 });
  assert.deepEqual(imported.sheets[0].frozen, { rows: 1, columns: 1 });
});

test('rejects invalid or duplicate Relation worksheet names', () => {
  const workbook = {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'sheet_1',
    sheets: [
      { id: 'sheet_1', name: '汇总' },
      { id: 'sheet_2', name: '汇总' },
    ],
  };
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /工作表名称不能重复/);
  workbook.sheets[1].name = '预算/明细';
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /工作表名称不能包含/);
  workbook.sheets[1].name = '';
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /工作表名称不能为空/);
  workbook.sheets[1].name = 'A'.repeat(32);
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /工作表名称不能超过 31 个字符/);
});

test('rejects empty or duplicate worksheet ids and missing active sheets', () => {
  const workbook = {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'sheet_1',
    sheets: [
      { id: 'sheet_1', name: '汇总' },
      { id: 'sheet_2', name: '明细' },
    ],
  };
  workbook.sheets[1].id = 'sheet_1';
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /工作表 ID 不能重复/);
  workbook.sheets[1].id = '';
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /工作表 ID 不能为空/);
  workbook.sheets[1].id = 'sheet_2';
  workbook.activeSheetId = 'missing';
  assert.throws(() => validateSpreadsheetWorkbookSheetNames(workbook), /活动工作表不存在/);
});

test('derives deterministic search text from spreadsheet sheet names and raw cell values', () => {
  const workbook = {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'sheet_1',
    sheets: [
      {
        id: 'sheet_1',
        name: '汇总',
        cells: {
          A10: { v: '第十行' },
          C2: { v: '=SUM(A2:B2)', computed: '30' },
          A2: { v: '收入' },
          B2: { value: 30 },
          D2: { v: '', style: { bold: true } },
          invalid: { v: '忽略无效坐标' },
        },
      },
      {
        id: 'sheet_2',
        name: '明细',
        cells: { B1: '乙', A1: '甲' },
      },
    ],
  };

  const expected = [
    '汇总',
    'A2 收入',
    'B2 30',
    'C2 =SUM(A2:B2)',
    'A10 第十行',
    '明细',
    'A1 甲',
    'B1 乙',
  ].join('\n');
  assert.equal(spreadsheetWorkbookToSearchText(workbook), expected);
  assert.equal(spreadsheetWorkbookToSearchText(JSON.stringify(workbook)), expected);
});

test('limits spreadsheet search text to 20000 characters', () => {
  const workbook = {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'sheet_1',
    sheets: [{ id: 'sheet_1', name: '大表', cells: { A1: { v: 'X'.repeat(25000) } } }],
  };
  assert.equal(spreadsheetWorkbookToSearchText(workbook).length, 20000);
  assert.match(spreadsheetWorkbookToSearchText(workbook), /^大表\nA1 X+$/);
});
