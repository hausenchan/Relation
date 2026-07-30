const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_OPERATIONS_PER_REQUEST,
  MAX_PROPERTY_SNAPSHOT_BYTES,
  applySpreadsheetOperations,
  normalizeSpreadsheetOperations,
  parseCellKey,
} = require('./spreadsheetOperations');

function createWorkbook() {
  return {
    format: 'relation_spreadsheet_workbook_v1',
    activeSheetId: 'sheet_1',
    sheets: [{
      id: 'sheet_1',
      name: '工作表1',
      rowCount: 1000,
      columnCount: 26,
      cells: { A1: { v: '10' }, C3: { v: '保留', style: { bold: true } } },
      rowHeights: {},
      columnWidths: {},
      mergedCells: [],
      filters: [],
      frozen: null,
    }],
    styles: {},
    definedNames: {},
  };
}

test('applies an atomic batch of preconditioned cell operations without mutating the source workbook', () => {
  const source = createWorkbook();
  const result = applySpreadsheetOperations(source, [
    { id: 'op-1', type: 'set_cell', sheet_id: 'sheet_1', cell: 'a1', before: { v: '10' }, after: { v: '11' } },
    { id: 'op-2', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B2', before: null, after: { v: '新增' } },
    { id: 'op-3', type: 'set_cell', sheet_id: 'sheet_1', cell: 'C3', before: { v: '保留', style: { bold: true } }, after: null },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.operationIds, ['op-1', 'op-2', 'op-3']);
  assert.deepEqual(result.workbook.sheets[0].cells, { A1: { v: '11' }, B2: { v: '新增' } });
  assert.deepEqual(source.sheets[0].cells, { A1: { v: '10' }, C3: { v: '保留', style: { bold: true } } });
});

test('rejects the full batch when any target cell no longer matches its before snapshot', () => {
  const source = createWorkbook();
  const result = applySpreadsheetOperations(source, [
    { id: 'op-new', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B2', before: null, after: { v: '不应写入' } },
    { id: 'op-conflict', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '旧值' }, after: { v: '12' } },
  ]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.workbook, source);
  assert.deepEqual(result.conflicts, [{
    operation_id: 'op-conflict',
    type: 'set_cell',
    sheet_id: 'sheet_1',
    cell: 'A1',
    current: { v: '10' },
  }]);
});

test('reports no change when every operation already matches its target value', () => {
  const source = createWorkbook();
  const result = applySpreadsheetOperations(source, [
    { id: 'op-noop', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '10' }, after: { v: '10' } },
    { id: 'op-retry', type: 'set_cell', sheet_id: 'sheet_1', cell: 'C3', before: { v: '旧值' }, after: { v: '保留', style: { bold: true } } },
  ]);
  assert.equal(result.changed, false);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workbook, source);
});

test('atomically applies sheet and workbook property operations with cell changes', () => {
  const source = createWorkbook();
  source.sheets.push({
    ...createWorkbook().sheets[0],
    id: 'sheet_2',
    name: '分析',
    cells: {
      A1: { v: '=工作表1!A1' },
      A2: { v: '="工作表1!A1"' },
      A3: { v: '=SUM(工作表1!A1:A2)' },
    },
  });
  const result = applySpreadsheetOperations(source, [
    {
      id: 'rename-sheet',
      type: 'set_sheet_property',
      sheet_id: 'sheet_1',
      property: 'name',
      before: '工作表1',
      after: '经营数据',
    },
    {
      id: 'freeze-sheet',
      type: 'set_sheet_property',
      sheet_id: 'sheet_1',
      property: 'frozen',
      before: null,
      after: { rows: 1, columns: 2 },
    },
    {
      id: 'filter-range',
      type: 'set_sheet_property',
      sheet_id: 'sheet_1',
      property: 'filterRange',
      before: null,
      after: {
        startRow: 0,
        endRow: 10,
        startColumn: 0,
        endColumn: 2,
        columns: [0, 2],
      },
    },
    {
      id: 'set-styles',
      type: 'set_workbook_property',
      property: 'styles',
      before: {},
      after: { currency: { format: 'CNY' } },
    },
    { id: 'set-formula', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B1', before: null, after: { v: '=A1+1' } },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.workbook.sheets[0].name, '经营数据');
  assert.deepEqual(result.workbook.sheets[0].frozen, { rows: 1, columns: 2 });
  assert.deepEqual(result.workbook.sheets[0].filterRange, {
    startRow: 0,
    endRow: 10,
    startColumn: 0,
    endColumn: 2,
    columns: [0, 2],
  });
  assert.deepEqual(result.workbook.styles, { currency: { format: 'CNY' } });
  assert.deepEqual(result.workbook.sheets[0].cells.B1, { v: '=A1+1' });
  assert.equal(result.workbook.sheets[1].cells.A1.v, '=经营数据!A1');
  assert.equal(result.workbook.sheets[1].cells.A2.v, '="工作表1!A1"');
  assert.equal(result.workbook.sheets[1].cells.A3.v, '=SUM(经营数据!A1:A2)');
  assert.equal(source.sheets[0].name, '工作表1');
  assert.equal(source.sheets[1].cells.A1.v, '=工作表1!A1');
});

test('atomically adds, deletes, and reorders sheets with stable ids', () => {
  const source = createWorkbook();
  const sheet2 = { ...createWorkbook().sheets[0], id: 'sheet_2', name: '待删除', cells: { A1: { v: '旧数据' } } };
  const sheet3 = { ...createWorkbook().sheets[0], id: 'sheet_3', name: '保留表', cells: { B2: { v: '保留' } } };
  const sheet4 = { ...createWorkbook().sheets[0], id: 'sheet_4', name: '新增表', cells: { C3: { v: '新增' } } };
  source.sheets.push(sheet2, sheet3);

  const result = applySpreadsheetOperations(source, [
    { id: 'delete-sheet-2', type: 'delete_sheet', sheet_id: 'sheet_2', before: sheet2, after: null },
    {
      id: 'add-sheet-4',
      type: 'add_sheet',
      sheet_id: 'sheet_4',
      previous_sheet_id: 'sheet_3',
      next_sheet_id: '',
      index: 2,
      before: null,
      after: sheet4,
    },
    {
      id: 'reorder-sheets',
      type: 'reorder_sheets',
      before: ['sheet_1', 'sheet_3', 'sheet_4'],
      after: ['sheet_3', 'sheet_4', 'sheet_1'],
    },
    {
      id: 'activate-sheet-4',
      type: 'set_workbook_property',
      property: 'activeSheetId',
      before: 'sheet_1',
      after: 'sheet_4',
    },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workbook.sheets.map(sheet => sheet.id), ['sheet_3', 'sheet_4', 'sheet_1']);
  assert.equal(result.workbook.sheets[1].cells.C3.v, '新增');
  assert.equal(result.workbook.activeSheetId, 'sheet_4');
  assert.deepEqual(source.sheets.map(sheet => sheet.id), ['sheet_1', 'sheet_2', 'sheet_3']);
});

test('reorders known sheets while preserving a concurrently added remote sheet', () => {
  const source = createWorkbook();
  source.sheets.push(
    { ...createWorkbook().sheets[0], id: 'remote', name: '远端新增' },
    { ...createWorkbook().sheets[0], id: 'sheet_2', name: '工作表2' },
  );

  const result = applySpreadsheetOperations(source, [{
    id: 'reorder-known-sheets',
    type: 'reorder_sheets',
    before: ['sheet_1', 'sheet_2'],
    after: ['sheet_2', 'sheet_1'],
  }]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workbook.sheets.map(sheet => sheet.id), ['sheet_2', 'remote', 'sheet_1']);
});

test('normalizes omitted optional fields in a compact added sheet snapshot', () => {
  const source = createWorkbook();
  const result = applySpreadsheetOperations(source, [{
    id: 'add-compact-sheet',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    previous_sheet_id: 'sheet_1',
    index: 1,
    before: null,
    after: {
      id: 'sheet_2',
      name: '精简工作表',
      rowCount: 20,
      columnCount: 10,
      cells: { A1: { v: '保留' } },
    },
  }]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workbook.sheets[1], {
    id: 'sheet_2',
    name: '精简工作表',
    rowCount: 20,
    columnCount: 10,
    cells: { A1: { v: '保留' } },
    rowHeights: {},
    columnWidths: {},
    mergedCells: [],
    filters: [],
    frozen: null,
    protectedRanges: [],
    conditionalFormats: [],
    dataValidations: [],
  });
});

test('enforces protected ranges and validation rules atomically for operation batches', () => {
  const source = createWorkbook();
  source.sheets[0].protectedRanges = [{
    id: 'lock-a1',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    ownerUserId: 1,
    allowedUserIds: [2],
    enabled: true,
  }];
  source.sheets[0].dataValidations = [{
    id: 'validation-b1',
    range: { startRow: 0, endRow: 0, startColumn: 1, endColumn: 1 },
    type: 'number',
    min: 1,
    max: 10,
    allowBlank: false,
    invalidAction: 'reject',
    enabled: true,
  }];

  assert.throws(() => applySpreadsheetOperations(source, [
    { id: 'write-unlocked-first', type: 'set_cell', sheet_id: 'sheet_1', cell: 'C1', before: null, after: { v: '不应部分写入' } },
    { id: 'write-locked', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '10' }, after: { v: '11' } },
  ], { actor: { userId: 3, canManage: false } }), error => (
    error.statusCode === 403 && error.code === 'SPREADSHEET_PROTECTED_RANGE'
  ));
  assert.equal(source.sheets[0].cells.C1, undefined);

  const allowed = applySpreadsheetOperations(source, [
    { id: 'allowed-write', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '10' }, after: { v: '11' } },
  ], { actor: { userId: 2, canManage: false } });
  assert.equal(allowed.workbook.sheets[0].cells.A1.v, '11');

  assert.throws(() => applySpreadsheetOperations(source, [
    { id: 'invalid-number', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B1', before: null, after: { v: '99' } },
  ], { actor: { userId: 2, canManage: false } }), error => (
    error.statusCode === 400 && error.code === 'SPREADSHEET_DATA_VALIDATION_FAILED'
  ));
  assert.equal(source.sheets[0].cells.B1, undefined);
});

test('only document managers can change protected-range definitions', () => {
  const source = createWorkbook();
  const protectedRanges = [{
    id: 'lock-a1',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    ownerUserId: 1,
    allowedUserIds: [],
    enabled: true,
  }];
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'create-lock',
    type: 'set_sheet_property',
    sheet_id: 'sheet_1',
    property: 'protectedRanges',
    before: [],
    after: protectedRanges,
  }], { actor: { userId: 2, canManage: false } }), error => (
    error.statusCode === 403 && error.code === 'SPREADSHEET_PROTECTION_MANAGE_REQUIRED'
  ));

  const managed = applySpreadsheetOperations(source, [{
    id: 'manager-create-lock',
    type: 'set_sheet_property',
    sheet_id: 'sheet_1',
    property: 'protectedRanges',
    before: [],
    after: protectedRanges,
  }], { actor: { userId: 1, canManage: true } });
  assert.deepEqual(managed.workbook.sheets[0].protectedRanges, protectedRanges);
});

test('rejects a mixed batch when deleting a sheet changed by another collaborator', () => {
  const source = createWorkbook();
  const changedSheet = { ...createWorkbook().sheets[0], id: 'sheet_2', name: '协作表', cells: { A1: { v: '远端新值' } } };
  source.sheets.push(changedSheet);
  const staleSheet = { ...changedSheet, cells: { A1: { v: '旧值' } } };

  const result = applySpreadsheetOperations(source, [
    { id: 'write-before-conflict', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B2', before: null, after: { v: '不应写入' } },
    { id: 'delete-stale-sheet', type: 'delete_sheet', sheet_id: 'sheet_2', before: staleSheet, after: null },
  ]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.workbook, source);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0], {
    operation_id: 'delete-stale-sheet',
    type: 'delete_sheet',
    sheet_id: 'sheet_2',
    current: changedSheet,
  });
});

test('reports an add-sheet name conflict without partially changing the workbook', () => {
  const source = createWorkbook();
  const duplicateNameSheet = { ...createWorkbook().sheets[0], id: 'sheet_2', name: '工作表1', cells: {} };
  const result = applySpreadsheetOperations(source, [{
    id: 'duplicate-sheet-name',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    previous_sheet_id: 'sheet_1',
    next_sheet_id: '',
    index: 1,
    before: null,
    after: duplicateNameSheet,
  }]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.workbook, source);
  assert.deepEqual(result.conflicts, [{
    operation_id: 'duplicate-sheet-name',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    property: 'name',
    current: { sheet_id: 'sheet_1', name: '工作表1' },
  }]);
});

test('allows an add to reuse a name released later in the same atomic batch', () => {
  const source = createWorkbook();
  const remoteSheet = { ...createWorkbook().sheets[0], id: 'remote', name: '工作表2', cells: {} };
  const localSheet = { ...createWorkbook().sheets[0], id: 'local', name: '工作表2', cells: {} };
  source.sheets.push(remoteSheet);
  const result = applySpreadsheetOperations(source, [
    {
      id: 'add-local-sheet',
      type: 'add_sheet',
      sheet_id: 'local',
      previous_sheet_id: 'sheet_1',
      next_sheet_id: 'remote',
      index: 1,
      before: null,
      after: localSheet,
    },
    {
      id: 'rename-remote-sheet',
      type: 'set_sheet_property',
      sheet_id: 'remote',
      property: 'name',
      before: '工作表2',
      after: '工作表2 (2)',
    },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workbook.sheets.map(sheet => sheet.name), ['工作表1', '工作表2', '工作表2 (2)']);
});

test('rolls back a name-releasing add batch when the planned rename conflicts', () => {
  const source = createWorkbook();
  const remoteSheet = { ...createWorkbook().sheets[0], id: 'remote', name: '工作表2', cells: {} };
  const localSheet = { ...createWorkbook().sheets[0], id: 'local', name: '工作表2', cells: {} };
  source.sheets.push(remoteSheet);
  const result = applySpreadsheetOperations(source, [
    {
      id: 'add-local-before-conflict',
      type: 'add_sheet',
      sheet_id: 'local',
      previous_sheet_id: 'sheet_1',
      next_sheet_id: 'remote',
      index: 1,
      before: null,
      after: localSheet,
    },
    {
      id: 'conflicting-name-release',
      type: 'set_sheet_property',
      sheet_id: 'remote',
      property: 'name',
      before: '过期名称',
      after: '工作表2 (2)',
    },
  ]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.workbook, source);
  assert.deepEqual(result.conflicts, [{
    operation_id: 'conflicting-name-release',
    type: 'set_sheet_property',
    sheet_id: 'remote',
    property: 'name',
    current: '工作表2',
  }]);
});

test('uses normalized defaults as property preconditions for legacy workbooks with omitted fields', () => {
  const source = createWorkbook();
  delete source.sheets[0].rowHeights;
  delete source.sheets[0].columnWidths;
  delete source.styles;
  delete source.definedNames;
  const result = applySpreadsheetOperations(source, [
    {
      id: 'legacy-widths',
      type: 'set_sheet_property',
      sheet_id: 'sheet_1',
      property: 'columnWidths',
      before: {},
      after: { 0: 160 },
    },
    {
      id: 'legacy-styles',
      type: 'set_workbook_property',
      property: 'styles',
      before: {},
      after: { currency: { format: 'CNY' } },
    },
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workbook.sheets[0].columnWidths, { 0: 160 });
  assert.deepEqual(result.workbook.styles, { currency: { format: 'CNY' } });
});

test('rejects a mixed batch atomically when a sheet property precondition conflicts', () => {
  const source = createWorkbook();
  const result = applySpreadsheetOperations(source, [
    { id: 'new-cell', type: 'set_cell', sheet_id: 'sheet_1', cell: 'B2', before: null, after: { v: '不应写入' } },
    {
      id: 'freeze-conflict',
      type: 'set_sheet_property',
      sheet_id: 'sheet_1',
      property: 'frozen',
      before: { rows: 1, columns: 1 },
      after: { rows: 2, columns: 2 },
    },
  ]);
  assert.equal(result.changed, false);
  assert.deepEqual(result.workbook, source);
  assert.deepEqual(result.conflicts, [{
    operation_id: 'freeze-conflict',
    type: 'set_sheet_property',
    sheet_id: 'sheet_1',
    property: 'frozen',
    current: null,
  }]);
});

test('validates operation ids, coordinates, properties, snapshots, and batch limits', () => {
  const source = createWorkbook();
  assert.deepEqual(parseCellKey('B2'), { key: 'B2', rowIndex: 1, columnIndex: 1 });
  assert.equal(parseCellKey('A0'), null);
  assert.equal(parseCellKey('ZZZ100001'), null);
  assert.throws(() => normalizeSpreadsheetOperations([]), /至少一个/);
  assert.throws(() => normalizeSpreadsheetOperations(Array.from(
    { length: MAX_OPERATIONS_PER_REQUEST + 1 },
    (_, index) => ({ id: `op-${index}`, type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: null, after: null }),
  )), /最多提交/);
  assert.throws(() => applySpreadsheetOperations(source, [
    { id: 'duplicate', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '10' }, after: null },
    { id: 'duplicate', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A2', before: null, after: null },
  ]), /操作 ID 不能重复/);
  assert.throws(() => applySpreadsheetOperations(source, [
    { id: 'bad-cell', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A0', before: null, after: null },
  ]), /单元格坐标不合法/);
  assert.throws(() => applySpreadsheetOperations(source, [
    { id: 'missing-sheet', type: 'set_cell', sheet_id: 'missing', cell: 'A1', before: null, after: null },
  ]), /工作表不存在/);
  assert.throws(() => applySpreadsheetOperations(source, [
    { id: 'large-cell', type: 'set_cell', sheet_id: 'sheet_1', cell: 'A1', before: { v: '10' }, after: { v: 'X'.repeat(17000) } },
  ]), /超过 16KB/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'unsupported-property',
    type: 'set_sheet_property',
    sheet_id: 'sheet_1',
    property: 'cells',
    before: {},
    after: {},
  }]), /工作表属性不支持/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-row-count',
    type: 'set_sheet_property',
    sheet_id: 'sheet_1',
    property: 'rowCount',
    before: 1000,
    after: 100001,
  }]), /工作表行数不合法/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'duplicate-name',
    type: 'set_sheet_property',
    sheet_id: 'sheet_1',
    property: 'name',
    before: '工作表1',
    after: '',
  }]), /工作表名称不能为空/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'unsupported-workbook-property',
    type: 'set_workbook_property',
    property: 'sheets',
    before: [],
    after: [],
  }]), /工作簿属性不支持/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'large-property',
    type: 'set_workbook_property',
    property: 'styles',
    before: {},
    after: { payload: 'X'.repeat(MAX_PROPERTY_SNAPSHOT_BYTES + 1) },
  }]), /超过 256KB/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-add-before',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    index: 1,
    before: {},
    after: { ...createWorkbook().sheets[0], id: 'sheet_2', name: '工作表2' },
  }]), /before 必须为空/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-delete-id',
    type: 'delete_sheet',
    sheet_id: 'sheet_2',
    before: { ...createWorkbook().sheets[0], id: 'other', name: '工作表2' },
    after: null,
  }]), /快照 ID 不一致/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-reorder-set',
    type: 'reorder_sheets',
    before: ['sheet_1', 'sheet_2'],
    after: ['sheet_1', 'sheet_3'],
  }]), /前后 ID 集合必须一致/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-add-field',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    index: 1,
    before: null,
    after: { ...createWorkbook().sheets[0], id: 'sheet_2', name: '工作表2', hidden: true },
  }]), /工作表字段不支持：hidden/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-add-coordinate',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    index: 1,
    before: null,
    after: {
      ...createWorkbook().sheets[0],
      id: 'sheet_2',
      name: '工作表2',
      cells: { A1001: { v: '超出声明行数' } },
    },
  }]), /工作表单元格超出声明行列范围/);
  assert.throws(() => applySpreadsheetOperations(source, [{
    id: 'bad-add-large-cell',
    type: 'add_sheet',
    sheet_id: 'sheet_2',
    index: 1,
    before: null,
    after: {
      ...createWorkbook().sheets[0],
      id: 'sheet_2',
      name: '工作表2',
      cells: { A1: { v: 'X'.repeat(17000) } },
    },
  }]), /超过 16KB/);
});
