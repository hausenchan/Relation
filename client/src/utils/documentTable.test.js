import {
  deleteDocumentTableColumnWidths,
  deleteDocumentTableRowWidths,
  getDocumentTableHorizontalAutoScrollDelta,
  getDocumentTableRowColumnWidths,
  insertDocumentTableColumnWidths,
  insertDocumentTableRowWidths,
  normalizeDocumentTableRowColumnWidths,
  resizeDocumentTableScopedColumnWidths,
  resolveDocumentTableContextMenuPosition,
  resolveDocumentTableStyleBounds,
  shouldShowDocumentTableContextMenu,
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

  test('shows the cell operation menu only after an explicit context-menu request', () => {
    const activeStyleBounds = {
      startRowIndex: 1,
      endRowIndex: 1,
      startColumnIndex: 2,
      endColumnIndex: 2,
    };
    expect(shouldShowDocumentTableContextMenu({
      activeStyleBounds,
      blockId: 'table-a',
      openMenuBlockId: null,
    })).toBe(false);
    expect(shouldShowDocumentTableContextMenu({
      activeStyleBounds,
      blockId: 'table-a',
      openMenuBlockId: 'table-a',
    })).toBe(true);
    expect(shouldShowDocumentTableContextMenu({
      activeStyleBounds,
      blockId: 'table-a',
      openMenuBlockId: 'table-b',
    })).toBe(false);
    expect(shouldShowDocumentTableContextMenu({
      activeStyleBounds: null,
      blockId: 'table-a',
      openMenuBlockId: 'table-a',
    })).toBe(false);
  });

  test('keeps the context menu inside a 13-inch viewport near right and bottom edges', () => {
    const position = resolveDocumentTableContextMenuPosition({
      anchorX: 1210,
      anchorY: 735,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(position).toEqual({
      left: 902,
      top: 87,
      width: 300,
      maxHeight: 640,
    });
    expect(position.left + position.width).toBeLessThanOrEqual(1268);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(788);
  });

  test('shrinks and clamps the context menu on a narrow viewport', () => {
    const position = resolveDocumentTableContextMenuPosition({
      anchorX: 310,
      anchorY: 540,
      viewportWidth: 320,
      viewportHeight: 568,
    });
    expect(position).toEqual({
      left: 12,
      top: 72,
      width: 296,
      maxHeight: 484,
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
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)).toEqual([120, 140, 185, 155]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 3)).toEqual([120, 140, 185, 155]);
    expect(result.columnWidths.reduce((sum, width) => sum + width, 0)).toBe(
      getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)
        .reduce((sum, width) => sum + width, 0),
    );

    const clamped = resizeDocumentTableScopedColumnWidths([120, 90], {}, {
      rowIndex: 1,
      rowCount: 2,
      columnIndex: 1,
      delta: -100,
    });
    expect(getDocumentTableRowColumnWidths(clamped.columnWidths, clamped.rowColumnWidths, 0)).toEqual([120, 90]);
    expect(getDocumentTableRowColumnWidths(clamped.columnWidths, clamped.rowColumnWidths, 1)).toEqual([130, 80]);
  });

  test('keeps the outer edge aligned when resizing a merged cell at the end of a row', () => {
    const result = resizeDocumentTableScopedColumnWidths([130, 160, 160, 160], {}, {
      rowIndex: 2,
      rowCount: 4,
      columnIndex: 1,
      colSpan: 3,
      delta: 80,
    });
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 0)).toEqual([130, 160, 160, 160]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)).toEqual([80, 160, 160, 210]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 3)).toEqual([80, 160, 160, 210]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)
      .reduce((sum, width) => sum + width, 0)).toBe(610);
  });

  test('preserves total width and minimum widths across every resize boundary', () => {
    const baseWidths = [120, 140, 160, 180];
    const baseTotal = baseWidths.reduce((sum, width) => sum + width, 0);
    [
      { columnIndex: 0, colSpan: 1, delta: 30 },
      { columnIndex: 1, colSpan: 1, delta: -90 },
      { columnIndex: 3, colSpan: 1, delta: 50 },
      { columnIndex: 0, colSpan: 4, delta: 50 },
    ].forEach(resizeOptions => {
      const result = resizeDocumentTableScopedColumnWidths(baseWidths, {}, {
        rowIndex: 1,
        rowCount: 2,
        ...resizeOptions,
      });
      const resizedWidths = getDocumentTableRowColumnWidths(
        result.columnWidths,
        result.rowColumnWidths,
        1,
      );
      expect(resizedWidths.reduce((sum, width) => sum + width, 0)).toBe(baseTotal);
      expect(resizedWidths.every(width => width >= 80)).toBe(true);
    });
  });

  test('repairs row widths saved by the previous unbalanced implementation', () => {
    const repaired = normalizeDocumentTableRowColumnWidths(
      { 2: [130, 160, 160, 240], 3: [130, 160, 160, 240] },
      4,
      4,
      [130, 160, 160, 160],
    );
    expect(repaired).toEqual({
      2: [80, 130, 160, 240],
      3: [80, 130, 160, 240],
    });
    expect(getDocumentTableRowColumnWidths([130, 160, 160, 160], repaired, 2)
      .reduce((sum, width) => sum + width, 0)).toBe(610);
  });

  test('resizing the first row updates the base while retaining lower-row differences', () => {
    const result = resizeDocumentTableScopedColumnWidths(
      [120, 140, 160],
      { 2: [120, 180, 160], 3: [120, 180, 160] },
      { rowIndex: 0, rowCount: 4, columnIndex: 1, delta: 20 },
    );
    expect(result.columnWidths).toEqual([120, 160, 140]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 0)).toEqual([120, 160, 140]);
    expect(getDocumentTableRowColumnWidths(result.columnWidths, result.rowColumnWidths, 2)).toEqual([120, 200, 100]);
  });

  test('keeps scoped widths aligned while inserting and deleting rows and columns', () => {
    const baseWidths = [120, 140, 160];
    const scopedWidths = { 2: [120, 180, 120], 3: [120, 180, 120] };
    const insertedRows = insertDocumentTableRowWidths(baseWidths, scopedWidths, {
      insertIndex: 2,
      sourceRowIndex: 2,
      rowCount: 4,
    });
    expect(getDocumentTableRowColumnWidths(baseWidths, insertedRows, 2)).toEqual([120, 180, 120]);
    expect(getDocumentTableRowColumnWidths(baseWidths, insertedRows, 4)).toEqual([120, 180, 120]);
    const deletedRows = deleteDocumentTableRowWidths(baseWidths, insertedRows, {
      startRowIndex: 1,
      endRowIndex: 2,
      rowCount: 5,
    });
    expect(getDocumentTableRowColumnWidths(baseWidths, deletedRows, 1)).toEqual([120, 180, 120]);

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
    )).toEqual([120, 140, 180, 120]);
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
    )).toEqual([120, 180, 120]);
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
