import {
  buildSpreadsheetCellKey,
  getSpreadsheetCellObject,
  normalizeSpreadsheetRange,
  translateSpreadsheetFormulaForPaste,
} from './spreadsheetWorkbook';

export const RELATION_SPREADSHEET_CLIPBOARD_MIME = 'application/x-relation-spreadsheet+json';
export const RELATION_SPREADSHEET_CLIPBOARD_FORMAT = 'relation_spreadsheet_clipboard_v1';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function rangesOverlap(left, right) {
  return Boolean(left && right
    && left.startRow <= right.endRow
    && left.endRow >= right.startRow
    && left.startColumn <= right.endColumn
    && left.endColumn >= right.startColumn);
}

function intersectRanges(left, right) {
  if (!rangesOverlap(left, right)) return null;
  return {
    startRow: Math.max(left.startRow, right.startRow),
    endRow: Math.min(left.endRow, right.endRow),
    startColumn: Math.max(left.startColumn, right.startColumn),
    endColumn: Math.min(left.endColumn, right.endColumn),
  };
}

function toRelativeRange(range, sourceRange) {
  return {
    startRow: range.startRow - sourceRange.startRow,
    endRow: range.endRow - sourceRange.startRow,
    startColumn: range.startColumn - sourceRange.startColumn,
    endColumn: range.endColumn - sourceRange.startColumn,
  };
}

function clipboardRulesForRange(rules, sourceRange) {
  return (Array.isArray(rules) ? rules : []).flatMap(rule => {
    const range = intersectRanges(normalizeSpreadsheetRange(rule?.range), sourceRange);
    return range ? [{ ...clone(rule), range: toRelativeRange(range, sourceRange) }] : [];
  });
}

function normalizedCellMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const width = Math.max(1, ...matrix.map(row => Array.isArray(row) ? row.length : 1));
  return matrix.map(row => {
    const values = Array.isArray(row) ? row : [row];
    return Array.from({ length: width }, (_, index) => {
      const cell = values[index];
      if (cell === undefined || cell === null || cell === '') return null;
      if (cell && typeof cell === 'object' && !Array.isArray(cell)) return clone(cell);
      return { v: String(cell) };
    });
  });
}

export function buildSpreadsheetClipboardPayload(sheet, range, { includeDimensions = false } = {}) {
  const bounds = normalizeSpreadsheetRange(range);
  if (!sheet || !bounds) return null;
  const cells = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    const line = [];
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      const cell = getSpreadsheetCellObject(sheet, row, column);
      line.push(Object.keys(cell).length ? clone(cell) : null);
    }
    cells.push(line);
  }
  return {
    format: RELATION_SPREADSHEET_CLIPBOARD_FORMAT,
    sourceSheetId: String(sheet.id || ''),
    sourceSheetName: String(sheet.name || ''),
    sourceRange: bounds,
    rowCount: cells.length,
    columnCount: cells[0]?.length || 0,
    cells,
    mergedCells: (sheet.mergedCells || []).flatMap(range => {
      const normalized = normalizeSpreadsheetRange(range);
      if (!normalized || !rangesOverlap(normalized, bounds)) return [];
      const contained = normalized.startRow >= bounds.startRow
        && normalized.endRow <= bounds.endRow
        && normalized.startColumn >= bounds.startColumn
        && normalized.endColumn <= bounds.endColumn;
      return contained ? [toRelativeRange(normalized, bounds)] : [];
    }),
    conditionalFormats: clipboardRulesForRange(sheet.conditionalFormats, bounds),
    dataValidations: clipboardRulesForRange(sheet.dataValidations, bounds),
    copyDimensions: Boolean(includeDimensions),
    rowHeights: includeDimensions
      ? Array.from({ length: cells.length }, (_, offset) => Number(sheet.rowHeights?.[bounds.startRow + offset]) || null)
      : [],
    columnWidths: includeDimensions
      ? Array.from({ length: cells[0]?.length || 0 }, (_, offset) => Number(sheet.columnWidths?.[bounds.startColumn + offset]) || null)
      : [],
  };
}

function getCellRawValue(cell) {
  if (cell && typeof cell === 'object') return cell.v ?? cell.value ?? '';
  return cell ?? '';
}

export function spreadsheetClipboardPayloadToText(payload, displayMatrix = null) {
  const cells = normalizedCellMatrix(payload?.cells);
  return cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
    const displayValue = displayMatrix?.[rowIndex]?.[columnIndex];
    return String(displayValue ?? getCellRawValue(cell) ?? '');
  }).join('\t')).join('\n');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function clipboardCellStyle(cell) {
  const style = cell?.style || {};
  return [
    style.fontFamily ? `font-family:${style.fontFamily}` : '',
    style.fontSize ? `font-size:${Number(style.fontSize)}px` : '',
    style.bold ? 'font-weight:700' : '',
    style.italic ? 'font-style:italic' : '',
    style.underline ? 'text-decoration:underline' : '',
    style.color ? `color:${style.color}` : '',
    style.backgroundColor ? `background-color:${style.backgroundColor}` : '',
    style.horizontalAlign ? `text-align:${style.horizontalAlign}` : '',
    style.wrap ? 'white-space:normal' : 'white-space:nowrap',
  ].filter(Boolean).join(';');
}

export function spreadsheetClipboardPayloadToHtml(payload, displayMatrix = null) {
  const cells = normalizedCellMatrix(payload?.cells);
  const rows = cells.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => {
    const raw = String(getCellRawValue(cell) ?? '');
    const displayValue = displayMatrix?.[rowIndex]?.[columnIndex] ?? raw;
    const formula = raw.startsWith('=') ? ` data-formula="${escapeHtml(raw)}"` : '';
    const style = clipboardCellStyle(cell);
    return `<td${formula}${style ? ` style="${escapeHtml(style)}"` : ''}>${escapeHtml(displayValue)}</td>`;
  }).join('')}</tr>`).join('');
  return `<table data-relation-spreadsheet="true"><tbody>${rows}</tbody></table>`;
}

function parseCellStyle(element) {
  const style = element?.style;
  if (!style) return {};
  const fontWeight = String(style.fontWeight || '');
  const textDecoration = String(style.textDecorationLine || style.textDecoration || '');
  return Object.fromEntries(Object.entries({
    fontFamily: style.fontFamily || '',
    fontSize: Number.parseFloat(style.fontSize) || null,
    bold: fontWeight === 'bold' || Number(fontWeight) >= 600 ? true : null,
    italic: style.fontStyle === 'italic' ? true : null,
    underline: textDecoration.includes('underline') ? true : null,
    color: style.color || '',
    backgroundColor: style.backgroundColor || '',
    horizontalAlign: ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : '',
    wrap: style.whiteSpace && style.whiteSpace !== 'nowrap' ? true : null,
  }).filter(([, value]) => value !== '' && value !== null && value !== undefined));
}

function cellFormulaFromHtml(element) {
  const attributes = ['data-formula', 'data-cell-formula', 'data-sheets-formula', 'x:fmla', 'formula'];
  const value = attributes.map(name => element.getAttribute(name)).find(Boolean);
  if (!value) return '';
  return String(value).startsWith('=') ? String(value) : `=${value}`;
}

export function parseSpreadsheetHtmlClipboard(html) {
  if (!html || typeof DOMParser === 'undefined') return null;
  const documentValue = new DOMParser().parseFromString(String(html), 'text/html');
  const table = documentValue.querySelector('table');
  if (!table) return null;
  const matrix = [];
  let hasFormulaMetadata = false;
  [...table.querySelectorAll('tr')].forEach((rowElement, rowIndex) => {
    if (!matrix[rowIndex]) matrix[rowIndex] = [];
    let columnIndex = 0;
    [...rowElement.querySelectorAll(':scope > th, :scope > td')].forEach(cellElement => {
      while (matrix[rowIndex][columnIndex] !== undefined) columnIndex += 1;
      const formula = cellFormulaFromHtml(cellElement);
      const style = parseCellStyle(cellElement);
      const cell = {
        v: formula || String(cellElement.textContent || '').replace(/\u00a0/g, ' '),
        ...(Object.keys(style).length ? { style } : {}),
      };
      if (formula) hasFormulaMetadata = true;
      const rowSpan = Math.max(1, Number(cellElement.getAttribute('rowspan')) || 1);
      const columnSpan = Math.max(1, Number(cellElement.getAttribute('colspan')) || 1);
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        if (!matrix[rowIndex + rowOffset]) matrix[rowIndex + rowOffset] = [];
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          matrix[rowIndex + rowOffset][columnIndex + columnOffset] = rowOffset || columnOffset ? null : cell;
        }
      }
      columnIndex += columnSpan;
    });
  });
  const cells = normalizedCellMatrix(matrix);
  if (!cells.length) return null;
  return {
    payload: {
      format: RELATION_SPREADSHEET_CLIPBOARD_FORMAT,
      sourceSheetId: '',
      sourceSheetName: '',
      sourceRange: null,
      rowCount: cells.length,
      columnCount: cells[0]?.length || 0,
      cells,
    },
    hasFormulaMetadata,
    sourceLooksLikeShimo: /shimo|shimowendang/i.test(String(html)),
  };
}

export function parseSpreadsheetTextClipboard(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) return null;
  const lines = normalized.split('\n').filter((line, index, rows) => index < rows.length - 1 || line !== '');
  const cells = normalizedCellMatrix(lines.map(line => line.split('\t').map(value => ({ v: value }))));
  return cells.length ? {
    format: RELATION_SPREADSHEET_CLIPBOARD_FORMAT,
    sourceSheetId: '',
    sourceSheetName: '',
    sourceRange: null,
    rowCount: cells.length,
    columnCount: cells[0]?.length || 0,
    cells,
  } : null;
}

export function parseSpreadsheetClipboardData(clipboardData) {
  if (!clipboardData?.getData) return null;
  const relationData = clipboardData.getData(RELATION_SPREADSHEET_CLIPBOARD_MIME);
  if (relationData) {
    try {
      const parsed = JSON.parse(relationData);
      const cells = normalizedCellMatrix(parsed?.cells);
      if (parsed?.format === RELATION_SPREADSHEET_CLIPBOARD_FORMAT && cells.length) {
        return { payload: { ...parsed, cells }, source: 'relation', hasFormulaMetadata: true };
      }
    } catch {
      // Fall through to interoperable clipboard formats.
    }
  }
  const htmlResult = parseSpreadsheetHtmlClipboard(clipboardData.getData('text/html'));
  if (htmlResult) return { ...htmlResult, source: 'html' };
  const payload = parseSpreadsheetTextClipboard(clipboardData.getData('text/plain'));
  return payload ? { payload, source: 'text', hasFormulaMetadata: false } : null;
}

export function applySpreadsheetClipboardPayload(sheet, payload, startRow, startColumn) {
  const cells = normalizedCellMatrix(payload?.cells);
  if (!sheet || !cells.length) return { endRow: startRow, endColumn: startColumn };
  const sourceRange = normalizeSpreadsheetRange(payload?.sourceRange);
  const rowDelta = sourceRange ? startRow - sourceRange.startRow : 0;
  const columnDelta = sourceRange ? startColumn - sourceRange.startColumn : 0;
  if (!sheet.cells || typeof sheet.cells !== 'object') sheet.cells = {};
  cells.forEach((row, rowOffset) => row.forEach((sourceCell, columnOffset) => {
    const targetRow = startRow + rowOffset;
    const targetColumn = startColumn + columnOffset;
    const key = buildSpreadsheetCellKey(targetRow, targetColumn);
    if (!sourceCell) {
      delete sheet.cells[key];
      return;
    }
    const cell = clone(sourceCell);
    const raw = getCellRawValue(cell);
    if (sourceRange && typeof raw === 'string' && raw.startsWith('=')) {
      cell.v = translateSpreadsheetFormulaForPaste(raw, rowDelta, columnDelta);
      delete cell.value;
      delete cell.computed;
    }
    sheet.cells[key] = cell;
  }));
  const endRow = startRow + cells.length - 1;
  const endColumn = startColumn + (cells[0]?.length || 1) - 1;
  const targetRange = { startRow, endRow, startColumn, endColumn };
  if (Array.isArray(payload.mergedCells)) {
    sheet.mergedCells = (sheet.mergedCells || []).filter(range => !rangesOverlap(range, targetRange));
    payload.mergedCells.forEach(relativeRange => {
      const range = normalizeSpreadsheetRange({
        startRow: startRow + Number(relativeRange.startRow),
        endRow: startRow + Number(relativeRange.endRow),
        startColumn: startColumn + Number(relativeRange.startColumn),
        endColumn: startColumn + Number(relativeRange.endColumn),
      });
      if (range && (range.startRow !== range.endRow || range.startColumn !== range.endColumn)) {
        sheet.mergedCells.push(range);
      }
    });
  }
  for (const property of ['conditionalFormats', 'dataValidations']) {
    if (!Array.isArray(payload[property]) || !payload[property].length) continue;
    const rules = Array.isArray(sheet[property]) ? sheet[property] : [];
    const usedIds = new Set(rules.map(rule => String(rule?.id || '')));
    const copiedRules = payload[property].flatMap((rule, index) => {
      const relativeRange = normalizeSpreadsheetRange(rule?.range);
      if (!relativeRange) return [];
      const baseId = `${String(rule.id || property).slice(0, 96)}_copy`;
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}_${suffix}`.slice(0, 128);
        suffix += 1;
      }
      usedIds.add(id);
      return [{
        ...clone(rule),
        id,
        range: {
          startRow: startRow + relativeRange.startRow,
          endRow: startRow + relativeRange.endRow,
          startColumn: startColumn + relativeRange.startColumn,
          endColumn: startColumn + relativeRange.endColumn,
        },
        priority: Number(rule.priority) || rules.length + index,
      }];
    });
    sheet[property] = [...rules, ...copiedRules];
  }
  if (payload.copyDimensions) {
    if (!sheet.rowHeights || typeof sheet.rowHeights !== 'object') sheet.rowHeights = {};
    if (!sheet.columnWidths || typeof sheet.columnWidths !== 'object') sheet.columnWidths = {};
    cells.forEach((_, offset) => {
      const value = Number(payload.rowHeights?.[offset]);
      if (Number.isFinite(value) && value > 0) sheet.rowHeights[startRow + offset] = value;
      else delete sheet.rowHeights[startRow + offset];
    });
    Array.from({ length: cells[0]?.length || 0 }, (_, offset) => offset).forEach(offset => {
      const value = Number(payload.columnWidths?.[offset]);
      if (Number.isFinite(value) && value > 0) sheet.columnWidths[startColumn + offset] = value;
      else delete sheet.columnWidths[startColumn + offset];
    });
  }
  sheet.rowCount = Math.max(Number(sheet.rowCount) || 1, endRow + 1);
  sheet.columnCount = Math.max(Number(sheet.columnCount) || 1, endColumn + 1);
  return { endRow, endColumn };
}
