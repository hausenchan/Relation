function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function resolveDocumentTableStyleBounds({
  wholeTableSelected = false,
  selectedRangeBounds = null,
  hasSelectedRange = false,
  selectedCell = null,
  rowCount = 0,
  columnCount = 0,
} = {}) {
  if (rowCount <= 0 || columnCount <= 0) return null;
  if (wholeTableSelected) {
    return {
      startRowIndex: 0,
      endRowIndex: rowCount - 1,
      startColumnIndex: 0,
      endColumnIndex: columnCount - 1,
    };
  }
  if (hasSelectedRange && selectedRangeBounds) {
    const firstRow = clampInteger(selectedRangeBounds.startRowIndex, 0, rowCount - 1);
    const lastRow = clampInteger(selectedRangeBounds.endRowIndex, 0, rowCount - 1);
    const firstColumn = clampInteger(selectedRangeBounds.startColumnIndex, 0, columnCount - 1);
    const lastColumn = clampInteger(selectedRangeBounds.endColumnIndex, 0, columnCount - 1);
    return {
      startRowIndex: Math.min(firstRow, lastRow),
      endRowIndex: Math.max(firstRow, lastRow),
      startColumnIndex: Math.min(firstColumn, lastColumn),
      endColumnIndex: Math.max(firstColumn, lastColumn),
    };
  }
  const rowIndex = Number(selectedCell?.rowIndex);
  const columnIndex = Number(selectedCell?.columnIndex);
  const isBodyCell = !selectedCell?.type || selectedCell.type === 'body';
  if (!isBodyCell || !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
  if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) return null;
  return {
    startRowIndex: rowIndex,
    endRowIndex: rowIndex,
    startColumnIndex: columnIndex,
    endColumnIndex: columnIndex,
  };
}

export function resizeDocumentTableColumnWidths(columnWidths, {
  columnIndex,
  colSpan = 1,
  delta = 0,
  minWidth = 80,
} = {}) {
  const widths = Array.isArray(columnWidths)
    ? columnWidths.map(width => Math.max(minWidth, Number(width) || minWidth))
    : [];
  if (!widths.length || !Number.isInteger(Number(columnIndex))) return widths;
  const startColumnIndex = clampInteger(columnIndex, 0, widths.length - 1);
  const safeColSpan = Math.max(1, Math.round(Number(colSpan) || 1));
  const resizeColumnIndex = Math.min(widths.length - 1, startColumnIndex + safeColSpan - 1);
  const widthDelta = Number(delta);
  if (!Number.isFinite(widthDelta)) return widths;
  widths[resizeColumnIndex] = Math.max(minWidth, Math.round(widths[resizeColumnIndex] + widthDelta));
  return widths;
}

export function getDocumentTableHorizontalAutoScrollDelta({
  pointerX,
  viewportLeft,
  viewportRight,
  scrollLeft = 0,
  scrollWidth = 0,
  clientWidth = 0,
  edgeThreshold = 48,
  maxStep = 24,
} = {}) {
  const maxScrollLeft = Math.max(0, Number(scrollWidth) - Number(clientWidth));
  const currentScrollLeft = Math.max(0, Math.min(maxScrollLeft, Number(scrollLeft) || 0));
  const threshold = Math.max(12, Number(edgeThreshold) || 48);
  const stepLimit = Math.max(1, Number(maxStep) || 24);
  const x = Number(pointerX);
  const left = Number(viewportLeft);
  const right = Number(viewportRight);
  if (![x, left, right].every(Number.isFinite) || right <= left || maxScrollLeft <= 0) return 0;

  if (x > right - threshold && currentScrollLeft < maxScrollLeft) {
    const ratio = Math.min(1, Math.max(0, (x - (right - threshold)) / threshold));
    return Math.min(maxScrollLeft - currentScrollLeft, Math.max(4, Math.ceil(stepLimit * ratio)));
  }
  if (x < left + threshold && currentScrollLeft > 0) {
    const ratio = Math.min(1, Math.max(0, ((left + threshold) - x) / threshold));
    return -Math.min(currentScrollLeft, Math.max(4, Math.ceil(stepLimit * ratio)));
  }
  return 0;
}
