import {
  deleteDocumentTableColumnWidths,
  deleteDocumentTableRowWidths,
  getDocumentTableHorizontalAutoScrollDelta,
  getDocumentTableRowColumnWidths,
  insertDocumentTableColumnWidths,
  insertDocumentTableRowWidths,
  resizeDocumentTableScopedColumnWidths,
  resolveDocumentTableStyleBounds,
} from './documentTable';

describe('ordinary document table interactions', () => {
  test('uses one selected body cell as a color styling range', () => {
    expect(resolveDocumentTableStyleBounds({
      selectedCell: { type: 'body', rowIndex: 2, columnIndex: 5 },
      rowCount: 4,
      columnCount: 8,
    })).toEqual({
      startRowIndex: 2,
      endRowIndex: 2,
      startColumnIndex: 5,
      endColumnIndex: 5,
    });
    expect(resolveDocumentTableStyleBounds({
      selectedCell: { type: 'database', rowIndex: 0, columnIndex: 0 },
      rowCount: 4,
      columnCount: 8,
    })).toBeNull();
  });

  test('keeps whole-table and multi-cell styling ranges intact', () => {
    expect(resolveDocumentTableStyleBounds({
      selectedRangeBounds: {
        startRowIndex: 3,
        endRowIndex: 1,
        startColumnIndex: 7,
        endColumnIndex: 4,
      },
      hasSelectedRange: true,
      rowCount: 4,
      columnCount: 8,
    })).toEqual({
      startRowIndex: 1,
      endRowIndex: 3,
      startColumnIndex: 4,
      endColumnIndex: 7,
    });
    expect(resolveDocumentTableStyleBounds({
      wholeTableSelected: true,
      rowCount: 4,
      columnCount: 8,
    })).toEqual({
      startRowIndex: 0,
      endRowIndex: 3,
      startColumnIndex: 0,
      endColumnIndex: 7,
    });
  });

  test('resizes from the selected row downward without moving rows above it', () => {
    const result = resizeDocumentTableScopedColumnWidths([120, 140, 160, 180], {}, {
      rowIndex: 2,
      rowCount: 4,
      columnIndex: 1,
      colSpan: 2,
      delta: 25,
    });
    expect(result.columnWidths).toEqual([120, 140, 160, 180]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 0)).toEqual([120, 140, 160, 180]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 1)).toEqual([120, 140, 160, 180]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)).toEqual([120, 140, 185, 180]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 3)).toEqual([120, 140, 185, 180]);

    const clamped = resizeDocumentTableScopedColumnWidths([120, 90], {}, {
      rowIndex: 1,
      rowCount: 2,
      columnIndex: 1,
      delta: -100,
    });
    expect(getDocumentTableRowColumnWidths(clamped.columnWidths, clamped.rowColumnWidths, 0)).toEqual([120, 90]);
    expect(getDocumentTableRowColumnWidths(clamped.columnWidths, clamped.rowColumnWidths, 1)).toEqual([120, 80]);
  });

  test('resizing the first row updates the base while retaining lower-row differences', () => {
    const result = resizeDocumentTableScopedColumnWidths(
      [120, 140, 160],
      { 2: [120, 180, 160], 3: [120, 180, 160] },
      { rowIndex: 0, rowCount: 4, columnIndex: 1, delta: 20 },
    );
    expect(result.columnWidths).toEqual([120, 160, 160]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 0)).toEqual([120, 160, 160]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)).toEqual([120, 200, 160]);
  });

  test('keeps scoped widths aligned while inserting and deleting rows and columns', () => {
    const baseWidths = [120, 140, 160];
    const scopedWidths = { 2: [120, 180, 160], 3: [120, 180, 160] };
    const insertedRows = insertDocumentTableRowWidths(baseWidths, scopedWidths, {
      insertIndex: 2,
      sourceRowIndex: 2,
      rowCount: 4,
    });
    expect(getDocumentTableRowColumnWidths(baseWidths, insertedRows, 2)).toEqual([120, 180, 160]);
    expect(getDocumentTableRowColumnWidths(baseWidths, insertedRows, 4)).toEqual([120, 180, 160]);
    const deletedRows = deleteDocumentTableRowWidths(baseWidths, insertedRows, {
      startRowIndex: 1,
      endRowIndex: 2,
      rowCount: 5,
    });
    expect(getDocumentTableRowColumnWidths(baseWidths, deletedRows, 1)).toEqual([120, 180, 160]);

    const insertedColumns = insertDocumentTableColumnWidths(baseWidths, scopedWidths, {
      insertIndex: 1,
      sourceColumnIndex: 1,
      rowCount: 4,
    });
    expect(insertedColumns.columnWidths).toEqual([120, 140, 140, 160]);
    expect(getDocumentTableRowColumnWidths(
      insertedColumns.columnWidths,
      insertedColumns.rowColumnWidths,
      2,
    )).toEqual([120, 180, 180, 160]);
    const deletedColumns = deleteDocumentTableColumnWidths(
      insertedColumns.columnWidths,
      insertedColumns.rowColumnWidths,
      { startColumnIndex: 1, endColumnIndex: 1, rowCount: 4 },
    );
    expect(deletedColumns.columnWidths).toEqual(baseWidths);
    expect(getDocumentTableRowColumnWidths(
      deletedColumns.columnWidths,
      deletedColumns.rowColumnWidths,
      2,
    )).toEqual([120, 180, 160]);
  });

  test('scrolls continuously toward either horizontal edge while drag-selecting', () => {
    expect(getDocumentTableHorizontalAutoScrollDelta({
      pointerX: 492,
      viewportLeft: 100,
      viewportRight: 500,
      scrollLeft: 120,
      scrollWidth: 1200,
      clientWidth: 400,
    })).toBeGreaterThan(0);
    expect(getDocumentTableHorizontalAutoScrollDelta({
      pointerX: 105,
      viewportLeft: 100,
      viewportRight: 500,
      scrollLeft: 120,
      scrollWidth: 1200,
      clientWidth: 400,
    })).toBeLessThan(0);
    expect(getDocumentTableHorizontalAutoScrollDelta({
      pointerX: 300,
      viewportLeft: 100,
      viewportRight: 500,
      scrollLeft: 120,
      scrollWidth: 1200,
      clientWidth: 400,
    })).toBe(0);
  });
});
