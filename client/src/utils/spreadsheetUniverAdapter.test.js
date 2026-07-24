import { createDefaultSpreadsheetWorkbook } from './spreadsheetWorkbook';
import {
  relationWorkbookToUniverSnapshot,
  univerSnapshotToRelationWorkbook,
} from './spreadsheetUniverAdapter';

test('converts relation workbook cells, formulas, freeze and sizes to a Univer snapshot', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0] = {
    ...workbook.sheets[0],
    rowCount: 120,
    columnCount: 18,
    cells: {
      A1: { v: '姓名' },
      B2: { v: 12 },
      C3: { v: '=SUM(B2:B3)' },
    },
    rowHeights: { 1: 36 },
    columnWidths: { 2: 140 },
    mergedCells: [{ startRow: 4, endRow: 4, startColumn: 1, endColumn: 3 }],
    frozen: { rows: 1, columns: 2 },
  };

  const snapshot = relationWorkbookToUniverSnapshot(workbook);
  const sheet = snapshot.sheets.sheet_1;

  expect(snapshot.sheetOrder).toEqual(['sheet_1']);
  expect(sheet.cellData[0][0].v).toBe('姓名');
  expect(sheet.cellData[1][1].v).toBe(12);
  expect(sheet.cellData[2][2].f).toBe('=SUM(B2:B3)');
  expect(sheet.freeze).toMatchObject({ ySplit: 1, xSplit: 2 });
  expect(sheet.rowData[1].h).toBe(36);
  expect(sheet.columnData[2].w).toBe(140);
  expect(sheet.mergeData[0]).toMatchObject({ startRow: 4, endColumn: 3 });
});

test('converts a Univer snapshot back to the existing relation workbook format', () => {
  const snapshot = relationWorkbookToUniverSnapshot(createDefaultSpreadsheetWorkbook());
  snapshot.sheets.sheet_1.cellData = {
    0: { 0: { v: '项目' }, 1: { v: '预算' } },
    1: { 0: { v: 'A' }, 1: { f: '=SUM(B3:B4)' } },
  };
  snapshot.sheets.sheet_1.freeze = { ySplit: 2, xSplit: 1, startRow: 2, startColumn: 1 };

  const workbook = univerSnapshotToRelationWorkbook(snapshot);

  expect(workbook.format).toBe('relation_spreadsheet_workbook_v1');
  expect(workbook.sheets[0].cells.A1).toEqual({ v: '项目' });
  expect(workbook.sheets[0].cells.B2).toEqual({ v: '=SUM(B3:B4)' });
  expect(workbook.sheets[0].frozen).toEqual({ rows: 2, columns: 1 });
});
