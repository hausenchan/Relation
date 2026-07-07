const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const JSZip = require('jszip');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const MAX_BLOCKS = 1200;
const MAX_TEXT_CHARS = 240000;
const MAX_TABLE_ROWS = 1200;
const MAX_TABLE_COLUMNS = 80;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function makeBlockFactory(seed) {
  let index = 0;
  const prefix = `b_file_${sha256(seed).slice(0, 8)}`;
  return (type = 'paragraph', content = '', extra = {}) => {
    index += 1;
    return {
      id: `${prefix}_${String(index).padStart(4, '0')}`,
      type,
      content: type === 'divider' ? '' : String(content || ''),
      checked: Boolean(extra.checked),
      highlight: extra.highlight || '',
      meta: extra.meta || {},
      ...extra,
    };
  };
}

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTagAttribute(fragment = '', name = '') {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(fragment || '').match(pattern);
  return decodeEntities(match?.[2] || match?.[3] || match?.[4] || '');
}

function getOpeningTag(fragment = '') {
  return String(fragment || '').match(/^<[^>]+>/)?.[0] || '';
}

function getInnerHtml(fragment = '') {
  return String(fragment || '')
    .replace(/^<[^>]+>/, '')
    .replace(/<\/[^>]+>\s*$/i, '');
}

function sanitizeStyle(value = '') {
  const allowed = [];
  String(value || '').split(';').forEach(part => {
    const [rawName, ...rawValueParts] = part.split(':');
    const name = String(rawName || '').trim().toLowerCase();
    const cssValue = rawValueParts.join(':').trim();
    if (!cssValue) return;
    if (!['color', 'background-color', 'font-weight', 'font-style', 'text-decoration'].includes(name)) return;
    if (/url\s*\(|expression\s*\(|javascript:/i.test(cssValue)) return;
    allowed.push(`${name}: ${cssValue}`);
  });
  return allowed.join('; ');
}

function sanitizeInlineHtml(value = '') {
  let html = String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
  html = html.replace(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>/gi, (match, slash, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    const allowedTags = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'span', 'mark', 'a', 'br']);
    if (!allowedTags.has(tag)) return '';
    if (tag === 'br') return '<br>';
    if (slash) return `</${tag}>`;
    const safeAttrs = [];
    if (tag === 'a') {
      const href = getTagAttribute(match, 'href');
      if (/^https?:\/\//i.test(href) || href.startsWith('/')) {
        safeAttrs.push(`href="${escapeHtml(href)}"`);
        safeAttrs.push('target="_blank"');
        safeAttrs.push('rel="noreferrer"');
      }
    }
    const style = sanitizeStyle(getTagAttribute(match, 'style'));
    if (style) safeAttrs.push(`style="${escapeHtml(style)}"`);
    return `<${tag}${safeAttrs.length ? ` ${safeAttrs.join(' ')}` : ''}>`;
  });
  return html.replace(/\s+/g, ' ').replace(/\s*<br>\s*/gi, '<br>').trim();
}

function htmlToPlain(value = '') {
  return decodeEntities(String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n'))
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normalizeCssColor(value = '') {
  const color = String(value || '').trim();
  if (!color || color === 'transparent' || color === 'inherit' || color === 'initial') return '';
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  if (/^[a-z]+$/i.test(color)) return color;
  return '';
}

function getCssDeclaration(styleText = '', property = '') {
  const match = String(styleText || '').match(new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function getCellStyle(cellTag = '', rowTag = '') {
  const cellStyle = getTagAttribute(cellTag, 'style');
  const rowStyle = getTagAttribute(rowTag, 'style');
  const backgroundColor = normalizeCssColor(
    getTagAttribute(cellTag, 'bgcolor')
      || getCssDeclaration(cellStyle, 'background(?:-color)?')
      || getCssDeclaration(rowStyle, 'background(?:-color)?')
  );
  const color = normalizeCssColor(
    getCssDeclaration(cellStyle, 'color')
      || getCssDeclaration(rowStyle, 'color')
  );
  return {
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(color ? { color } : {}),
  };
}

function isEmptyCellStyle(style = {}) {
  return !style.backgroundColor && !style.color;
}

function buildTableMergeKey(rowIndex, columnIndex) {
  return `${rowIndex}:${columnIndex}`;
}

function parseHtmlTable(fragment = '', makeBlock) {
  const rowFragments = String(fragment || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const matrix = [];
  const occupied = new Set();
  const mergedCells = [];
  const cellStyles = {};

  rowFragments.forEach((rowHtml, rowIndex) => {
    matrix[rowIndex] = matrix[rowIndex] || [];
    const rowTag = getOpeningTag(rowHtml);
    const cellFragments = rowHtml.match(/<(td|th)\b[\s\S]*?<\/\1>/gi) || [];
    let columnIndex = 0;
    cellFragments.forEach(cellHtml => {
      while (occupied.has(buildTableMergeKey(rowIndex, columnIndex))) columnIndex += 1;
      const openingTag = getOpeningTag(cellHtml);
      const tag = openingTag.match(/^<([a-z0-9]+)/i)?.[1]?.toLowerCase() || 'td';
      const rowSpan = Math.max(1, Number(getTagAttribute(openingTag, 'rowspan')) || 1);
      const colSpan = Math.max(1, Number(getTagAttribute(openingTag, 'colspan')) || 1);
      const inner = sanitizeInlineHtml(getInnerHtml(cellHtml)
        .replace(/<\/(p|div|h[1-6])>\s*<(p|div|h[1-6])[^>]*>/gi, '<br>')
        .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, ''));
      const content = tag === 'th' && inner && !/^<strong\b/i.test(inner) ? `<strong>${inner}</strong>` : inner;
      matrix[rowIndex][columnIndex] = content;

      const style = getCellStyle(openingTag, rowTag);
      if (!isEmptyCellStyle(style)) {
        cellStyles[buildTableMergeKey(rowIndex, columnIndex)] = style;
      }
      if (rowSpan > 1 || colSpan > 1) {
        mergedCells.push({ rowIndex, columnIndex, rowSpan, colSpan });
      }
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        matrix[r] = matrix[r] || [];
        for (let c = columnIndex; c < columnIndex + colSpan; c += 1) {
          occupied.add(buildTableMergeKey(r, c));
          if (r !== rowIndex || c !== columnIndex) matrix[r][c] = matrix[r][c] ?? '';
        }
      }
      columnIndex += colSpan;
    });
  });

  const visibleRows = matrix.filter(row => Array.isArray(row) && row.length);
  if (!visibleRows.length) return null;
  const columnCount = Math.min(Math.max(...visibleRows.map(row => row.length), 1), MAX_TABLE_COLUMNS);
  const rows = visibleRows.slice(0, MAX_TABLE_ROWS).map(row => (
    Array.from({ length: columnCount }, (_, index) => row[index] || '')
  ));
  return makeBlock('table-simple', '', {
    meta: {
      columns: Array.from({ length: columnCount }, (_, index) => `字段 ${index + 1}`),
      rows,
      mergedCells: mergedCells.filter(item => (
        item.rowIndex < rows.length && item.columnIndex < columnCount
      )),
      cellStyles,
    },
  });
}

function parseHtmlList(fragment = '', listType = 'bullet', makeBlock, indent = 0) {
  const blocks = [];
  const itemFragments = String(fragment || '').match(/<li\b[\s\S]*?<\/li>/gi) || [];
  itemFragments.forEach(itemHtml => {
    const nestedLists = itemHtml.match(/<(ul|ol)\b[\s\S]*?<\/\1>/gi) || [];
    const ownHtml = sanitizeInlineHtml(getInnerHtml(itemHtml).replace(/<(ul|ol)\b[\s\S]*?<\/\1>/gi, ''));
    if (htmlToPlain(ownHtml)) {
      blocks.push(makeBlock(listType, ownHtml, { meta: { indent: Math.min(indent, 4) } }));
    }
    nestedLists.forEach(nested => {
      const nestedType = /^<ol\b/i.test(nested) ? 'numbered' : 'bullet';
      blocks.push(...parseHtmlList(nested, nestedType, makeBlock, indent + 1));
    });
  });
  return blocks;
}

function parseHtmlToBlocks(html = '', seed = '') {
  const makeBlock = makeBlockFactory(seed || html.slice(0, 120));
  const clean = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const blocks = [];
  const tokenPattern = /<(table|ul|ol|h[1-6]|p|blockquote|pre|div)\b[\s\S]*?<\/\1>/gi;
  let match;

  while ((match = tokenPattern.exec(clean)) && blocks.length < MAX_BLOCKS) {
    const fragment = match[0];
    const tag = match[1].toLowerCase();
    if (tag === 'table') {
      const tableBlock = parseHtmlTable(fragment, makeBlock);
      if (tableBlock) blocks.push(tableBlock);
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      blocks.push(...parseHtmlList(fragment, tag === 'ol' ? 'numbered' : 'bullet', makeBlock));
      continue;
    }
    if (tag === 'div' && /<(table|ul|ol|h[1-6]|p|blockquote|pre)\b/i.test(getInnerHtml(fragment))) {
      blocks.push(...parseHtmlToBlocks(getInnerHtml(fragment), `${seed}:nested:${blocks.length}`));
      continue;
    }
    const inline = tag === 'pre'
      ? escapeHtml(htmlToPlain(fragment))
      : sanitizeInlineHtml(getInnerHtml(fragment)
        .replace(/<\/(p|div|h[1-6])>\s*<(p|div|h[1-6])[^>]*>/gi, '<br>')
        .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, ''));
    if (!htmlToPlain(inline)) continue;
    if (/^h[1-6]$/.test(tag)) {
      blocks.push(makeBlock(`heading${Math.min(4, Number(tag.slice(1)))}`, inline));
    } else if (tag === 'blockquote') {
      blocks.push(makeBlock('quote', inline));
    } else if (tag === 'pre') {
      blocks.push(makeBlock('code', inline));
    } else {
      blocks.push(makeBlock('paragraph', inline));
    }
  }

  if (!blocks.length) {
    return parsePlainTextToBlocks(htmlToPlain(clean), seed);
  }
  return blocks.slice(0, MAX_BLOCKS);
}

function inferPlainTextBlockType(line = '', markdown = false) {
  const text = String(line || '').trim();
  if (markdown) {
    const heading = text.match(/^(#{1,4})\s+(.+)$/);
    if (heading) return { type: `heading${heading[1].length}`, content: escapeHtml(heading[2].trim()), meta: {} };
  }
  const bullet = text.match(/^[-*•]\s+(.+)$/);
  if (bullet) return { type: 'bullet', content: escapeHtml(bullet[1].trim()), meta: { indent: 0 } };
  const numbered = text.match(/^(\d+|[一二三四五六七八九十]+)[.)、]\s*(.+)$/);
  if (numbered) return { type: 'numbered', content: escapeHtml(numbered[2].trim()), meta: { indent: 0 } };
  return { type: 'paragraph', content: escapeHtml(text), meta: {} };
}

function parsePlainTextToBlocks(text = '', seed = '', options = {}) {
  const makeBlock = makeBlockFactory(seed || text.slice(0, 120));
  const markdown = Boolean(options.markdown);
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, MAX_TEXT_CHARS);
  const blocks = [];
  normalized.split('\n').forEach(rawLine => {
    if (blocks.length >= MAX_BLOCKS) return;
    const line = rawLine.trim();
    if (!line) return;
    const inferred = inferPlainTextBlockType(line, markdown);
    blocks.push(makeBlock(inferred.type, inferred.content, { meta: inferred.meta }));
  });
  return blocks.length ? blocks : [];
}

function collectBlocksText(blocks = []) {
  const parts = [];
  const visit = value => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = htmlToPlain(String(value)).trim();
      if (text) parts.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      ['content', 'text', 'title', 'meta', 'columns', 'rows', 'cells', 'body', 'value'].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key]);
      });
    }
  };
  visit(blocks);
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 20000);
}

function titleFromBlocks(blocks = []) {
  const firstTextBlock = blocks.find(block => htmlToPlain(block?.content || '').trim());
  const firstText = htmlToPlain(firstTextBlock?.content || '').replace(/\s+/g, ' ').trim();
  if (firstText && firstText.length >= 4 && firstText.length <= 120) return firstText;
  const preferred = blocks.find(block => /^heading[1-4]$/.test(block?.type || '') && htmlToPlain(block.content).trim());
  const fallback = preferred || blocks.find(block => htmlToPlain(block?.content || '').trim());
  return htmlToPlain(fallback?.content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeResult({ title = '', blocks = [], warnings = [], parser = '' } = {}) {
  const safeBlocks = Array.isArray(blocks)
    ? blocks.filter(Boolean).slice(0, MAX_BLOCKS)
    : [];
  const contentText = collectBlocksText(safeBlocks);
  return {
    title: String(title || titleFromBlocks(safeBlocks) || '').trim(),
    blocks: safeBlocks,
    content_text: contentText,
    warnings: [...new Set((warnings || []).filter(Boolean))],
    parser,
    content_extracted: Boolean(contentText.trim() && safeBlocks.length),
  };
}

async function parseDocx(filePath, filename) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='标题'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='标题 4'] => h4:fresh",
      ],
      includeDefaultStyleMap: true,
    }
  );
  const blocks = parseHtmlToBlocks(result.value || '', filename);
  return normalizeResult({
    blocks,
    warnings: (result.messages || []).map(item => item.message).filter(Boolean),
    parser: 'mammoth',
  });
}

async function parsePdf(filePath, filename) {
  const data = await pdfParse(fs.readFileSync(filePath));
  const text = String(data.text || '').trim();
  return normalizeResult({
    title: data.info?.Title || '',
    blocks: parsePlainTextToBlocks(text, filename),
    parser: 'pdf-parse',
  });
}

function normalizeTableRows(rows = [], stylesBySourceCell = {}) {
  let normalizedRows = rows.map(row => (
    Array.isArray(row) ? row.map(cell => String(cell ?? '').trim()) : []
  ));
  while (normalizedRows.length && normalizedRows[normalizedRows.length - 1].every(cell => !cell)) {
    normalizedRows.pop();
  }
  const columnCount = Math.min(
    Math.max(...normalizedRows.map(row => {
      let last = row.length - 1;
      while (last >= 0 && !row[last]) last -= 1;
      return last + 1;
    }), 0),
    MAX_TABLE_COLUMNS
  );
  if (!columnCount) return { rows: [], cellStyles: {} };
  normalizedRows = normalizedRows
    .slice(0, MAX_TABLE_ROWS)
    .map(row => Array.from({ length: columnCount }, (_, index) => row[index] || ''));
  const cellStyles = {};
  Object.entries(stylesBySourceCell || {}).forEach(([key, style]) => {
    const [rowText, columnText] = key.split(':');
    const rowIndex = Number(rowText);
    const columnIndex = Number(columnText);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    if (rowIndex < 0 || rowIndex >= normalizedRows.length || columnIndex < 0 || columnIndex >= columnCount) return;
    if (!isEmptyCellStyle(style)) cellStyles[buildTableMergeKey(rowIndex, columnIndex)] = style;
  });
  return { rows: normalizedRows, cellStyles };
}

function tableRowsToBlock(rows, makeBlock, cellStyles = {}) {
  if (!rows.length) return null;
  const columnCount = Math.max(...rows.map(row => row.length), 1);
  return makeBlock('table-simple', '', {
    meta: {
      columns: Array.from({ length: columnCount }, (_, index) => `字段 ${index + 1}`),
      rows: rows.map(row => Array.from({ length: columnCount }, (_, index) => escapeHtml(row[index] || ''))),
      mergedCells: [],
      cellStyles,
    },
  });
}

function parseDelimitedRows(text = '', delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!inQuotes && char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function spreadsheetColumnToIndex(cellRef = '') {
  const letters = String(cellRef || '').match(/[A-Z]+/i)?.[0] || '';
  if (!letters) return 0;
  return letters.toUpperCase().split('').reduce((sum, char) => sum * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

function normalizeSpreadsheetColor(value = '') {
  const raw = String(value || '').replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return '';
}

function parseSpreadsheetSharedStrings(xml = '') {
  return (String(xml || '').match(/<si\b[\s\S]*?<\/si>/gi) || []).map(item => (
    (item.match(/<t\b[^>]*>[\s\S]*?<\/t>/gi) || [])
      .map(textNode => decodeEntities(textNode.replace(/^<t\b[^>]*>/i, '').replace(/<\/t>$/i, '')))
      .join('')
  ));
}

function parseSpreadsheetStyles(xml = '') {
  const fills = (String(xml || '').match(/<fill\b[\s\S]*?<\/fill>/gi) || []).map(fillXml => (
    normalizeSpreadsheetColor(fillXml.match(/<fgColor\b[^>]*\srgb="([^"]+)"/i)?.[1])
      || normalizeSpreadsheetColor(fillXml.match(/<bgColor\b[^>]*\srgb="([^"]+)"/i)?.[1])
  ));
  const fonts = (String(xml || '').match(/<font\b[\s\S]*?<\/font>/gi) || []).map(fontXml => (
    normalizeSpreadsheetColor(fontXml.match(/<color\b[^>]*\srgb="([^"]+)"/i)?.[1])
  ));
  const cellXfsXml = String(xml || '').match(/<cellXfs\b[\s\S]*?<\/cellXfs>/i)?.[0] || '';
  const xfs = (cellXfsXml.match(/<xf\b[^>]*\/?>/gi) || []).map(xfXml => {
    const fillId = Number(xfXml.match(/\sfillId="(\d+)"/i)?.[1]);
    const fontId = Number(xfXml.match(/\sfontId="(\d+)"/i)?.[1]);
    const backgroundColor = Number.isInteger(fillId) ? fills[fillId] : '';
    const color = Number.isInteger(fontId) ? fonts[fontId] : '';
    return {
      ...(backgroundColor ? { backgroundColor } : {}),
      ...(color ? { color } : {}),
    };
  });
  return xfs;
}

function parseWorkbookRelationships(xml = '') {
  const rels = {};
  (String(xml || '').match(/<Relationship\b[^>]*\/?>/gi) || []).forEach(relXml => {
    const id = getTagAttribute(relXml, 'Id');
    const target = getTagAttribute(relXml, 'Target');
    if (!id || !target) return;
    rels[id] = target.startsWith('/') ? target.replace(/^\/+/, '') : `xl/${target.replace(/^\.?\//, '')}`;
  });
  return rels;
}

function parseWorkbookSheets(xml = '', rels = {}, zip) {
  const sheets = [];
  (String(xml || '').match(/<sheet\b[^>]*\/?>/gi) || []).forEach((sheetXml, index) => {
    const name = getTagAttribute(sheetXml, 'name') || `Sheet ${index + 1}`;
    const relId = getTagAttribute(sheetXml, 'r:id');
    const target = rels[relId] || `xl/worksheets/sheet${index + 1}.xml`;
    sheets.push({ name, path: target });
  });
  if (sheets.length) return sheets;
  return Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/sheet(\d+)\.xml/i)?.[1] || 0))
    .map((name, index) => ({ name: `Sheet ${index + 1}`, path: name }));
}

function parseSpreadsheetCellValue(cellXml = '', sharedStrings = []) {
  const opening = getOpeningTag(cellXml);
  const type = getTagAttribute(opening, 't');
  if (type === 'inlineStr') {
    return (cellXml.match(/<t\b[^>]*>[\s\S]*?<\/t>/gi) || [])
      .map(item => decodeEntities(item.replace(/^<t\b[^>]*>/i, '').replace(/<\/t>$/i, '')))
      .join('')
      .trim();
  }
  const rawValue = decodeEntities(cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || '').trim();
  if (type === 's') return String(sharedStrings[Number(rawValue)] || '').trim();
  if (type === 'b') return rawValue === '1' ? 'TRUE' : 'FALSE';
  return rawValue;
}

async function parseSpreadsheetXmlWorkbook(filePath, filename) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string').catch(() => '') || '';
  const stylesXml = await zip.file('xl/styles.xml')?.async('string').catch(() => '') || '';
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string').catch(() => '') || '';
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string').catch(() => '') || '';
  const sharedStrings = parseSpreadsheetSharedStrings(sharedStringsXml);
  const styles = parseSpreadsheetStyles(stylesXml);
  const sheets = parseWorkbookSheets(workbookXml, parseWorkbookRelationships(relsXml), zip);
  const makeBlock = makeBlockFactory(filename);
  const blocks = [];

  for (let sheetIndex = 0; sheetIndex < sheets.length && blocks.length < MAX_BLOCKS; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    const file = zip.file(sheet.path);
    if (!file) continue;
    const xml = await file.async('string');
    const rows = [];
    const sourceStyles = {};
    const rowFragments = xml.match(/<row\b[\s\S]*?<\/row>/gi) || [];
    rowFragments.forEach(rowXml => {
      const rowNumber = Number(getTagAttribute(getOpeningTag(rowXml), 'r')) || rows.length + 1;
      const rowIndex = rowNumber - 1;
      if (rowIndex >= MAX_TABLE_ROWS) return;
      const nextRow = rows[rowIndex] || [];
      const cellFragments = rowXml.match(/<c\b[\s\S]*?<\/c>/gi) || [];
      cellFragments.forEach(cellXml => {
        const opening = getOpeningTag(cellXml);
        const ref = getTagAttribute(opening, 'r');
        const columnIndex = spreadsheetColumnToIndex(ref);
        if (columnIndex >= MAX_TABLE_COLUMNS) return;
        nextRow[columnIndex] = parseSpreadsheetCellValue(cellXml, sharedStrings);
        const styleIndex = Number(getTagAttribute(opening, 's'));
        const style = Number.isInteger(styleIndex) ? styles[styleIndex] : null;
        if (style && !isEmptyCellStyle(style)) sourceStyles[buildTableMergeKey(rowIndex, columnIndex)] = style;
      });
      rows[rowIndex] = nextRow;
    });
    const normalized = normalizeTableRows(rows, sourceStyles);
    if (!normalized.rows.length) continue;
    if (sheets.length > 1) {
      blocks.push(makeBlock(sheetIndex === 0 ? 'heading1' : 'heading2', escapeHtml(sheet.name)));
    }
    const tableBlock = tableRowsToBlock(normalized.rows, makeBlock, normalized.cellStyles);
    if (tableBlock) blocks.push(tableBlock);
  }

  return normalizeResult({
    title: sheets[0]?.name || '',
    blocks,
    parser: 'xlsx-xml',
    warnings: blocks.length ? [] : ['未读取到 Excel 表格内容'],
  });
}

async function parseWorkbook(filePath, filename, ext) {
  const makeBlock = makeBlockFactory(filename);
  const blocks = [];
  if (['csv', 'tsv'].includes(ext)) {
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const normalized = normalizeTableRows(parseDelimitedRows(fs.readFileSync(filePath, 'utf8'), delimiter));
    const tableBlock = tableRowsToBlock(normalized.rows, makeBlock, normalized.cellStyles);
    if (tableBlock) blocks.push(tableBlock);
    return normalizeResult({ blocks, parser: ext });
  }
  return parseSpreadsheetXmlWorkbook(filePath, filename);
}

function stripRtfToText(value = '') {
  return String(value || '')
    .replace(/\\'([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\tab/gi, '\t')
    .replace(/[{}]/g, '')
    .replace(/\\[a-z]+\d* ?/gi, '')
    .replace(/\\[^a-z\s]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTextFile(filePath, filename, ext) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const text = ext === 'rtf' ? stripRtfToText(raw) : raw;
  return normalizeResult({
    blocks: parsePlainTextToBlocks(text, filename, { markdown: ['md', 'markdown'].includes(ext) }),
    parser: ext === 'rtf' ? 'rtf-text' : 'plain-text',
  });
}

function extractReadableStringsFromBuffer(buffer) {
  const utf8Text = buffer.toString('utf8').match(/[\p{L}\p{N}\p{P}\p{Zs}\t ]{6,}/gu)?.join('\n') || '';
  const utf16Text = buffer.toString('utf16le').match(/[\p{L}\p{N}\p{P}\p{Zs}\t ]{6,}/gu)?.join('\n') || '';
  return [utf8Text, utf16Text]
    .sort((a, b) => b.length - a.length)[0]
    .replace(/\u0000/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parsePptx(filePath, filename) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slidePaths = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0));
  const makeBlock = makeBlockFactory(filename);
  const blocks = [];
  for (let index = 0; index < slidePaths.length && blocks.length < MAX_BLOCKS; index += 1) {
    const xml = await zip.file(slidePaths[index]).async('string');
    const paragraphs = [];
    const paragraphMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/gi) || [];
    paragraphMatches.forEach(paragraphXml => {
      const text = (paragraphXml.match(/<a:t\b[^>]*>[\s\S]*?<\/a:t>/gi) || [])
        .map(item => decodeEntities(item.replace(/^<a:t\b[^>]*>/i, '').replace(/<\/a:t>$/i, '')))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) return;
      const isBullet = /<a:bu(?:Char|AutoNum)\b/i.test(paragraphXml);
      const level = Math.max(0, Math.min(4, Number(paragraphXml.match(/\slvl="(\d+)"/i)?.[1]) || 0));
      paragraphs.push({ text, isBullet, level });
    });
    if (!paragraphs.length) continue;
    blocks.push(makeBlock('heading2', escapeHtml(paragraphs[0].text || `幻灯片 ${index + 1}`)));
    paragraphs.slice(1).forEach(item => {
      blocks.push(makeBlock(item.isBullet ? 'bullet' : 'paragraph', escapeHtml(item.text), {
        meta: item.isBullet ? { indent: item.level } : {},
      }));
    });
  }
  return normalizeResult({
    blocks,
    warnings: slidePaths.length ? [] : ['未读取到 PPT 页面正文'],
    parser: 'pptx-xml',
  });
}

function getXmindChildren(topic = {}) {
  const children = topic.children || {};
  if (Array.isArray(children)) return children;
  return [
    ...(children.attached || []),
    ...(children.detached || []),
    ...(children.summary || []),
  ].filter(Boolean);
}

function appendXmindTopicBlocks(topic, blocks, makeBlock, depth = 0) {
  const title = String(topic?.title || topic?.text || '').trim();
  if (title) {
    blocks.push(makeBlock(depth === 0 ? 'heading1' : 'bullet', escapeHtml(title), {
      meta: depth === 0 ? {} : { indent: Math.min(depth - 1, 4) },
    }));
  }
  getXmindChildren(topic).forEach(child => appendXmindTopicBlocks(child, blocks, makeBlock, depth + 1));
}

async function parseXmind(filePath, filename) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const makeBlock = makeBlockFactory(filename);
  const blocks = [];
  const contentJson = zip.file('content.json');
  if (contentJson) {
    const parsed = JSON.parse(await contentJson.async('string'));
    const sheets = Array.isArray(parsed) ? parsed : [parsed];
    sheets.forEach(sheet => {
      if (sheet?.title && sheets.length > 1) blocks.push(makeBlock('heading2', escapeHtml(sheet.title)));
      appendXmindTopicBlocks(sheet.rootTopic || sheet.topic || sheet, blocks, makeBlock, 0);
    });
  } else {
    const contentXml = zip.file('content.xml');
    if (contentXml) {
      const xml = await contentXml.async('string');
      const titles = (xml.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi) || [])
        .map(item => decodeEntities(item.replace(/^<title\b[^>]*>/i, '').replace(/<\/title>$/i, '')).trim())
        .filter(Boolean);
      titles.forEach((title, index) => blocks.push(makeBlock(index === 0 ? 'heading1' : 'bullet', escapeHtml(title), {
        meta: index === 0 ? {} : { indent: 0 },
      })));
    }
  }
  return normalizeResult({
    blocks,
    warnings: blocks.length ? [] : ['未读取到 XMind 主题内容'],
    parser: 'xmind',
  });
}

function parseMindMapXml(filePath, filename) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const makeBlock = makeBlockFactory(filename);
  const blocks = [];
  const nodes = xml.match(/<node\b[^>]*>/gi) || [];
  nodes.forEach((node, index) => {
    const text = getTagAttribute(node, 'TEXT') || getTagAttribute(node, 'text') || getTagAttribute(node, 'label');
    if (!text) return;
    blocks.push(makeBlock(index === 0 ? 'heading1' : 'bullet', escapeHtml(text), {
      meta: index === 0 ? {} : { indent: 0 },
    }));
  });
  return normalizeResult({
    blocks,
    warnings: blocks.length ? [] : ['未读取到思维导图节点内容'],
    parser: 'mindmap-xml',
  });
}

function parseBinaryFallback(filePath, filename) {
  const text = extractReadableStringsFromBuffer(fs.readFileSync(filePath));
  return normalizeResult({
    blocks: parsePlainTextToBlocks(text, filename),
    warnings: text ? ['该格式使用兼容模式提取文字，版式可能无法完整保留'] : ['暂未解析出可展示正文，已保留原文件'],
    parser: 'binary-text',
  });
}

async function parseDocumentImportFileToBlocks({ filePath, filename, ext, mimetype }) {
  const safeExt = String(ext || path.extname(filename).slice(1)).toLowerCase();
  const name = String(filename || path.basename(filePath) || '导入文件');
  try {
    if (['docx', 'dotx', 'odt'].includes(safeExt)) return await parseDocx(filePath, name);
    if (safeExt === 'pdf') return await parsePdf(filePath, name);
    if (['xlsx', 'xlsm', 'csv', 'tsv'].includes(safeExt)) return await parseWorkbook(filePath, name, safeExt);
    if (['pptx', 'ppsx', 'odp'].includes(safeExt)) return await parsePptx(filePath, name);
    if (['txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml', 'rtf'].includes(safeExt) || String(mimetype || '').startsWith('text/')) {
      return parseTextFile(filePath, name, safeExt);
    }
    if (safeExt === 'xmind') return await parseXmind(filePath, name);
    if (['mind', 'mm', 'drawio'].includes(safeExt)) return parseMindMapXml(filePath, name);
    if (['doc', 'dot', 'xls', 'xlsb', 'ods', 'numbers', 'ppt', 'pps', 'pages', 'key', 'wps', 'wpt', 'et', 'ett', 'dps', 'dpt'].includes(safeExt)) {
      return parseBinaryFallback(filePath, name);
    }
    return normalizeResult({
      blocks: [],
      warnings: ['暂不支持直接解析该格式正文，已保留原文件'],
      parser: 'unsupported',
    });
  } catch (error) {
    return normalizeResult({
      blocks: [],
      warnings: [`解析失败：${error.message || '未知错误'}`],
      parser: 'failed',
    });
  }
}

module.exports = {
  parseDocumentImportFileToBlocks,
  collectBlocksText,
};
