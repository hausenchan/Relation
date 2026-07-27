import {
  getDocumentTableHorizontalAutoScrollDelta,
  resizeDocumentTableColumnWidths,
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

  test('resizes the underlying rightmost column for normal and merged cells', () => {
    expect(resizeDocumentTableColumnWidths([120, 140, 160], {
      columnIndex: 1,
      delta: 30,
    })).toEqual([120, 170, 160]);
    expect(resizeDocumentTableColumnWidths([120, 140, 160, 180], {
      columnIndex: 1,
      colSpan: 2,
      delta: 25,
    })).toEqual([120, 140, 185, 180]);
    expect(resizeDocumentTableColumnWidths([120, 90], {
      columnIndex: 1,
      delta: -100,
    })).toEqual([120, 80]);
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
