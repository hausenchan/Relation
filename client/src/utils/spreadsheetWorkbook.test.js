import {
  applySpreadsheetFormatPattern,
  buildSpreadsheetCellKey,
  createSpreadsheetFormatPattern,
  createDefaultSpreadsheetWorkbook,
  createDefaultSpreadsheetSheet,
  createSpreadsheetFormulaEvaluator,
  getDocumentContentSignature,
  getSpreadsheetVisibleRows,
  getNextSpreadsheetSheetName,
  mergeSpreadsheetWorkbookSnapshots,
  mergeSpreadsheetCells,
  normalizeSpreadsheetWorkbook,
  parseSpreadsheetCellKey,
  renameSpreadsheetSheet,
  setSpreadsheetCellValue,
  setSpreadsheetColumnFilter,
  shiftSpreadsheetColumns,
  shiftSpreadsheetRows,
  sortSpreadsheetRange,
  spreadsheetClipboardMatrixHasMultipleCells,
  spreadsheetColumnIndex,
  spreadsheetColumnLabel,
  unmergeSpreadsheetCells,
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

  test('normalizes legacy or invalid content into a workbook', () => {
    const workbook = normalizeSpreadsheetWorkbook('{"blocks":[]}');
    expect(workbook.format).toBe('relation_spreadsheet_workbook_v1');
    expect(workbook.sheets[0].name).toBe('工作表1');
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
