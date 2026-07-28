const OFFICE_PAGE_CONTENT_WIDTH_PX = 624;
const DEFAULT_TABLE_COLUMN_WIDTH_PX = 160;

export const OFFICE_CLIPBOARD_FONT_FAMILY = "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";

function escapeHtmlAttribute(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeCssColor(value = '') {
  const color = String(value || '').trim();
  if (!color || ['transparent', 'inherit', 'initial'].includes(color.toLowerCase())) return '';
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  if (/^[a-z]+$/i.test(color)) return color;
  return '';
}

function normalizePositiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeRows(rows = []) {
  const source = Array.isArray(rows) ? rows.filter(Array.isArray) : [];
  const columnCount = Math.max(1, ...source.map(row => row.length));
  const normalizedRows = (source.length ? source : [[]]).map(row => (
    Array.from({ length: columnCount }, (_, columnIndex) => String(row[columnIndex] ?? ''))
  ));
  return { rows: normalizedRows, columnCount };
}

function normalizeColumnWidths(columnWidths, columnCount) {
  return Array.from({ length: columnCount }, (_, columnIndex) => (
    normalizePositiveNumber(columnWidths?.[columnIndex], DEFAULT_TABLE_COLUMN_WIDTH_PX)
  ));
}

function normalizeRowColumnWidths(rowColumnWidths, rowCount, columnCount, baseWidths) {
  if (!rowColumnWidths || typeof rowColumnWidths !== 'object') return {};
  return Object.entries(rowColumnWidths).reduce((result, [rowKey, widths]) => {
    const rowIndex = Number(rowKey);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowCount || !Array.isArray(widths)) return result;
    result[rowIndex] = Array.from({ length: columnCount }, (_, columnIndex) => (
      normalizePositiveNumber(widths[columnIndex], baseWidths[columnIndex])
    ));
    return result;
  }, {});
}

function normalizeMergedCells(mergedCells, rowCount, columnCount) {
  if (!Array.isArray(mergedCells)) return [];
  const occupied = new Set();
  return mergedCells.reduce((result, merge) => {
    const rowIndex = Number(merge?.rowIndex);
    const columnIndex = Number(merge?.columnIndex);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return result;
    if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) return result;
    const rowSpan = Math.min(rowCount - rowIndex, Math.max(1, Math.round(Number(merge?.rowSpan) || 1)));
    const colSpan = Math.min(columnCount - columnIndex, Math.max(1, Math.round(Number(merge?.colSpan) || 1)));
    if (rowSpan === 1 && colSpan === 1) return result;
    const coveredKeys = [];
    for (let row = rowIndex; row < rowIndex + rowSpan; row += 1) {
      for (let column = columnIndex; column < columnIndex + colSpan; column += 1) {
        coveredKeys.push(`${row}:${column}`);
      }
    }
    if (coveredKeys.some(key => occupied.has(key))) return result;
    coveredKeys.forEach(key => occupied.add(key));
    result.push({ rowIndex, columnIndex, rowSpan, colSpan });
    return result;
  }, []);
}

function scaleWidths(widths, scale) {
  return widths.map(width => Math.max(1, Math.round(width * scale * 100) / 100));
}

function sumWidths(widths, startIndex = 0, span = widths.length) {
  return widths
    .slice(startIndex, startIndex + span)
    .reduce((total, width) => total + width, 0);
}

function tableStyle(width) {
  return [
    'border-collapse: collapse',
    'border-spacing: 0',
    'table-layout: fixed',
    `width: ${width}px`,
    `max-width: ${width}px`,
    `font-family: ${OFFICE_CLIPBOARD_FONT_FAMILY}`,
    "mso-fareast-font-family: 'Microsoft YaHei'",
    'font-size: 14px',
    'line-height: 1.55',
    'color: #111827',
    'mso-table-lspace: 0pt',
    'mso-table-rspace: 0pt',
  ].join('; ');
}

function cellStyle({ width, height, backgroundColor, color, horizontalCenter, verticalCenter }) {
  return [
    'border: 1px solid #e5e7eb',
    'mso-border-alt: solid #e5e7eb .75pt',
    'padding: 4px',
    'mso-padding-alt: 3pt 3pt 3pt 3pt',
    `width: ${width}px`,
    height ? `height: ${height}px` : '',
    `vertical-align: ${verticalCenter ? 'middle' : 'top'}`,
    `text-align: ${horizontalCenter ? 'center' : 'left'}`,
    `background-color: ${backgroundColor || '#ffffff'}`,
    `color: ${color || '#111827'}`,
    'overflow-wrap: anywhere',
    'word-break: break-word',
  ].filter(Boolean).join('; ');
}

function cellParagraphStyle({ color, horizontalCenter }) {
  return [
    'margin: 0',
    'padding: 0',
    `font-family: ${OFFICE_CLIPBOARD_FONT_FAMILY}`,
    "mso-fareast-font-family: 'Microsoft YaHei'",
    'font-size: 14px',
    'line-height: 1.55',
    `text-align: ${horizontalCenter ? 'center' : 'left'}`,
    `color: ${color || '#111827'}`,
  ].join('; ');
}

export function buildOfficeTableHtml({
  rows = [],
  columnWidths = [],
  rowColumnWidths = {},
  rowHeights = {},
  mergedCells = [],
  cellStyles = {},
  horizontalCenter = false,
  verticalCenter = false,
  sanitizeCellHtml = value => String(value || ''),
  tableAttributes = '',
  maxWidth = OFFICE_PAGE_CONTENT_WIDTH_PX,
} = {}) {
  const normalized = normalizeRows(rows);
  const baseWidths = normalizeColumnWidths(columnWidths, normalized.columnCount);
  const scopedWidths = normalizeRowColumnWidths(
    rowColumnWidths,
    normalized.rows.length,
    normalized.columnCount,
    baseWidths,
  );
  const allWidthSets = [baseWidths, ...Object.values(scopedWidths)];
  const sourceWidth = Math.max(...allWidthSets.map(widths => sumWidths(widths)), 1);
  const safeMaxWidth = normalizePositiveNumber(maxWidth, OFFICE_PAGE_CONTENT_WIDTH_PX);
  const scale = Math.min(1, safeMaxWidth / sourceWidth);
  const outputWidth = Math.round(sourceWidth * scale * 100) / 100;
  const scaledBaseWidths = scaleWidths(baseWidths, scale);
  const mergeList = normalizeMergedCells(mergedCells, normalized.rows.length, normalized.columnCount);
  const mergeAnchors = new Map();
  const coveredCells = new Set();
  mergeList.forEach((merge) => {
    mergeAnchors.set(`${merge.rowIndex}:${merge.columnIndex}`, merge);
    for (let row = merge.rowIndex; row < merge.rowIndex + merge.rowSpan; row += 1) {
      for (let column = merge.columnIndex; column < merge.columnIndex + merge.colSpan; column += 1) {
        if (row !== merge.rowIndex || column !== merge.columnIndex) coveredCells.add(`${row}:${column}`);
      }
    }
  });

  const colgroup = scaledBaseWidths.map(width => (
    `<col width="${Math.round(width)}" style="width: ${width}px;" />`
  )).join('');
  const body = normalized.rows.map((row, rowIndex) => {
    const sourceRowWidths = scopedWidths[rowIndex] || baseWidths;
    const scaledRowWidths = scaleWidths(sourceRowWidths, scale);
    const rowHeight = normalizePositiveNumber(rowHeights?.[rowIndex], 0);
    const cells = row.map((cell, columnIndex) => {
      const key = `${rowIndex}:${columnIndex}`;
      if (coveredCells.has(key)) return '';
      const merge = mergeAnchors.get(key);
      const rowSpan = merge?.rowSpan || 1;
      const colSpan = merge?.colSpan || 1;
      const style = cellStyles?.[key] || {};
      const backgroundColor = normalizeCssColor(style.backgroundColor || style.background || style.fill);
      const color = normalizeCssColor(style.color || style.textColor);
      const width = Math.round(sumWidths(scaledRowWidths, columnIndex, colSpan) * 100) / 100;
      const html = sanitizeCellHtml(cell) || '&nbsp;';
      const attributes = [
        `width="${Math.round(width)}"`,
        `style="${escapeHtmlAttribute(cellStyle({ width, height: rowHeight, backgroundColor, color, horizontalCenter, verticalCenter }))}"`,
        `valign="${verticalCenter ? 'middle' : 'top'}"`,
        backgroundColor ? `bgcolor="${escapeHtmlAttribute(backgroundColor)}"` : '',
        rowSpan > 1 ? `rowspan="${rowSpan}"` : '',
        colSpan > 1 ? `colspan="${colSpan}"` : '',
      ].filter(Boolean).join(' ');
      return `<td ${attributes}><p style="${escapeHtmlAttribute(cellParagraphStyle({ color, horizontalCenter }))}">${html}</p></td>`;
    }).join('');
    const trStyle = rowHeight ? ` style="height: ${rowHeight}px;" height="${Math.round(rowHeight)}"` : '';
    return `<tr${trStyle}>${cells}</tr>`;
  }).join('');
  const safeAttributes = String(tableAttributes || '').trim();
  return `<table${safeAttributes ? ` ${safeAttributes}` : ''} width="${Math.round(outputWidth)}" style="${escapeHtmlAttribute(tableStyle(outputWidth))}"><colgroup>${colgroup}</colgroup><tbody>${body}</tbody></table>`;
}

function getOfficeBlockTypography(type = 'paragraph') {
  const headingLevel = Number(String(type).match(/^heading([1-4])$/)?.[1] || 0);
  if (headingLevel) {
    const fontSizes = { 1: 24, 2: 20, 3: 17, 4: 15 };
    return {
      tag: `h${headingLevel}`,
      fontSize: fontSizes[headingLevel],
      fontWeight: 700,
      lineHeight: 1.35,
      margin: headingLevel === 1 ? '16px 0 10px' : '12px 0 8px',
    };
  }
  if (type === 'quote') return { tag: 'blockquote', fontSize: 15, fontWeight: 400, lineHeight: 1.75, margin: '8px 0' };
  if (type === 'code') return { tag: 'pre', fontSize: 13, fontWeight: 400, lineHeight: 1.6, margin: '8px 0' };
  return { tag: 'p', fontSize: 15, fontWeight: 400, lineHeight: 1.75, margin: '0 0 8px' };
}

export function buildOfficeTextBlockHtml({
  type = 'paragraph',
  content = '',
  checked = false,
  highlight = '',
  indent = 0,
  body = '',
  fallbackHtml = '&nbsp;',
} = {}) {
  if (type === 'divider') return '<hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 12px 0;" />';
  const typography = getOfficeBlockTypography(type);
  const safeHighlight = normalizeCssColor(highlight);
  const safeIndent = Math.max(0, Math.round(Number(indent) || 0));
  const styles = [
    `margin: ${typography.margin}`,
    safeIndent ? `margin-left: ${safeIndent * 24}px` : '',
    `font-family: ${OFFICE_CLIPBOARD_FONT_FAMILY}`,
    "mso-fareast-font-family: 'Microsoft YaHei'",
    `font-size: ${typography.fontSize}px`,
    `font-weight: ${typography.fontWeight}`,
    `line-height: ${typography.lineHeight}`,
    'color: #202124',
    safeHighlight ? `background-color: ${safeHighlight}` : '',
    type === 'quote' ? 'border-left: 4px solid #94a3b8; padding-left: 12px; color: #475569; font-style: italic' : '',
    type === 'code' ? "font-family: Consolas, 'Liberation Mono', monospace; white-space: pre-wrap; background-color: #f8fafc; padding: 8px" : '',
  ].filter(Boolean).join('; ');
  const todoPrefix = type === 'todo' ? `<span>${checked ? '&#9745;' : '&#9744;'}&nbsp;</span>` : '';
  const mainContent = content || fallbackHtml;
  const foldBody = body
    ? `<div style="margin: 4px 0 0 24px; font-family: ${escapeHtmlAttribute(OFFICE_CLIPBOARD_FONT_FAMILY)}; font-size: 15px; line-height: 1.75;">${body}</div>`
    : '';
  if (['bullet', 'numbered', 'fold-list'].includes(type)) {
    const listTag = type === 'numbered' ? 'ol' : 'ul';
    const listStyle = [
      `margin: ${typography.margin}`,
      `padding-left: ${24 + safeIndent * 24}px`,
      `font-family: ${OFFICE_CLIPBOARD_FONT_FAMILY}`,
      "mso-fareast-font-family: 'Microsoft YaHei'",
      'font-size: 15px',
      'line-height: 1.75',
      'color: #202124',
    ].join('; ');
    return `<${listTag} style="${escapeHtmlAttribute(listStyle)}"><li data-block-type="${escapeHtmlAttribute(type)}" data-indent="${safeIndent}" style="margin: 0; padding: 0;">${mainContent}${foldBody}</li></${listTag}>`;
  }
  return `<${typography.tag} data-block-type="${escapeHtmlAttribute(type)}" data-indent="${safeIndent}" style="${escapeHtmlAttribute(styles)}">${todoPrefix}${mainContent}${foldBody}</${typography.tag}>`;
}

export function buildOfficeClipboardEnvelope(content = '', {
  attributeName = '',
  encodedPayload = '',
} = {}) {
  const safeAttributeName = /^[a-z][a-z0-9:_-]*$/i.test(attributeName) ? attributeName : '';
  const payloadAttribute = safeAttributeName
    ? ` ${safeAttributeName}="${escapeHtmlAttribute(encodedPayload)}"`
    : '';
  const rootStyle = [
    `font-family: ${OFFICE_CLIPBOARD_FONT_FAMILY}`,
    "mso-fareast-font-family: 'Microsoft YaHei'",
    'font-size: 15px',
    'line-height: 1.75',
    'color: #202124',
  ].join('; ');
  return [
    '<!DOCTYPE html>',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="utf-8" /></head>',
    `<body style="${escapeHtmlAttribute(rootStyle)}"><!--StartFragment--><div${payloadAttribute} style="${escapeHtmlAttribute(rootStyle)}">`,
    String(content || ''),
    '</div><!--EndFragment--></body></html>',
  ].join('');
}
