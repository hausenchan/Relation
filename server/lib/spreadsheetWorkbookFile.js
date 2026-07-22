const fs = require('fs');
const path = require('path');

const JSZip = require('jszip');

const WORKBOOK_FORMAT = 'relation_spreadsheet_workbook_v1';
const MAX_IMPORT_ROWS = 100000;
const MAX_IMPORT_COLUMNS = 2000;
const MAX_IMPORT_CELLS = 300000;
const MAX_IMPORT_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_SHEET_NAME_LENGTH = 31;
const MAX_SEARCH_TEXT_LENGTH = 20000;
const INVALID_SHEET_NAME_CHARACTERS = /[\\/*?:\[\]]/;

function spreadsheetWorkbookValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isSpreadsheetWorkbookValue(workbookValue) {
  if (workbookValue && typeof workbookValue === 'object') return workbookValue.format === WORKBOOK_FORMAT;
  if (typeof workbookValue !== 'string') return false;
  try {
    return JSON.parse(workbookValue)?.format === WORKBOOK_FORMAT;
  } catch {
    return false;
  }
}

function validateSpreadsheetWorkbookSheetNames(workbookValue) {
  let workbook = workbookValue;
  if (typeof workbookValue === 'string') {
    try {
      workbook = JSON.parse(workbookValue);
    } catch {
      throw spreadsheetWorkbookValidationError('在线表格工作簿格式不合法');
    }
  }
  if (!workbook || workbook.format !== WORKBOOK_FORMAT || !Array.isArray(workbook.sheets) || !workbook.sheets.length) {
    throw spreadsheetWorkbookValidationError('在线表格工作簿格式不合法');
  }
  const usedNames = new Set();
  const usedIds = new Set();
  workbook.sheets.forEach(sheet => {
    const id = String(sheet?.id ?? '').trim();
    if (!id) throw spreadsheetWorkbookValidationError('工作表 ID 不能为空');
    if (usedIds.has(id)) throw spreadsheetWorkbookValidationError('工作表 ID 不能重复');
    usedIds.add(id);
    const name = String(sheet?.name ?? '').trim();
    if (!name) throw spreadsheetWorkbookValidationError('工作表名称不能为空');
    if (Array.from(name).length > MAX_SHEET_NAME_LENGTH) {
      throw spreadsheetWorkbookValidationError(`工作表名称不能超过 ${MAX_SHEET_NAME_LENGTH} 个字符`);
    }
    if (INVALID_SHEET_NAME_CHARACTERS.test(name)) {
      throw spreadsheetWorkbookValidationError('工作表名称不能包含 \\ / ? * [ ] :');
    }
    if (name.startsWith("'") || name.endsWith("'")) {
      throw spreadsheetWorkbookValidationError('工作表名称不能以英文单引号开头或结尾');
    }
    const key = name.toLocaleLowerCase('zh-CN');
    if (usedNames.has(key)) throw spreadsheetWorkbookValidationError('工作表名称不能重复');
    usedNames.add(key);
  });
  if (!usedIds.has(String(workbook.activeSheetId ?? '').trim())) {
    throw spreadsheetWorkbookValidationError('活动工作表不存在');
  }
  return workbook;
}

function decodeXml(value = '') {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function escapeXml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getAttribute(fragment = '', name = '') {
  const match = String(fragment || '').match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return decodeXml(match?.[1] ?? match?.[2] ?? '');
}

function columnLabel(index) {
  let value = Math.max(0, Number(index) || 0) + 1;
  let label = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    label = String.fromCharCode(65 + mod) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label || 'A';
}

function columnIndex(label) {
  const normalized = String(label || '').replace(/\$/g, '').toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return -1;
  return normalized.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function parseCellReference(reference) {
  const match = String(reference || '').match(/^\$?([A-Z]+)\$?([1-9]\d*)$/i);
  if (!match) return null;
  return { rowIndex: Number(match[2]) - 1, columnIndex: columnIndex(match[1]) };
}

function buildCellReference(rowIndex, columnIndexValue) {
  return `${columnLabel(columnIndexValue)}${rowIndex + 1}`;
}

function parseRangeReference(reference) {
  const [startText, endText = startText] = String(reference || '').split(':');
  const start = parseCellReference(startText);
  const end = parseCellReference(endText);
  if (!start || !end) return null;
  return {
    startRow: Math.min(start.rowIndex, end.rowIndex),
    endRow: Math.max(start.rowIndex, end.rowIndex),
    startColumn: Math.min(start.columnIndex, end.columnIndex),
    endColumn: Math.max(start.columnIndex, end.columnIndex),
  };
}

function buildRangeReference(range) {
  return `${buildCellReference(range.startRow, range.startColumn)}:${buildCellReference(range.endRow, range.endColumn)}`;
}

function parseSharedStrings(xml) {
  return (String(xml || '').match(/<si\b[\s\S]*?<\/si>/gi) || []).map(fragment => (
    (fragment.match(/<t\b[^>]*>[\s\S]*?<\/t>/gi) || [])
      .map(text => decodeXml(text.replace(/^<t\b[^>]*>/i, '').replace(/<\/t>$/i, '')))
      .join('')
  ));
}

function normalizeColor(value = '') {
  const hex = String(value || '').replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{8}$/.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9A-F]{6}$/.test(hex)) return `#${hex}`;
  return '';
}

function parseStyles(xml) {
  const fontsFragment = String(xml || '').match(/<fonts\b[\s\S]*?<\/fonts>/i)?.[0] || '';
  const fillsFragment = String(xml || '').match(/<fills\b[\s\S]*?<\/fills>/i)?.[0] || '';
  const xfsFragment = String(xml || '').match(/<cellXfs\b[\s\S]*?<\/cellXfs>/i)?.[0] || '';
  const fonts = (fontsFragment.match(/<font\b[\s\S]*?<\/font>/gi) || []).map(font => ({
    bold: /<b(?:\s[^>]*)?\s*\/?\s*>/i.test(font),
  }));
  const fills = (fillsFragment.match(/<fill\b[\s\S]*?<\/fill>/gi) || []).map(fill => {
    const foreground = fill.match(/<fgColor\b[^>]*\/?\s*>/i)?.[0] || '';
    return { backgroundColor: normalizeColor(getAttribute(foreground, 'rgb')) };
  });
  return (xfsFragment.match(/<xf\b[^>]*\/?\s*>/gi) || []).map(xf => {
    const font = fonts[Number(getAttribute(xf, 'fontId')) || 0] || {};
    const fill = fills[Number(getAttribute(xf, 'fillId')) || 0] || {};
    return {
      ...(font.bold ? { bold: true } : {}),
      ...(fill.backgroundColor ? { backgroundColor: fill.backgroundColor } : {}),
    };
  });
}

function resolveRelationshipTarget(target = '') {
  const normalized = String(target || '').replace(/\\/g, '/');
  if (normalized.startsWith('/')) return normalized.replace(/^\/+/, '');
  return path.posix.normalize(path.posix.join('xl', normalized));
}

function parseRelationships(xml) {
  const result = {};
  (String(xml || '').match(/<Relationship\b[^>]*\/?\s*>/gi) || []).forEach(fragment => {
    const id = getAttribute(fragment, 'Id');
    const target = getAttribute(fragment, 'Target');
    if (id && target) result[id] = resolveRelationshipTarget(target);
  });
  return result;
}

function parseWorkbookSheetList(xml, relationships, zip) {
  const sheets = (String(xml || '').match(/<sheet\b[^>]*\/?\s*>/gi) || []).map((fragment, index) => ({
    name: getAttribute(fragment, 'name') || `工作表${index + 1}`,
    path: relationships[getAttribute(fragment, 'r:id')] || `xl/worksheets/sheet${index + 1}.xml`,
  }));
  if (sheets.length) return sheets;
  return Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => Number(left.match(/sheet(\d+)/i)?.[1] || 0) - Number(right.match(/sheet(\d+)/i)?.[1] || 0))
    .map((sheetPath, index) => ({ name: `工作表${index + 1}`, path: sheetPath }));
}

function translateSharedFormula(formula, baseReference, targetReference) {
  const base = parseCellReference(baseReference);
  const target = parseCellReference(targetReference);
  if (!base || !target) return formula;
  const rowDelta = target.rowIndex - base.rowIndex;
  const columnDelta = target.columnIndex - base.columnIndex;
  return String(formula || '').replace(/(\$?)([A-Z]{1,4})(\$?)([1-9]\d*)/gi, (match, absoluteColumn, label, absoluteRow, rowText) => {
    const rowIndex = Number(rowText) - 1 + (absoluteRow ? 0 : rowDelta);
    const columnIndexValue = columnIndex(label) + (absoluteColumn ? 0 : columnDelta);
    if (rowIndex < 0 || columnIndexValue < 0) return '#REF!';
    return `${absoluteColumn}${columnLabel(columnIndexValue)}${absoluteRow}${rowIndex + 1}`;
  });
}

function parseCellValue(fragment, sharedStrings, reference, sharedFormulas) {
  const opening = fragment.match(/^<c\b[^>]*>/i)?.[0] || fragment.match(/^<c\b[^>]*\/>/i)?.[0] || '';
  const type = getAttribute(opening, 't');
  const formulaFragment = fragment.match(/<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/i)?.[0] || '';
  const formulaOpening = formulaFragment.match(/^<f\b[^>]*>/i)?.[0] || formulaFragment;
  let formula = decodeXml(formulaFragment.replace(/^<f\b[^>]*>/i, '').replace(/<\/f>$/i, '')).trim();
  if (getAttribute(formulaOpening, 't') === 'shared') {
    const sharedIndex = getAttribute(formulaOpening, 'si');
    if (formula && sharedIndex) sharedFormulas.set(sharedIndex, { formula, reference });
    else if (sharedIndex && sharedFormulas.has(sharedIndex)) {
      const shared = sharedFormulas.get(sharedIndex);
      formula = translateSharedFormula(shared.formula, shared.reference, reference);
    }
  }
  const raw = decodeXml(fragment.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || '');
  let value = raw;
  if (type === 'inlineStr') {
    value = (fragment.match(/<t\b[^>]*>[\s\S]*?<\/t>/gi) || [])
      .map(text => decodeXml(text.replace(/^<t\b[^>]*>/i, '').replace(/<\/t>$/i, '')))
      .join('');
  } else if (type === 's') value = sharedStrings[Number(raw)] ?? '';
  else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
  else if (type === 'str') value = raw;
  return { value: formula ? `=${formula}` : value, computed: formula ? raw : undefined };
}

function parseWorksheet(xml, index, name, sharedStrings, styles) {
  const cells = {};
  const rowHeights = {};
  const columnWidths = {};
  const mergedCells = [];
  let maxRow = 0;
  let maxColumn = 0;
  let cellCount = 0;
  const sharedFormulas = new Map();

  (String(xml || '').match(/<row\b[\s\S]*?<\/row>/gi) || []).forEach((rowFragment, fallbackRowIndex) => {
    const rowOpening = rowFragment.match(/^<row\b[^>]*>/i)?.[0] || '';
    const rowIndex = Math.max(0, (Number(getAttribute(rowOpening, 'r')) || fallbackRowIndex + 1) - 1);
    if (rowIndex >= MAX_IMPORT_ROWS) throw new Error(`Excel 行数超过 ${MAX_IMPORT_ROWS} 行限制`);
    const height = Number(getAttribute(rowOpening, 'ht'));
    if (Number.isFinite(height) && height > 0) rowHeights[rowIndex] = Math.round(height * 4 / 3);
    (rowFragment.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/gi) || []).forEach((cellFragment, fallbackColumnIndex) => {
      cellCount += 1;
      if (cellCount > MAX_IMPORT_CELLS) throw new Error(`Excel 非空单元格超过 ${MAX_IMPORT_CELLS} 个限制`);
      const opening = cellFragment.match(/^<c\b[^>]*>/i)?.[0] || cellFragment;
      const reference = getAttribute(opening, 'r') || buildCellReference(rowIndex, fallbackColumnIndex);
      const parsed = parseCellReference(reference);
      if (!parsed || parsed.columnIndex >= MAX_IMPORT_COLUMNS) {
        if (parsed?.columnIndex >= MAX_IMPORT_COLUMNS) throw new Error(`Excel 列数超过 ${MAX_IMPORT_COLUMNS} 列限制`);
        return;
      }
      const parsedValue = parseCellValue(cellFragment, sharedStrings, reference, sharedFormulas);
      const style = styles[Number(getAttribute(opening, 's')) || 0] || {};
      if (parsedValue.value === '' && !Object.keys(style).length) return;
      cells[buildCellReference(parsed.rowIndex, parsed.columnIndex)] = {
        v: parsedValue.value,
        ...(parsedValue.computed !== undefined ? { computed: parsedValue.computed } : {}),
        ...(Object.keys(style).length ? { style } : {}),
      };
      maxRow = Math.max(maxRow, parsed.rowIndex);
      maxColumn = Math.max(maxColumn, parsed.columnIndex);
    });
  });

  const columnsFragment = String(xml || '').match(/<cols\b[\s\S]*?<\/cols>/i)?.[0] || '';
  (columnsFragment.match(/<col\b[^>]*\/?\s*>/gi) || []).forEach(fragment => {
    const start = Math.max(1, Number(getAttribute(fragment, 'min')) || 1);
    const end = Math.min(MAX_IMPORT_COLUMNS, Number(getAttribute(fragment, 'max')) || start);
    const width = Number(getAttribute(fragment, 'width'));
    if (!Number.isFinite(width) || width <= 0) return;
    for (let column = start - 1; column < end; column += 1) columnWidths[column] = Math.round(width * 7 + 5);
  });

  (String(xml || '').match(/<mergeCell\b[^>]*\/?\s*>/gi) || []).forEach(fragment => {
    const range = parseRangeReference(getAttribute(fragment, 'ref'));
    if (!range) return;
    mergedCells.push(range);
    maxRow = Math.max(maxRow, range.endRow);
    maxColumn = Math.max(maxColumn, range.endColumn);
  });

  const pane = String(xml || '').match(/<pane\b[^>]*\/?\s*>/i)?.[0] || '';
  const frozen = /state="frozen"/i.test(pane)
    ? {
      rows: Math.max(0, Number(getAttribute(pane, 'ySplit')) || 0),
      columns: Math.max(0, Number(getAttribute(pane, 'xSplit')) || 0),
    }
    : null;
  const autoFilter = String(xml || '').match(/<autoFilter\b[^>]*\/?\s*>/i)?.[0] || '';
  const filterRange = parseRangeReference(getAttribute(autoFilter, 'ref'));

  return {
    id: `sheet_${index + 1}`,
    name: String(name || `工作表${index + 1}`).slice(0, 31),
    rowCount: Math.max(1000, maxRow + 1),
    columnCount: Math.max(26, maxColumn + 1),
    cells,
    rowHeights,
    columnWidths,
    mergedCells,
    filters: [],
    ...(filterRange ? { filterRange } : {}),
    frozen: frozen?.rows || frozen?.columns ? frozen : null,
  };
}

async function parseSpreadsheetWorkbookBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const uncompressedBytes = Object.values(zip.files).reduce((sum, file) => (
    sum + (Number(file?._data?.uncompressedSize) || 0)
  ), 0);
  if (uncompressedBytes > MAX_IMPORT_UNCOMPRESSED_BYTES) {
    throw new Error('Excel 解压后超过 200MB 限制');
  }
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string').catch(() => '') || '';
  const stylesXml = await zip.file('xl/styles.xml')?.async('string').catch(() => '') || '';
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string').catch(() => '') || '';
  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string').catch(() => '') || '';
  if (!workbookXml) throw new Error('文件不是有效的 Excel 工作簿');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const styles = parseStyles(stylesXml);
  const sheetList = parseWorkbookSheetList(workbookXml, parseRelationships(relationshipsXml), zip);
  if (!sheetList.length) throw new Error('Excel 工作簿中没有可读取的工作表');
  const sheets = [];
  for (let index = 0; index < sheetList.length; index += 1) {
    const source = sheetList[index];
    const worksheetFile = zip.file(source.path);
    if (!worksheetFile) continue;
    sheets.push(parseWorksheet(await worksheetFile.async('string'), index, source.name, sharedStrings, styles));
  }
  if (!sheets.length) throw new Error('Excel 工作簿中没有可读取的数据');
  const activeTab = Math.max(0, Number(workbookXml.match(/<workbookView\b[^>]*activeTab="(\d+)"/i)?.[1]) || 0);
  return {
    format: WORKBOOK_FORMAT,
    activeSheetId: sheets[Math.min(activeTab, sheets.length - 1)].id,
    sheets,
    styles: {},
    definedNames: {},
  };
}

async function parseSpreadsheetWorkbookFile(filePath) {
  return parseSpreadsheetWorkbookBuffer(fs.readFileSync(filePath));
}

function parseWorkbookInput(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || parsed.format !== WORKBOOK_FORMAT || !Array.isArray(parsed.sheets) || !parsed.sheets.length) {
    throw new Error('在线表格工作簿格式不合法');
  }
  return parsed;
}

function getCellRawValue(cell) {
  if (cell && typeof cell === 'object') return cell.v ?? cell.value ?? '';
  return cell ?? '';
}

function spreadsheetWorkbookToSearchText(workbookValue) {
  const workbook = parseWorkbookInput(workbookValue);
  let result = '';
  const append = (value) => {
    const text = String(value ?? '').trim();
    if (!text || result.length >= MAX_SEARCH_TEXT_LENGTH) return;
    const prefix = result ? '\n' : '';
    result += `${prefix}${text}`.slice(0, MAX_SEARCH_TEXT_LENGTH - result.length);
  };

  for (const sheet of workbook.sheets) {
    append(sheet?.name);
    const cells = Object.entries(sheet?.cells || {})
      .map(([reference, cell]) => ({ reference: parseCellReference(reference), cell }))
      .filter(item => item.reference)
      .sort((left, right) => (
        left.reference.rowIndex - right.reference.rowIndex
        || left.reference.columnIndex - right.reference.columnIndex
      ));
    for (const { reference, cell } of cells) {
      const value = String(getCellRawValue(cell) ?? '').trim();
      if (!value) continue;
      append(`${buildCellReference(reference.rowIndex, reference.columnIndex)} ${value}`);
      if (result.length >= MAX_SEARCH_TEXT_LENGTH) break;
    }
    if (result.length >= MAX_SEARCH_TEXT_LENGTH) break;
  }
  return result;
}

function usedRangeForSheet(sheet) {
  let maxRow = 0;
  let maxColumn = 0;
  Object.keys(sheet.cells || {}).forEach(reference => {
    const parsed = parseCellReference(reference);
    if (!parsed) return;
    maxRow = Math.max(maxRow, parsed.rowIndex);
    maxColumn = Math.max(maxColumn, parsed.columnIndex);
  });
  (sheet.mergedCells || []).forEach(range => {
    maxRow = Math.max(maxRow, Number(range.endRow) || 0);
    maxColumn = Math.max(maxColumn, Number(range.endColumn) || 0);
  });
  return { startRow: 0, endRow: maxRow, startColumn: 0, endColumn: maxColumn };
}

function normalizeSheetName(name, index, usedNames) {
  const base = String(name || `工作表${index + 1}`).replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || `工作表${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const tail = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function styleKey(style = {}) {
  return JSON.stringify({
    bold: Boolean(style.bold),
    backgroundColor: normalizeColor(style.backgroundColor),
  });
}

function buildStyleTable(workbook) {
  const styles = [{ bold: false, backgroundColor: '' }];
  const indexByKey = new Map([[styleKey(styles[0]), 0]]);
  workbook.sheets.forEach(sheet => Object.values(sheet.cells || {}).forEach(cell => {
    const style = cell && typeof cell === 'object' ? (cell.style || {}) : {};
    const key = styleKey(style);
    if (indexByKey.has(key)) return;
    indexByKey.set(key, styles.length);
    styles.push({ bold: Boolean(style.bold), backgroundColor: normalizeColor(style.backgroundColor) });
  }));
  const fonts = [{ bold: false }];
  const fills = [{ type: 'none' }, { type: 'gray125' }];
  const fontIndexByBold = new Map([[false, 0]]);
  const fillIndexByColor = new Map([['', 0]]);
  styles.forEach(style => {
    if (!fontIndexByBold.has(style.bold)) {
      fontIndexByBold.set(style.bold, fonts.length);
      fonts.push({ bold: style.bold });
    }
    if (style.backgroundColor && !fillIndexByColor.has(style.backgroundColor)) {
      fillIndexByColor.set(style.backgroundColor, fills.length);
      fills.push({ type: 'solid', color: style.backgroundColor });
    }
  });
  return { styles, indexByKey, fonts, fills, fontIndexByBold, fillIndexByColor };
}

function buildStylesXml(table) {
  const fonts = table.fonts.map(font => `<font>${font.bold ? '<b/>' : ''}<sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>`).join('');
  const fills = table.fills.map(fill => {
    if (fill.type === 'none') return '<fill><patternFill patternType="none"/></fill>';
    if (fill.type === 'gray125') return '<fill><patternFill patternType="gray125"/></fill>';
    return `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill.color.replace('#', '')}"/><bgColor indexed="64"/></patternFill></fill>`;
  }).join('');
  const xfs = table.styles.map(style => {
    const fontId = table.fontIndexByBold.get(style.bold) || 0;
    const fillId = table.fillIndexByColor.get(style.backgroundColor) || 0;
    return `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${fillId ? ' applyFill="1"' : ''}${fontId ? ' applyFont="1"' : ''}/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${table.fonts.length}">${fonts}</fonts><fills count="${table.fills.length}">${fills}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${table.styles.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function numericCellValue(value) {
  const text = String(value ?? '');
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return null;
  if (/^-?0\d+/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function buildCellXml(reference, cell, styleIndex) {
  const raw = getCellRawValue(cell);
  const styleAttribute = styleIndex ? ` s="${styleIndex}"` : '';
  if (typeof raw === 'string' && raw.startsWith('=')) {
    return `<c r="${reference}"${styleAttribute}><f>${escapeXml(raw.slice(1))}</f></c>`;
  }
  if (/^(TRUE|FALSE)$/i.test(String(raw))) {
    return `<c r="${reference}"${styleAttribute} t="b"><v>${/^TRUE$/i.test(String(raw)) ? 1 : 0}</v></c>`;
  }
  const numeric = numericCellValue(raw);
  if (numeric !== null) return `<c r="${reference}"${styleAttribute}><v>${numeric}</v></c>`;
  if (raw === '' && !styleIndex) return '';
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(raw)}</t></is></c>`;
}

function buildWorksheetXml(sheet, styleTable) {
  const usedRange = usedRangeForSheet(sheet);
  const rows = new Map();
  Object.entries(sheet.cells || {}).forEach(([reference, cell]) => {
    const parsed = parseCellReference(reference);
    if (!parsed) return;
    const style = cell && typeof cell === 'object' ? (cell.style || {}) : {};
    const styleIndex = styleTable.indexByKey.get(styleKey(style)) || 0;
    const xml = buildCellXml(buildCellReference(parsed.rowIndex, parsed.columnIndex), cell, styleIndex);
    if (!xml) return;
    if (!rows.has(parsed.rowIndex)) rows.set(parsed.rowIndex, []);
    rows.get(parsed.rowIndex).push({ columnIndex: parsed.columnIndex, xml });
  });
  Object.keys(sheet.rowHeights || {}).forEach(key => {
    const rowIndex = Number(key);
    if (Number.isFinite(rowIndex) && !rows.has(rowIndex)) rows.set(rowIndex, []);
  });
  const sheetData = [...rows.entries()].sort((left, right) => left[0] - right[0]).map(([rowIndex, cells]) => {
    const height = Number(sheet.rowHeights?.[rowIndex]);
    const heightAttributes = Number.isFinite(height) && height > 0 ? ` ht="${(height * 3 / 4).toFixed(2)}" customHeight="1"` : '';
    return `<row r="${rowIndex + 1}"${heightAttributes}>${cells.sort((left, right) => left.columnIndex - right.columnIndex).map(item => item.xml).join('')}</row>`;
  }).join('');
  const columns = Object.entries(sheet.columnWidths || {}).map(([index, pixels]) => {
    const column = Number(index) + 1;
    const width = Math.max(1, (Number(pixels) - 5) / 7);
    return `<col min="${column}" max="${column}" width="${width.toFixed(2)}" customWidth="1"/>`;
  }).join('');
  const frozenRows = Math.max(0, Number(sheet.frozen?.rows) || 0);
  const frozenColumns = Math.max(0, Number(sheet.frozen?.columns) || 0);
  const pane = frozenRows || frozenColumns
    ? `<pane${frozenColumns ? ` xSplit="${frozenColumns}"` : ''}${frozenRows ? ` ySplit="${frozenRows}"` : ''} topLeftCell="${buildCellReference(frozenRows, frozenColumns)}" activePane="bottomRight" state="frozen"/>`
    : '';
  const merges = (sheet.mergedCells || []).map(range => `<mergeCell ref="${buildRangeReference(range)}"/>`).join('');
  const autoFilterRange = sheet.filterRange || ((sheet.filters || []).length ? usedRange : null);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${buildRangeReference(usedRange)}"/><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${columns ? `<cols>${columns}</cols>` : ''}<sheetData>${sheetData}</sheetData>${autoFilterRange ? `<autoFilter ref="${buildRangeReference(autoFilterRange)}"/>` : ''}${merges ? `<mergeCells count="${sheet.mergedCells.length}">${merges}</mergeCells>` : ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

async function buildSpreadsheetWorkbookXlsx(workbookValue) {
  const workbook = parseWorkbookInput(workbookValue);
  const zip = new JSZip();
  const usedNames = new Set();
  const sheets = workbook.sheets.map((sheet, index) => ({ ...sheet, exportName: normalizeSheetName(sheet.name, index, usedNames) }));
  const activeSheetIndex = Math.max(0, sheets.findIndex(sheet => sheet.id === workbook.activeSheetId));
  const styleTable = buildStyleTable({ ...workbook, sheets });
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${activeSheetIndex}"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.exportName)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', buildStylesXml(styleTable));
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, buildWorksheetXml(sheet, styleTable)));
  const now = new Date().toISOString();
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Relation</dc:creator><cp:lastModifiedBy>Relation</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Relation</Application><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map(sheet => `<vt:lpstr>${escapeXml(sheet.exportName)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

module.exports = {
  WORKBOOK_FORMAT,
  buildSpreadsheetWorkbookXlsx,
  parseSpreadsheetWorkbookBuffer,
  parseSpreadsheetWorkbookFile,
  isSpreadsheetWorkbookValue,
  spreadsheetWorkbookToSearchText,
  validateSpreadsheetWorkbookSheetNames,
};
