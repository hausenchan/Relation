function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeColumnWidths(columnWidths, columnCount, minWidth = 80) {
  return Array.from({ length: Math.max(0, columnCount) }, (_, columnIndex) => (
    Math.max(minWidth, Number(columnWidths?.[columnIndex]) || minWidth)
  ));
}

function columnWidthsEqual(left, right) {
  return left.length === right.length && left.every((width, index) => width === right[index]);
}

function getColumnWidthsTotal(columnWidths) {
  return columnWidths.reduce((total, width) => total + width, 0);
}

// Reclaim total-width drift from unchanged columns first so older scoped widths keep their intended resize.
function getDocumentTableWidthCompensationOrder(columnWidths, baseWidths) {
  const lastColumnIndex = columnWidths.length - 1;
  const changedColumnIndices = columnWidths
    .map((width, columnIndex) => ({
      columnIndex,
      difference: Math.abs(width - baseWidths[columnIndex]),
    }))
    .filter(item => item.difference > 0.001);
  const primaryColumnIndex = changedColumnIndices.reduce((primary, item) => (
    item.difference > primary.difference ? item : primary
  ), { columnIndex: lastColumnIndex, difference: -1 }).columnIndex;
  const changedColumns = new Set(changedColumnIndices.map(item => item.columnIndex));
  const surroundingColumns = primaryColumnIndex === lastColumnIndex
    ? Array.from({ length: primaryColumnIndex }, (_, columnIndex) => columnIndex)
    : [
      ...Array.from(
        { length: lastColumnIndex - primaryColumnIndex },
        (_, offset) => primaryColumnIndex + offset + 1,
      ),
      ...Array.from({ length: primaryColumnIndex }, (_, offset) => primaryColumnIndex - offset - 1),
    ];
  return [
    ...surroundingColumns.filter(columnIndex => !changedColumns.has(columnIndex)),
    ...surroundingColumns.filter(columnIndex => changedColumns.has(columnIndex)),
    primaryColumnIndex,
  ];
}

function balanceDocumentTableColumnWidths(columnWidths, baseWidths, minWidth = 80) {
  const balancedWidths = normalizeColumnWidths(columnWidths, baseWidths.length, minWidth);
  if (!balancedWidths.length) return balancedWidths;
  let remainingDifference = getColumnWidthsTotal(balancedWidths) - getColumnWidthsTotal(baseWidths);
  if (Math.abs(remainingDifference) <= 0.001) return balancedWidths;
  const compensationOrder = getDocumentTableWidthCompensationOrder(balancedWidths, baseWidths);

  if (remainingDifference > 0) {
    compensationOrder.forEach(columnIndex => {
      if (remainingDifference <= 0.001) return;
      const reduction = Math.min(remainingDifference, balancedWidths[columnIndex] - minWidth);
      balancedWidths[columnIndex] -= reduction;
      remainingDifference -= reduction;
    });
  } else {
    balancedWidths[compensationOrder[0]] += Math.abs(remainingDifference);
  }
  return balancedWidths;
}

function resizeDocumentTableColumnWidthsWithinRow(columnWidths, {
  columnIndex,
  colSpan = 1,
  delta = 0,
  minWidth = 80,
} = {}) {
  const widths = normalizeColumnWidths(columnWidths, columnWidths?.length || 0, minWidth);
  if (widths.length < 2 || !Number.isInteger(Number(columnIndex))) return widths;
  const startColumnIndex = clampInteger(columnIndex, 0, widths.length - 1);
  const safeColSpan = Math.max(1, Math.round(Number(colSpan) || 1));
  const resizeColumnIndex = Math.min(widths.length - 1, startColumnIndex + safeColSpan - 1);
  const compensationColumnIndex = resizeColumnIndex < widths.length - 1
    ? resizeColumnIndex + 1
    : startColumnIndex - 1;
  const widthDelta = Number(delta);
  if (compensationColumnIndex < 0 || !Number.isFinite(widthDelta)) return widths;
  const appliedDelta = Math.max(
    minWidth - widths[resizeColumnIndex],
    Math.min(widths[compensationColumnIndex] - minWidth, Math.round(widthDelta)),
  );
  widths[resizeColumnIndex] += appliedDelta;
  widths[compensationColumnIndex] -= appliedDelta;
  return widths;
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

export function shouldShowDocumentTableContextMenu({
  activeStyleBounds = null,
  blockId = null,
  openMenuBlockId = null,
} = {}) {
  return Boolean(activeStyleBounds)
    && openMenuBlockId !== null
    && openMenuBlockId !== undefined
    && openMenuBlockId === blockId;
}

export function resolveDocumentTableContextMenuPosition({
  anchorRect = null,
  anchorX = 0,
  anchorY = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  menuWidth = 280,
  menuHeight = 640,
  minimumMenuHeight = 320,
  viewportTop = 72,
  viewportMargin = 12,
  anchorOffset = 8,
} = {}) {
  const safeViewportWidth = Math.max(1, Math.round(Number(viewportWidth) || 0));
  const safeViewportHeight = Math.max(1, Math.round(Number(viewportHeight) || 0));
  const safeMargin = Math.max(0, Math.round(Number(viewportMargin) || 0));
  const safeTop = Math.max(safeMargin, Math.min(
    Math.round(Number(viewportTop) || safeMargin),
    Math.max(safeMargin, safeViewportHeight - safeMargin - 1),
  ));
  const safeOffset = Math.max(0, Math.round(Number(anchorOffset) || 0));
  const availableWidth = Math.max(1, safeViewportWidth - (safeMargin * 2));
  const availableHeight = Math.max(1, safeViewportHeight - safeTop - safeMargin);
  const width = Math.min(Math.max(1, Math.round(Number(menuWidth) || 280)), availableWidth);
  const preferredHeight = Math.min(Math.max(1, Math.round(Number(menuHeight) || 640)), availableHeight);
  const minimumHeight = Math.min(
    preferredHeight,
    Math.max(1, Math.round(Number(minimumMenuHeight) || 320)),
  );
  const fallbackX = Math.max(0, Math.min(safeViewportWidth, Number(anchorX) || 0));
  const fallbackY = Math.max(0, Math.min(safeViewportHeight, Number(anchorY) || 0));
  const rawLeft = Number(anchorRect?.left);
  const rawRight = Number(anchorRect?.right);
  const rawTop = Number(anchorRect?.top);
  const rawBottom = Number(anchorRect?.bottom);
  const normalizedLeft = Number.isFinite(rawLeft) ? rawLeft : fallbackX;
  const normalizedRight = Number.isFinite(rawRight) ? rawRight : normalizedLeft;
  const normalizedTop = Number.isFinite(rawTop) ? rawTop : fallbackY;
  const normalizedBottom = Number.isFinite(rawBottom) ? rawBottom : normalizedTop;
  const anchorLeft = Math.max(0, Math.min(safeViewportWidth, Math.min(normalizedLeft, normalizedRight)));
  const anchorRight = Math.max(0, Math.min(safeViewportWidth, Math.max(normalizedLeft, normalizedRight)));
  const anchorTop = Math.max(safeTop, Math.min(
    safeViewportHeight - safeMargin,
    Math.min(normalizedTop, normalizedBottom),
  ));
  const maxLeft = Math.max(safeMargin, safeViewportWidth - safeMargin - width);
  const viewportRight = safeViewportWidth - safeMargin;
  const viewportBottom = safeViewportHeight - safeMargin;
  const rightCandidate = anchorRight + safeOffset;
  const leftCandidate = anchorLeft - width - safeOffset;
  const fitsRight = rightCandidate + width <= viewportRight;
  const fitsLeft = leftCandidate >= safeMargin;
  const spaceRight = Math.max(0, viewportRight - anchorRight - safeOffset);
  const spaceLeft = Math.max(0, anchorLeft - safeOffset - safeMargin);
  const preferredLeft = fitsRight || (!fitsLeft && spaceRight >= spaceLeft)
    ? rightCandidate
    : leftCandidate;
  const availableBelowAnchor = Math.max(0, viewportBottom - anchorTop);
  const maxHeight = Math.min(preferredHeight, Math.max(minimumHeight, availableBelowAnchor));
  const maxTop = Math.max(safeTop, viewportBottom - maxHeight);

  return {
    left: Math.round(Math.max(safeMargin, Math.min(preferredLeft, maxLeft))),
    top: Math.round(Math.max(safeTop, Math.min(anchorTop, maxTop))),
    width,
    maxHeight,
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

export function normalizeDocumentTableRowColumnWidths(
  rowColumnWidths,
  rowCount,
  columnCount,
  columnWidths,
  minWidth = 80,
) {
  if (!rowColumnWidths || typeof rowColumnWidths !== 'object' || rowCount <= 0 || columnCount <= 0) return {};
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  return Object.entries(rowColumnWidths).reduce((result, [rowKey, widths]) => {
    const rowIndex = Number(rowKey);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowCount || !Array.isArray(widths)) return result;
    const normalized = balanceDocumentTableColumnWidths(Array.from({ length: columnCount }, (_, columnIndex) => (
      Math.max(minWidth, Number(widths[columnIndex]) || baseWidths[columnIndex])
    )), baseWidths, minWidth);
    if (!columnWidthsEqual(normalized, baseWidths)) result[rowIndex] = normalized;
    return result;
  }, {});
}

export function getDocumentTableRowColumnWidths(columnWidths, rowColumnWidths, rowIndex, minWidth = 80) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  const scopedWidths = rowColumnWidths?.[Number(rowIndex)];
  if (!Array.isArray(scopedWidths)) return baseWidths;
  return balanceDocumentTableColumnWidths(Array.from({ length: columnCount }, (_, columnIndex) => (
    Math.max(minWidth, Number(scopedWidths[columnIndex]) || baseWidths[columnIndex])
  )), baseWidths, minWidth);
}

export function resizeDocumentTableScopedColumnWidths(columnWidths, rowColumnWidths, {
  rowIndex,
  rowCount,
  columnIndex,
  colSpan = 1,
  delta = 0,
  minWidth = 80,
} = {}) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  if (!rowCount || !columnCount) return { columnWidths: baseWidths, rowColumnWidths: {} };
  const scopedWidths = normalizeDocumentTableRowColumnWidths(
    rowColumnWidths,
    rowCount,
    columnCount,
    baseWidths,
    minWidth,
  );
  const startRowIndex = clampInteger(rowIndex, 0, rowCount - 1);
  const resizeOptions = { columnIndex, colSpan, delta, minWidth };
  const nextBaseWidths = startRowIndex === 0
    ? resizeDocumentTableColumnWidthsWithinRow(baseWidths, resizeOptions)
    : baseWidths;
  const nextScopedWidths = {};

  for (let currentRowIndex = 0; currentRowIndex < rowCount; currentRowIndex += 1) {
    const currentWidths = getDocumentTableRowColumnWidths(baseWidths, scopedWidths, currentRowIndex, minWidth);
    const nextWidths = currentRowIndex >= startRowIndex
      ? resizeDocumentTableColumnWidthsWithinRow(currentWidths, resizeOptions)
      : currentWidths;
    if (!columnWidthsEqual(nextWidths, nextBaseWidths)) nextScopedWidths[currentRowIndex] = nextWidths;
  }
  return {
    columnWidths: nextBaseWidths,
    rowColumnWidths: nextScopedWidths,
  };
}

function scaleDocumentTableWidthsToTotal(widths, targetWidth, minWidth = 80) {
  const normalized = normalizeColumnWidths(widths, widths?.length || 0, minWidth);
  if (!normalized.length) return normalized;
  const minimumTotal = normalized.length * minWidth;
  const nextTotal = Math.max(minimumTotal, Math.round(Number(targetWidth) || 0));
  const currentTotal = getColumnWidthsTotal(normalized);
  if (currentTotal <= 0) return normalized;
  const ratio = nextTotal / currentTotal;
  let scaled = normalized.map(width => Math.max(minWidth, Math.round(width * ratio)));
  let drift = nextTotal - getColumnWidthsTotal(scaled);

  while (drift !== 0) {
    const adjustableIndex = drift > 0
      ? scaled.length - 1
      : scaled.findIndex(width => width > minWidth);
    if (adjustableIndex < 0) break;
    const step = drift > 0 ? drift : -Math.min(Math.abs(drift), scaled[adjustableIndex] - minWidth);
    if (step === 0) break;
    scaled[adjustableIndex] += step;
    drift = nextTotal - getColumnWidthsTotal(scaled);
  }
  return scaled;
}

export function resizeDocumentTableOverallWidth(columnWidths, rowColumnWidths, {
  targetWidth,
  rowCount,
  minWidth = 80,
} = {}) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  if (!columnCount) return { columnWidths: [], rowColumnWidths: {} };
  const nextBaseWidths = scaleDocumentTableWidthsToTotal(baseWidths, targetWidth, minWidth);
  const scopedWidths = normalizeDocumentTableRowColumnWidths(
    rowColumnWidths,
    rowCount,
    columnCount,
    baseWidths,
    minWidth,
  );
  const nextScopedWidths = {};
  Object.entries(scopedWidths).forEach(([rowKey, widths]) => {
    const nextWidths = scaleDocumentTableWidthsToTotal(widths, targetWidth, minWidth);
    if (!columnWidthsEqual(nextWidths, nextBaseWidths)) nextScopedWidths[rowKey] = nextWidths;
  });
  return {
    columnWidths: nextBaseWidths,
    rowColumnWidths: normalizeDocumentTableRowColumnWidths(
      nextScopedWidths,
      rowCount,
      columnCount,
      nextBaseWidths,
      minWidth,
    ),
  };
}

export function insertDocumentTableRowWidths(columnWidths, rowColumnWidths, {
  insertIndex,
  sourceRowIndex = insertIndex,
  rowCount,
  minWidth = 80,
} = {}) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  if (!rowCount || !columnCount) return {};
  const safeInsertIndex = clampInteger(insertIndex, 0, rowCount);
  const scopedWidths = normalizeDocumentTableRowColumnWidths(
    rowColumnWidths,
    rowCount,
    columnCount,
    baseWidths,
    minWidth,
  );
  const inheritedRowIndex = clampInteger(sourceRowIndex, 0, rowCount - 1);
  const inheritedWidths = getDocumentTableRowColumnWidths(baseWidths, scopedWidths, inheritedRowIndex, minWidth);
  const nextScopedWidths = {};
  Object.entries(scopedWidths).forEach(([rowKey, widths]) => {
    const rowIndex = Number(rowKey);
    nextScopedWidths[rowIndex >= safeInsertIndex ? rowIndex + 1 : rowIndex] = widths;
  });
  if (!columnWidthsEqual(inheritedWidths, baseWidths)) nextScopedWidths[safeInsertIndex] = inheritedWidths;
  return normalizeDocumentTableRowColumnWidths(
    nextScopedWidths,
    rowCount + 1,
    columnCount,
    baseWidths,
    minWidth,
  );
}

export function deleteDocumentTableRowWidths(columnWidths, rowColumnWidths, {
  startRowIndex,
  endRowIndex,
  rowCount,
  minWidth = 80,
} = {}) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  if (!rowCount || !columnCount) return {};
  const start = clampInteger(startRowIndex, 0, rowCount - 1);
  const end = clampInteger(endRowIndex, start, rowCount - 1);
  const deleteCount = end - start + 1;
  const scopedWidths = normalizeDocumentTableRowColumnWidths(
    rowColumnWidths,
    rowCount,
    columnCount,
    baseWidths,
    minWidth,
  );
  const nextScopedWidths = {};
  Object.entries(scopedWidths).forEach(([rowKey, widths]) => {
    const rowIndex = Number(rowKey);
    if (rowIndex >= start && rowIndex <= end) return;
    nextScopedWidths[rowIndex > end ? rowIndex - deleteCount : rowIndex] = widths;
  });
  return normalizeDocumentTableRowColumnWidths(
    nextScopedWidths,
    rowCount - deleteCount,
    columnCount,
    baseWidths,
    minWidth,
  );
}

export function insertDocumentTableColumnWidths(columnWidths, rowColumnWidths, {
  insertIndex,
  sourceColumnIndex = insertIndex,
  rowCount,
  minWidth = 80,
} = {}) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  if (!columnCount) return { columnWidths: [], rowColumnWidths: {} };
  const safeInsertIndex = clampInteger(insertIndex, 0, columnCount);
  const safeSourceColumnIndex = clampInteger(sourceColumnIndex, 0, columnCount - 1);
  const nextBaseWidths = [...baseWidths];
  nextBaseWidths.splice(safeInsertIndex, 0, baseWidths[safeSourceColumnIndex]);
  const scopedWidths = normalizeDocumentTableRowColumnWidths(
    rowColumnWidths,
    rowCount,
    columnCount,
    baseWidths,
    minWidth,
  );
  const nextScopedWidths = {};
  Object.entries(scopedWidths).forEach(([rowKey, widths]) => {
    const nextWidths = [...widths];
    nextWidths.splice(safeInsertIndex, 0, baseWidths[safeSourceColumnIndex]);
    nextScopedWidths[rowKey] = nextWidths;
  });
  return {
    columnWidths: nextBaseWidths,
    rowColumnWidths: normalizeDocumentTableRowColumnWidths(
      nextScopedWidths,
      rowCount,
      columnCount + 1,
      nextBaseWidths,
      minWidth,
    ),
  };
}

export function deleteDocumentTableColumnWidths(columnWidths, rowColumnWidths, {
  startColumnIndex,
  endColumnIndex,
  rowCount,
  minWidth = 80,
} = {}) {
  const columnCount = Array.isArray(columnWidths) ? columnWidths.length : 0;
  const baseWidths = normalizeColumnWidths(columnWidths, columnCount, minWidth);
  if (!columnCount) return { columnWidths: [], rowColumnWidths: {} };
  const start = clampInteger(startColumnIndex, 0, columnCount - 1);
  const end = clampInteger(endColumnIndex, start, columnCount - 1);
  const nextBaseWidths = baseWidths.filter((_, columnIndex) => columnIndex < start || columnIndex > end);
  const scopedWidths = normalizeDocumentTableRowColumnWidths(
    rowColumnWidths,
    rowCount,
    columnCount,
    baseWidths,
    minWidth,
  );
  const nextScopedWidths = {};
  Object.entries(scopedWidths).forEach(([rowKey, widths]) => {
    nextScopedWidths[rowKey] = widths.filter((_, columnIndex) => columnIndex < start || columnIndex > end);
  });
  return {
    columnWidths: nextBaseWidths,
    rowColumnWidths: normalizeDocumentTableRowColumnWidths(
      nextScopedWidths,
      rowCount,
      nextBaseWidths.length,
      nextBaseWidths,
      minWidth,
    ),
  };
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
