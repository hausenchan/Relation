import {
  createDefaultSpreadsheetSheet,
  createDefaultSpreadsheetWorkbook,
} from './spreadsheetWorkbook';
import {
  buildSpreadsheetOperationSavePlan,
  spreadsheetOperationsAreApplied,
} from './spreadsheetOperations';

function createWorkbook() {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].cells = {
    A1: { v: '10' },
    C3: { v: '保留', style: { bold: true } },
  };
  return workbook;
}

function operationId({ type, sheetId, cell, property }) {
  return `${type}-${sheetId || 'workbook'}-${cell || property}`;
}

test('builds deterministic set_cell operations for value, style, insert, and delete changes', () => {
  const base = createWorkbook();
  const local = JSON.parse(JSON.stringify(base));
  local.sheets[0].cells.A1 = { v: '11' };
  local.sheets[0].cells.B2 = { v: '新增' };
  delete local.sheets[0].cells.C3;
  local.sheets[0].cells.D4 = {};

  const plan = buildSpreadsheetOperationSavePlan({
    baseWorkbook: JSON.stringify(base),
    localWorkbook: local,
    operationIdFactory: ({ cell }) => `op-${cell}`,
  });

  expect(plan.mode).toBe('operations');
  expect(plan.operations).toEqual([
    { id: 'op-A1', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '10' }, after: { v: '11' } },
    { id: 'op-B2', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B2', before: null, after: { v: '新增' } },
    { id: 'op-C3', type: 'set_cell', sheet_id: 'sheet_1', cell: 'C3', before: { v: '保留', style: { bold: true } }, after: null },
  ]);
  expect(spreadsheetOperationsAreApplied(local, plan.operations)).toBe(true);
  const serverMerged = JSON.parse(JSON.stringify(local));
  serverMerged.sheets[0].cells.E5 = { v: '远端不同单元格' };
  expect(spreadsheetOperationsAreApplied(serverMerged, plan.operations)).toBe(true);
  expect(spreadsheetOperationsAreApplied(base, plan.operations)).toBe(false);
});

test('builds sheet property operations for rename, dimensions, sizing, filters, merges, and freezing', () => {
  const base = createWorkbook();
  const local = JSON.parse(JSON.stringify(base));
  Object.assign(local.sheets[0], {
    name: '经营数据',
    rowCount: 1200,
    columnCount: 30,
    rowHeights: { 0: 28 },
    columnWidths: { 0: 160 },
    mergedCells: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }],
    filters: [{ columnIndex: 0, value: '华东' }],
    filterRange: { startRow: 0, endRow: 10, startColumn: 0, endColumn: 2 },
    frozen: { rows: 2, columns: 1 },
  });

  const plan = buildSpreadsheetOperationSavePlan({
    baseWorkbook: base,
    localWorkbook: local,
    operationIdFactory: operationId,
  });

  expect(plan.mode).toBe('operations');
  expect(plan.operations).toHaveLength(9);
  expect(plan.operations.map(item => item.property)).toEqual([
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
  expect(plan.operations.every(item => item.type === 'set_sheet_property')).toBe(true);
  expect(spreadsheetOperationsAreApplied(local, plan.operations)).toBe(true);
  expect(spreadsheetOperationsAreApplied(base, plan.operations)).toBe(false);
});

test('builds workbook property and mixed cell/property operation batches', () => {
  const base = createWorkbook();
  const secondSheet = createDefaultSpreadsheetSheet(1, base.sheets);
  base.sheets.push(secondSheet);
  const local = JSON.parse(JSON.stringify(base));
  local.sheets[0].name = '源数据';
  local.sheets[0].cells.B2 = { v: '=A1+1' };
  local.activeSheetId = secondSheet.id;
  local.styles = { currency: { format: 'CNY' } };
  local.definedNames = { Revenue: '源数据!A1:B2' };

  const plan = buildSpreadsheetOperationSavePlan({
    baseWorkbook: base,
    localWorkbook: local,
    operationIdFactory: operationId,
  });

  expect(plan.mode).toBe('operations');
  expect(plan.operations.map(item => item.type)).toEqual([
    'set_sheet_property',
    'set_cell',
    'set_workbook_property',
    'set_workbook_property',
    'set_workbook_property',
  ]);
  expect(plan.operations.slice(2).map(item => item.property)).toEqual([
    'activeSheetId',
    'styles',
    'definedNames',
  ]);
  expect(spreadsheetOperationsAreApplied(local, plan.operations)).toBe(true);
  const serverMerged = JSON.parse(JSON.stringify(local));
  serverMerged.sheets[1].cells.D4 = { v: '远端保留' };
  expect(spreadsheetOperationsAreApplied(serverMerged, plan.operations)).toBe(true);
});

test('builds atomic Sheet add, delete, reorder, and active-sheet operations', () => {
  const base = createWorkbook();
  const sheet2 = createDefaultSpreadsheetSheet(1, base.sheets);
  const sheet3 = createDefaultSpreadsheetSheet(2, [...base.sheets, sheet2]);
  sheet2.id = 'sheet_2';
  sheet2.name = '待删除';
  sheet2.cells.A1 = { v: '旧值' };
  sheet3.id = 'sheet_3';
  sheet3.name = '保留表';
  base.sheets.push(sheet2, sheet3);

  const local = JSON.parse(JSON.stringify(base));
  const sheet4 = createDefaultSpreadsheetSheet(3, local.sheets);
  sheet4.id = 'sheet_4';
  sheet4.name = '新增表';
  sheet4.cells.B2 = { v: '新增值' };
  local.sheets = [local.sheets[2], sheet4, local.sheets[0]];
  local.activeSheetId = 'sheet_4';

  const plan = buildSpreadsheetOperationSavePlan({
    baseWorkbook: base,
    localWorkbook: local,
    operationIdFactory: operationId,
  });

  expect(plan.mode).toBe('operations');
  expect(plan.operations.map(item => item.type)).toEqual([
    'delete_sheet',
    'add_sheet',
    'reorder_sheets',
    'set_workbook_property',
  ]);
  expect(plan.operations[0]).toMatchObject({ sheet_id: 'sheet_2', before: sheet2, after: null });
  expect(plan.operations[1]).toMatchObject({
    sheet_id: 'sheet_4',
    previous_sheet_id: 'sheet_3',
    index: 1,
    before: null,
    after: sheet4,
  });
  expect(plan.operations[2]).toMatchObject({
    before: ['sheet_1', 'sheet_3', 'sheet_4'],
    after: ['sheet_3', 'sheet_4', 'sheet_1'],
  });
  expect(spreadsheetOperationsAreApplied(local, plan.operations)).toBe(true);
  const serverMerged = JSON.parse(JSON.stringify(local));
  serverMerged.sheets.splice(1, 0, { ...createDefaultSpreadsheetSheet(4), id: 'remote', name: '远端新增' });
  expect(spreadsheetOperationsAreApplied(serverMerged, plan.operations)).toBe(true);
  expect(spreadsheetOperationsAreApplied(base, plan.operations)).toBe(false);
});

test('falls back to document save for title and unknown structure changes', () => {
  const base = createWorkbook();
  expect(buildSpreadsheetOperationSavePlan({
    baseWorkbook: base,
    localWorkbook: base,
    titleChanged: true,
  })).toMatchObject({ mode: 'document', reason: 'title_changed' });

  const unknownRoot = JSON.parse(JSON.stringify(base));
  unknownRoot.calculationMode = 'manual';
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: unknownRoot }))
    .toMatchObject({ mode: 'document', reason: 'unsupported_structure_changed' });
  const unknownSheet = JSON.parse(JSON.stringify(base));
  unknownSheet.sheets[0].hidden = true;
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: unknownSheet }))
    .toMatchObject({ mode: 'document', reason: 'unsupported_structure_changed' });
  const unknownAddedSheet = JSON.parse(JSON.stringify(base));
  const added = createDefaultSpreadsheetSheet(1, unknownAddedSheet.sheets);
  added.hidden = true;
  unknownAddedSheet.sheets.push(added);
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: unknownAddedSheet }))
    .toMatchObject({ mode: 'document', reason: 'unsupported_structure_changed' });
});

test('falls back for operation count, snapshot size, invalid cells, and malformed workbooks', () => {
  const base = createWorkbook();
  const manyChanges = JSON.parse(JSON.stringify(base));
  manyChanges.sheets[0].name = '改名';
  manyChanges.sheets[0].cells.B1 = { v: '1' };
  expect(buildSpreadsheetOperationSavePlan({
    baseWorkbook: base,
    localWorkbook: manyChanges,
    maxOperations: 1,
  })).toMatchObject({ mode: 'document', reason: 'operation_limit' });

  const largeCell = JSON.parse(JSON.stringify(base));
  largeCell.sheets[0].cells.B2 = { v: 'X'.repeat(17000) };
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: largeCell }))
    .toMatchObject({ mode: 'document', reason: 'snapshot_limit' });
  const largeProperty = JSON.parse(JSON.stringify(base));
  largeProperty.styles = { payload: 'X'.repeat(257 * 1024) };
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: largeProperty }))
    .toMatchObject({ mode: 'document', reason: 'snapshot_limit' });
  const largeDeletedSheetBase = JSON.parse(JSON.stringify(base));
  const largeDeletedSheet = createDefaultSpreadsheetSheet(1, largeDeletedSheetBase.sheets);
  largeDeletedSheet.id = 'large-sheet';
  largeDeletedSheet.name = '超大表';
  largeDeletedSheet.cells.A1 = { v: 'X'.repeat(257 * 1024) };
  largeDeletedSheetBase.sheets.push(largeDeletedSheet);
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: largeDeletedSheetBase, localWorkbook: base }))
    .toMatchObject({ mode: 'document', reason: 'snapshot_limit' });

  const invalidCell = JSON.parse(JSON.stringify(base));
  invalidCell.sheets[0].cells.A0 = { v: '非法' };
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: invalidCell }))
    .toMatchObject({ mode: 'document', reason: 'invalid_cell' });
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: '{', localWorkbook: base }))
    .toMatchObject({ mode: 'document', reason: 'invalid_workbook' });
  const duplicateIdWorkbook = JSON.parse(JSON.stringify(base));
  duplicateIdWorkbook.sheets.push({ ...createDefaultSpreadsheetSheet(1), id: 'sheet_1', name: '工作表2' });
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: duplicateIdWorkbook }))
    .toMatchObject({ mode: 'document', reason: 'invalid_workbook' });
});

test('produces an empty operation batch for unchanged content and rejects unknown result operations', () => {
  const base = createWorkbook();
  expect(buildSpreadsheetOperationSavePlan({ baseWorkbook: base, localWorkbook: base }))
    .toEqual({ mode: 'operations', reason: '', operations: [] });
  expect(spreadsheetOperationsAreApplied(base, [{ type: 'unsupported', after: null }])).toBe(false);
});
