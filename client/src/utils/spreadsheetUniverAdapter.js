import {
  SPREADSHEET_WORKBOOK_FORMAT,
  buildSpreadsheetCellKey,
  createDefaultSpreadsheetWorkbook,
  normalizeSpreadsheetWorkbook,
  parseSpreadsheetCellKey,
} from './spreadsheetWorkbook';

export const UNIVER_SPREADSHEET_WORKBOOK_FORMAT = 'relation_univer_spreadsheet_workbook_v1';
export const RELATION_UNIVER_ENGINE = 'univer';
export const RELATION_UNIVER_ENGINE_VERSION = '0.25.1';

const UNIVER_APP_VERSION = '3.0.0-alpha';
const BOOLEAN_FALSE = 0;
const CELL_TYPE_STRING = 1;
const CELL_TYPE_NUMBER = 2;
const CELL_TYPE_BOOLEAN = 3;
const DEFAULT_UNIVER_ROW_HEIGHT = 24;
const DEFAULT_UNIVER_COLUMN_WIDTH = 100;
const DEFAULT_UNIVER_ROW_HEADER_WIDTH = 46;
const DEFAULT_UNIVER_COLUMN_HEADER_HEIGHT = 24;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJsonValue(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function inferUniverCellType(value) {
  if (typeof value === 'number') return CELL_TYPE_NUMBER;
  if (typeof value === 'boolean') return CELL_TYPE_BOOLEAN;
  return CELL_TYPE_STRING;
}

function relationCellToUniverCell(cell) {
  const rawValue = cell && typeof cell === 'object' ? (cell.v ?? cell.value ?? '') : cell;
  const normalizedValue = normalizeCellValue(rawValue);
  const style = cell && typeof cell === 'object' ? cell.style : null;
  const result = {};

  if (typeof normalizedValue === 'string' && normalizedValue.startsWith('=')) {
    result.f = normalizedValue;
  } else {
    result.v = normalizedValue;
    result.t = inferUniverCellType(normalizedValue);
  }

  if (style && typeof style === 'object' && Object.keys(style).length) {
    result.s = {
      bl: style.bold ? 1 : undefined,
      it: style.italic ? 1 : undefined,
      ul: style.underline ? { s: 1 } : undefined,
      bg: style.backgroundColor ? { rgb: style.backgroundColor } : undefined,
      cl: style.color ? { rgb: style.color } : undefined,
      ht: style.align === 'center' ? 2 : style.align === 'right' ? 3 : undefined,
    };
  }

  return result;
}

function univerCellToRelationCell(cell) {
  if (!cell || typeof cell !== 'object') return null;
  const rawValue = cell.f || cell.v;
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  return { v: rawValue };
}

function buildUniverWorksheet(sheet, index) {
  const rowData = {};
  const columnData = {};
  const cellData = {};
  const rowCount = Math.max(20, Number(sheet.rowCount) || 1000);
  const columnCount = Math.max(10, Number(sheet.columnCount) || 26);
  const frozenRows = Math.max(0, Math.min(rowCount, Number(sheet.frozen?.rows) || 0));
  const frozenColumns = Math.max(0, Math.min(columnCount, Number(sheet.frozen?.columns) || 0));

  Object.entries(sheet.rowHeights || {}).forEach(([key, value]) => {
    const indexValue = Number(key);
    const height = Number(value);
    if (Number.isInteger(indexValue) && indexValue >= 0 && Number.isFinite(height) && height > 0) {
      rowData[indexValue] = { h: height };
    }
  });
  Object.entries(sheet.columnWidths || {}).forEach(([key, value]) => {
    const indexValue = Number(key);
    const width = Number(value);
    if (Number.isInteger(indexValue) && indexValue >= 0 && Number.isFinite(width) && width > 0) {
      columnData[indexValue] = { w: width };
    }
  });
  Object.entries(sheet.cells || {}).forEach(([reference, cell]) => {
    const position = parseSpreadsheetCellKey(reference);
    if (!position) return;
    const row = position.rowIndex;
    const column = position.columnIndex;
    if (!cellData[row]) cellData[row] = {};
    cellData[row][column] = relationCellToUniverCell(cell);
  });

  return {
    id: String(sheet.id || `sheet_${index + 1}`),
    name: String(sheet.name || `工作表${index + 1}`),
    tabColor: '',
    hidden: BOOLEAN_FALSE,
    rowCount,
    columnCount,
    freeze: {
      xSplit: frozenColumns,
      ySplit: frozenRows,
      startRow: frozenRows,
      startColumn: frozenColumns,
    },
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: DEFAULT_UNIVER_COLUMN_WIDTH,
    defaultRowHeight: DEFAULT_UNIVER_ROW_HEIGHT,
    mergeData: (sheet.mergedCells || []).map(range => ({
      startRow: Number(range.startRow) || 0,
      endRow: Number(range.endRow) || 0,
      startColumn: Number(range.startColumn) || 0,
      endColumn: Number(range.endColumn) || 0,
      rangeType: 0,
    })),
    cellData,
    rowData,
    columnData,
    rowHeader: { width: DEFAULT_UNIVER_ROW_HEADER_WIDTH },
    columnHeader: { height: DEFAULT_UNIVER_COLUMN_HEADER_HEIGHT },
    showGridlines: 1,
    gridlinesColor: '#e6e8eb',
    rightToLeft: BOOLEAN_FALSE,
  };
}

export function relationWorkbookToUniverSnapshot(workbookValue, options = {}) {
  const parsed = parseJsonValue(workbookValue, null);
  if (parsed?.format === UNIVER_SPREADSHEET_WORKBOOK_FORMAT && parsed.snapshot) {
    return clone(parsed.snapshot);
  }

  const workbook = normalizeSpreadsheetWorkbook(parsed || createDefaultSpreadsheetWorkbook());
  const sheetOrder = workbook.sheets.map(sheet => String(sheet.id));
  const sheets = {};
  workbook.sheets.forEach((sheet, index) => {
    sheets[String(sheet.id)] = buildUniverWorksheet(sheet, index);
  });

  return {
    id: String(options.workbookId || 'relation_univer_workbook'),
    name: String(options.name || '在线表格'),
    appVersion: UNIVER_APP_VERSION,
    locale: 'zhCN',
    styles: {},
    sheetOrder,
    sheets,
    custom: {
      relationFormat: SPREADSHEET_WORKBOOK_FORMAT,
      activeSheetId: workbook.activeSheetId,
    },
  };
}

export function univerSnapshotToRelationWorkbook(snapshotValue) {
  const snapshot = parseJsonValue(snapshotValue, null);
  if (!snapshot || !snapshot.sheets || !Array.isArray(snapshot.sheetOrder)) {
    return createDefaultSpreadsheetWorkbook();
  }

  const sheets = snapshot.sheetOrder
    .map((sheetId, index) => {
      const sheet = snapshot.sheets?.[sheetId];
      if (!sheet) return null;
      const cells = {};
      const rowHeights = {};
      const columnWidths = {};
      Object.entries(sheet.cellData || {}).forEach(([rowKey, row]) => {
        Object.entries(row || {}).forEach(([columnKey, cell]) => {
          const relationCell = univerCellToRelationCell(cell);
          if (!relationCell) return;
          cells[buildSpreadsheetCellKey(Number(rowKey), Number(columnKey))] = relationCell;
        });
      });
      Object.entries(sheet.rowData || {}).forEach(([rowKey, row]) => {
        const height = Number(row?.h || row?.ah);
        if (Number.isFinite(height) && height > 0) rowHeights[rowKey] = height;
      });
      Object.entries(sheet.columnData || {}).forEach(([columnKey, column]) => {
        const width = Number(column?.w);
        if (Number.isFinite(width) && width > 0) columnWidths[columnKey] = width;
      });
      const freeze = sheet.freeze || {};
      const frozenRows = Math.max(0, Number(freeze.ySplit) || 0);
      const frozenColumns = Math.max(0, Number(freeze.xSplit) || 0);
      return {
        id: String(sheet.id || sheetId || `sheet_${index + 1}`),
        name: String(sheet.name || `工作表${index + 1}`),
        rowCount: Math.max(20, Number(sheet.rowCount) || 1000),
        columnCount: Math.max(10, Number(sheet.columnCount) || 26),
        cells,
        rowHeights,
        columnWidths,
        mergedCells: (sheet.mergeData || []).map(range => ({
          startRow: Number(range.startRow) || 0,
          endRow: Number(range.endRow) || 0,
          startColumn: Number(range.startColumn) || 0,
          endColumn: Number(range.endColumn) || 0,
        })),
        filters: [],
        frozen: frozenRows || frozenColumns ? { rows: frozenRows, columns: frozenColumns } : null,
      };
    })
    .filter(Boolean);

  const activeSheetId = String(snapshot.custom?.activeSheetId || sheets[0]?.id || '');
  return normalizeSpreadsheetWorkbook({
    format: SPREADSHEET_WORKBOOK_FORMAT,
    activeSheetId: sheets.some(sheet => sheet.id === activeSheetId) ? activeSheetId : sheets[0]?.id,
    sheets: sheets.length ? sheets : createDefaultSpreadsheetWorkbook().sheets,
    styles: {},
    definedNames: {},
  });
}

export function wrapUniverSnapshotForRelation(snapshot, relationMeta = {}) {
  return {
    format: UNIVER_SPREADSHEET_WORKBOOK_FORMAT,
    engine: RELATION_UNIVER_ENGINE,
    engineVersion: RELATION_UNIVER_ENGINE_VERSION,
    snapshot: clone(snapshot),
    relationMeta: {
      activeSheetId: snapshot?.custom?.activeSheetId || snapshot?.sheetOrder?.[0] || 'sheet_1',
      attachments: {},
      ...relationMeta,
    },
  };
}
