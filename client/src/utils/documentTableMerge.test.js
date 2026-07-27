import {
  expandDocumentTableSelectionBounds,
  resolveDocumentTableMergePlan,
} from './documentTableMerge';

describe('ordinary document table merge selection', () => {
  test('recursively expands a drag selection to complete intersecting merged cells', () => {
    expect(expandDocumentTableSelectionBounds(
      {
        startRowIndex: 2,
        endRowIndex: 2,
        startColumnIndex: 1,
        endColumnIndex: 2,
      },
      [
        { rowIndex: 2, columnIndex: 2, rowSpan: 2, colSpan: 1 },
        { rowIndex: 3, columnIndex: 2, rowSpan: 1, colSpan: 2 },
      ],
      { rowCount: 6, columnCount: 6 },
    )).toEqual({
      startRowIndex: 2,
      endRowIndex: 3,
      startColumnIndex: 1,
      endColumnIndex: 3,
    });
  });

  test('allows contained existing merges and removes them from the replacement plan', () => {
    const outsideMerge = { rowIndex: 0, columnIndex: 0, rowSpan: 1, colSpan: 2 };
    const containedMerge = { rowIndex: 2, columnIndex: 2, rowSpan: 1, colSpan: 2 };
    expect(resolveDocumentTableMergePlan(
      [outsideMerge, containedMerge],
      {
        startRowIndex: 2,
        endRowIndex: 2,
        startColumnIndex: 1,
        endColumnIndex: 4,
      },
    )).toEqual({
      canMerge: true,
      retainedMergedCells: [outsideMerge],
    });
  });

  test('rejects a selection that still cuts through an existing merge', () => {
    const mergedCells = [{ rowIndex: 2, columnIndex: 2, rowSpan: 2, colSpan: 2 }];
    expect(resolveDocumentTableMergePlan(
      mergedCells,
      {
        startRowIndex: 2,
        endRowIndex: 2,
        startColumnIndex: 1,
        endColumnIndex: 3,
      },
    )).toEqual({
      canMerge: false,
      retainedMergedCells: mergedCells,
    });
  });

  test('keeps a one-cell selection unavailable for merge', () => {
    expect(resolveDocumentTableMergePlan([], {
      startRowIndex: 1,
      endRowIndex: 1,
      startColumnIndex: 1,
      endColumnIndex: 1,
    })).toEqual({ canMerge: false, retainedMergedCells: [] });
  });
});
