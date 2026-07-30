import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  BorderInnerOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  CheckOutlined,
  ClearOutlined,
  DeleteColumnOutlined,
  DeleteRowOutlined,
  DownloadOutlined,
  FilterOutlined,
  FormatPainterOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  FunctionOutlined,
  InsertRowAboveOutlined,
  InsertRowRightOutlined,
  LockOutlined,
  MenuOutlined,
  MergeCellsOutlined,
  MinusOutlined,
  PlusOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  TableOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Checkbox, Dropdown, Input, InputNumber, Modal, Select, Tooltip, Typography, message } from 'antd';
import MentionPicker, { preloadMentionCandidates, scheduleMentionNotification } from './MentionPicker';
import {
  SpreadsheetConditionalFormatDialog,
  SpreadsheetDataValidationDialog,
  SpreadsheetProtectionDialog,
} from './SpreadsheetRuleDialogs';
import './SpreadsheetDocumentEditor.css';
import {
  applySpreadsheetFormatPattern,
  buildSpreadsheetCellKey,
  createDefaultSpreadsheetSheet,
  createSpreadsheetFormatPattern,
  createSpreadsheetFormulaEvaluator,
  extractSpreadsheetFormulaReferences,
  findSpreadsheetMergedRange,
  formatSpreadsheetDisplayValue,
  getSpreadsheetConditionalStyle,
  getSpreadsheetProtectedRangeAccess,
  getSpreadsheetCellObject,
  getSpreadsheetCellRawValue,
  getSpreadsheetUsedRange,
  getSpreadsheetVisibleRows,
  mergeSpreadsheetCells,
  normalizeSpreadsheetRange,
  normalizeSpreadsheetWorkbook,
  parseSpreadsheetCellKey,
  renameSpreadsheetSheet,
  resolveSpreadsheetSortRange,
  setSpreadsheetCellValue,
  setSpreadsheetColumnFilter,
  shiftSpreadsheetCells,
  shiftSpreadsheetColumns,
  shiftSpreadsheetRows,
  sortSpreadsheetRange,
  summarizeSpreadsheetRange,
  spreadsheetColumnLabel,
  spreadsheetRangeContainsCell,
  spreadsheetRangesOverlap,
  unmergeSpreadsheetCells,
  updateSpreadsheetRangeStyle,
  validateSpreadsheetCellInput,
  validateSpreadsheetSheetName,
} from '../utils/spreadsheetWorkbook';
import {
  RELATION_SPREADSHEET_CLIPBOARD_MIME,
  applySpreadsheetClipboardPayload,
  buildSpreadsheetClipboardPayload,
  parseSpreadsheetClipboardData,
  parseSpreadsheetTextClipboard,
  spreadsheetClipboardPayloadToHtml,
  spreadsheetClipboardPayloadToText,
} from '../utils/spreadsheetClipboard';

const { Text } = Typography;
const ROW_HEADER_WIDTH = 46;
const COLUMN_HEADER_HEIGHT = 24;
const DEFAULT_ROW_HEIGHT = 24;
const DEFAULT_COLUMN_WIDTH = 96;
const VIRTUAL_OVERSCAN = 4;
const MAX_FROZEN_ROWS = 100;
const MAX_FROZEN_COLUMNS = 50;
const MAX_HISTORY_ENTRIES = 30;
const MAX_HISTORY_BYTES = 24 * 1024 * 1024;
const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5];
const DEFAULT_FONT_FAMILY = 'Arial';
const DEFAULT_FONT_SIZE = 13;
const FONT_FAMILY_OPTIONS = ['Arial', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Times New Roman'];
const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const TEXT_COLOR_OPTIONS = ['#111827', '#374151', '#dc2626', '#d97706', '#15803d', '#1677ff', '#4338ca', '#7e22ce'];
const FILL_COLOR_OPTIONS = ['#ffffff', '#f8fafc', '#fef3c7', '#ffedd5', '#dcfce7', '#dbeafe', '#e0e7ff', '#f3e8ff'];
const FORMULA_REFERENCE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];
const SELECTION_BORDER_COLOR = '#5b9fe5';
const SELECTION_FILL_COLOR = '#e2edf9';
const SELECTION_SUMMARY_METRICS = [
  { key: 'sum', label: '总和', numeric: true },
  { key: 'average', label: '平均', numeric: true },
  { key: 'max', label: '最大', numeric: true },
  { key: 'min', label: '最小', numeric: true },
  { key: 'count', label: '计数', numeric: false },
  { key: 'numericCount', label: '数值计数', numeric: false },
];
const SELECTION_SUMMARY_FORMATTER = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 10,
});
const EMPTY_SELECTION_SUMMARY = {
  sum: 0,
  average: null,
  max: null,
  min: null,
  count: 0,
  numericCount: 0,
};
const NUMBER_FORMAT_TYPES = [
  ['general', '常规'],
  ['text', '文本'],
  ['number', '数值'],
  ['percentage', '百分比'],
  ['currency', '货币'],
  ['accounting', '会计专用'],
  ['date', '日期'],
  ['time', '时间'],
  ['fraction', '分数'],
  ['scientific', '科学计数'],
  ['special', '特殊'],
  ['custom', '自定义'],
];

function formatSelectionSummaryValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--';
  return SELECTION_SUMMARY_FORMATTER.format(Object.is(Number(value), -0) ? 0 : Number(value));
}

function serializeWorkbookSnapshot(value) {
  return JSON.stringify(value || {});
}

function trimWorkbookHistory(stack) {
  const next = stack.slice(-MAX_HISTORY_ENTRIES);
  let approximateBytes = next.reduce((sum, snapshot) => sum + snapshot.length * 2, 0);
  while (next.length > 1 && approximateBytes > MAX_HISTORY_BYTES) {
    approximateBytes -= next.shift().length * 2;
  }
  return next;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findOffsetIndex(offsets, value) {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= value) low = middle + 1;
    else if (offsets[middle] > value) high = middle - 1;
    else return middle;
  }
  return clamp(low, 0, Math.max(0, offsets.length - 2));
}

function buildOffsets(count, getSize) {
  const offsets = [0];
  for (let index = 0; index < count; index += 1) offsets.push(offsets[index] + getSize(index));
  return offsets;
}

function rangeIsSingleCell(range) {
  const normalized = normalizeSpreadsheetRange(range);
  return !normalized || (normalized.startRow === normalized.endRow && normalized.startColumn === normalized.endColumn);
}

function spreadsheetRangesEqual(left, right) {
  const a = normalizeSpreadsheetRange(left);
  const b = normalizeSpreadsheetRange(right);
  return Boolean(a && b
    && a.startRow === b.startRow
    && a.endRow === b.endRow
    && a.startColumn === b.startColumn
    && a.endColumn === b.endColumn);
}

function spreadsheetRangeLabel(range) {
  const normalized = normalizeSpreadsheetRange(range);
  if (!normalized) return '';
  const start = buildSpreadsheetCellKey(normalized.startRow, normalized.startColumn);
  const end = buildSpreadsheetCellKey(normalized.endRow, normalized.endColumn);
  return start === end ? start : `${start}:${end}`;
}

function spreadsheetCellShiftAffectedRange(range, direction, sheet) {
  const normalized = normalizeSpreadsheetRange(range);
  if (!normalized || !sheet) return normalized;
  if (direction === 'insert-right' || direction === 'delete-left') {
    return { ...normalized, endColumn: Math.max(normalized.endColumn, sheet.columnCount - 1) };
  }
  return { ...normalized, endRow: Math.max(normalized.endRow, sheet.rowCount - 1) };
}

function createUniqueSpreadsheetSheetId(sheets = []) {
  const usedIds = new Set((Array.isArray(sheets) ? sheets : []).map(sheet => String(sheet?.id || '')));
  const base = `sheet_${Date.now()}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createSpreadsheetRuleId(prefix, rules = []) {
  const usedIds = new Set((rules || []).map(rule => String(rule?.id || '')));
  const base = `${prefix}_${Date.now().toString(36)}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function SpreadsheetToolbarButton({ title, active = false, disabled = false, danger = false, icon, onClick }) {
  return (
    <Tooltip title={title}>
      <Button
        aria-label={title}
        icon={icon}
        type="text"
        danger={danger}
        disabled={disabled}
        size="small"
        className={`relation-spreadsheet-toolbar-button${active ? ' relation-spreadsheet-toolbar-button--active' : ''}`}
        onClick={onClick}
      />
    </Tooltip>
  );
}

function SpreadsheetSheetRenameInput({ defaultValue, onChange, onErrorSetter }) {
  const [error, setError] = useState('');

  useEffect(() => {
    onErrorSetter?.(setError);
    return () => onErrorSetter?.(null);
  }, [onErrorSetter]);

  return (
    <div>
      <Input
        defaultValue={defaultValue}
        autoFocus
        status={error ? 'error' : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'spreadsheet-sheet-name-error' : undefined}
        onChange={event => {
          setError('');
          onChange?.(event);
        }}
      />
      {error ? (
        <Text
          id="spreadsheet-sheet-name-error"
          role="alert"
          type="danger"
          style={{ display: 'block', marginTop: 6 }}
        >
          {error}
        </Text>
      ) : null}
    </div>
  );
}

function SpreadsheetCellFormatModal({ open, initialFormat, sampleValue, onCancel, onConfirm }) {
  const [config, setConfig] = useState({ type: 'general', decimals: 2, useGrouping: true, negativeStyle: 'minus' });

  useEffect(() => {
    if (!open) return;
    setConfig({
      type: initialFormat?.type || (typeof initialFormat === 'string' ? initialFormat : 'general'),
      decimals: Number(initialFormat?.decimals ?? 2),
      useGrouping: initialFormat?.useGrouping !== false,
      negativeStyle: initialFormat?.negativeStyle || 'minus',
      currency: initialFormat?.currency || 'CNY',
      pattern: initialFormat?.pattern || '',
    });
  }, [open, initialFormat]);

  const numericFormat = ['number', 'percentage', 'currency', 'accounting', 'scientific'].includes(config.type);
  return (
    <Modal
      open={open}
      title="设置单元格格式"
      width={620}
      okText="确定"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => onConfirm(config.type === 'general' ? null : config)}
      className="relation-spreadsheet-format-modal"
    >
      <div className="relation-spreadsheet-format-layout">
        <div className="relation-spreadsheet-format-categories" role="tablist" aria-label="单元格格式分类">
          {NUMBER_FORMAT_TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={config.type === value}
              className={config.type === value ? 'is-active' : ''}
              onClick={() => setConfig(current => ({ ...current, type: value }))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relation-spreadsheet-format-options">
          <div className="relation-spreadsheet-format-preview">
            <span>示例</span>
            <strong>{String(formatSpreadsheetDisplayValue(sampleValue || 715.42, config) ?? '')}</strong>
          </div>
          {numericFormat ? (
            <>
              <label>
                <span>小数位数</span>
                <InputNumber
                  min={0}
                  max={10}
                  value={config.decimals}
                  onChange={value => setConfig(current => ({ ...current, decimals: Number(value) || 0 }))}
                />
              </label>
              <Checkbox
                checked={config.useGrouping}
                onChange={event => setConfig(current => ({ ...current, useGrouping: event.target.checked }))}
              >
                使用千分位分隔符
              </Checkbox>
              <label>
                <span>负数</span>
                <Select
                  value={config.negativeStyle}
                  options={[
                    { value: 'minus', label: '-1,234.10' },
                    { value: 'parentheses', label: '(1,234.10)' },
                  ]}
                  onChange={value => setConfig(current => ({ ...current, negativeStyle: value }))}
                />
              </label>
            </>
          ) : null}
          {['currency', 'accounting'].includes(config.type) ? (
            <label>
              <span>币种</span>
              <Select
                value={config.currency}
                options={[
                  { value: 'CNY', label: '人民币 CNY' },
                  { value: 'USD', label: '美元 USD' },
                  { value: 'HKD', label: '港币 HKD' },
                ]}
                onChange={value => setConfig(current => ({ ...current, currency: value }))}
              />
            </label>
          ) : null}
          {config.type === 'custom' ? (
            <label>
              <span>自定义格式</span>
              <Input
                maxLength={64}
                value={config.pattern}
                placeholder="#,##0.00"
                onChange={event => setConfig(current => ({ ...current, pattern: event.target.value }))}
              />
            </label>
          ) : null}
          <p>格式只改变显示方式，不会修改单元格原始值或公式。</p>
        </div>
      </div>
    </Modal>
  );
}

function SpreadsheetCustomSortModal({ open, columns, activeColumnIndex, onCancel, onConfirm }) {
  const [columnIndex, setColumnIndex] = useState(activeColumnIndex);
  const [direction, setDirection] = useState('asc');
  const [hasHeader, setHasHeader] = useState(true);

  useEffect(() => {
    if (!open) return;
    setColumnIndex(activeColumnIndex);
    setDirection('asc');
    setHasHeader(true);
  }, [open, activeColumnIndex]);

  return (
    <Modal
      open={open}
      title="自定义排序"
      okText="排序"
      cancelText="取消"
      width={420}
      onCancel={onCancel}
      onOk={() => onConfirm({ columnIndex, direction, hasHeader })}
      className="relation-spreadsheet-sort-modal"
    >
      <div className="relation-spreadsheet-sort-options">
        <label>
          <span>关键列</span>
          <Select value={columnIndex} options={columns} onChange={setColumnIndex} />
        </label>
        <label>
          <span>排序方式</span>
          <Select
            value={direction}
            options={[
              { value: 'asc', label: '升序' },
              { value: 'desc', label: '降序' },
            ]}
            onChange={setDirection}
          />
        </label>
        <Checkbox checked={hasHeader} onChange={event => setHasHeader(event.target.checked)}>
          数据包含标题行
        </Checkbox>
      </div>
    </Modal>
  );
}

export default function SpreadsheetDocumentEditor({
  workbook: workbookValue,
  canEdit = false,
  isMobile = false,
  selectedCell,
  onSelectedCellChange,
  onWorkbookChange,
  onSelectionChange,
  onImportXlsx,
  onExportXlsx,
  importing = false,
  collaborationNotice = '',
  collaborators = [],
  mentionContext,
  currentUser = null,
  protectionUsers = [],
  canManageProtection = false,
  fillAvailableHeight = false,
  frameless = false,
  workspaceFocusMode = false,
  onWorkspaceFocusModeChange,
  onViewportScroll,
}) {
  const workbook = useMemo(() => normalizeSpreadsheetWorkbook(workbookValue), [workbookValue]);
  const activeSheet = workbook.sheets.find(sheet => sheet.id === selectedCell?.sheetId)
    || workbook.sheets.find(sheet => sheet.id === workbook.activeSheetId)
    || workbook.sheets[0];
  const activeRowIndex = clamp(Number(selectedCell?.rowIndex) || 0, 0, activeSheet.rowCount - 1);
  const activeColumnIndex = clamp(Number(selectedCell?.columnIndex) || 0, 0, activeSheet.columnCount - 1);
  const activeCellKey = buildSpreadsheetCellKey(activeRowIndex, activeColumnIndex);
  const [selection, setSelection] = useState(() => normalizeSpreadsheetRange({
    rowIndex: activeRowIndex,
    columnIndex: activeColumnIndex,
  }));
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingCellKey, setEditingCellKey] = useState('');
  const [mentionState, setMentionState] = useState(null);
  const [scrollState, setScrollState] = useState({ top: 0, left: 0, width: 800, height: 500 });
  const [zoom, setZoom] = useState(1);
  const [resizeDrag, setResizeDrag] = useState(null);
  const [formatPainter, setFormatPainter] = useState(null);
  const [clipboardState, setClipboardState] = useState(null);
  const [cellFormatOpen, setCellFormatOpen] = useState(false);
  const [customSortOpen, setCustomSortOpen] = useState(false);
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [conditionalFormatOpen, setConditionalFormatOpen] = useState(false);
  const [dataValidationOpen, setDataValidationOpen] = useState(false);
  const [selectionSummaryMetric, setSelectionSummaryMetric] = useState('sum');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef(null);
  const viewportRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorActiveRef = useRef(false);
  const workbookRef = useRef(workbook);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const inputTransactionRef = useRef(null);
  const keyCommandRef = useRef(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const formatPainterRef = useRef(null);
  const currentSelectionRef = useRef(null);
  const applyFormatPainterRef = useRef(null);
  const suppressCellEditUntilRef = useRef(0);
  workbookRef.current = workbook;
  onSelectionChangeRef.current = onSelectionChange;

  const detectInputMention = (event, rowIndex, columnIndex) => {
    if (!canEdit || !mentionContext?.entity_type || !mentionContext?.entity_id) {
      setMentionState(null);
      return;
    }
    const input = event?.target;
    if (typeof input?.selectionStart !== 'number') {
      setMentionState(null);
      return;
    }
    const value = String(input.value || '');
    const offset = input.selectionStart;
    const before = value.slice(0, offset);
    const match = before.match(/(^|[\s([{，。；：、“‘])@([\p{L}\p{N}_-]{0,24})$/u);
    if (!match) {
      setMentionState(null);
      return;
    }
    const rect = input.getBoundingClientRect();
    setMentionState({
      rowIndex,
      columnIndex,
      query: match[2] || '',
      atOffset: offset - match[2].length - 1,
      endOffset: offset,
      value,
      lineContent: value,
      position: { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY + 6 },
    });
  };

  const insertSpreadsheetMention = (user) => {
    if (!mentionState || !user) return;
    const name = user.name || user.display_name || user.username || '';
    const nextValue = `${mentionState.value.slice(0, mentionState.atOffset)}@${name} ${mentionState.value.slice(mentionState.endOffset)}`;
    updateCellValue(mentionState.rowIndex, mentionState.columnIndex, nextValue, { recordHistory: false });
    setMentionState(null);
    scheduleMentionNotification({
      context: mentionContext,
      user,
      lineContent: nextValue,
    });
  };

  useEffect(() => {
    const next = normalizeSpreadsheetRange({ rowIndex: activeRowIndex, columnIndex: activeColumnIndex });
    setMentionState(null);
    setSelection(current => (
      current && spreadsheetRangeContainsCell(current, activeRowIndex, activeColumnIndex)
        ? current
        : next
    ));
  }, [activeSheet.id, activeRowIndex, activeColumnIndex]);

  useEffect(() => {
    if (selectedCell?.sheetId === activeSheet.id) return;
    onSelectedCellChange?.({
      sheetId: activeSheet.id,
      rowIndex: activeRowIndex,
      columnIndex: activeColumnIndex,
    });
  }, [
    activeSheet.id,
    activeRowIndex,
    activeColumnIndex,
    selectedCell?.sheetId,
    onSelectedCellChange,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(fullscreenElement === editorRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!canEdit || !mentionContext?.entity_type || !mentionContext?.entity_id) return;
    preloadMentionCandidates(mentionContext).catch(() => {});
  }, [canEdit, mentionContext?.entity_type, mentionContext?.entity_id, mentionContext?.scope]);

  useEffect(() => {
    if (canEdit) return;
    formatPainterRef.current = null;
    setFormatPainter(null);
  }, [canEdit]);

  useEffect(() => {
    if (!formatPainter) return undefined;
    const cancelFormatPainter = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      formatPainterRef.current = null;
      setFormatPainter(null);
    };
    window.addEventListener('keydown', cancelFormatPainter);
    return () => window.removeEventListener('keydown', cancelFormatPainter);
  }, [formatPainter]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateSize = () => setScrollState(current => ({
      ...current,
      width: viewport.clientWidth || current.width,
      height: viewport.clientHeight || current.height,
    }));
    updateSize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const recordUndoSnapshot = (snapshot) => {
    const serialized = typeof snapshot === 'string' ? snapshot : serializeWorkbookSnapshot(snapshot);
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    if (last !== serialized) {
      undoStackRef.current = trimWorkbookHistory([...undoStackRef.current, serialized]);
    }
    redoStackRef.current = [];
  };

  const beginInputTransaction = (source) => {
    if (inputTransactionRef.current?.source === source) return;
    commitInputTransaction();
    inputTransactionRef.current = { source, before: serializeWorkbookSnapshot(workbookRef.current) };
  };

  const commitInputTransaction = () => {
    const transaction = inputTransactionRef.current;
    inputTransactionRef.current = null;
    const sourceMatch = String(transaction?.source || '').match(/^(?:cell|formula):([^:]+):([A-Z]+\d+)$/i);
    if (transaction && sourceMatch && transaction.before !== serializeWorkbookSnapshot(workbookRef.current)) {
      const parsedCell = parseSpreadsheetCellKey(sourceMatch[2]);
      const sheet = workbookRef.current.sheets.find(item => String(item.id) === sourceMatch[1]);
      if (sheet && parsedCell) {
        const validationEvaluator = createSpreadsheetFormulaEvaluator(workbookRef.current);
        const rawValue = getSpreadsheetCellRawValue(sheet, parsedCell.rowIndex, parsedCell.columnIndex);
        const validationValue = String(rawValue).startsWith('=')
          ? validationEvaluator.getValue(sheet.id, parsedCell.rowIndex, parsedCell.columnIndex)
          : rawValue;
        const validation = validateSpreadsheetCellInput(
          sheet,
          parsedCell.rowIndex,
          parsedCell.columnIndex,
          validationValue,
          {
            evaluateCustomFormula: rule => validationEvaluator.evaluateFormula(sheet.id, rule.formula) === true,
          },
        );
        if (!validation.valid && validation.action === 'reject') {
          const previous = normalizeSpreadsheetWorkbook(JSON.parse(transaction.before));
          workbookRef.current = previous;
          onWorkbookChange?.(previous);
          message.error(validation.message);
          return false;
        }
        if (!validation.valid) message.warning(validation.message);
      }
    }
    if (transaction && transaction.before !== serializeWorkbookSnapshot(workbookRef.current)) {
      recordUndoSnapshot(transaction.before);
    }
    return true;
  };

  const cancelInputTransaction = () => {
    const transaction = inputTransactionRef.current;
    inputTransactionRef.current = null;
    if (!transaction || transaction.before === serializeWorkbookSnapshot(workbookRef.current)) return;
    const previous = normalizeSpreadsheetWorkbook(JSON.parse(transaction.before));
    workbookRef.current = previous;
    onWorkbookChange?.(previous);
  };

  const undoWorkbookChange = () => {
    commitInputTransaction();
    const previous = undoStackRef.current.pop();
    if (!previous) {
      message.info('没有可撤回的操作');
      return;
    }
    redoStackRef.current = trimWorkbookHistory([
      ...redoStackRef.current,
      serializeWorkbookSnapshot(workbookRef.current),
    ]);
    const restored = normalizeSpreadsheetWorkbook(JSON.parse(previous));
    workbookRef.current = restored;
    onWorkbookChange?.(restored);
    message.success('已撤回上一次操作');
  };

  const redoWorkbookChange = () => {
    commitInputTransaction();
    const next = redoStackRef.current.pop();
    if (!next) {
      message.info('没有可重做的操作');
      return;
    }
    undoStackRef.current = trimWorkbookHistory([
      ...undoStackRef.current,
      serializeWorkbookSnapshot(workbookRef.current),
    ]);
    const restored = normalizeSpreadsheetWorkbook(JSON.parse(next));
    workbookRef.current = restored;
    onWorkbookChange?.(restored);
    message.success('已重做上一次操作');
  };

  const applyWorkbookUpdate = (updater, { recordHistory = true } = {}) => {
    if (!canEdit) return;
    const before = serializeWorkbookSnapshot(workbookRef.current);
    const draft = JSON.parse(before);
    const result = normalizeSpreadsheetWorkbook(updater(draft) || draft);
    if (before === serializeWorkbookSnapshot(result)) return;
    if (recordHistory) recordUndoSnapshot(before);
    workbookRef.current = result;
    onWorkbookChange?.(result);
  };

  useEffect(() => {
    if (!resizeDrag) return undefined;
    const handlePointerMove = event => {
      const delta = resizeDrag.axis === 'column'
        ? event.clientX - resizeDrag.startPosition
        : event.clientY - resizeDrag.startPosition;
      setResizeDrag(current => current ? { ...current, previewSize: clamp(current.startSize + delta / zoom, current.min, current.max) } : null);
    };
    const handlePointerUp = event => {
      const delta = resizeDrag.axis === 'column'
        ? event.clientX - resizeDrag.startPosition
        : event.clientY - resizeDrag.startPosition;
      const size = Math.round(clamp(resizeDrag.startSize + delta / zoom, resizeDrag.min, resizeDrag.max));
      applyWorkbookUpdate(draft => {
        const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
        if (resizeDrag.axis === 'column') sheet.columnWidths[resizeDrag.index] = size;
        else sheet.rowHeights[resizeDrag.index] = size;
        return draft;
      });
      setResizeDrag(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  });

  useEffect(() => {
    if (!isSelecting) return undefined;
    const stopSelecting = () => {
      setIsSelecting(false);
      if (formatPainterRef.current && currentSelectionRef.current) {
        applyFormatPainterRef.current?.(currentSelectionRef.current);
      }
    };
    window.addEventListener('mouseup', stopSelecting, { once: true });
    return () => window.removeEventListener('mouseup', stopSelecting);
  }, [isSelecting]);

  const evaluator = useMemo(() => createSpreadsheetFormulaEvaluator(workbook), [workbook]);
  const visibleRows = useMemo(() => (
    activeSheet.filters?.length
      ? getSpreadsheetVisibleRows(workbook, activeSheet.id)
      : Array.from({ length: activeSheet.rowCount }, (_, rowIndex) => rowIndex)
  ), [workbook, activeSheet]);
  const rowPositionByIndex = useMemo(() => new Map(visibleRows.map((rowIndex, position) => [rowIndex, position])), [visibleRows]);
  const columnWidth = columnIndex => {
    if (resizeDrag?.axis === 'column' && resizeDrag.index === columnIndex) return resizeDrag.previewSize * zoom;
    return clamp(Number(activeSheet.columnWidths?.[columnIndex]) || DEFAULT_COLUMN_WIDTH, 48, 480) * zoom;
  };
  const rowHeight = rowIndex => {
    if (resizeDrag?.axis === 'row' && resizeDrag.index === rowIndex) return resizeDrag.previewSize * zoom;
    return clamp(Number(activeSheet.rowHeights?.[rowIndex]) || DEFAULT_ROW_HEIGHT, 22, 160) * zoom;
  };
  const columnOffsets = useMemo(
    () => buildOffsets(activeSheet.columnCount, columnWidth),
    [activeSheet.columnCount, activeSheet.columnWidths, zoom, resizeDrag]
  );
  const rowOffsets = useMemo(
    () => buildOffsets(visibleRows.length, position => rowHeight(visibleRows[position])),
    [visibleRows, activeSheet.rowHeights, zoom, resizeDrag]
  );
  const totalWidth = ROW_HEADER_WIDTH + (columnOffsets[columnOffsets.length - 1] || 0);
  const totalHeight = COLUMN_HEADER_HEIGHT + (rowOffsets[rowOffsets.length - 1] || 0);
  const frozenRows = clamp(Number(activeSheet.frozen?.rows) || 0, 0, visibleRows.length);
  const frozenColumns = clamp(Number(activeSheet.frozen?.columns) || 0, 0, activeSheet.columnCount);

  const bodyTop = Math.max(0, scrollState.top - COLUMN_HEADER_HEIGHT);
  const bodyLeft = Math.max(0, scrollState.left - ROW_HEADER_WIDTH);
  const firstVisibleRowPosition = Math.max(0, findOffsetIndex(rowOffsets, bodyTop) - VIRTUAL_OVERSCAN);
  const lastVisibleRowPosition = Math.min(
    visibleRows.length - 1,
    findOffsetIndex(rowOffsets, bodyTop + scrollState.height) + VIRTUAL_OVERSCAN
  );
  const firstVisibleColumn = Math.max(0, findOffsetIndex(columnOffsets, bodyLeft) - VIRTUAL_OVERSCAN);
  const lastVisibleColumn = Math.min(
    activeSheet.columnCount - 1,
    findOffsetIndex(columnOffsets, bodyLeft + scrollState.width) + VIRTUAL_OVERSCAN
  );
  const renderedRowPositions = new Set();
  for (let position = 0; position < frozenRows; position += 1) renderedRowPositions.add(position);
  for (let position = firstVisibleRowPosition; position <= lastVisibleRowPosition; position += 1) renderedRowPositions.add(position);
  const renderedColumns = new Set();
  for (let column = 0; column < frozenColumns; column += 1) renderedColumns.add(column);
  for (let column = firstVisibleColumn; column <= lastVisibleColumn; column += 1) renderedColumns.add(column);
  (activeSheet.mergedCells || []).forEach(range => {
    const normalized = normalizeSpreadsheetRange(range);
    const rowPosition = rowPositionByIndex.get(normalized?.startRow);
    if (rowPosition !== undefined && [...renderedRowPositions].some(position => {
      const rowIndex = visibleRows[position];
      return rowIndex >= normalized.startRow && rowIndex <= normalized.endRow;
    })) renderedRowPositions.add(rowPosition);
    if ([...renderedColumns].some(column => column >= normalized.startColumn && column <= normalized.endColumn)) {
      renderedColumns.add(normalized.startColumn);
    }
  });
  const rowPositions = [...renderedRowPositions].filter(position => position >= 0 && position < visibleRows.length).sort((a, b) => a - b);
  const columns = [...renderedColumns].filter(column => column >= 0 && column < activeSheet.columnCount).sort((a, b) => a - b);

  const currentSelection = normalizeSpreadsheetRange(selection, {
    startRow: activeRowIndex,
    endRow: activeRowIndex,
    startColumn: activeColumnIndex,
    endColumn: activeColumnIndex,
  });
  currentSelectionRef.current = currentSelection;
  const selectsWholeRows = currentSelection.startColumn === 0
    && currentSelection.endColumn === activeSheet.columnCount - 1;
  const selectsWholeColumns = currentSelection.startRow === 0
    && currentSelection.endRow === activeSheet.rowCount - 1;
  const selectedCellCount = (currentSelection.endRow - currentSelection.startRow + 1)
    * (currentSelection.endColumn - currentSelection.startColumn + 1);
  const selectionSummary = useMemo(() => selectedCellCount > 1
    ? summarizeSpreadsheetRange(
      activeSheet,
      currentSelection,
      (row, column) => evaluator.getValue(activeSheet.id, row, column),
    )
    : EMPTY_SELECTION_SUMMARY, [
    activeSheet,
    selectedCellCount,
    currentSelection.startRow,
    currentSelection.endRow,
    currentSelection.startColumn,
    currentSelection.endColumn,
    evaluator,
  ]);
  const effectiveSelectionSummaryMetric = selectionSummary.numericCount
    ? selectionSummaryMetric
    : 'count';
  const selectedSummaryDefinition = SELECTION_SUMMARY_METRICS.find(
    item => item.key === effectiveSelectionSummaryMetric,
  ) || SELECTION_SUMMARY_METRICS[0];
  const showSelectionSummary = selectedCellCount > 1 && selectionSummary.count > 0;
  const selectionSummaryMenuItems = SELECTION_SUMMARY_METRICS.map(item => ({
    key: item.key,
    disabled: item.numeric && !selectionSummary.numericCount,
    icon: item.key === effectiveSelectionSummaryMetric
      ? <CheckOutlined />
      : <span className="relation-spreadsheet-selection-summary-menu__icon" />,
    label: (
      <span className="relation-spreadsheet-selection-summary-menu__item">
        <span>{item.label}:</span>
        <strong>{formatSelectionSummaryValue(selectionSummary[item.key])}</strong>
      </span>
    ),
  }));
  const selectionProtectionAccess = getSpreadsheetProtectedRangeAccess(activeSheet, currentSelection, {
    userId: currentUser?.id,
    canManage: canManageProtection,
  });
  const selectionLocked = !selectionProtectionAccess.allowed;
  const selectionMutationDisabled = !canEdit || selectionLocked;
  const workbookHasProtection = workbook.sheets.some(sheet => (
    (sheet.protectedRanges || []).some(rule => rule?.enabled !== false)
  ));
  const importDisabled = !canEdit || (!canManageProtection && workbookHasProtection);
  const selectedProtectionRule = (activeSheet.protectedRanges || []).find(rule => (
    rule.enabled !== false && spreadsheetRangesEqual(rule.range, currentSelection)
  )) || (activeSheet.protectedRanges || []).find(rule => (
    rule.enabled !== false && spreadsheetRangeContainsCell(rule.range, activeRowIndex, activeColumnIndex)
  ));
  const selectedConditionalRule = (activeSheet.conditionalFormats || []).find(rule => (
    rule.enabled !== false && spreadsheetRangesEqual(rule.range, currentSelection)
  ));
  const selectedValidationRule = (activeSheet.dataValidations || []).find(rule => (
    rule.enabled !== false && spreadsheetRangesEqual(rule.range, currentSelection)
  ));
  const selectedCellObject = getSpreadsheetCellObject(activeSheet, activeRowIndex, activeColumnIndex);
  const selectedCellRawValue = getSpreadsheetCellRawValue(activeSheet, activeRowIndex, activeColumnIndex);
  const selectedCellStyle = selectedCellObject.style || {};
  const selectedFontFamily = selectedCellStyle.fontFamily || DEFAULT_FONT_FAMILY;
  const selectedFontSize = Number(selectedCellStyle.fontSize) || DEFAULT_FONT_SIZE;
  const selectionLabel = spreadsheetRangeLabel(currentSelection) || activeCellKey;
  const protectionRangeLabel = spreadsheetRangeLabel(selectedProtectionRule?.range || currentSelection) || selectionLabel;
  const formulaReferences = useMemo(() => (
    extractSpreadsheetFormulaReferences(selectedCellRawValue, activeSheet.name)
      .filter(reference => (
        String(reference.sheetName || '').toLocaleLowerCase('zh-CN') === String(activeSheet.name || '').toLocaleLowerCase('zh-CN')
        && String(reference.endSheetName || '').toLocaleLowerCase('zh-CN') === String(activeSheet.name || '').toLocaleLowerCase('zh-CN')
      ))
      .map((reference, index) => ({
        ...reference,
        color: FORMULA_REFERENCE_COLORS[index % FORMULA_REFERENCE_COLORS.length],
      }))
  ), [selectedCellRawValue, activeSheet.name]);
  const remoteCollaborators = useMemo(() => (
    (Array.isArray(collaborators) ? collaborators : []).filter(item => item?.session_id && item?.user_name)
  ), [collaborators]);
  const activeRemoteCollaborators = useMemo(() => remoteCollaborators
    .filter(item => item.sheet_id === activeSheet.id)
    .map(item => ({
      ...item,
      selection: normalizeSpreadsheetRange(item.selection),
    }))
    .filter(item => item.selection), [remoteCollaborators, activeSheet.id]);

  useEffect(() => {
    onSelectionChangeRef.current?.({
      sheetId: activeSheet.id,
      selection: { ...currentSelection },
    });
  }, [
    activeSheet.id,
    currentSelection.startRow,
    currentSelection.endRow,
    currentSelection.startColumn,
    currentSelection.endColumn,
  ]);

  const setActiveFormatPainter = next => {
    formatPainterRef.current = next;
    setFormatPainter(next);
  };

  const focusSpreadsheetGrid = () => {
    editorActiveRef.current = true;
    window.requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true }));
  };

  const ensureSpreadsheetRangeEditable = (range = currentSelection) => {
    if (!canEdit) return false;
    const access = getSpreadsheetProtectedRangeAccess(activeSheet, range, {
      userId: currentUser?.id,
      canManage: canManageProtection,
    });
    if (access.allowed) return true;
    message.warning(access.deniedRules[0]?.description || '所选单元格已锁定，你没有编辑权限');
    return false;
  };

  const activateFormatPainter = continuous => {
    if (!canEdit) return;
    const sourceSheet = workbookRef.current.sheets.find(sheet => sheet.id === activeSheet.id)
      || workbookRef.current.sheets[0];
    const pattern = createSpreadsheetFormatPattern(sourceSheet, currentSelection);
    if (!pattern) return;
    setEditingCellKey('');
    setActiveFormatPainter({ pattern, continuous: Boolean(continuous) });
    focusSpreadsheetGrid();
  };

  const applyFormatPainterToRange = targetRange => {
    const painter = formatPainterRef.current;
    if (!painter || !targetRange || !ensureSpreadsheetRangeEditable(targetRange)) return;
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      applySpreadsheetFormatPattern(sheet, targetRange, painter.pattern);
      draft.activeSheetId = sheet.id;
      return draft;
    });
    suppressCellEditUntilRef.current = Date.now() + 400;
    if (!painter.continuous) setActiveFormatPainter(null);
  };
  applyFormatPainterRef.current = applyFormatPainterToRange;

  const notifySelection = (rowIndex, columnIndex, nextRange = null) => {
    const merged = findSpreadsheetMergedRange(activeSheet, rowIndex, columnIndex);
    const targetRow = merged?.startRow ?? rowIndex;
    const targetColumn = merged?.startColumn ?? columnIndex;
    const nextSelection = nextRange
      || normalizeSpreadsheetRange(merged || { rowIndex: targetRow, columnIndex: targetColumn });
    onSelectedCellChange?.({ sheetId: activeSheet.id, rowIndex: targetRow, columnIndex: targetColumn });
    currentSelectionRef.current = nextSelection;
    setSelection(nextSelection);
  };

  const selectWholeRow = rowIndex => {
    const nextRange = normalizeSpreadsheetRange({
      startRow: rowIndex,
      endRow: rowIndex,
      startColumn: 0,
      endColumn: activeSheet.columnCount - 1,
    });
    setEditingCellKey('');
    setSelectionAnchor(null);
    setIsSelecting(false);
    onSelectedCellChange?.({ sheetId: activeSheet.id, rowIndex, columnIndex: 0 });
    setSelection(nextRange);
    currentSelectionRef.current = nextRange;
    if (formatPainterRef.current) applyFormatPainterToRange(nextRange);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  const selectWholeColumn = columnIndex => {
    const nextRange = normalizeSpreadsheetRange({
      startRow: 0,
      endRow: activeSheet.rowCount - 1,
      startColumn: columnIndex,
      endColumn: columnIndex,
    });
    setEditingCellKey('');
    setSelectionAnchor(null);
    setIsSelecting(false);
    onSelectedCellChange?.({ sheetId: activeSheet.id, rowIndex: 0, columnIndex });
    setSelection(nextRange);
    currentSelectionRef.current = nextRange;
    if (formatPainterRef.current) applyFormatPainterToRange(nextRange);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  const scrollCellIntoView = (rowIndex, columnIndex) => {
    const viewport = viewportRef.current;
    const rowPosition = rowPositionByIndex.get(rowIndex);
    if (!viewport || rowPosition === undefined) return;
    const top = COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition];
    const bottom = top + rowHeight(rowIndex);
    const left = ROW_HEADER_WIDTH + columnOffsets[columnIndex];
    const right = left + columnWidth(columnIndex);
    if (top < viewport.scrollTop + COLUMN_HEADER_HEIGHT) viewport.scrollTop = Math.max(0, top - COLUMN_HEADER_HEIGHT);
    else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
    if (left < viewport.scrollLeft + ROW_HEADER_WIDTH) viewport.scrollLeft = Math.max(0, left - ROW_HEADER_WIDTH);
    else if (right > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = right - viewport.clientWidth;
  };

  const moveSelection = (rowDelta, columnDelta, extend = false) => {
    const nextRow = clamp(activeRowIndex + rowDelta, 0, activeSheet.rowCount - 1);
    const nextColumn = clamp(activeColumnIndex + columnDelta, 0, activeSheet.columnCount - 1);
    const anchor = extend
      ? (selectionAnchor || { rowIndex: currentSelection.startRow, columnIndex: currentSelection.startColumn })
      : null;
    const nextRange = anchor ? normalizeSpreadsheetRange({
      startRow: anchor.rowIndex,
      endRow: nextRow,
      startColumn: anchor.columnIndex,
      endColumn: nextColumn,
    }) : null;
    if (extend && !selectionAnchor) setSelectionAnchor(anchor);
    if (!extend) setSelectionAnchor(null);
    notifySelection(nextRow, nextColumn, nextRange);
    window.requestAnimationFrame(() => scrollCellIntoView(nextRow, nextColumn));
  };

  const updateCellValue = (rowIndex, columnIndex, value, options) => {
    if (!ensureSpreadsheetRangeEditable({ rowIndex, columnIndex })) return;
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      setSpreadsheetCellValue(sheet, rowIndex, columnIndex, value);
      draft.activeSheetId = sheet.id;
      return draft;
    }, options);
  };

  const updateRangeStyle = stylePatch => {
    if (!ensureSpreadsheetRangeEditable()) return;
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      updateSpreadsheetRangeStyle(sheet, currentSelection, stylePatch);
      return draft;
    });
    focusSpreadsheetGrid();
  };

  const clearSheetRange = (sheet, range, mode = 'content') => {
    const bounds = normalizeSpreadsheetRange(range);
    if (!sheet || !bounds) return;
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
        const key = buildSpreadsheetCellKey(row, column);
        if (mode === 'all') delete sheet.cells[key];
        else if (mode === 'format') {
          const cell = getSpreadsheetCellObject(sheet, row, column);
          if (!Object.keys(cell).length) continue;
          const next = { ...cell };
          delete next.style;
          if ((next.v ?? next.value ?? '') === '') delete sheet.cells[key];
          else sheet.cells[key] = next;
        } else setSpreadsheetCellValue(sheet, row, column, '');
      }
    }
  };

  const clearSelection = (mode = 'content') => {
    if (!ensureSpreadsheetRangeEditable()) return;
    if (mode !== 'format') {
      const validationWorkbook = normalizeSpreadsheetWorkbook(JSON.parse(JSON.stringify(workbookRef.current)));
      const validationSheet = validationWorkbook.sheets.find(item => item.id === activeSheet.id) || validationWorkbook.sheets[0];
      clearSheetRange(validationSheet, currentSelection, mode);
      const validationEvaluator = createSpreadsheetFormulaEvaluator(validationWorkbook);
      for (let row = currentSelection.startRow; row <= currentSelection.endRow; row += 1) {
        for (let column = currentSelection.startColumn; column <= currentSelection.endColumn; column += 1) {
          const validation = validateSpreadsheetCellInput(validationSheet, row, column, '', {
            evaluateCustomFormula: rule => validationEvaluator.evaluateFormula(validationSheet.id, rule.formula) === true,
          });
          if (!validation.valid && validation.action === 'reject') {
            message.error(`${buildSpreadsheetCellKey(row, column)}：${validation.message}`);
            return;
          }
        }
      }
    }
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      clearSheetRange(sheet, currentSelection, mode);
      return draft;
    });
    focusSpreadsheetGrid();
  };

  const selectionClipboardPayload = () => {
    const sheet = workbookRef.current.sheets.find(item => item.id === activeSheet.id) || workbookRef.current.sheets[0];
    const payload = buildSpreadsheetClipboardPayload(sheet, currentSelection);
    if (!payload) return null;
    const displayMatrix = [];
    for (let row = currentSelection.startRow; row <= currentSelection.endRow; row += 1) {
      const values = [];
      for (let column = currentSelection.startColumn; column <= currentSelection.endColumn; column += 1) {
        values.push(evaluator.getValue(activeSheet.id, row, column));
      }
      displayMatrix.push(values);
    }
    return { payload, displayMatrix };
  };

  const setSelectionToPastedRange = (endRow, endColumn) => {
    const nextRange = normalizeSpreadsheetRange({
      startRow: activeRowIndex,
      endRow,
      startColumn: activeColumnIndex,
      endColumn,
    });
    currentSelectionRef.current = nextRange;
    setSelection(nextRange);
  };

  const validateClipboardTarget = payload => {
    const validationWorkbook = normalizeSpreadsheetWorkbook(JSON.parse(JSON.stringify(workbookRef.current)));
    const validationSheet = validationWorkbook.sheets.find(item => item.id === activeSheet.id) || validationWorkbook.sheets[0];
    applySpreadsheetClipboardPayload(validationSheet, payload, activeRowIndex, activeColumnIndex);
    const validationEvaluator = createSpreadsheetFormulaEvaluator(validationWorkbook);
    let warning = '';
    for (let rowOffset = 0; rowOffset < payload.cells.length; rowOffset += 1) {
      const row = payload.cells[rowOffset] || [];
      for (let columnOffset = 0; columnOffset < row.length; columnOffset += 1) {
        const targetRow = activeRowIndex + rowOffset;
        const targetColumn = activeColumnIndex + columnOffset;
        const value = getSpreadsheetCellRawValue(validationSheet, targetRow, targetColumn);
        const validationValue = String(value).startsWith('=')
          ? validationEvaluator.getValue(validationSheet.id, targetRow, targetColumn)
          : value;
        const result = validateSpreadsheetCellInput(
          validationSheet,
          targetRow,
          targetColumn,
          validationValue,
          {
            evaluateCustomFormula: rule => validationEvaluator.evaluateFormula(validationSheet.id, rule.formula) === true,
          },
        );
        if (!result.valid && result.action === 'reject') {
          message.error(`${buildSpreadsheetCellKey(activeRowIndex + rowOffset, activeColumnIndex + columnOffset)}：${result.message}`);
          return false;
        }
        if (!result.valid && !warning) warning = result.message;
      }
    }
    if (warning) message.warning(warning);
    return true;
  };

  const applyClipboardPayload = (payload, { insertDirection = '', cutState = clipboardState } = {}) => {
    const targetRange = payload?.cells?.length ? {
      startRow: activeRowIndex,
      endRow: activeRowIndex + payload.cells.length - 1,
      startColumn: activeColumnIndex,
      endColumn: activeColumnIndex + Math.max(0, ...payload.cells.map(row => (row?.length || 1) - 1)),
    } : currentSelection;
    const affectedTargetRange = insertDirection
      ? spreadsheetCellShiftAffectedRange(targetRange, insertDirection, activeSheet)
      : targetRange;
    if (!canEdit || !payload?.cells?.length || !ensureSpreadsheetRangeEditable(affectedTargetRange) || !validateClipboardTarget(payload)) return false;
    if (cutState?.mode === 'cut' && cutState.payload?.sourceRange) {
      const sourceSheet = workbookRef.current.sheets.find(item => item.id === cutState.payload.sourceSheetId);
      const sourceAccess = getSpreadsheetProtectedRangeAccess(sourceSheet, cutState.payload.sourceRange, {
        userId: currentUser?.id,
        canManage: canManageProtection,
      });
      if (!sourceAccess.allowed) {
        message.warning(sourceAccess.deniedRules[0]?.description || '剪切源区域已锁定');
        return false;
      }
    }
    let pastedRange = { endRow: activeRowIndex, endColumn: activeColumnIndex };
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      if (cutState?.mode === 'cut' && cutState.payload?.sourceRange) {
        const sourceSheet = draft.sheets.find(item => item.id === cutState.payload.sourceSheetId);
        if (sourceSheet) clearSheetRange(sourceSheet, cutState.payload.sourceRange, 'all');
      }
      if (insertDirection) {
        const rowCount = Math.max(1, Number(payload.rowCount) || payload.cells.length);
        const columnCount = Math.max(1, Number(payload.columnCount) || payload.cells[0]?.length || 1);
        shiftSpreadsheetCells(sheet, {
          startRow: activeRowIndex,
          endRow: activeRowIndex + rowCount - 1,
          startColumn: activeColumnIndex,
          endColumn: activeColumnIndex + columnCount - 1,
        }, insertDirection, draft);
      }
      pastedRange = applySpreadsheetClipboardPayload(sheet, payload, activeRowIndex, activeColumnIndex);
      return draft;
    });
    setSelectionToPastedRange(pastedRange.endRow, pastedRange.endColumn);
    if (cutState?.mode === 'cut') setClipboardState(null);
    focusSpreadsheetGrid();
    return true;
  };

  const handlePaste = event => {
    if (!canEdit || event.target?.closest?.('[data-spreadsheet-formula-input="true"]')) return;
    const parsed = parseSpreadsheetClipboardData(event.clipboardData);
    if (!parsed?.payload) return;
    const isMatrixPaste = Number(parsed.payload.rowCount) > 1 || Number(parsed.payload.columnCount) > 1;
    if (!isMatrixPaste && event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    const pasted = applyClipboardPayload(parsed.payload, {
      cutState: parsed.source === 'relation' ? clipboardState : null,
    });
    if (!pasted) return;
    if (parsed.sourceLooksLikeShimo && !parsed.hasFormulaMetadata) {
      message.warning('源内容未提供公式，仅粘贴结果值');
    }
    message.success(isMatrixPaste ? '已粘贴表格区域' : '已粘贴单元格');
  };

  const handleCopy = event => {
    if (event.target?.closest?.('[data-spreadsheet-formula-input="true"]')) return;
    const clipboard = selectionClipboardPayload();
    if (!clipboard) return;
    const plain = spreadsheetClipboardPayloadToText(clipboard.payload, clipboard.displayMatrix);
    const html = spreadsheetClipboardPayloadToHtml(clipboard.payload, clipboard.displayMatrix);
    event.clipboardData?.setData(RELATION_SPREADSHEET_CLIPBOARD_MIME, JSON.stringify(clipboard.payload));
    event.clipboardData?.setData('text/plain', plain);
    event.clipboardData?.setData('text/html', html);
    event.preventDefault();
    setClipboardState({ mode: 'copy', payload: clipboard.payload });
    message.success(rangeIsSingleCell(currentSelection) ? '已复制单元格' : '已复制选区');
  };

  const handleCut = event => {
    if (!canEdit || event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (!ensureSpreadsheetRangeEditable()) return;
    const clipboard = selectionClipboardPayload();
    if (!clipboard) return;
    event.clipboardData?.setData(RELATION_SPREADSHEET_CLIPBOARD_MIME, JSON.stringify(clipboard.payload));
    event.clipboardData?.setData('text/plain', spreadsheetClipboardPayloadToText(clipboard.payload, clipboard.displayMatrix));
    event.clipboardData?.setData('text/html', spreadsheetClipboardPayloadToHtml(clipboard.payload, clipboard.displayMatrix));
    event.preventDefault();
    setClipboardState({ mode: 'cut', payload: clipboard.payload });
    message.success('已剪切选区，粘贴成功后将移动内容');
  };

  const writeSelectionToSystemClipboard = async mode => {
    if (mode === 'cut' && !ensureSpreadsheetRangeEditable()) return;
    const clipboard = selectionClipboardPayload();
    if (!clipboard) return;
    const plain = spreadsheetClipboardPayloadToText(clipboard.payload, clipboard.displayMatrix);
    const html = spreadsheetClipboardPayloadToHtml(clipboard.payload, clipboard.displayMatrix);
    try {
      if (navigator.clipboard?.write && typeof window.ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new window.ClipboardItem({
          [RELATION_SPREADSHEET_CLIPBOARD_MIME]: new Blob([JSON.stringify(clipboard.payload)], { type: RELATION_SPREADSHEET_CLIPBOARD_MIME }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })]);
      } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(plain);
    } catch {
      // The internal clipboard still supports in-page paste when browser permission is unavailable.
    }
    setClipboardState({ mode, payload: clipboard.payload });
    message.success(mode === 'cut' ? '已剪切选区，粘贴成功后将移动内容' : '已复制选区');
    focusSpreadsheetGrid();
  };

  const pasteFromContextMenu = async insertDirection => {
    if (clipboardState?.payload) {
      const pasted = applyClipboardPayload(clipboardState.payload, { insertDirection });
      if (!pasted) return;
      message.success(insertDirection ? '已插入复制的单元格' : '已粘贴选区');
      return;
    }
    try {
      const text = await navigator.clipboard?.readText?.();
      const payload = parseSpreadsheetTextClipboard(text);
      if (!payload) throw new Error('剪贴板为空');
      const pasted = applyClipboardPayload(payload, { insertDirection, cutState: null });
      if (!pasted) return;
      message.success(insertDirection ? '已插入复制的单元格' : '已粘贴选区');
    } catch (error) {
      message.warning(error?.message || '无法读取剪贴板，请使用 Ctrl/Cmd+V');
    }
  };

  const handleGridKeyDown = event => {
    const key = String(event.key || '').toLowerCase();
    const hasCommandModifier = event.metaKey || event.ctrlKey;
    if (!event.altKey && hasCommandModifier && ((key === 'z' && event.shiftKey) || key === 'y')) {
      event.preventDefault();
      event.stopPropagation();
      redoWorkbookChange();
      return;
    }
    if (!event.altKey && hasCommandModifier && key === 'z') {
      event.preventDefault();
      event.stopPropagation();
      undoWorkbookChange();
      return;
    }
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    if ((event.metaKey || event.ctrlKey) && ['c', 'v', 'x'].includes(event.key.toLowerCase())) return;
    if (
      canEdit
      && !event.altKey
      && !event.metaKey
      && !event.ctrlKey
      && !event.isComposing
      && event.key
      && event.key.length === 1
    ) {
      if (!ensureSpreadsheetRangeEditable({ rowIndex: activeRowIndex, columnIndex: activeColumnIndex })) return;
      event.preventDefault();
      const transactionKey = `cell:${activeSheet.id}:${activeCellKey}`;
      beginInputTransaction(transactionKey);
      updateCellValue(activeRowIndex, activeColumnIndex, event.key, { recordHistory: false });
      setEditingCellKey(buildSpreadsheetCellKey(activeRowIndex, activeColumnIndex));
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection('content');
      return;
    }
    const keyMoves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [event.shiftKey ? -1 : 1, 0],
      Tab: [0, event.shiftKey ? -1 : 1],
    };
    if (keyMoves[event.key]) {
      event.preventDefault();
      moveSelection(keyMoves[event.key][0], keyMoves[event.key][1], event.shiftKey && event.key.startsWith('Arrow'));
    }
  };
  keyCommandRef.current = handleGridKeyDown;

  useEffect(() => {
    const handleDocumentPointerDown = event => {
      if (editorRef.current?.contains(event.target)
        || event.target?.closest?.('.relation-spreadsheet-freeze-menu, .relation-spreadsheet-menu-popup')) {
        editorActiveRef.current = true;
        return;
      }
      editorActiveRef.current = false;
    };
    const handleDocumentKeyDown = event => {
      const key = String(event.key || '').toLowerCase();
      const commandKey = event.metaKey || event.ctrlKey;
      if (!editorActiveRef.current || !commandKey || !['z', 'y'].includes(key)) return;
      if (editorRef.current?.contains(event.target)) return;
      if (event.target?.closest?.('input, textarea, [contenteditable="true"], .ant-modal-root')) return;
      keyCommandRef.current?.(event);
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, []);

  const insertRow = () => {
    if (!ensureSpreadsheetRangeEditable({
      startRow: activeRowIndex,
      endRow: activeRowIndex,
      startColumn: 0,
      endColumn: activeSheet.columnCount - 1,
    })) return;
    applyWorkbookUpdate(draft => {
      shiftSpreadsheetRows(draft.sheets.find(item => item.id === activeSheet.id), activeRowIndex, 1, draft);
      return draft;
    });
  };
  const deleteRow = () => {
    if (activeSheet.rowCount <= 1) return;
    if (!ensureSpreadsheetRangeEditable({
      startRow: activeRowIndex,
      endRow: activeRowIndex,
      startColumn: 0,
      endColumn: activeSheet.columnCount - 1,
    })) return;
    applyWorkbookUpdate(draft => {
      shiftSpreadsheetRows(draft.sheets.find(item => item.id === activeSheet.id), activeRowIndex, -1, draft);
      return draft;
    });
    moveSelection(activeRowIndex >= activeSheet.rowCount - 1 ? -1 : 0, 0);
  };
  const insertColumn = () => {
    if (!ensureSpreadsheetRangeEditable({
      startRow: 0,
      endRow: activeSheet.rowCount - 1,
      startColumn: activeColumnIndex,
      endColumn: activeColumnIndex,
    })) return;
    applyWorkbookUpdate(draft => {
      shiftSpreadsheetColumns(draft.sheets.find(item => item.id === activeSheet.id), activeColumnIndex, 1, draft);
      return draft;
    });
  };
  const deleteColumn = () => {
    if (activeSheet.columnCount <= 1) return;
    if (!ensureSpreadsheetRangeEditable({
      startRow: 0,
      endRow: activeSheet.rowCount - 1,
      startColumn: activeColumnIndex,
      endColumn: activeColumnIndex,
    })) return;
    applyWorkbookUpdate(draft => {
      shiftSpreadsheetColumns(draft.sheets.find(item => item.id === activeSheet.id), activeColumnIndex, -1, draft);
      return draft;
    });
    moveSelection(0, activeColumnIndex >= activeSheet.columnCount - 1 ? -1 : 0);
  };

  const shiftSelectedCells = direction => {
    if (!ensureSpreadsheetRangeEditable(spreadsheetCellShiftAffectedRange(currentSelection, direction, activeSheet))) return;
    if ((activeSheet.mergedCells || []).some(range => spreadsheetRangesOverlap(range, currentSelection))) {
      message.warning('请先取消选区内的合并单元格');
      return;
    }
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      shiftSpreadsheetCells(sheet, currentSelection, direction, draft);
      return draft;
    });
    focusSpreadsheetGrid();
  };

  const toggleMerge = () => {
    if (!ensureSpreadsheetRangeEditable()) return;
    const existing = findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex);
    if (existing) {
      applyWorkbookUpdate(draft => {
        unmergeSpreadsheetCells(draft.sheets.find(item => item.id === activeSheet.id), existing);
        return draft;
      });
      return;
    }
    if (rangeIsSingleCell(currentSelection)) return;
    const hasDiscardedContent = Object.entries(activeSheet.cells || {}).some(([key, cell]) => {
      const match = key.match(/^([A-Z]+)(\d+)$/);
      if (!match) return false;
      const column = match[1].split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const row = Number(match[2]) - 1;
      if (!spreadsheetRangeContainsCell(currentSelection, row, column)) return false;
      if (row === currentSelection.startRow && column === currentSelection.startColumn) return false;
      return String(cell?.v ?? cell?.value ?? cell ?? '') !== '';
    });
    const merge = () => applyWorkbookUpdate(draft => {
      mergeSpreadsheetCells(draft.sheets.find(item => item.id === activeSheet.id), currentSelection);
      return draft;
    });
    if (!hasDiscardedContent) return merge();
    Modal.confirm({
      title: '合并选区',
      content: '合并后仅保留左上角单元格内容，其他单元格内容会被清除。',
      okText: '继续合并',
      cancelText: '取消',
      onOk: merge,
    });
  };

  const sortSelection = (direction, options = {}) => {
    const sortRange = resolveSpreadsheetSortRange(activeSheet, currentSelection);
    if (!ensureSpreadsheetRangeEditable(sortRange)) return;
    const usedRange = getSpreadsheetUsedRange(activeSheet);
    const hasHeader = options.hasHeader === undefined && sortRange.startRow > usedRange.startRow
      ? false
      : options.hasHeader;
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id);
      sortSpreadsheetRange(
        sheet,
        resolveSpreadsheetSortRange(sheet, currentSelection),
        Number.isInteger(options.columnIndex) ? options.columnIndex : activeColumnIndex,
        direction,
        (row, column) => evaluator.getValue(activeSheet.id, row, column),
        { hasHeader },
      );
      return draft;
    });
    focusSpreadsheetGrid();
  };

  const filterCurrentValue = () => {
    if (!ensureSpreadsheetRangeEditable({ rowIndex: activeRowIndex, columnIndex: activeColumnIndex })) return;
    const value = evaluator.getValue(activeSheet.id, activeRowIndex, activeColumnIndex);
    applyWorkbookUpdate(draft => {
      setSpreadsheetColumnFilter(draft.sheets.find(item => item.id === activeSheet.id), activeColumnIndex, value, 'equals');
      return draft;
    });
  };
  const clearFilters = () => applyWorkbookUpdate(draft => {
    draft.sheets.find(item => item.id === activeSheet.id).filters = [];
    return draft;
  });
  const updateFrozen = patch => applyWorkbookUpdate(draft => {
    const sheet = draft.sheets.find(item => item.id === activeSheet.id);
    const next = { rows: Number(sheet.frozen?.rows) || 0, columns: Number(sheet.frozen?.columns) || 0, ...patch };
    sheet.frozen = next.rows || next.columns ? next : null;
    return draft;
  });
  const freezeRowsToCurrent = () => {
    if (activeRowIndex + 1 > MAX_FROZEN_ROWS) {
      message.warning(`最多冻结前 ${MAX_FROZEN_ROWS} 行`);
      return;
    }
    updateFrozen({ rows: activeRowIndex + 1 });
  };
  const freezeColumnsToCurrent = () => {
    if (activeColumnIndex + 1 > MAX_FROZEN_COLUMNS) {
      message.warning(`最多冻结前 ${MAX_FROZEN_COLUMNS} 列`);
      return;
    }
    updateFrozen({ columns: activeColumnIndex + 1 });
  };
  const freezeToCurrent = () => {
    if (activeRowIndex + 1 > MAX_FROZEN_ROWS || activeColumnIndex + 1 > MAX_FROZEN_COLUMNS) {
      message.warning(`冻结区域最多为前 ${MAX_FROZEN_ROWS} 行、${MAX_FROZEN_COLUMNS} 列`);
      return;
    }
    updateFrozen({ rows: activeRowIndex + 1, columns: activeColumnIndex + 1 });
  };
  const freezeActionItems = [
    {
      key: 'freeze-row',
      label: `冻结至当前行（${activeRowIndex + 1} 行）`,
      onClick: freezeRowsToCurrent,
    },
    {
      key: 'freeze-column',
      label: `冻结至当前列（${activeColumnIndex + 1} 列）`,
      onClick: freezeColumnsToCurrent,
    },
    {
      key: 'freeze-row-column',
      label: `冻结至当前行和列（${activeRowIndex + 1} 行 | ${activeColumnIndex + 1} 列）`,
      onClick: freezeToCurrent,
    },
    {
      key: 'clear-freeze',
      label: '取消冻结',
      disabled: !frozenRows && !frozenColumns,
      onClick: () => updateFrozen({ rows: 0, columns: 0 }),
    },
  ];

  const insertFormula = functionName => {
    let targetRow = activeRowIndex;
    let targetColumn = activeColumnIndex;
    let referenceRange = currentSelection;
    if (!rangeIsSingleCell(currentSelection)) {
      targetRow = Math.min(activeSheet.rowCount - 1, currentSelection.endRow + 1);
      targetColumn = currentSelection.startColumn;
    } else if (activeRowIndex > 0) {
      referenceRange = { startRow: 0, endRow: activeRowIndex - 1, startColumn: activeColumnIndex, endColumn: activeColumnIndex };
    } else {
      referenceRange = null;
    }
    const reference = referenceRange
      ? `${buildSpreadsheetCellKey(referenceRange.startRow, referenceRange.startColumn)}:${buildSpreadsheetCellKey(referenceRange.endRow, referenceRange.endColumn)}`
      : '';
    updateCellValue(targetRow, targetColumn, `=${functionName}(${reference})`);
    notifySelection(targetRow, targetColumn);
  };

  const toggleSpreadsheetFullscreen = async () => {
    const node = editorRef.current;
    if (!node) return;
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fullscreenElement === node) {
        const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
        if (exitFullscreen) await exitFullscreen.call(document);
        return;
      }
      const requestFullscreen = node.requestFullscreen || node.webkitRequestFullscreen;
      if (!requestFullscreen) {
        message.warning('当前浏览器不支持表格全屏');
        return;
      }
      await requestFullscreen.call(node);
    } catch {
      message.warning('无法切换表格全屏，请稍后重试');
    }
  };

  const changeZoomByStep = direction => {
    setZoom(current => {
      const currentIndex = ZOOM_LEVELS.reduce((nearestIndex, level, index) => (
        Math.abs(level - current) < Math.abs(ZOOM_LEVELS[nearestIndex] - current)
          ? index
          : nearestIndex
      ), 0);
      return ZOOM_LEVELS[clamp(currentIndex + direction, 0, ZOOM_LEVELS.length - 1)];
    });
  };

  const switchSheet = sheetId => {
    const sheet = workbook.sheets.find(item => item.id === sheetId);
    if (!sheet) return;
    onSelectedCellChange?.({ sheetId, rowIndex: 0, columnIndex: 0 });
    setSelection(normalizeSpreadsheetRange({ rowIndex: 0, columnIndex: 0 }));
    setEditingCellKey('');
    if (canEdit) applyWorkbookUpdate(draft => ({ ...draft, activeSheetId: sheetId }), { recordHistory: false });
  };
  const addSheet = () => {
    const currentSheets = workbookRef.current.sheets || [];
    const nextSheet = createDefaultSpreadsheetSheet(currentSheets.length, currentSheets);
    nextSheet.id = createUniqueSpreadsheetSheetId(currentSheets);
    applyWorkbookUpdate(draft => {
      draft.sheets.push(nextSheet);
      draft.activeSheetId = nextSheet.id;
      return draft;
    });
    onSelectedCellChange?.({ sheetId: nextSheet.id, rowIndex: 0, columnIndex: 0 });
  };
  const renameSheet = sheet => {
    let nextName = sheet.name;
    let setValidationError = null;
    Modal.confirm({
      title: '重命名工作表',
      content: (
        <SpreadsheetSheetRenameInput
          defaultValue={sheet.name}
          onChange={event => { nextName = event.target.value; }}
          onErrorSetter={setter => { setValidationError = setter; }}
        />
      ),
      okText: '保存',
      cancelText: '取消',
      onOk: close => {
        const validation = validateSpreadsheetSheetName(nextName, workbook.sheets, sheet.id);
        if (!validation.valid) {
          if (setValidationError) setValidationError(validation.error);
          else message.warning(validation.error);
          return;
        }
        applyWorkbookUpdate(draft => {
          return renameSpreadsheetSheet(draft, sheet.id, validation.name);
        });
        close?.();
      },
    });
  };
  const deleteSheet = sheet => {
    if (workbook.sheets.length <= 1) return;
    if (!canManageProtection && (sheet.protectedRanges || []).some(rule => rule.enabled !== false)) {
      message.warning('该工作表包含锁定单元格，只有文档管理者可以删除');
      return;
    }
    Modal.confirm({
      title: `删除 ${sheet.name}`,
      content: '工作表及其数据将被删除，并随文档自动保存。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const remaining = workbook.sheets.filter(item => item.id !== sheet.id);
        applyWorkbookUpdate(draft => ({
          ...draft,
          activeSheetId: remaining[0].id,
          sheets: draft.sheets.filter(item => item.id !== sheet.id),
        }));
        onSelectedCellChange?.({ sheetId: remaining[0].id, rowIndex: 0, columnIndex: 0 });
      },
    });
  };
  const moveSheet = (sheet, offset) => {
    const currentIndex = workbook.sheets.findIndex(item => item.id === sheet.id);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= workbook.sheets.length) return;
    applyWorkbookUpdate(draft => {
      const draftIndex = draft.sheets.findIndex(item => item.id === sheet.id);
      const [movedSheet] = draft.sheets.splice(draftIndex, 1);
      draft.sheets.splice(draftIndex + offset, 0, movedSheet);
      return draft;
    });
  };

  const getSheetActionMenu = sheet => ({
    items: [
      { key: 'rename', label: '重命名', disabled: !canEdit },
      { key: 'move-left', icon: <ArrowLeftOutlined />, label: '向左移动', disabled: !canEdit || workbook.sheets[0]?.id === sheet.id },
      { key: 'move-right', icon: <ArrowRightOutlined />, label: '向右移动', disabled: !canEdit || workbook.sheets[workbook.sheets.length - 1]?.id === sheet.id },
      { key: 'delete', label: '删除', danger: true, disabled: !canEdit || workbook.sheets.length <= 1 },
    ],
    onClick: ({ key }) => {
      if (key === 'rename') renameSheet(sheet);
      else if (key === 'move-left') moveSheet(sheet, -1);
      else if (key === 'move-right') moveSheet(sheet, 1);
      else if (key === 'delete') deleteSheet(sheet);
    },
  });

  const sheetListMenu = {
    items: workbook.sheets.map(sheet => ({
      key: sheet.id,
      icon: sheet.id === activeSheet.id
        ? <CheckOutlined />
        : <span className="relation-spreadsheet-sheet-list-menu__icon" />,
      label: sheet.name,
    })),
    onClick: ({ key }) => switchSheet(key),
  };

  const viewMenu = {
    items: [{ key: 'normal', icon: <CheckOutlined />, label: '普通视图' }],
  };

  const zoomMenu = {
    items: ZOOM_LEVELS.map(level => ({
      key: String(level),
      icon: level === zoom
        ? <CheckOutlined />
        : <span className="relation-spreadsheet-zoom-menu__icon" />,
      label: `${Math.round(level * 100)}%`,
    })),
    onClick: ({ key }) => setZoom(Number(key)),
  };

  const saveSelectionRule = (property, values, existingRule, prefix, options = {}) => {
    const targetRange = options.preserveExistingRange && existingRule?.range
      ? { ...normalizeSpreadsheetRange(existingRule.range) }
      : { ...currentSelectionRef.current };
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      const rules = Array.isArray(sheet[property]) ? sheet[property] : [];
      const id = existingRule?.id || createSpreadsheetRuleId(prefix, rules);
      const nextRule = {
        ...(existingRule || {}),
        ...values,
        id,
        range: targetRange,
        enabled: true,
      };
      sheet[property] = existingRule
        ? rules.map(rule => rule.id === existingRule.id ? nextRule : rule)
        : [...rules, nextRule];
      return draft;
    });
    focusSpreadsheetGrid();
  };

  const deleteSelectionRule = (property, rule) => {
    if (!rule) return;
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      sheet[property] = (sheet[property] || []).filter(item => item.id !== rule.id);
      return draft;
    });
    focusSpreadsheetGrid();
  };

  const saveProtectionRule = values => {
    if (!canManageProtection) return;
    saveSelectionRule('protectedRanges', {
      ...values,
      ownerUserId: Number(selectedProtectionRule?.ownerUserId || currentUser?.id) || null,
      allowedUserIds: (values.allowedUserIds || []).map(Number),
    }, selectedProtectionRule, 'lock', { preserveExistingRange: true });
    setProtectionOpen(false);
  };

  const saveConditionalRule = values => {
    if (!ensureSpreadsheetRangeEditable()) return;
    saveSelectionRule('conditionalFormats', {
      ...values,
      priority: selectedConditionalRule?.priority ?? (activeSheet.conditionalFormats || []).length,
    }, selectedConditionalRule, 'condition');
    setConditionalFormatOpen(false);
  };

  const saveValidationRule = values => {
    if (!ensureSpreadsheetRangeEditable()) return;
    const overlappingRule = (activeSheet.dataValidations || []).find(rule => (
      rule.id !== selectedValidationRule?.id && spreadsheetRangesOverlap(rule.range, currentSelection)
    ));
    if (overlappingRule) {
      message.warning('所选范围已有其他数据验证规则，请先调整或删除原规则');
      return;
    }
    saveSelectionRule('dataValidations', {
      ...values,
      priority: selectedValidationRule?.priority ?? (activeSheet.dataValidations || []).length,
    }, selectedValidationRule, 'validation');
    setDataValidationOpen(false);
  };

  const menuItems = [
    {
      key: 'insert',
      label: '插入',
      items: [
        { key: 'insert-row', label: '在上方插入行', onClick: insertRow },
        { key: 'insert-column', label: '在左侧插入列', onClick: insertColumn },
      ],
    },
    {
      key: 'format',
      label: '格式',
      items: [
        { key: 'bold', label: selectedCellStyle.bold ? '取消加粗' : '加粗', onClick: () => updateRangeStyle({ bold: selectedCellStyle.bold ? null : true }) },
        { key: 'fill', label: selectedCellStyle.backgroundColor ? '清除填充色' : '填充浅黄色', onClick: () => updateRangeStyle({ backgroundColor: selectedCellStyle.backgroundColor ? null : '#fef3c7' }) },
        { key: 'merge', label: findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex) ? '取消合并' : '合并选区', disabled: rangeIsSingleCell(currentSelection) && !findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex), onClick: toggleMerge },
      ],
    },
    {
      key: 'formula',
      label: '公式',
      items: ['SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX'].map(name => ({ key: name, label: name, onClick: () => insertFormula(name) })),
    },
    {
      key: 'data',
      label: '数据',
      items: [
        { key: 'sort-asc', label: '按当前列升序', onClick: () => sortSelection('asc') },
        { key: 'sort-desc', label: '按当前列降序', onClick: () => sortSelection('desc') },
        { key: 'filter-value', label: '筛选为当前值', onClick: filterCurrentValue },
        { key: 'clear-filter', label: '清除筛选', disabled: !activeSheet.filters?.length, onClick: clearFilters },
      ],
    },
    {
      key: 'view',
      label: '查看',
      items: freezeActionItems,
    },
  ];

  const renderMenu = menu => (
    <Dropdown
      key={menu.key}
      menu={{
        items: menu.items.map(item => ({
          key: item.key,
          label: item.label,
          disabled: !canEdit || (menu.key !== 'view' && selectionLocked) || item.disabled,
          danger: item.danger,
        })),
        onClick: ({ key }) => menu.items.find(item => item.key === key)?.onClick?.(),
      }}
    >
      <Button type="text" size="small">{menu.label}</Button>
    </Dropdown>
  );

  const contextMenuItems = [
    { key: 'cut', label: '剪切', disabled: !canEdit || selectionLocked },
    { key: 'copy', label: '复制' },
    { key: 'paste', label: '粘贴', disabled: !canEdit || selectionLocked },
    {
      key: 'insert-copied',
      label: '插入复制的单元格',
      disabled: !canEdit || selectionLocked || !clipboardState?.payload,
      children: [
        { key: 'insert-copy-right', label: '右移' },
        { key: 'insert-copy-down', label: '下移' },
      ],
    },
    { type: 'divider' },
    {
      key: 'clear',
      label: '清除',
      disabled: !canEdit || selectionLocked,
      children: [
        { key: 'clear-content', label: '清除内容' },
        { key: 'clear-format', label: '清除格式' },
        { key: 'clear-all', label: '清除全部' },
      ],
    },
    {
      key: 'insert-cells',
      label: '插入',
      disabled: !canEdit || selectionLocked,
      children: [
        { key: 'insert-cell-right', label: '插入单元格 - 右移' },
        { key: 'insert-cell-down', label: '插入单元格 - 下移' },
        { key: 'insert-row', label: '在上方插入行' },
        { key: 'insert-column', label: '在左侧插入列' },
      ],
    },
    {
      key: 'delete-cells',
      label: '删除',
      disabled: !canEdit || selectionLocked,
      children: [
        { key: 'delete-row', label: '删除行', danger: true, disabled: activeSheet.rowCount <= 1 },
        { key: 'delete-column', label: '删除列', danger: true, disabled: activeSheet.columnCount <= 1 },
        { key: 'delete-cell-left', label: '删除单元格 - 左移', danger: true },
        { key: 'delete-cell-up', label: '删除单元格 - 上移', danger: true },
      ],
    },
    { type: 'divider' },
    {
      key: 'sort',
      label: '排序',
      disabled: !canEdit || selectionLocked,
      children: [
        { key: 'sort-asc', label: '升序' },
        { key: 'sort-desc', label: '降序' },
        { key: 'sort-custom', label: '自定义排序' },
      ],
    },
    {
      key: 'merge',
      label: findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex) ? '取消合并单元格' : '合并单元格',
      disabled: !canEdit || selectionLocked || (rangeIsSingleCell(currentSelection) && !findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex)),
    },
    { key: 'cell-format', label: '设置单元格格式', disabled: !canEdit || selectionLocked },
    { type: 'divider' },
    {
      key: 'protection',
      icon: <LockOutlined />,
      label: selectedProtectionRule ? '管理锁定单元格' : '锁定单元格',
      disabled: !canManageProtection,
    },
    { key: 'conditional-format', label: selectedConditionalRule ? '编辑条件格式' : '条件格式', disabled: !canEdit || selectionLocked },
    { key: 'data-validation', label: selectedValidationRule ? '编辑数据验证' : '数据验证', disabled: !canEdit || selectionLocked },
  ];

  const handleContextMenuAction = ({ key }) => {
    if (key === 'cut') writeSelectionToSystemClipboard('cut');
    else if (key === 'copy') writeSelectionToSystemClipboard('copy');
    else if (key === 'paste') pasteFromContextMenu('');
    else if (key === 'insert-copy-right') pasteFromContextMenu('insert-right');
    else if (key === 'insert-copy-down') pasteFromContextMenu('insert-down');
    else if (key === 'clear-content') clearSelection('content');
    else if (key === 'clear-format') clearSelection('format');
    else if (key === 'clear-all') clearSelection('all');
    else if (key === 'insert-cell-right') shiftSelectedCells('insert-right');
    else if (key === 'insert-cell-down') shiftSelectedCells('insert-down');
    else if (key === 'insert-row') insertRow();
    else if (key === 'insert-column') insertColumn();
    else if (key === 'delete-row') deleteRow();
    else if (key === 'delete-column') deleteColumn();
    else if (key === 'delete-cell-left') shiftSelectedCells('delete-left');
    else if (key === 'delete-cell-up') shiftSelectedCells('delete-up');
    else if (key === 'sort-asc') sortSelection('asc');
    else if (key === 'sort-desc') sortSelection('desc');
    else if (key === 'sort-custom') setCustomSortOpen(true);
    else if (key === 'merge') toggleMerge();
    else if (key === 'cell-format') setCellFormatOpen(true);
    else if (key === 'protection') setProtectionOpen(true);
    else if (key === 'conditional-format') setConditionalFormatOpen(true);
    else if (key === 'data-validation') setDataValidationOpen(true);
  };

  const renderCell = (rowPosition, columnIndex) => {
    const rowIndex = visibleRows[rowPosition];
    const merged = findSpreadsheetMergedRange(activeSheet, rowIndex, columnIndex);
    if (merged && (rowIndex !== merged.startRow || columnIndex !== merged.startColumn)) return null;
    const mergedEndRowPosition = merged ? rowPositionByIndex.get(merged.endRow) : rowPosition;
    const cellWidth = merged
      ? columnOffsets[Math.min(activeSheet.columnCount, merged.endColumn + 1)] - columnOffsets[merged.startColumn]
      : columnWidth(columnIndex);
    const cellHeight = merged && mergedEndRowPosition !== undefined
      ? rowOffsets[mergedEndRowPosition + 1] - rowOffsets[rowPosition]
      : rowHeight(rowIndex);
    const frozenRow = rowPosition < frozenRows;
    const frozenColumn = columnIndex < frozenColumns;
    const top = frozenRow
      ? scrollState.top + COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition]
      : COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition];
    const left = frozenColumn
      ? scrollState.left + ROW_HEADER_WIDTH + columnOffsets[columnIndex]
      : ROW_HEADER_WIDTH + columnOffsets[columnIndex];
    const cell = getSpreadsheetCellObject(activeSheet, rowIndex, columnIndex);
    const rawValue = getSpreadsheetCellRawValue(activeSheet, rowIndex, columnIndex);
    const calculatedValue = evaluator.getValue(activeSheet.id, rowIndex, columnIndex);
    const conditionalStyle = getSpreadsheetConditionalStyle(
      activeSheet,
      rowIndex,
      columnIndex,
      calculatedValue,
      (sheetId, targetRow, targetColumn) => evaluator.getValue(sheetId, targetRow, targetColumn),
    );
    const style = { ...(cell.style || {}), ...conditionalStyle };
    const displayValue = formatSpreadsheetDisplayValue(calculatedValue, style.numberFormat);
    const cellFontSize = clamp(Number(style.fontSize) || DEFAULT_FONT_SIZE, 8, 48) * Math.min(1.15, zoom);
    const cellTextColor = evaluator.isError(calculatedValue) ? '#dc2626' : (style.color || '#111827');
    const justifyContent = style.horizontalAlign === 'center'
      ? 'center'
      : style.horizontalAlign === 'right'
        ? 'flex-end'
        : 'flex-start';
    const alignItems = style.verticalAlign === 'top'
      ? 'flex-start'
      : style.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center';
    const selected = spreadsheetRangeContainsCell(currentSelection, rowIndex, columnIndex);
    const active = rowIndex === activeRowIndex && columnIndex === activeColumnIndex;
    const selectionEdgeShadows = selected ? [
      rowIndex === currentSelection.startRow ? `inset 0 2px 0 ${SELECTION_BORDER_COLOR}` : '',
      rowIndex === currentSelection.endRow ? `inset 0 -2px 0 ${SELECTION_BORDER_COLOR}` : '',
      columnIndex === currentSelection.startColumn ? `inset 2px 0 0 ${SELECTION_BORDER_COLOR}` : '',
      columnIndex === currentSelection.endColumn ? `inset -2px 0 0 ${SELECTION_BORDER_COLOR}` : '',
    ].filter(Boolean).join(', ') : '';
    const selectionHandle = selected
      && rowIndex === currentSelection.endRow
      && columnIndex === currentSelection.endColumn;
    const formulaReference = formulaReferences.find(reference => (
      spreadsheetRangeContainsCell(reference, rowIndex, columnIndex)
    ));
    const formulaReferenceColor = formulaReference?.color;
    const remoteCollaborator = activeRemoteCollaborators.find(item => (
      spreadsheetRangeContainsCell(item.selection, rowIndex, columnIndex)
    ));
    const cellProtectionAccess = getSpreadsheetProtectedRangeAccess(activeSheet, { rowIndex, columnIndex }, {
      userId: currentUser?.id,
      canManage: canManageProtection,
    });
    const cellValidationRules = (activeSheet.dataValidations || []).filter(rule => (
      rule?.enabled !== false && spreadsheetRangeContainsCell(rule.range, rowIndex, columnIndex)
    ));
    const listValidationRule = cellValidationRules.find(rule => rule.type === 'list' && Array.isArray(rule.values));
    const cellLocked = !cellProtectionAccess.allowed;
    const cellHasProtection = cellProtectionAccess.rules.length > 0;
    const editing = active && editingCellKey === buildSpreadsheetCellKey(rowIndex, columnIndex) && canEdit && !cellLocked;
    return (
      <div
        key={`cell-${rowIndex}-${columnIndex}`}
        role="gridcell"
        aria-selected={selected}
        data-spreadsheet-row-index={rowIndex}
        data-spreadsheet-column-index={columnIndex}
        data-spreadsheet-formula-reference={formulaReference?.token || undefined}
        data-spreadsheet-locked={cellLocked ? 'true' : undefined}
        data-spreadsheet-protected={cellHasProtection ? 'true' : undefined}
        data-spreadsheet-conditional={Object.keys(conditionalStyle).length ? 'true' : undefined}
        data-spreadsheet-validation={cellValidationRules.length ? cellValidationRules.map(rule => rule.id).join(',') : undefined}
        data-spreadsheet-remote-selection={remoteCollaborator?.session_id || undefined}
        data-spreadsheet-selection-anchor={selected && active ? 'true' : undefined}
        title={remoteCollaborator
          ? `${remoteCollaborator.user_name} 的选区`
          : (cellHasProtection
            ? (cellProtectionAccess.rules[0]?.description || '锁定单元格')
            : (formulaReference ? `公式引用 ${formulaReference.token}` : undefined))}
        onMouseDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          setEditingCellKey('');
          const anchor = event.shiftKey
            ? (selectionAnchor || { rowIndex: currentSelection.startRow, columnIndex: currentSelection.startColumn })
            : { rowIndex, columnIndex };
          setSelectionAnchor(anchor);
          setIsSelecting(true);
          notifySelection(rowIndex, columnIndex, event.shiftKey ? normalizeSpreadsheetRange({
            startRow: anchor.rowIndex,
            endRow: rowIndex,
            startColumn: anchor.columnIndex,
            endColumn: columnIndex,
          }) : null);
        }}
        onMouseEnter={() => {
          if (!isSelecting || !selectionAnchor) return;
          const nextSelection = normalizeSpreadsheetRange({
            startRow: selectionAnchor.rowIndex,
            endRow: rowIndex,
            startColumn: selectionAnchor.columnIndex,
            endColumn: columnIndex,
          });
          currentSelectionRef.current = nextSelection;
          setSelection(nextSelection);
        }}
        onContextMenu={() => {
          setEditingCellKey('');
          if (!spreadsheetRangeContainsCell(currentSelection, rowIndex, columnIndex)) {
            notifySelection(rowIndex, columnIndex);
          }
          editorActiveRef.current = true;
        }}
        onDoubleClick={() => {
          if (formatPainterRef.current || Date.now() < suppressCellEditUntilRef.current) return;
          if (!ensureSpreadsheetRangeEditable({ rowIndex, columnIndex })) return;
          notifySelection(rowIndex, columnIndex);
          beginInputTransaction(`cell:${activeSheet.id}:${buildSpreadsheetCellKey(rowIndex, columnIndex)}`);
          setEditingCellKey(buildSpreadsheetCellKey(rowIndex, columnIndex));
        }}
        style={{
          position: 'absolute',
          top,
          left,
          width: cellWidth,
          height: cellHeight,
          boxSizing: 'border-box',
          borderRight: formulaReferenceColor && columnIndex === formulaReference.endColumn
            ? `2px dashed ${formulaReferenceColor}`
            : '1px solid #e5e7eb',
          borderBottom: formulaReferenceColor && rowIndex === formulaReference.endRow
            ? `2px dashed ${formulaReferenceColor}`
            : '1px solid #e5e7eb',
          borderTop: formulaReferenceColor && rowIndex === formulaReference.startRow
            ? `2px dashed ${formulaReferenceColor}`
            : (style.border ? `1px solid ${style.border.color || '#cbd5e1'}` : undefined),
          borderLeft: formulaReferenceColor && columnIndex === formulaReference.startColumn
            ? `2px dashed ${formulaReferenceColor}`
            : (style.border ? `1px solid ${style.border.color || '#cbd5e1'}` : undefined),
          background: selected && !active
            ? SELECTION_FILL_COLOR
            : (remoteCollaborator ? `${remoteCollaborator.color || '#389e0d'}1f` : (style.backgroundColor || '#fff')),
          boxShadow: selected
            ? (selectionEdgeShadows || 'none')
            : (remoteCollaborator ? `inset 0 0 0 2px ${remoteCollaborator.color || '#389e0d'}` : 'none'),
          zIndex: frozenRow && frozenColumn ? 12 : (frozenRow || frozenColumn ? 8 : (selected ? 4 : 1)),
          overflow: selectionHandle ? 'visible' : 'hidden',
          cursor: cellLocked ? 'not-allowed' : 'cell',
        }}
      >
        {cellHasProtection ? <LockOutlined className="relation-spreadsheet-cell-lock" aria-hidden="true" /> : null}
        {active && canEdit && !cellLocked && !editing && listValidationRule ? (
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: listValidationRule.values.map((value, index) => ({
                key: `${index}`,
                label: String(value),
              })),
              onClick: ({ key }) => {
                const value = listValidationRule.values[Number(key)];
                updateCellValue(rowIndex, columnIndex, value);
                focusSpreadsheetGrid();
              },
            }}
          >
            <button
              type="button"
              className="relation-spreadsheet-validation-trigger"
              aria-label="选择数据验证选项"
              onMouseDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
            >
              <CaretDownOutlined />
            </button>
          </Dropdown>
        ) : null}
        {editing ? (
          <Input
            autoFocus
            variant="borderless"
            value={rawValue}
            onMouseDown={event => event.stopPropagation()}
            onFocus={() => beginInputTransaction(`cell:${activeSheet.id}:${buildSpreadsheetCellKey(rowIndex, columnIndex)}`)}
            onChange={event => {
              updateCellValue(rowIndex, columnIndex, event.target.value, { recordHistory: false });
              window.setTimeout(() => detectInputMention(event, rowIndex, columnIndex), 0);
            }}
            onBlur={() => {
              commitInputTransaction();
              setEditingCellKey('');
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                commitInputTransaction();
                setEditingCellKey('');
                moveSelection(event.key === 'Enter' ? (event.shiftKey ? -1 : 1) : 0, event.key === 'Tab' ? (event.shiftKey ? -1 : 1) : 0);
                window.requestAnimationFrame(() => editorRef.current?.focus());
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelInputTransaction();
                setEditingCellKey('');
                window.requestAnimationFrame(() => editorRef.current?.focus());
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              padding: '0 6px',
              borderRadius: 0,
              background: '#fff',
              fontFamily: style.fontFamily || DEFAULT_FONT_FAMILY,
              fontSize: cellFontSize,
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
              textDecoration: style.underline ? 'underline' : 'none',
              color: cellTextColor,
              textAlign: style.horizontalAlign || 'left',
            }}
          />
        ) : (
          <div style={{
            height: '100%',
            padding: listValidationRule && active ? '0 24px 0 6px' : '0 6px',
            overflow: 'hidden',
            display: 'flex',
            alignItems,
            justifyContent,
            whiteSpace: style.wrap ? 'normal' : 'nowrap',
            textOverflow: 'ellipsis',
            lineHeight: '18px',
            fontFamily: style.fontFamily || DEFAULT_FONT_FAMILY,
            fontWeight: style.bold ? 700 : 400,
            fontStyle: style.italic ? 'italic' : 'normal',
            textDecoration: style.underline ? 'underline' : 'none',
            color: cellTextColor,
            fontSize: cellFontSize,
          }}>
            {String(displayValue ?? '')}
          </div>
        )}
        {selectionHandle ? (
          <span
            aria-hidden="true"
            className="relation-spreadsheet-selection-fill-handle"
            data-spreadsheet-selection-fill-handle="true"
          />
        ) : null}
      </div>
    );
  };

  return (
    <section
      ref={editorRef}
      className={`relation-spreadsheet-editor${fillAvailableHeight ? ' relation-spreadsheet-editor--fill' : ''}${frameless ? ' relation-spreadsheet-editor--frameless' : ''}${workspaceFocusMode ? ' relation-spreadsheet-editor--focus-mode' : ''}${formatPainter ? ' relation-spreadsheet-editor--format-painter-active' : ''}`}
      aria-label="在线表格编辑区"
      data-spreadsheet-editor-root="true"
      data-spreadsheet-format-painter-mode={formatPainter ? (formatPainter.continuous ? 'continuous' : 'once') : 'off'}
      tabIndex={0}
      onFocusCapture={() => { editorActiveRef.current = true; }}
      onPointerDownCapture={() => { editorActiveRef.current = true; }}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onCut={handleCut}
      onKeyDown={handleGridKeyDown}
      style={{
        height: fillAvailableHeight ? '100%' : (isMobile ? 'calc(100vh - 210px)' : 'calc(100vh - 230px)'),
        minHeight: fillAvailableHeight ? 0 : (isMobile ? 520 : 620),
        border: frameless ? 'none' : '1px solid #d9d9d9',
        borderRadius: frameless ? 0 : 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        outline: 'none',
      }}
    >
      <div
        className="relation-spreadsheet-command-area"
        style={{ borderBottom: '1px solid #e5e7eb', background: fillAvailableHeight ? '#fff' : '#fafafa' }}
      >
        <div
          className="relation-spreadsheet-menu-bar"
          data-spreadsheet-menu-bar="true"
          hidden={workspaceFocusMode}
          style={{
            display: workspaceFocusMode ? 'none' : 'flex',
            alignItems: 'center',
            gap: 2,
            minHeight: fillAvailableHeight ? 30 : undefined,
            overflowX: 'auto',
            padding: fillAvailableHeight ? '3px 8px 2px' : '5px 8px 3px',
          }}
        >
          {menuItems.map(renderMenu)}
          <div style={{ flex: 1 }} />
          {remoteCollaborators.length > 0 && (
            <Tooltip title={`${remoteCollaborators.map(item => item.user_name).join('、')} 正在查看此表格`}>
              <div
                data-spreadsheet-online-collaborators="true"
                aria-label={`${remoteCollaborators.length} 位协作者在线`}
                style={{ display: 'flex', alignItems: 'center', marginRight: 6 }}
              >
                {remoteCollaborators.slice(0, 3).map((item, index) => (
                  <span
                    key={item.session_id}
                    aria-label={item.user_name}
                    style={{
                      width: 24,
                      height: 24,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: item.color || '#389e0d',
                      border: '2px solid #fff',
                      borderRadius: '50%',
                      boxSizing: 'border-box',
                      color: '#fff',
                      fontSize: 12,
                      marginLeft: index ? -6 : 0,
                    }}
                  >
                    {item.user_name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
                {remoteCollaborators.length > 3 && (
                  <span
                    aria-label={`另有 ${remoteCollaborators.length - 3} 位协作者`}
                    style={{
                      width: 24,
                      height: 24,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: -6,
                      backgroundColor: '#64748b',
                      border: '2px solid #fff',
                      borderRadius: '50%',
                      boxSizing: 'border-box',
                      color: '#fff',
                      fontSize: 11,
                    }}
                  >
                    +{remoteCollaborators.length - 3}
                  </span>
                )}
              </div>
            </Tooltip>
          )}
          <Tooltip title="导入 Excel">
            <Button
              aria-label="导入 Excel"
              type="text"
              size="small"
              icon={<UploadOutlined />}
              loading={importing}
              disabled={importDisabled}
              onClick={() => fileInputRef.current?.click()}
            />
          </Tooltip>
          <Tooltip title="导出 Excel">
            <Button aria-label="导出 Excel" type="text" size="small" icon={<DownloadOutlined />} onClick={onExportXlsx} />
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm"
            disabled={importDisabled}
            hidden
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!importDisabled && file) onImportXlsx?.(file);
            }}
          />
        </div>
        <div className="relation-spreadsheet-toolbar-shell">
          <div
            className="relation-spreadsheet-toolbar-scroll"
            data-spreadsheet-toolbar="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              minHeight: fillAvailableHeight ? 34 : undefined,
              overflowX: 'auto',
              padding: fillAvailableHeight ? '2px 8px 4px' : '4px 8px 7px',
            }}
          >
          <SpreadsheetToolbarButton title="在上方插入行" disabled={selectionMutationDisabled} icon={<InsertRowAboveOutlined />} onClick={insertRow} />
          <SpreadsheetToolbarButton title="删除当前行" disabled={selectionMutationDisabled || activeSheet.rowCount <= 1} danger icon={<DeleteRowOutlined />} onClick={deleteRow} />
          <SpreadsheetToolbarButton title="在左侧插入列" disabled={selectionMutationDisabled} icon={<InsertRowRightOutlined />} onClick={insertColumn} />
          <SpreadsheetToolbarButton title="删除当前列" disabled={selectionMutationDisabled || activeSheet.columnCount <= 1} danger icon={<DeleteColumnOutlined />} onClick={deleteColumn} />
          <div style={{ width: 1, height: 20, background: '#d9d9d9', margin: '0 4px' }} />
          <Tooltip title={<span>格式刷<br /><small>双击连续使用格式刷</small></span>}>
            <Button
              aria-label="格式刷"
              aria-pressed={Boolean(formatPainter)}
              data-spreadsheet-format-painter="true"
              data-spreadsheet-format-painter-mode={formatPainter ? (formatPainter.continuous ? 'continuous' : 'once') : 'off'}
              type="text"
              size="small"
              disabled={!canEdit}
              className={`relation-spreadsheet-format-painter${formatPainter ? ' relation-spreadsheet-format-painter--active' : ''}`}
              icon={<FormatPainterOutlined />}
              onClick={event => {
                event.stopPropagation();
                if (event.detail > 1) return;
                if (formatPainterRef.current) setActiveFormatPainter(null);
                else activateFormatPainter(false);
              }}
              onDoubleClick={event => {
                event.preventDefault();
                event.stopPropagation();
                activateFormatPainter(true);
              }}
            />
          </Tooltip>
          <Select
            aria-label="字体"
            size="small"
            disabled={selectionMutationDisabled}
            value={selectedFontFamily}
            style={{ width: 118 }}
            options={FONT_FAMILY_OPTIONS.map(value => ({ value, label: value }))}
            onChange={value => updateRangeStyle({ fontFamily: value === DEFAULT_FONT_FAMILY ? null : value })}
          />
          <Select
            aria-label="字号"
            size="small"
            disabled={selectionMutationDisabled}
            value={selectedFontSize}
            style={{ width: 72 }}
            options={FONT_SIZE_OPTIONS.map(value => ({ value, label: `${value}` }))}
            onChange={value => updateRangeStyle({ fontSize: value === DEFAULT_FONT_SIZE ? null : value })}
          />
          <SpreadsheetToolbarButton title="加粗" disabled={selectionMutationDisabled} active={Boolean(selectedCellStyle.bold)} icon={<BoldOutlined />} onClick={() => updateRangeStyle({ bold: selectedCellStyle.bold ? null : true })} />
          <Tooltip title="斜体">
            <Button
              aria-label="斜体"
              type={selectedCellStyle.italic ? 'primary' : 'text'}
              size="small"
              disabled={selectionMutationDisabled}
              onClick={() => updateRangeStyle({ italic: selectedCellStyle.italic ? null : true })}
              style={{ fontStyle: 'italic', fontFamily: 'Times New Roman, serif' }}
            >
              I
            </Button>
          </Tooltip>
          <Tooltip title="下划线">
            <Button
              aria-label="下划线"
              type={selectedCellStyle.underline ? 'primary' : 'text'}
              size="small"
              disabled={selectionMutationDisabled}
              onClick={() => updateRangeStyle({ underline: selectedCellStyle.underline ? null : true })}
              style={{ textDecoration: 'underline' }}
            >
              U
            </Button>
          </Tooltip>
          <Dropdown menu={{ items: TEXT_COLOR_OPTIONS.map(value => ({
            key: value,
            label: <span><span style={{ display: 'inline-block', width: 12, height: 12, marginRight: 8, background: value, border: '1px solid #d9d9d9', verticalAlign: -1 }} />{value}</span>,
          })), onClick: ({ key }) => updateRangeStyle({ color: key === '#111827' ? null : key }) }}>
            <Button aria-label="文字颜色" type="text" size="small" disabled={selectionMutationDisabled} style={{ color: selectedCellStyle.color || '#111827' }}>A</Button>
          </Dropdown>
          <Dropdown menu={{ items: FILL_COLOR_OPTIONS.map(value => ({
            key: value,
            label: <span><span style={{ display: 'inline-block', width: 12, height: 12, marginRight: 8, background: value, border: '1px solid #d9d9d9', verticalAlign: -1 }} />{value}</span>,
          })), onClick: ({ key }) => updateRangeStyle({ backgroundColor: key === '#ffffff' ? null : key }) }}>
            <Button aria-label="填充色" type="text" size="small" disabled={selectionMutationDisabled} icon={<BgColorsOutlined />} />
          </Dropdown>
          <Dropdown menu={{ items: [
            { key: 'left', label: '左对齐' },
            { key: 'center', label: '居中' },
            { key: 'right', label: '右对齐' },
          ], onClick: ({ key }) => updateRangeStyle({ horizontalAlign: key === 'left' ? null : key }) }}>
            <Button aria-label="水平对齐" type="text" size="small" disabled={selectionMutationDisabled}>
              {selectedCellStyle.horizontalAlign === 'center' ? '居中' : selectedCellStyle.horizontalAlign === 'right' ? '右' : '左'}
            </Button>
          </Dropdown>
          <Dropdown menu={{ items: [
            { key: 'top', label: '顶部对齐' },
            { key: 'middle', label: '垂直居中' },
            { key: 'bottom', label: '底部对齐' },
          ], onClick: ({ key }) => updateRangeStyle({ verticalAlign: key === 'middle' ? null : key }) }}>
            <Button aria-label="垂直对齐" type="text" size="small" disabled={selectionMutationDisabled}>
              {selectedCellStyle.verticalAlign === 'top' ? '上' : selectedCellStyle.verticalAlign === 'bottom' ? '下' : '中'}
            </Button>
          </Dropdown>
          <Tooltip title="自动换行">
            <Button
              aria-label="自动换行"
              type={selectedCellStyle.wrap ? 'primary' : 'text'}
              size="small"
              disabled={selectionMutationDisabled}
              onClick={() => updateRangeStyle({ wrap: selectedCellStyle.wrap ? null : true })}
            >
              换行
            </Button>
          </Tooltip>
          <Tooltip title="边框">
            <Button
              aria-label="边框"
              type={selectedCellStyle.border ? 'primary' : 'text'}
              size="small"
              disabled={selectionMutationDisabled}
              onClick={() => updateRangeStyle({ border: selectedCellStyle.border ? null : { color: '#cbd5e1' } })}
            >
              □
            </Button>
          </Tooltip>
          <SpreadsheetToolbarButton title={findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex) ? '取消合并' : '合并选区'} disabled={selectionMutationDisabled || (rangeIsSingleCell(currentSelection) && !findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex))} active={Boolean(findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex))} icon={<MergeCellsOutlined />} onClick={toggleMerge} />
          <SpreadsheetToolbarButton title="清空内容" disabled={selectionMutationDisabled} icon={<ClearOutlined />} onClick={() => clearSelection('content')} />
          <div style={{ width: 1, height: 20, background: '#d9d9d9', margin: '0 4px' }} />
          <Dropdown menu={{ items: [
            { key: 'SUM', label: 'SUM 求和' },
            { key: 'AVERAGE', label: 'AVERAGE 平均值' },
            { key: 'COUNT', label: 'COUNT 计数' },
            { key: 'MAX', label: 'MAX 最大值' },
            { key: 'MIN', label: 'MIN 最小值' },
            { key: 'SUMIF', label: 'SUMIF 条件求和' },
            { key: 'COUNTIF', label: 'COUNTIF 条件计数' },
            { key: 'VLOOKUP', label: 'VLOOKUP 纵向查找' },
            { key: 'XLOOKUP', label: 'XLOOKUP 查找' },
          ], onClick: ({ key }) => insertFormula(key) }}>
            <Button aria-label="常用公式" type="text" size="small" icon={<FunctionOutlined />} disabled={selectionMutationDisabled} />
          </Dropdown>
          <SpreadsheetToolbarButton title="升序" disabled={selectionMutationDisabled} icon={<SortAscendingOutlined />} onClick={() => sortSelection('asc')} />
          <SpreadsheetToolbarButton title="降序" disabled={selectionMutationDisabled} icon={<SortDescendingOutlined />} onClick={() => sortSelection('desc')} />
          <SpreadsheetToolbarButton title="筛选为当前值" disabled={selectionMutationDisabled} active={Boolean(activeSheet.filters?.length)} icon={<FilterOutlined />} onClick={filterCurrentValue} />
          <Tooltip title="冻结行列">
            <Dropdown
              trigger={['click']}
              placement="bottomLeft"
              disabled={!canEdit}
              overlayClassName="relation-spreadsheet-freeze-menu"
              menu={{
                items: [
                  ...freezeActionItems.slice(0, 3).map(item => ({
                    key: item.key,
                    label: item.label,
                  })),
                  { type: 'divider' },
                  {
                    key: freezeActionItems[3].key,
                    label: freezeActionItems[3].label,
                    disabled: freezeActionItems[3].disabled,
                  },
                ],
                onClick: ({ key }) => freezeActionItems.find(item => item.key === key)?.onClick?.(),
              }}
            >
              <Button
                aria-label="冻结行列"
                data-spreadsheet-freeze-trigger="true"
                type="text"
                size="small"
                disabled={!canEdit}
                className={`relation-spreadsheet-freeze-trigger${frozenRows || frozenColumns ? ' relation-spreadsheet-freeze-trigger--active' : ''}`}
              >
                <BorderInnerOutlined />
                <CaretDownOutlined className="relation-spreadsheet-freeze-trigger__caret" />
              </Button>
            </Dropdown>
          </Tooltip>
          </div>
          {typeof onWorkspaceFocusModeChange === 'function' && (
            <div className="relation-spreadsheet-focus-toggle-slot">
              <Tooltip title={workspaceFocusMode ? '展开标题与菜单' : '收起标题与菜单'} placement="left">
                <Button
                  type="text"
                  size="small"
                  className="relation-spreadsheet-focus-toggle"
                  data-spreadsheet-focus-toggle="true"
                  aria-label={workspaceFocusMode ? '展开标题与菜单' : '收起标题与菜单'}
                  aria-pressed={workspaceFocusMode}
                  icon={workspaceFocusMode ? <CaretDownOutlined /> : <CaretUpOutlined />}
                  onKeyDown={event => event.stopPropagation()}
                  onClick={() => onWorkspaceFocusModeChange(!workspaceFocusMode)}
                />
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {collaborationNotice ? (
        <Alert
          data-spreadsheet-collaboration-notice="true"
          type={String(collaborationNotice).startsWith('检测到') ? 'warning' : 'info'}
          showIcon
          message={collaborationNotice}
          style={{ borderRadius: 0, borderWidth: '0 0 1px' }}
        />
      ) : null}

      <div className="relation-spreadsheet-formula-bar" data-spreadsheet-formula-bar="true" style={{
        display: 'grid',
        gridTemplateColumns: fillAvailableHeight ? '74px minmax(0, 1fr)' : '112px minmax(0, 1fr)',
        alignItems: 'center',
        gap: fillAvailableHeight ? 0 : 8,
        minHeight: fillAvailableHeight ? 29 : undefined,
        padding: fillAvailableHeight ? 0 : '7px 10px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <Input className="relation-spreadsheet-name-box" size="small" value={selectionLabel} readOnly />
        <Input
          className="relation-spreadsheet-formula-input"
          data-spreadsheet-formula-input="true"
          data-spreadsheet-formula-reference-count={formulaReferences.length}
          size="small"
          prefix={<Text type="secondary">fx</Text>}
          value={selectedCellRawValue}
          readOnly={!canEdit || selectionLocked}
          onFocus={() => beginInputTransaction(`formula:${activeSheet.id}:${activeCellKey}`)}
          onChange={event => {
            beginInputTransaction(`formula:${activeSheet.id}:${activeCellKey}`);
            updateCellValue(activeRowIndex, activeColumnIndex, event.target.value, { recordHistory: false });
            window.setTimeout(() => detectInputMention(event, activeRowIndex, activeColumnIndex), 0);
          }}
          onBlur={commitInputTransaction}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitInputTransaction();
              event.currentTarget.blur();
              window.requestAnimationFrame(() => editorRef.current?.focus());
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelInputTransaction();
              event.currentTarget.blur();
              window.requestAnimationFrame(() => editorRef.current?.focus());
            }
          }}
          placeholder="输入值或以 = 开头的公式"
        />
      </div>

      <Dropdown
        trigger={['contextMenu']}
        overlayClassName="relation-spreadsheet-context-menu"
        menu={{ items: contextMenuItems, onClick: handleContextMenuAction }}
        onOpenChange={open => { if (!open) focusSpreadsheetGrid(); }}
      >
        <div
          ref={viewportRef}
          role="grid"
          data-spreadsheet-grid="true"
          aria-rowcount={activeSheet.rowCount}
          aria-colcount={activeSheet.columnCount}
          onScroll={event => {
          const {
            scrollTop,
            scrollLeft,
            scrollHeight,
            clientHeight,
          } = event.currentTarget;
          setScrollState(current => ({
            ...current,
            top: scrollTop,
            left: scrollLeft,
          }));
          onViewportScroll?.({ scrollTop, scrollLeft, scrollHeight, clientHeight });
        }}
          style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', background: '#f8fafc' }}
        >
          <div style={{ position: 'relative', width: totalWidth, height: totalHeight, minWidth: '100%' }}>
          {columns.map(columnIndex => {
            const frozen = columnIndex < frozenColumns;
            const selectedHeader = selectsWholeColumns
              && columnIndex >= currentSelection.startColumn
              && columnIndex <= currentSelection.endColumn;
            const highlightedHeader = selectedHeader || (!selectsWholeRows && activeColumnIndex === columnIndex);
            const columnResizeAllowed = getSpreadsheetProtectedRangeAccess(activeSheet, {
              startRow: 0,
              endRow: activeSheet.rowCount - 1,
              startColumn: columnIndex,
              endColumn: columnIndex,
            }, {
              userId: currentUser?.id,
              canManage: canManageProtection,
            }).allowed;
            const left = frozen
              ? scrollState.left + ROW_HEADER_WIDTH + columnOffsets[columnIndex]
              : ROW_HEADER_WIDTH + columnOffsets[columnIndex];
            return (
              <div
                key={`column-${columnIndex}`}
                role="columnheader"
                aria-label={`选择 ${spreadsheetColumnLabel(columnIndex)} 列`}
                aria-selected={selectedHeader}
                data-spreadsheet-column-header={columnIndex}
                onMouseDown={event => {
                  if (event.button !== 0 || event.target.closest('[data-spreadsheet-resize-handle]')) return;
                  event.preventDefault();
                  selectWholeColumn(columnIndex);
                }}
                style={{
                  position: 'absolute',
                  left,
                  top: scrollState.top,
                  width: columnWidth(columnIndex),
                  height: COLUMN_HEADER_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  borderRight: '1px solid #d1d5db',
                  borderBottom: '1px solid #d1d5db',
                  background: selectedHeader ? '#dbeafe' : (highlightedHeader ? '#e6f4ff' : '#f3f4f6'),
                  color: selectedHeader ? '#1677ff' : '#4b5563',
                  fontWeight: 600,
                  boxShadow: selectedHeader ? 'inset 0 -2px 0 #1677ff' : 'none',
                  zIndex: frozen ? 22 : 18,
                  userSelect: 'none',
                  cursor: 'pointer',
                }}>
                {spreadsheetColumnLabel(columnIndex)}
                {activeSheet.filters?.some(filter => Number(filter.columnIndex) === columnIndex) && (
                  <FilterOutlined style={{ marginLeft: 5, color: '#1677ff', fontSize: 11 }} />
                )}
                {canEdit && columnResizeAllowed && (
                  <span
                    aria-label={`调整 ${spreadsheetColumnLabel(columnIndex)} 列宽`}
                    data-spreadsheet-resize-handle="column"
                    onPointerDown={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      setResizeDrag({ axis: 'column', index: columnIndex, startPosition: event.clientX, startSize: columnWidth(columnIndex) / zoom, previewSize: columnWidth(columnIndex) / zoom, min: 48, max: 480 });
                    }}
                    style={{ position: 'absolute', top: 0, right: -3, width: 7, height: '100%', cursor: 'col-resize', zIndex: 2 }}
                  />
                )}
              </div>
            );
          })}

          {rowPositions.map(rowPosition => {
            const rowIndex = visibleRows[rowPosition];
            const frozen = rowPosition < frozenRows;
            const selectedHeader = selectsWholeRows
              && rowIndex >= currentSelection.startRow
              && rowIndex <= currentSelection.endRow;
            const highlightedHeader = selectedHeader || (!selectsWholeColumns && activeRowIndex === rowIndex);
            const rowResizeAllowed = getSpreadsheetProtectedRangeAccess(activeSheet, {
              startRow: rowIndex,
              endRow: rowIndex,
              startColumn: 0,
              endColumn: activeSheet.columnCount - 1,
            }, {
              userId: currentUser?.id,
              canManage: canManageProtection,
            }).allowed;
            const top = frozen
              ? scrollState.top + COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition]
              : COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition];
            return (
              <React.Fragment key={`row-${rowIndex}`}>
                <div
                  role="rowheader"
                  aria-label={`选择第 ${rowIndex + 1} 行`}
                  aria-selected={selectedHeader}
                  data-spreadsheet-row-header={rowIndex}
                  onMouseDown={event => {
                    if (event.button !== 0 || event.target.closest('[data-spreadsheet-resize-handle]')) return;
                    event.preventDefault();
                    selectWholeRow(rowIndex);
                  }}
                  style={{
                    position: 'absolute',
                    left: scrollState.left,
                    top,
                    width: ROW_HEADER_WIDTH,
                    height: rowHeight(rowIndex),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    borderRight: '1px solid #d1d5db',
                    borderBottom: '1px solid #e5e7eb',
                    background: selectedHeader ? '#dbeafe' : (highlightedHeader ? '#e6f4ff' : '#f3f4f6'),
                    color: selectedHeader ? '#1677ff' : '#6b7280',
                    fontWeight: selectedHeader ? 600 : 400,
                    boxShadow: selectedHeader ? 'inset -2px 0 0 #1677ff' : 'none',
                    zIndex: frozen ? 22 : 16,
                    userSelect: 'none',
                    cursor: 'pointer',
                  }}>
                  {rowIndex + 1}
                  {canEdit && rowResizeAllowed && (
                    <span
                      aria-label={`调整第 ${rowIndex + 1} 行高度`}
                      data-spreadsheet-resize-handle="row"
                      onPointerDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setResizeDrag({ axis: 'row', index: rowIndex, startPosition: event.clientY, startSize: rowHeight(rowIndex) / zoom, previewSize: rowHeight(rowIndex) / zoom, min: 22, max: 160 });
                      }}
                      style={{ position: 'absolute', left: 0, bottom: -3, width: '100%', height: 7, cursor: 'row-resize', zIndex: 2 }}
                    />
                  )}
                </div>
                {columns.map(columnIndex => renderCell(rowPosition, columnIndex))}
              </React.Fragment>
            );
          })}

          <div style={{
            position: 'absolute',
            left: scrollState.left,
            top: scrollState.top,
            width: ROW_HEADER_WIDTH,
            height: COLUMN_HEADER_HEIGHT,
            borderRight: '1px solid #d1d5db',
            borderBottom: '1px solid #d1d5db',
            background: '#e5e7eb',
            zIndex: 30,
          }} />
          </div>
        </div>
      </Dropdown>

      <div
        className="relation-spreadsheet-sheet-bar"
        data-spreadsheet-sheet-bar="true"
      >
        <div className="relation-spreadsheet-sheet-bar__start">
          <Dropdown
            trigger={['click']}
            placement="topLeft"
            overlayClassName="relation-spreadsheet-sheet-list-menu"
            menu={sheetListMenu}
          >
            <button
              type="button"
              className="relation-spreadsheet-sheet-bar__icon-button"
              data-spreadsheet-sheet-list-trigger="true"
              aria-label="工作表列表"
              title="工作表列表"
            >
              <MenuOutlined aria-hidden="true" />
            </button>
          </Dropdown>
          <button
            type="button"
            className="relation-spreadsheet-sheet-bar__icon-button"
            aria-label="新增工作表"
            title="新增工作表"
            disabled={!canEdit}
            onClick={addSheet}
          >
            <PlusOutlined aria-hidden="true" />
          </button>
        </div>

        <div className="relation-spreadsheet-sheet-tabs" role="tablist" aria-label="工作表">
          {workbook.sheets.map((sheet, index) => {
            const active = sheet.id === activeSheet.id;
            const nextSheet = workbook.sheets[index + 1];
            const showDivider = nextSheet
              && !active
              && nextSheet.id !== activeSheet.id;
            return (
              <React.Fragment key={sheet.id}>
                <Dropdown trigger={['contextMenu']} menu={getSheetActionMenu(sheet)}>
                  <div className={`relation-spreadsheet-sheet-tab-shell${active ? ' relation-spreadsheet-sheet-tab-shell--active' : ''}`}>
                    <button
                      type="button"
                      role="tab"
                      className={`relation-spreadsheet-sheet-tab${active ? ' relation-spreadsheet-sheet-tab--active' : ''}`}
                      aria-selected={active}
                      aria-pressed={active}
                      title={sheet.name}
                      onClick={() => switchSheet(sheet.id)}
                      onDoubleClick={() => canEdit && renameSheet(sheet)}
                    >
                      <span className="relation-spreadsheet-sheet-tab__label">{sheet.name}</span>
                    </button>
                    {active ? (
                      <Dropdown
                        trigger={['click']}
                        placement="topLeft"
                        menu={getSheetActionMenu(sheet)}
                      >
                        <button
                          type="button"
                          className="relation-spreadsheet-sheet-tab__menu"
                          aria-label={`${sheet.name} 工作表菜单`}
                          title="工作表菜单"
                          onClick={event => event.stopPropagation()}
                        >
                          <CaretDownOutlined aria-hidden="true" />
                        </button>
                      </Dropdown>
                    ) : null}
                  </div>
                </Dropdown>
                {showDivider ? <span className="relation-spreadsheet-sheet-tab-divider" aria-hidden="true" /> : null}
              </React.Fragment>
            );
          })}
        </div>

        <div className="relation-spreadsheet-sheet-bar__end">
          <span className="relation-spreadsheet-sheet-bar__divider" aria-hidden="true" />
          {activeSheet.filters?.length > 0 && (
            <Button className="relation-spreadsheet-clear-filter" type="link" size="small" onClick={clearFilters}>清除筛选</Button>
          )}
          {showSelectionSummary ? (
            <Dropdown
              trigger={['click']}
              placement="topRight"
              overlayClassName="relation-spreadsheet-selection-summary-menu"
              menu={{
                items: selectionSummaryMenuItems,
                onClick: ({ key }) => setSelectionSummaryMetric(key),
              }}
            >
              <button
                type="button"
                className="relation-spreadsheet-selection-summary"
                data-spreadsheet-selection-summary="true"
                aria-label={`选区统计，当前${selectedSummaryDefinition.label} ${formatSelectionSummaryValue(selectionSummary[effectiveSelectionSummaryMetric])}`}
              >
                <span>{selectedSummaryDefinition.label}:</span>
                <strong data-spreadsheet-selection-summary-value="true">
                  {formatSelectionSummaryValue(selectionSummary[effectiveSelectionSummaryMetric])}
                </strong>
                <CaretDownOutlined aria-hidden="true" />
              </button>
            </Dropdown>
          ) : null}
          <Dropdown
            trigger={['click']}
            placement="topRight"
            overlayClassName="relation-spreadsheet-view-menu"
            menu={viewMenu}
          >
            <button
              type="button"
              className="relation-spreadsheet-sheet-bar__control relation-spreadsheet-view-control"
              data-spreadsheet-view-trigger="true"
              aria-label="表格视图"
              title="表格视图"
            >
              <TableOutlined aria-hidden="true" />
              <CaretDownOutlined className="relation-spreadsheet-sheet-bar__caret" aria-hidden="true" />
            </button>
          </Dropdown>
          <button
            type="button"
            className="relation-spreadsheet-sheet-bar__control relation-spreadsheet-fullscreen-control"
            data-spreadsheet-fullscreen-trigger="true"
            aria-label={isFullscreen ? '退出全屏' : '全屏'}
            aria-pressed={isFullscreen}
            title={isFullscreen ? '退出全屏' : '全屏'}
            onClick={toggleSpreadsheetFullscreen}
          >
            {isFullscreen ? <FullscreenExitOutlined aria-hidden="true" /> : <FullscreenOutlined aria-hidden="true" />}
          </button>
          <div className="relation-spreadsheet-zoom-controls" aria-label="缩放控件">
            <button
              type="button"
              className="relation-spreadsheet-sheet-bar__control"
              data-spreadsheet-zoom-out="true"
              aria-label="缩小表格"
              title="缩小"
              disabled={zoom <= ZOOM_LEVELS[0]}
              onClick={() => changeZoomByStep(-1)}
            >
              <MinusOutlined aria-hidden="true" />
            </button>
            <Dropdown
              trigger={['click']}
              placement="topRight"
              overlayClassName="relation-spreadsheet-zoom-menu"
              menu={zoomMenu}
            >
              <button
                type="button"
                className="relation-spreadsheet-zoom-value"
                data-spreadsheet-zoom-value="true"
                aria-label={`当前缩放 ${Math.round(zoom * 100)}%`}
                title="选择缩放比例"
              >
                {Math.round(zoom * 100)}%
              </button>
            </Dropdown>
            <button
              type="button"
              className="relation-spreadsheet-sheet-bar__control"
              data-spreadsheet-zoom-in="true"
              aria-label="放大表格"
              title="放大"
              disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              onClick={() => changeZoomByStep(1)}
            >
              <PlusOutlined aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <SpreadsheetCellFormatModal
        open={cellFormatOpen}
        initialFormat={selectedCellStyle.numberFormat}
        sampleValue={evaluator.getValue(activeSheet.id, activeRowIndex, activeColumnIndex)}
        onCancel={() => {
          setCellFormatOpen(false);
          focusSpreadsheetGrid();
        }}
        onConfirm={numberFormat => {
          updateRangeStyle({ numberFormat });
          setCellFormatOpen(false);
        }}
      />
      <SpreadsheetCustomSortModal
        open={customSortOpen}
        columns={Array.from(
          { length: currentSelection.endColumn - currentSelection.startColumn + 1 },
          (_, offset) => {
            const columnIndex = currentSelection.startColumn + offset;
            return { value: columnIndex, label: `${spreadsheetColumnLabel(columnIndex)} 列` };
          },
        )}
        activeColumnIndex={activeColumnIndex}
        onCancel={() => {
          setCustomSortOpen(false);
          focusSpreadsheetGrid();
        }}
        onConfirm={options => {
          sortSelection(options.direction, options);
          setCustomSortOpen(false);
        }}
      />
      <SpreadsheetProtectionDialog
        open={protectionOpen}
        rangeLabel={protectionRangeLabel}
        initialRule={selectedProtectionRule}
        users={protectionUsers}
        onCancel={() => {
          setProtectionOpen(false);
          focusSpreadsheetGrid();
        }}
        onSave={saveProtectionRule}
        onDelete={() => {
          if (!canManageProtection) return;
          deleteSelectionRule('protectedRanges', selectedProtectionRule);
          setProtectionOpen(false);
        }}
      />
      <SpreadsheetConditionalFormatDialog
        open={conditionalFormatOpen}
        rangeLabel={selectionLabel}
        initialRule={selectedConditionalRule}
        onCancel={() => {
          setConditionalFormatOpen(false);
          focusSpreadsheetGrid();
        }}
        onSave={saveConditionalRule}
        onDelete={() => {
          deleteSelectionRule('conditionalFormats', selectedConditionalRule);
          setConditionalFormatOpen(false);
        }}
      />
      <SpreadsheetDataValidationDialog
        open={dataValidationOpen}
        rangeLabel={selectionLabel}
        initialRule={selectedValidationRule}
        onCancel={() => {
          setDataValidationOpen(false);
          focusSpreadsheetGrid();
        }}
        onSave={saveValidationRule}
        onDelete={() => {
          deleteSelectionRule('dataValidations', selectedValidationRule);
          setDataValidationOpen(false);
        }}
      />
      <MentionPicker
        open={Boolean(mentionState)}
        context={mentionContext}
        query={mentionState?.query || ''}
        position={mentionState?.position}
        onSelect={insertSpreadsheetMention}
        onClose={() => setMentionState(null)}
      />
    </section>
  );
}
