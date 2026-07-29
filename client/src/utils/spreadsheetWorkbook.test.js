import {
  applySpreadsheetFormatPattern,
  buildSpreadsheetCellKey,
  createSpreadsheetFormatPattern,
  createDefaultSpreadsheetWorkbook,
  createDefaultSpreadsheetSheet,
  createSpreadsheetFormulaEvaluator,
  extractSpreadsheetFormulaReferences,
  formatSpreadsheetDisplayValue,
  getDocumentContentSignature,
  getSpreadsheetConditionalStyle,
  getSpreadsheetProtectedRangeAccess,
  getSpreadsheetVisibleRows,
  getNextSpreadsheetSheetName,
  mergeSpreadsheetWorkbookSnapshots,
  mergeSpreadsheetCells,
  normalizeSpreadsheetWorkbook,
  parseSpreadsheetCellKey,
  renameSpreadsheetSheet,
  resolveSpreadsheetSortRange,
  setSpreadsheetCellValue,
  setSpreadsheetColumnFilter,
  shiftSpreadsheetCells,
  shiftSpreadsheetColumns,
  shiftSpreadsheetRows,
  sortSpreadsheetRange,
  summarizeSpreadsheetRange,
  spreadsheetClipboardMatrixHasMultipleCells,
  spreadsheetColumnIndex,
  spreadsheetColumnLabel,
  translateSpreadsheetFormulaForPaste,
  unmergeSpreadsheetCells,
  validateSpreadsheetCellInput,
  validateSpreadsheetSheetName,
} from './spreadsheetWorkbook';

function workbookWithCells(cells) {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].cells = Object.fromEntries(Object.entries(cells).map(([key, value]) => [key, { v: value }]));
  return workbook;
}

describe('spreadsheet workbook model', () => {
  test('distinguishes a single clipboard value from a pasted matrix', () => {
    expect(spreadsheetClipboardMatrixHasMultipleCells([['alpha']])).toBe(false);
    expect(spreadsheetClipboardMatrixHasMultipleCells([['alpha', 'beta']])).toBe(true);
    expect(spreadsheetClipboardMatrixHasMultipleCells([['alpha'], ['beta']])).toBe(true);
  });

  test('builds stable signatures for serialized and object content', () => {
    expect(getDocumentContentSignature('{"value":1}')).toBe('{"value":1}');
    expect(getDocumentContentSignature({ value: 1 })).toBe('{"value":1}');
    expect(getDocumentContentSignature(null)).toBe('{}');
  });

  test('converts spreadsheet column labels and cell keys', () => {
    expect(spreadsheetColumnLabel(0)).toBe('A');
    expect(spreadsheetColumnLabel(25)).toBe('Z');
    expect(spreadsheetColumnLabel(26)).toBe('AA');
    expect(spreadsheetColumnIndex('AZ')).toBe(51);
    expect(parseSpreadsheetCellKey('$BC$12')).toEqual({ rowIndex: 11, columnIndex: 54 });
    expect(buildSpreadsheetCellKey(4, 27)).toBe('AB5');
  });

  test('formats display values without changing workbook raw values', () => {
    expect(formatSpreadsheetDisplayValue('1234.5', {
      type: 'number', decimals: 2, useGrouping: true,
    })).toBe('1,234.50');
    expect(formatSpreadsheetDisplayValue('-1234.5', {
      type: 'number', decimals: 1, useGrouping: true, negativeStyle: 'parentheses',
    })).toBe('(1,234.5)');
    expect(formatSpreadsheetDisplayValue('0.125', { type: 'percentage', decimals: 1 })).toBe('12.5%');
    expect(formatSpreadsheetDisplayValue('0.5', { type: 'fraction' })).toBe('1/2');
  });

  test('normalizes legacy or invalid content into a workbook', () => {
    const workbook = normalizeSpreadsheetWorkbook('{"blocks":[]}');
    expect(workbook.format).toBe('relation_spreadsheet_workbook_v1');
    expect(workbook.sheets[0].name).toBe('工作表1');
    expect(workbook.sheets[0]).toMatchObject({
      protectedRanges: [],
      conditionalFormats: [],
      dataValidations: [],
    });
  });

  test('enforces protected ranges and evaluates conditional formats and validation rules', () => {
    const workbook = workbookWithCells({ A1: '120', A2: '80', B1: '研发' });
    const sheet = workbook.sheets[0];
    sheet.protectedRanges = [{
      id: 'lock-1',
      range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 },
      ownerUserId: 1,
      allowedUserIds: [2],
      enabled: true,
    }];
    sheet.conditionalFormats = [{
      id: 'condition-1',
      range: { startRow: 0, endRow: 2, startColumn: 0, endColumn: 0 },
      type: 'greater_than',
      values: [100],
      style: { color: '#dc2626', backgroundColor: '#fee2e2' },
      enabled: true,
    }];
    sheet.dataValidations = [{
      id: 'validation-1',
      range: { rowIndex: 0, columnIndex: 1 },
      type: 'list',
      values: ['研发', '产品'],
      invalidAction: 'reject',
      enabled: true,
    }];

    expect(getSpreadsheetProtectedRangeAccess(sheet, { rowIndex: 0, columnIndex: 0 }, { userId: 3 }).allowed).toBe(false);
    expect(getSpreadsheetProtectedRangeAccess(sheet, { rowIndex: 0, columnIndex: 0 }, { userId: 2 }).allowed).toBe(true);
    expect(getSpreadsheetProtectedRangeAccess(sheet, { rowIndex: 0, columnIndex: 0 }, { userId: 3, canManage: true }).allowed).toBe(true);
    expect(getSpreadsheetConditionalStyle(sheet, 0, 0, 120)).toEqual({ color: '#dc2626', backgroundColor: '#fee2e2' });
    expect(getSpreadsheetConditionalStyle(sheet, 1, 0, 80)).toEqual({});
    expect(validateSpreadsheetCellInput(sheet, 0, 1, '产品').valid).toBe(true);
    expect(validateSpreadsheetCellInput(sheet, 0, 1, '财务')).toMatchObject({ valid: false, action: 'reject' });
  });

  test('keeps sheet names valid and unique across add, rename and legacy normalization', () => {
    const sheets = [
      { id: 'sheet_1', name: '工作表1' },
      { id: 'sheet_3', name: '工作表3' },
    ];
    expect(getNextSpreadsheetSheetName(sheets)).toBe('工作表2');
    expect(createDefaultSpreadsheetSheet(3, sheets).name).toBe('工作表2');
    expect(validateSpreadsheetSheetName('工作表1', sheets, 'sheet_3')).toMatchObject({ valid: false, error: '工作表名称不能重复' });
    expect(validateSpreadsheetSheetName('  ', sheets)).toMatchObject({ valid: false, error: '工作表名称不能为空' });
    expect(validateSpreadsheetSheetName('A'.repeat(32), sheets)).toMatchObject({ valid: false, error: '工作表名称不能超过 31 个字符' });
    ['\\', '/', '?', '*', '[', ']', ':'].forEach(character => {
      expect(validateSpreadsheetSheetName(`明细${character}表`, sheets)).toMatchObject({ valid: false });
    });
    expect(validateSpreadsheetSheetName("'明细", sheets)).toMatchObject({ valid: false });

    const workbook = createDefaultSpreadsheetWorkbook();
    workbook.sheets.push(
      { ...workbook.sheets[0], id: 'duplicate', name: '工作表1' },
      { ...workbook.sheets[0], id: 'invalid', name: '预算/明细' },
    );
    const normalized = normalizeSpreadsheetWorkbook(workbook);
    expect(normalized.sheets.map(sheet => sheet.name)).toEqual(['工作表1', '工作表1 (2)', '预算 明细']);
  });

  test('three-way merges remote spreadsheet cells without dropping local dirty values', () => {
    const base = workbookWithCells({ A1: 'base-a', B1: 'base-b' });
    const local = JSON.parse(JSON.stringify(base));
    const remote = JSON.parse(JSON.stringify(base));
    local.sheets[0].name = '本地名称';
    local.sheets[0].cells.A1 = { v: 'local-a' };
    remote.sheets[0].cells.B1 = { v: 'remote-b' };
    remote.sheets[0].cells.C1 = { v: 'remote-c' };

    const merged = mergeSpreadsheetWorkbookSnapshots(base, local, remote);
    expect(merged.hadRemoteChanges).toBe(true);
    expect(merged.hadConflicts).toBe(false);
    expect(merged.workbook.sheets[0].name).toBe('本地名称');
    expect(merged.workbook.sheets[0].cells).toMatchObject({
      A1: { v: 'local-a' },
      B1: { v: 'remote-b' },
      C1: { v: 'remote-c' },
    });
  });

  test('keeps local same-cell changes and preserves modified sheets when deletes conflict', () => {
    const base = workbookWithCells({ A1: 'base', B1: 'base-b' });
    base.sheets.push({
      ...createDefaultSpreadsheetSheet(1),
      id: 'details',
      name: '明细',
      cells: { A1: { v: 'base-detail' } },
    });
    base.sheets.push({
      ...createDefaultSpreadsheetSheet(2),
      id: 'remote-details',
      name: '远端明细',
      cells: { A1: { v: 'base-remote-detail' } },
    });
    const local = JSON.parse(JSON.stringify(base));
    const remote = JSON.parse(JSON.stringify(base));
    local.sheets[0].cells.A1 = { v: 'local' };
    delete local.sheets[0].cells.B1;
    remote.sheets[0].cells.A1 = { v: 'remote' };
    remote.sheets[0].cells.B1 = { v: 'remote-b' };
    local.sheets[1].cells.A1 = { v: 'local-detail' };
    remote.sheets = remote.sheets.filter(sheet => sheet.id !== 'details');
    local.sheets = local.sheets.filter(sheet => sheet.id !== 'remote-details');
    remote.sheets.find(sheet => sheet.id === 'remote-details').cells.A1 = { v: 'remote-detail' };

    const merged = mergeSpreadsheetWorkbookSnapshots(base, local, remote);
    expect(merged.hadConflicts).toBe(true);
    expect(merged.workbook.sheets[0].cells.A1.v).toBe('local');
    expect(merged.workbook.sheets[0].cells.B1).toBeUndefined();
    expect(merged.workbook.sheets.find(sheet => sheet.id === 'details').cells.A1.v).toBe('local-detail');
    expect(merged.workbook.sheets.find(sheet => sheet.id === 'remote-details').cells.A1.v).toBe('remote-detail');
  });

  test('calculates arithmetic, ranges and common functions', () => {
    const workbook = workbookWithCells({
      A1: '10',
      A2: '20',
      B1: '=A1+A2*2',
      B2: '=SUM(A1:A2)',
      C1: '=AVERAGE(A1:A2)',
      C2: '=IF(B2=30,"是","否")',
      D1: '=AND(A1=10,A2=20)',
      D2: '=OR(A1=0,A2=20)',
      E1: '=CONCAT(LEFT("增长中台",2),RIGHT("表格",1))',
      E2: '=MID("ABCDEFG",3,2)',
    });
    const evaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(evaluator.getValue('sheet_1', 0, 1)).toBe(50);
    expect(evaluator.getValue('sheet_1', 1, 1)).toBe(30);
    expect(evaluator.getValue('sheet_1', 0, 2)).toBe(15);
    expect(evaluator.getValue('sheet_1', 1, 2)).toBe('是');
    expect(evaluator.getValue('sheet_1', 0, 3)).toBe(true);
    expect(evaluator.getValue('sheet_1', 1, 3)).toBe(true);
    expect(evaluator.getValue('sheet_1', 0, 4)).toBe('增长格');
    expect(evaluator.getValue('sheet_1', 1, 4)).toBe('CD');
  });

  test('covers operators, absolute references, dates, errors and direct formula evaluation', () => {
    const workbook = workbookWithCells({
      A1: '3',
      A2: '4',
      B1: '=$A$1^2+A2',
      B2: '=-A1+ABS(-5)',
      C1: '=ROUND(10/3,2)',
      C2: '=COUNTA(A1:B2)',
      D1: '=A1&"-"&A2',
      D2: '=A1<>A2',
      E1: '=UNKNOWN(A1)',
      E2: '=TODAY()',
      F1: '=NOW()',
    });
    const evaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(evaluator.getValue('sheet_1', 0, 1)).toBe(13);
    expect(evaluator.getValue('sheet_1', 1, 1)).toBe(2);
    expect(evaluator.getValue('sheet_1', 0, 2)).toBe(3.33);
    expect(evaluator.getValue('sheet_1', 1, 2)).toBe(4);
    expect(evaluator.getValue('sheet_1', 0, 3)).toBe('3-4');
    expect(evaluator.getValue('sheet_1', 1, 3)).toBe(true);
    expect(evaluator.getValue('sheet_1', 0, 4)).toBe('#NAME?');
    expect(evaluator.getValue('sheet_1', 1, 4)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(evaluator.getValue('sheet_1', 0, 5)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(evaluator.evaluateFormula('sheet_1', '=A1+A2=7')).toBe(true);
    expect(evaluator.evaluateFormula('sheet_1', 'A1+A2')).toBe('#VALUE!');
  });

  test('evaluates custom data-validation formulas through the workbook engine', () => {
    const workbook = workbookWithCells({ A1: '8' });
    const sheet = workbook.sheets[0];
    sheet.dataValidations = [{
      id: 'positive-value',
      range: { rowIndex: 0, columnIndex: 0 },
      type: 'custom_formula',
      formula: '=A1>0',
      allowBlank: false,
      invalidAction: 'reject',
      enabled: true,
    }];
    const evaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(validateSpreadsheetCellInput(sheet, 0, 0, '8', {
      evaluateCustomFormula: rule => evaluator.evaluateFormula(sheet.id, rule.formula) === true,
    }).valid).toBe(true);
    sheet.cells.A1 = { v: '-1' };
    const invalidEvaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(validateSpreadsheetCellInput(sheet, 0, 0, '-1', {
      evaluateCustomFormula: rule => invalidEvaluator.evaluateFormula(sheet.id, rule.formula) === true,
    })).toMatchObject({ valid: false, action: 'reject' });
  });

  test('calculates lookup and conditional aggregate functions', () => {
    const workbook = workbookWithCells({
      A1: '产品',
      B1: '收入',
      C1: '负责人',
      A2: 'A',
      B2: '10',
      C2: '张三',
      A3: 'B',
      B3: '20',
      C3: '李四',
      A4: 'C',
      B4: '30',
      C4: '李四',
      E1: '=VLOOKUP("B",A2:C4,2,FALSE)',
      E2: '=XLOOKUP("C",A2:A4,C2:C4,"未找到")',
      E3: '=SUMIF(C2:C4,"李四",B2:B4)',
      E4: '=COUNTIF(B2:B4,">=20")',
      E5: '=XLOOKUP("D",A2:A4,C2:C4,"未找到")',
    });
    const evaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(evaluator.getValue('sheet_1', 0, 4)).toBe('20');
    expect(evaluator.getValue('sheet_1', 1, 4)).toBe('李四');
    expect(evaluator.getValue('sheet_1', 2, 4)).toBe(50);
    expect(evaluator.getValue('sheet_1', 3, 4)).toBe(2);
    expect(evaluator.getValue('sheet_1', 4, 4)).toBe('未找到');
  });

  test('calculates cross-sheet references and reports formula errors', () => {
    const workbook = workbookWithCells({
      A1: '=明细!A1*2',
      A2: '=A2',
      A3: '=1/0',
      A4: '=SUM(A1:A100001)',
      A5: '=A5+1',
      A6: '=SUM(A6:A6)',
    });
    const detail = { ...workbook.sheets[0], id: 'detail', name: '明细', cells: { A1: { v: '8' } } };
    workbook.sheets.push(detail);
    const evaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(evaluator.getValue('sheet_1', 0, 0)).toBe(16);
    expect(evaluator.getValue('sheet_1', 1, 0)).toBe('#CYCLE!');
    expect(evaluator.getValue('sheet_1', 2, 0)).toBe('#DIV/0!');
    expect(evaluator.getValue('sheet_1', 3, 0)).toBe('#VALUE!');
    expect(evaluator.getValue('sheet_1', 4, 0)).toBe('#CYCLE!');
    expect(evaluator.getValue('sheet_1', 5, 0)).toBe('#CYCLE!');
  });

  test('extracts visible formula references without matching quoted text', () => {
    expect(extractSpreadsheetFormulaReferences(
      '=P4/T4+"A1"+SUM(\'源 数据\'!$B$2:C3)+Sheet10!A1',
      '公式表',
    )).toEqual([
      expect.objectContaining({ token: 'P4', sheetName: '公式表', startRow: 3, endRow: 3, startColumn: 15, endColumn: 15 }),
      expect.objectContaining({ token: 'T4', sheetName: '公式表', startRow: 3, endRow: 3, startColumn: 19, endColumn: 19 }),
      expect.objectContaining({ token: "'源 数据'!$B$2:C3", sheetName: '源 数据', startRow: 1, endRow: 2, startColumn: 1, endColumn: 2 }),
      expect.objectContaining({ token: 'Sheet10!A1', sheetName: 'Sheet10', startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }),
    ]);
  });

  test('translates relative formula references when pasting without changing absolute references or strings', () => {
    expect(translateSpreadsheetFormulaForPaste(
      '=A1+$B$2+Sheet10!C3+"A1"',
      1,
      2,
    )).toBe('=C2+$B$2+Sheet10!E4+"A1"');
  });

  test('renames cross-sheet formula references without changing strings or similar sheet names', () => {
    const workbook = createDefaultSpreadsheetWorkbook();
    workbook.sheets[0].cells = { B2: { v: '15' } };
    workbook.sheets.push(
      {
        ...createDefaultSpreadsheetSheet(1),
        id: 'formula',
        name: '公式表',
        cells: {
          A1: { v: '=工作表1!B2' },
          A2: { v: '=SUM(\'工作表1\'!B2:B2)' },
          A3: { v: '=IF("工作表1!B2"="工作表1!B2",工作表1!B2,0)' },
          A4: { v: '=工作表10!B2' },
        },
      },
      { ...createDefaultSpreadsheetSheet(2), id: 'similar', name: '工作表10', cells: { B2: { v: '99' } } },
    );

    renameSpreadsheetSheet(workbook, 'sheet_1', '源 数据');
    expect(workbook.sheets[0].name).toBe('源 数据');
    expect(workbook.sheets[1].cells.A1.v).toBe("='源 数据'!B2");
    expect(workbook.sheets[1].cells.A2.v).toBe("=SUM('源 数据'!B2:B2)");
    expect(workbook.sheets[1].cells.A3.v).toBe("=IF(\"工作表1!B2\"=\"工作表1!B2\",'源 数据'!B2,0)");
    expect(workbook.sheets[1].cells.A4.v).toBe('=工作表10!B2');
    expect(createSpreadsheetFormulaEvaluator(workbook).getValue('formula', 0, 0)).toBe('15');

    const legacyWorkbook = createDefaultSpreadsheetWorkbook();
    legacyWorkbook.sheets[0].name = 'Data';
    legacyWorkbook.sheets.push({
      ...createDefaultSpreadsheetSheet(1),
      id: 'legacy-formula',
      name: 'Legacy',
      cells: { A1: '=data!A1' },
    });
    renameSpreadsheetSheet(legacyWorkbook, 'sheet_1', 'DATA');
    expect(legacyWorkbook.sheets[1].cells.A1).toBe('=DATA!A1');
  });

  test('sets and clears sparse cells without losing formatting', () => {
    const workbook = createDefaultSpreadsheetWorkbook();
    const sheet = workbook.sheets[0];
    setSpreadsheetCellValue(sheet, 2, 3, '值');
    expect(sheet.cells.D3.v).toBe('值');
    sheet.cells.D3.style = { bold: true };
    sheet.cells.D3.computed = '旧缓存';
    setSpreadsheetCellValue(sheet, 2, 3, '=1+1');
    expect(sheet.cells.D3.computed).toBeUndefined();
    setSpreadsheetCellValue(sheet, 2, 3, '');
    expect(sheet.cells.D3).toEqual({ style: { bold: true } });
  });

  test('captures and tiles cell formats without copying values', () => {
    const workbook = workbookWithCells({
      A1: '来源一',
      B1: '来源二',
      D2: '目标一',
      E2: '目标二',
      F2: '目标三',
      G2: '目标四',
    });
    const sheet = workbook.sheets[0];
    sheet.cells.A1.style = { bold: true, color: '#dc2626', border: { color: '#cbd5e1' } };
    sheet.cells.B1.style = { italic: true, backgroundColor: '#dbeafe' };
    sheet.cells.D2.style = { underline: true };
    sheet.cells.E2.style = { wrap: true };

    const pattern = createSpreadsheetFormatPattern(sheet, {
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 1,
    });
    applySpreadsheetFormatPattern(sheet, {
      startRow: 1,
      endRow: 1,
      startColumn: 3,
      endColumn: 6,
    }, pattern);

    expect(sheet.cells.D2).toEqual({
      v: '目标一',
      style: { bold: true, color: '#dc2626', border: { color: '#cbd5e1' } },
    });
    expect(sheet.cells.E2).toEqual({
      v: '目标二',
      style: { italic: true, backgroundColor: '#dbeafe' },
    });
    expect(sheet.cells.F2.style).toEqual(sheet.cells.A1.style);
    expect(sheet.cells.G2.style).toEqual(sheet.cells.B1.style);
  });

  test('uses an unformatted source cell to clear only the target format', () => {
    const workbook = workbookWithCells({ A1: '默认格式', B1: '保留内容' });
    const sheet = workbook.sheets[0];
    sheet.cells.B1.style = { bold: true, color: '#dc2626' };

    const pattern = createSpreadsheetFormatPattern(sheet, { rowIndex: 0, columnIndex: 0 });
    applySpreadsheetFormatPattern(sheet, { rowIndex: 0, columnIndex: 1 }, pattern);

    expect(sheet.cells.B1).toEqual({ v: '保留内容' });
  });

  test('merges a range into its anchor and can unmerge it', () => {
    const workbook = workbookWithCells({ A1: '保留', B1: '删除', A2: '删除' });
    const sheet = workbook.sheets[0];
    mergeSpreadsheetCells(sheet, { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 });
    expect(sheet.cells.A1.v).toBe('保留');
    expect(sheet.cells.B1).toBeUndefined();
    expect(sheet.mergedCells).toHaveLength(1);
    unmergeSpreadsheetCells(sheet, { rowIndex: 0, columnIndex: 0 });
    expect(sheet.mergedCells).toHaveLength(0);
  });

  test('sorts selected data while preserving a text header', () => {
    const workbook = workbookWithCells({ A1: '名称', B1: '金额', A2: '乙', B2: '20', A3: '甲', B3: '10' });
    const sheet = workbook.sheets[0];
    sortSpreadsheetRange(sheet, { startRow: 0, endRow: 2, startColumn: 0, endColumn: 1 }, 1, 'asc');
    expect(sheet.cells.A1.v).toBe('名称');
    expect(sheet.cells.A2.v).toBe('甲');
    expect(sheet.cells.B3.v).toBe('20');
  });

  test('expands a selected data column to the complete used row records before sorting', () => {
    const workbook = workbookWithCells({
      A1: '日期', B1: '汇总申请uv', C1: '备注',
      A2: '2026/7/28', B2: '5575', C2: '甲',
      A3: '2026/7/27', B3: '314', C3: '乙',
    });
    const sheet = workbook.sheets[0];
    expect(resolveSpreadsheetSortRange(sheet, {
      startRow: 0,
      endRow: sheet.rowCount - 1,
      startColumn: 1,
      endColumn: 1,
    })).toEqual({ startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 });

    sortSpreadsheetRange(sheet, resolveSpreadsheetSortRange(sheet, {
      startRow: 0,
      endRow: sheet.rowCount - 1,
      startColumn: 1,
      endColumn: 1,
    }), 1, 'asc');
    expect([sheet.cells.A2.v, sheet.cells.B2.v, sheet.cells.C2.v]).toEqual(['2026/7/27', '314', '乙']);
    expect([sheet.cells.A3.v, sheet.cells.B3.v, sheet.cells.C3.v]).toEqual(['2026/7/28', '5575', '甲']);
  });

  test('summarizes numeric results in a sparse selected range', () => {
    const workbook = workbookWithCells({
      A1: '名称', B1: '10', B2: '20', B3: '=SUM(B1:B2)', B4: '', C2: '说明',
    });
    const evaluator = createSpreadsheetFormulaEvaluator(workbook);
    expect(summarizeSpreadsheetRange(
      workbook.sheets[0],
      { startRow: 0, endRow: 2, startColumn: 1, endColumn: 1 },
      (row, column) => evaluator.getValue('sheet_1', row, column),
    )).toEqual({ sum: 60, average: 20, max: 30, min: 10, count: 3, numericCount: 3 });
    expect(summarizeSpreadsheetRange(workbook.sheets[0], {
      startRow: 0,
      endRow: 3,
      startColumn: 0,
      endColumn: 2,
    }, (row, column) => evaluator.getValue('sheet_1', row, column)).count).toBe(5);
  });

  test('keeps blank cells after populated values in descending sorts', () => {
    const workbook = workbookWithCells({
      B1: '汇总申请uv',
      B2: '5575',
      B3: '6445',
      B5: '6888',
      B6: '314',
    });
    workbook.sheets[0].cells.B2.style = { bold: true };
    const sheet = workbook.sheets[0];
    sortSpreadsheetRange(sheet, { startRow: 0, endRow: 5, startColumn: 1, endColumn: 1 }, 1, 'desc');
    expect([sheet.cells.B2?.v, sheet.cells.B3?.v, sheet.cells.B4?.v, sheet.cells.B5?.v, sheet.cells.B6?.v])
      .toEqual(['6888', '6445', '5575', '314', undefined]);
    expect(sheet.cells.B4.style).toEqual({ bold: true });
  });

  test('filters rows by the selected column value and keeps the header visible', () => {
    const workbook = workbookWithCells({ A1: '状态', A2: '进行中', A3: '完成', A4: '进行中' });
    setSpreadsheetColumnFilter(workbook.sheets[0], 0, '进行中');
    expect(getSpreadsheetVisibleRows(workbook, 'sheet_1').slice(0, 4)).toEqual([0, 1, 3]);
  });

  test('shifts cells, formulas and merge ranges when rows or columns change', () => {
    const workbook = workbookWithCells({ A1: '1', A2: '=A1', B2: '=A2' });
    const sheet = workbook.sheets[0];
    sheet.mergedCells = [{ startRow: 1, endRow: 1, startColumn: 0, endColumn: 1 }];
    shiftSpreadsheetRows(sheet, 0, 1);
    expect(sheet.cells.A2.v).toBe('1');
    expect(sheet.cells.A3.v).toBe('=A2');
    shiftSpreadsheetColumns(sheet, 0, 1);
    expect(sheet.cells.B2.v).toBe('1');
    expect(sheet.cells.B3.v).toBe('=B2');
  });

  test('shifts local cells and remaps formula references for insert and delete cell operations', () => {
    const workbook = workbookWithCells({ A1: '1', B1: '2', C1: '=A1+B1' });
    const sheet = workbook.sheets[0];
    shiftSpreadsheetCells(sheet, { rowIndex: 0, columnIndex: 1 }, 'insert-right', workbook);
    expect(sheet.cells.C1.v).toBe('2');
    expect(sheet.cells.D1.v).toBe('=A1+C1');

    shiftSpreadsheetCells(sheet, { rowIndex: 0, columnIndex: 1 }, 'delete-left', workbook);
    expect(sheet.cells.B1.v).toBe('2');
    expect(sheet.cells.C1.v).toBe('=A1+B1');
  });

  test('shifts structural references without rewriting strings or numbered sheet names', () => {
    const workbook = createDefaultSpreadsheetWorkbook();
    const source = workbook.sheets[0];
    source.name = 'Sheet1';
    source.cells = {
      A1: { v: '1' },
      B1: { v: '=Sheet1!$A$1&"A1"' },
    };
    const other = {
      ...createDefaultSpreadsheetSheet(1),
      id: 'other',
      name: 'Other',
      cells: {
        A1: { v: '=SUM(Sheet1!A1:A2)+Sheet10!A1' },
        A2: { v: '=TRUE!A1' },
      },
    };
    const truthSheet = { ...createDefaultSpreadsheetSheet(2), id: 'truth', name: 'TRUE', cells: { A1: { v: '2' } } };
    const similarSheet = { ...createDefaultSpreadsheetSheet(3), id: 'similar', name: 'Sheet10', cells: { A1: { v: '3' } } };
    workbook.sheets.push(other, truthSheet, similarSheet);

    shiftSpreadsheetRows(source, 0, 1, workbook);
    expect(source.cells.B2.v).toBe('=Sheet1!$A$2&"A1"');
    expect(other.cells.A1.v).toBe('=SUM(Sheet1!A2:A3)+Sheet10!A1');
    expect(createSpreadsheetFormulaEvaluator(workbook).getValue('other', 1, 0)).toBe('2');

    shiftSpreadsheetColumns(source, 0, 1, workbook);
    expect(source.cells.C2.v).toBe('=Sheet1!$B$2&"A1"');
    expect(other.cells.A1.v).toBe('=SUM(Sheet1!B2:B3)+Sheet10!A1');
  });
});
