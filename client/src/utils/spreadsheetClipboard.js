import {
  buildSpreadsheetCellKey,
  getSpreadsheetCellObject,
  normalizeSpreadsheetRange,
  parseSpreadsheetCellKey,
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

export function buildSpreadsheetClipboardPayload(sheet, range) {
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
  };
}

function getCellRawValue(cell) {
  if (cell && typeof cell === 'object') return cell.v ?? cell.value ?? '';
  return cell ?? '';
}

function normalizeGroupedNumericDisplayValue(value) {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (!/^[+-]?(?:[1-9]\d{0,2}|0)(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) return text;
  const unsigned = trimmed.replace(/^[+-]/, '');
  const integer = unsigned.split('.')[0].replace(/,/g, '');
  if (integer.length > 1 && integer.startsWith('0')) return text;
  const normalized = trimmed.replace(/,/g, '');
  return Number.isFinite(Number(normalized)) ? normalized : text;
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

function formulaFromStructuredValue(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('=')) return text;
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        return formulaFromStructuredValue(JSON.parse(text), depth + 1);
      } catch {
        return '';
      }
    }
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const formula = formulaFromStructuredValue(item, depth + 1);
      if (formula) return formula;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const entries = Object.entries(value);
  const preferred = entries.filter(([key]) => /(^|[_-])(formula|fmla|fx|expression)($|[_-])/i.test(key));
  for (const [, candidate] of [...preferred, ...entries]) {
    const formula = formulaFromStructuredValue(candidate, depth + 1);
    if (formula) return formula;
  }
  return '';
}

function cellFormulaFromHtml(element) {
  const candidates = [element, ...element.querySelectorAll('*')];
  const exactAttributes = ['data-formula', 'data-cell-formula', 'data-sheets-formula', 'data-shimo-formula', 'x:fmla', 'formula'];
  for (const candidate of candidates) {
    for (const name of exactAttributes) {
      const value = candidate.getAttribute?.(name);
      if (!value) continue;
      const formula = formulaFromStructuredValue(value) || String(value);
      return formula.startsWith('=') ? formula : `=${formula}`;
    }
    for (const attribute of [...(candidate.attributes || [])]) {
      if (!/(formula|fmla|cell|meta|payload|value)/i.test(attribute.name)) continue;
      const formula = formulaFromStructuredValue(attribute.value);
      if (formula) return formula;
    }
  }
  return '';
}

function sourceRangeFromHtml(documentValue, table, rowCount, columnCount) {
  const candidates = [table, documentValue.body, documentValue.documentElement].filter(Boolean);
  const attributeNames = ['data-range', 'data-copy-range', 'data-selection-range', 'data-source-range'];
  for (const candidate of candidates) {
    for (const name of attributeNames) {
      const value = candidate.getAttribute?.(name);
      const startText = String(value || '').match(/\$?[A-Z]+\$?[1-9]\d*/i)?.[0];
      const start = parseSpreadsheetCellKey(startText);
      if (!start) continue;
      return {
        startRow: start.rowIndex,
        endRow: start.rowIndex + Math.max(0, rowCount - 1),
        startColumn: start.columnIndex,
        endColumn: start.columnIndex + Math.max(0, columnCount - 1),
      };
    }
  }
  return null;
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
      const displayValue = String(cellElement.textContent || '').replace(/\u00a0/g, ' ');
      const cell = {
        v: formula || normalizeGroupedNumericDisplayValue(displayValue),
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
  const sourceRange = sourceRangeFromHtml(documentValue, table, cells.length, cells[0]?.length || 0);
  return {
    payload: {
      format: RELATION_SPREADSHEET_CLIPBOARD_FORMAT,
      sourceSheetId: '',
      sourceSheetName: '',
      sourceRange,
      rowCount: cells.length,
      columnCount: cells[0]?.length || 0,
      cells,
    },
    hasFormulaMetadata,
    sourceLooksLikeShimo: /shimo|shimowendang/i.test(String(html)),
  };
}

function cellFromStructuredClipboardValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) return { v: String(value) };
  const formula = formulaFromStructuredValue(value);
  const explicitRawValue = value.v ?? value.value ?? value.text;
  const displayValue = value.displayValue ?? value.formattedValue ?? '';
  const rawValue = explicitRawValue ?? normalizeGroupedNumericDisplayValue(displayValue);
  const cell = { v: formula || String(rawValue ?? '') };
  if (value.style && typeof value.style === 'object') cell.style = clone(value.style);
  return cell;
}

function findStructuredClipboardMatrix(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length && value.every(row => Array.isArray(row))) {
      return normalizedCellMatrix(value.map(row => row.map(cellFromStructuredClipboardValue)));
    }
    for (const item of value) {
      const matrix = findStructuredClipboardMatrix(item, depth + 1);
      if (matrix?.length) return matrix;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  const preferredKeys = ['cells', 'cellData', 'matrix', 'data', 'values', 'clipboardData'];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const matrix = findStructuredClipboardMatrix(value[key], depth + 1);
    if (matrix?.length) return matrix;
  }
  for (const candidate of Object.values(value)) {
    const matrix = findStructuredClipboardMatrix(candidate, depth + 1);
    if (matrix?.length) return matrix;
  }
  return null;
}

function parseStructuredSpreadsheetClipboard(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const cells = findStructuredClipboardMatrix(parsed);
    if (!cells?.length) return null;
    const sourceRange = normalizeSpreadsheetRange(parsed.sourceRange || parsed.range || parsed.selectionRange);
    return {
      payload: {
        format: RELATION_SPREADSHEET_CLIPBOARD_FORMAT,
        sourceSheetId: String(parsed.sourceSheetId || parsed.sheetId || ''),
        sourceSheetName: String(parsed.sourceSheetName || parsed.sheetName || ''),
        sourceRange,
        rowCount: cells.length,
        columnCount: cells[0]?.length || 0,
        cells,
      },
      hasFormulaMetadata: cells.some(row => row.some(cell => String(getCellRawValue(cell)).startsWith('='))),
    };
  } catch {
    return null;
  }
}

function mergeTextRawValuesIntoHtmlPayload(htmlResult, textPayload) {
  if (!htmlResult?.payload?.cells?.length || !textPayload?.cells?.length) return htmlResult;
  if (htmlResult.payload.cells.length !== textPayload.cells.length
    || htmlResult.payload.cells[0]?.length !== textPayload.cells[0]?.length) return htmlResult;
  let mergedRawValue = false;
  const cells = htmlResult.payload.cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
    const textCell = textPayload.cells[rowIndex]?.[columnIndex];
    const textValue = String(getCellRawValue(textCell) ?? '');
    const htmlValue = String(getCellRawValue(cell) ?? '');
    const isFormula = textValue.startsWith('=');
    const isRawNumericMatch = textValue !== htmlValue
      && Number.isFinite(Number(textValue))
      && normalizeGroupedNumericDisplayValue(htmlValue) === textValue;
    if (!isFormula && !isRawNumericMatch) return cell;
    mergedRawValue = true;
    return { ...(cell || {}), v: textValue };
  }));
  const hasFormulaMetadata = htmlResult.hasFormulaMetadata
    || cells.some(row => row.some(cell => String(getCellRawValue(cell)).startsWith('=')));
  return mergedRawValue
    ? { ...htmlResult, payload: { ...htmlResult.payload, cells }, hasFormulaMetadata }
    : htmlResult;
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
  const customTypes = Array.from(clipboardData.types || []).filter(type => (
    ![RELATION_SPREADSHEET_CLIPBOARD_MIME, 'text/html', 'text/plain'].includes(type)
    && /(shimo|spreadsheet|sheets|excel)/i.test(type)
  ));
  for (const type of customTypes) {
    const structured = parseStructuredSpreadsheetClipboard(clipboardData.getData(type));
    if (structured) {
      return {
        ...structured,
        source: 'structured',
        sourceLooksLikeShimo: /shimo/i.test(type),
      };
    }
  }
  const payload = parseSpreadsheetTextClipboard(clipboardData.getData('text/plain'));
  const htmlResult = mergeTextRawValuesIntoHtmlPayload(
    parseSpreadsheetHtmlClipboard(clipboardData.getData('text/html')),
    payload,
  );
  if (htmlResult) return { ...htmlResult, source: 'html' };
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
  sheet.rowCount = Math.max(Number(sheet.rowCount) || 1, endRow + 1);
  sheet.columnCount = Math.max(Number(sheet.columnCount) || 1, endColumn + 1);
  return { endRow, endColumn };
}
