function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeSelectionBounds(bounds, rowCount, columnCount) {
  if (!bounds || rowCount <= 0 || columnCount <= 0) return null;
  const firstRowIndex = clampInteger(bounds.startRowIndex, 0, rowCount - 1);
  const lastRowIndex = clampInteger(bounds.endRowIndex, 0, rowCount - 1);
  const firstColumnIndex = clampInteger(bounds.startColumnIndex, 0, columnCount - 1);
  const lastColumnIndex = clampInteger(bounds.endColumnIndex, 0, columnCount - 1);
  return {
    startRowIndex: Math.min(firstRowIndex, lastRowIndex),
    endRowIndex: Math.max(firstRowIndex, lastRowIndex),
    startColumnIndex: Math.min(firstColumnIndex, lastColumnIndex),
    endColumnIndex: Math.max(firstColumnIndex, lastColumnIndex),
  };
}

function getMergedCellBounds(merge) {
  const rowIndex = Number(merge?.rowIndex);
  const columnIndex = Number(merge?.columnIndex);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
  const rowSpan = Math.max(1, Math.round(Number(merge?.rowSpan) || 1));
  const colSpan = Math.max(1, Math.round(Number(merge?.colSpan) || 1));
  return {
    startRowIndex: rowIndex,
    endRowIndex: rowIndex + rowSpan - 1,
    startColumnIndex: columnIndex,
    endColumnIndex: columnIndex + colSpan - 1,
  };
}

function boundsIntersect(left, right) {
  return left.startRowIndex <= right.endRowIndex
    && left.endRowIndex >= right.startRowIndex
    && left.startColumnIndex <= right.endColumnIndex
    && left.endColumnIndex >= right.startColumnIndex;
}

function boundsContain(outer, inner) {
  return outer.startRowIndex <= inner.startRowIndex
    && outer.endRowIndex >= inner.endRowIndex
    && outer.startColumnIndex <= inner.startColumnIndex
    && outer.endColumnIndex >= inner.endColumnIndex;
}

export function expandDocumentTableSelectionBounds(
  selectedRangeBounds,
  mergedCells,
  { rowCount = 0, columnCount = 0 } = {},
) {
  const expandedBounds = normalizeSelectionBounds(selectedRangeBounds, rowCount, columnCount);
  if (!expandedBounds || !Array.isArray(mergedCells) || !mergedCells.length) return expandedBounds;
  let changed = true;

  while (changed) {
    changed = false;
    mergedCells.forEach(merge => {
      const mergeBounds = getMergedCellBounds(merge);
      if (!mergeBounds || !boundsIntersect(expandedBounds, mergeBounds) || boundsContain(expandedBounds, mergeBounds)) return;
      const nextBounds = normalizeSelectionBounds({
        startRowIndex: Math.min(expandedBounds.startRowIndex, mergeBounds.startRowIndex),
        endRowIndex: Math.max(expandedBounds.endRowIndex, mergeBounds.endRowIndex),
        startColumnIndex: Math.min(expandedBounds.startColumnIndex, mergeBounds.startColumnIndex),
        endColumnIndex: Math.max(expandedBounds.endColumnIndex, mergeBounds.endColumnIndex),
      }, rowCount, columnCount);
      if (!nextBounds) return;
      const boundsChanged = nextBounds.startRowIndex !== expandedBounds.startRowIndex
        || nextBounds.endRowIndex !== expandedBounds.endRowIndex
        || nextBounds.startColumnIndex !== expandedBounds.startColumnIndex
        || nextBounds.endColumnIndex !== expandedBounds.endColumnIndex;
      if (!boundsChanged) return;
      Object.assign(expandedBounds, nextBounds);
      changed = true;
    });
  }
  return expandedBounds;
}

export function resolveDocumentTableMergePlan(mergedCells, selectedRangeBounds) {
  if (!selectedRangeBounds) return { canMerge: false, retainedMergedCells: [...(mergedCells || [])] };
  const selectedCellCount = (
    (selectedRangeBounds.endRowIndex - selectedRangeBounds.startRowIndex + 1)
    * (selectedRangeBounds.endColumnIndex - selectedRangeBounds.startColumnIndex + 1)
  );
  if (selectedCellCount <= 1) {
    return { canMerge: false, retainedMergedCells: [...(mergedCells || [])] };
  }

  const retainedMergedCells = [];
  for (const merge of mergedCells || []) {
    const mergeBounds = getMergedCellBounds(merge);
    if (!mergeBounds || !boundsIntersect(selectedRangeBounds, mergeBounds)) {
      retainedMergedCells.push(merge);
      continue;
    }
    if (boundsContain(selectedRangeBounds, mergeBounds)) continue;
    return { canMerge: false, retainedMergedCells: [...(mergedCells || [])] };
  }
  return { canMerge: true, retainedMergedCells };
}
