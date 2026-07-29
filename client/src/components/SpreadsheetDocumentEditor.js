import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  BorderInnerOutlined,
  CaretDownOutlined,
  ClearOutlined,
  DeleteColumnOutlined,
  DeleteRowOutlined,
  DownloadOutlined,
  FilterOutlined,
  FunctionOutlined,
  InsertRowAboveOutlined,
  InsertRowRightOutlined,
  MergeCellsOutlined,
  PlusOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Dropdown, Input, Modal, Select, Space, Tooltip, Typography, message } from 'antd';
import MentionPicker, { preloadMentionCandidates, scheduleMentionNotification } from './MentionPicker';
import './SpreadsheetDocumentEditor.css';
import {
  buildSpreadsheetCellKey,
  createDefaultSpreadsheetSheet,
  createSpreadsheetFormulaEvaluator,
  findSpreadsheetMergedRange,
  getSpreadsheetCellObject,
  getSpreadsheetCellRawValue,
  getSpreadsheetUsedRange,
  getSpreadsheetVisibleRows,
  mergeSpreadsheetCells,
  normalizeSpreadsheetRange,
  normalizeSpreadsheetWorkbook,
  renameSpreadsheetSheet,
  setSpreadsheetCellValue,
  setSpreadsheetColumnFilter,
  shiftSpreadsheetColumns,
  shiftSpreadsheetRows,
  sortSpreadsheetRange,
  spreadsheetClipboardMatrixHasMultipleCells,
  spreadsheetColumnLabel,
  spreadsheetRangeContainsCell,
  unmergeSpreadsheetCells,
  updateSpreadsheetRangeStyle,
  validateSpreadsheetSheetName,
} from '../utils/spreadsheetWorkbook';

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
const DEFAULT_FONT_FAMILY = 'Arial';
const DEFAULT_FONT_SIZE = 13;
const FONT_FAMILY_OPTIONS = ['Arial', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Times New Roman'];
const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const TEXT_COLOR_OPTIONS = ['#111827', '#374151', '#dc2626', '#d97706', '#15803d', '#1677ff', '#4338ca', '#7e22ce'];
const FILL_COLOR_OPTIONS = ['#ffffff', '#f8fafc', '#fef3c7', '#ffedd5', '#dcfce7', '#dbeafe', '#e0e7ff', '#f3e8ff'];

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
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

function SpreadsheetToolbarButton({ title, active = false, disabled = false, danger = false, icon, onClick }) {
  return (
    <Tooltip title={title}>
      <Button
        aria-label={title}
        icon={icon}
        type={active ? 'primary' : 'text'}
        danger={danger}
        disabled={disabled}
        size="small"
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
  fillAvailableHeight = false,
  frameless = false,
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
  const editorRef = useRef(null);
  const viewportRef = useRef(null);
  const fileInputRef = useRef(null);
  const workbookRef = useRef(workbook);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const inputTransactionRef = useRef(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
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
    if (!canEdit || !mentionContext?.entity_type || !mentionContext?.entity_id) return;
    preloadMentionCandidates(mentionContext).catch(() => {});
  }, [canEdit, mentionContext?.entity_type, mentionContext?.entity_id, mentionContext?.scope]);

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
    if (transaction && transaction.before !== serializeWorkbookSnapshot(workbookRef.current)) {
      recordUndoSnapshot(transaction.before);
    }
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
    const stopSelecting = () => setIsSelecting(false);
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
  const selectedCellObject = getSpreadsheetCellObject(activeSheet, activeRowIndex, activeColumnIndex);
  const selectedCellRawValue = getSpreadsheetCellRawValue(activeSheet, activeRowIndex, activeColumnIndex);
  const selectedCellStyle = selectedCellObject.style || {};
  const selectedFontFamily = selectedCellStyle.fontFamily || DEFAULT_FONT_FAMILY;
  const selectedFontSize = Number(selectedCellStyle.fontSize) || DEFAULT_FONT_SIZE;
  const selectionLabel = rangeIsSingleCell(currentSelection)
    ? activeCellKey
    : `${buildSpreadsheetCellKey(currentSelection.startRow, currentSelection.startColumn)}:${buildSpreadsheetCellKey(currentSelection.endRow, currentSelection.endColumn)}`;
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

  const notifySelection = (rowIndex, columnIndex, nextRange = null) => {
    const merged = findSpreadsheetMergedRange(activeSheet, rowIndex, columnIndex);
    const targetRow = merged?.startRow ?? rowIndex;
    const targetColumn = merged?.startColumn ?? columnIndex;
    onSelectedCellChange?.({ sheetId: activeSheet.id, rowIndex: targetRow, columnIndex: targetColumn });
    setSelection(nextRange || normalizeSpreadsheetRange(merged || { rowIndex: targetRow, columnIndex: targetColumn }));
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
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      setSpreadsheetCellValue(sheet, rowIndex, columnIndex, value);
      draft.activeSheetId = sheet.id;
      return draft;
    }, options);
  };

  const updateRangeStyle = stylePatch => {
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      updateSpreadsheetRangeStyle(sheet, currentSelection, stylePatch);
      return draft;
    });
  };

  const clearSelection = (clearStyle = false) => {
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      for (let row = currentSelection.startRow; row <= currentSelection.endRow; row += 1) {
        for (let column = currentSelection.startColumn; column <= currentSelection.endColumn; column += 1) {
          if (clearStyle) updateSpreadsheetRangeStyle(sheet, { rowIndex: row, columnIndex: column }, {
            bold: null,
            backgroundColor: null,
          });
          else setSpreadsheetCellValue(sheet, row, column, '');
        }
      }
      return draft;
    });
  };

  const applyPastedMatrix = matrix => {
    if (!canEdit || !Array.isArray(matrix) || !matrix.length) return;
    applyWorkbookUpdate(draft => {
      const sheet = draft.sheets.find(item => item.id === activeSheet.id) || draft.sheets[0];
      matrix.forEach((line, rowOffset) => {
        (Array.isArray(line) ? line : [line]).forEach((value, columnOffset) => {
          setSpreadsheetCellValue(sheet, activeRowIndex + rowOffset, activeColumnIndex + columnOffset, value);
        });
      });
      return draft;
    });
    const endRow = activeRowIndex + matrix.length - 1;
    const endColumn = activeColumnIndex + Math.max(0, ...matrix.map(line => line.length - 1));
    setSelection(normalizeSpreadsheetRange({
      startRow: activeRowIndex,
      endRow,
      startColumn: activeColumnIndex,
      endColumn,
    }));
  };

  const handlePaste = event => {
    if (!canEdit || event.target?.closest?.('[data-spreadsheet-formula-input="true"]')) return;
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text) return;
    const matrix = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      .filter((line, index, lines) => index < lines.length - 1 || line !== '')
      .map(line => line.split('\t'));
    const isMatrixPaste = spreadsheetClipboardMatrixHasMultipleCells(matrix);
    if (!isMatrixPaste && event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    applyPastedMatrix(matrix);
    message.success(isMatrixPaste ? '已粘贴表格区域' : '已粘贴单元格');
  };

  const handleCopy = event => {
    if (event.target?.closest?.('[data-spreadsheet-formula-input="true"]')) return;
    const rows = [];
    for (let row = currentSelection.startRow; row <= currentSelection.endRow; row += 1) {
      const values = [];
      for (let column = currentSelection.startColumn; column <= currentSelection.endColumn; column += 1) {
        values.push(evaluator.getValue(activeSheet.id, row, column));
      }
      rows.push(values);
    }
    const plain = rows.map(line => line.map(value => String(value ?? '')).join('\t')).join('\n');
    const html = `<table><tbody>${rows.map(line => `<tr>${line.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    event.clipboardData?.setData('text/plain', plain);
    event.clipboardData?.setData('text/html', html);
    event.preventDefault();
    message.success(rangeIsSingleCell(currentSelection) ? '已复制单元格' : '已复制选区');
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
    if ((event.metaKey || event.ctrlKey) && ['c', 'v'].includes(event.key.toLowerCase())) return;
    if (
      canEdit
      && !event.altKey
      && !event.metaKey
      && !event.ctrlKey
      && !event.isComposing
      && event.key
      && event.key.length === 1
    ) {
      event.preventDefault();
      const transactionKey = `cell:${activeSheet.id}:${activeCellKey}`;
      beginInputTransaction(transactionKey);
      updateCellValue(activeRowIndex, activeColumnIndex, event.key, { recordHistory: false });
      setEditingCellKey(buildSpreadsheetCellKey(activeRowIndex, activeColumnIndex));
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection(false);
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

  const insertRow = () => applyWorkbookUpdate(draft => {
    shiftSpreadsheetRows(draft.sheets.find(item => item.id === activeSheet.id), activeRowIndex, 1, draft);
    return draft;
  });
  const deleteRow = () => {
    if (activeSheet.rowCount <= 1) return;
    applyWorkbookUpdate(draft => {
      shiftSpreadsheetRows(draft.sheets.find(item => item.id === activeSheet.id), activeRowIndex, -1, draft);
      return draft;
    });
    moveSelection(activeRowIndex >= activeSheet.rowCount - 1 ? -1 : 0, 0);
  };
  const insertColumn = () => applyWorkbookUpdate(draft => {
    shiftSpreadsheetColumns(draft.sheets.find(item => item.id === activeSheet.id), activeColumnIndex, 1, draft);
    return draft;
  });
  const deleteColumn = () => {
    if (activeSheet.columnCount <= 1) return;
    applyWorkbookUpdate(draft => {
      shiftSpreadsheetColumns(draft.sheets.find(item => item.id === activeSheet.id), activeColumnIndex, -1, draft);
      return draft;
    });
    moveSelection(0, activeColumnIndex >= activeSheet.columnCount - 1 ? -1 : 0);
  };

  const toggleMerge = () => {
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

  const sortSelection = direction => applyWorkbookUpdate(draft => {
    const sheet = draft.sheets.find(item => item.id === activeSheet.id);
    const bounds = rangeIsSingleCell(currentSelection) ? getSpreadsheetUsedRange(sheet) : currentSelection;
    sortSpreadsheetRange(sheet, bounds, activeColumnIndex, direction, (row, column) => evaluator.getValue(activeSheet.id, row, column));
    return draft;
  });

  const filterCurrentValue = () => {
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
    updateFrozen({ rows: activeRowIndex + 1, columns: 0 });
  };
  const freezeColumnsToCurrent = () => {
    if (activeColumnIndex + 1 > MAX_FROZEN_COLUMNS) {
      message.warning(`最多冻结前 ${MAX_FROZEN_COLUMNS} 列`);
      return;
    }
    updateFrozen({ rows: 0, columns: activeColumnIndex + 1 });
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
        items: menu.items.map(item => ({ key: item.key, label: item.label, disabled: !canEdit || item.disabled, danger: item.danger })),
        onClick: ({ key }) => menu.items.find(item => item.key === key)?.onClick?.(),
      }}
    >
      <Button type="text" size="small">{menu.label}</Button>
    </Dropdown>
  );

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
    const displayValue = evaluator.getValue(activeSheet.id, rowIndex, columnIndex);
    const style = cell.style || {};
    const cellFontSize = clamp(Number(style.fontSize) || DEFAULT_FONT_SIZE, 8, 48) * Math.min(1.15, zoom);
    const cellTextColor = evaluator.isError(displayValue) ? '#dc2626' : (style.color || '#111827');
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
    const remoteCollaborator = activeRemoteCollaborators.find(item => (
      spreadsheetRangeContainsCell(item.selection, rowIndex, columnIndex)
    ));
    const editing = active && editingCellKey === buildSpreadsheetCellKey(rowIndex, columnIndex) && canEdit;
    return (
      <div
        key={`cell-${rowIndex}-${columnIndex}`}
        role="gridcell"
        aria-selected={selected}
        data-spreadsheet-row-index={rowIndex}
        data-spreadsheet-column-index={columnIndex}
        data-spreadsheet-remote-selection={remoteCollaborator?.session_id || undefined}
        title={remoteCollaborator ? `${remoteCollaborator.user_name} 的选区` : undefined}
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
          setSelection(normalizeSpreadsheetRange({
            startRow: selectionAnchor.rowIndex,
            endRow: rowIndex,
            startColumn: selectionAnchor.columnIndex,
            endColumn: columnIndex,
          }));
        }}
        onDoubleClick={() => {
          if (!canEdit) return;
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
          borderRight: '1px solid #e5e7eb',
          borderBottom: '1px solid #e5e7eb',
          borderTop: style.border ? `1px solid ${style.border.color || '#cbd5e1'}` : undefined,
          borderLeft: style.border ? `1px solid ${style.border.color || '#cbd5e1'}` : undefined,
          background: selected
            ? '#eaf3ff'
            : (remoteCollaborator ? `${remoteCollaborator.color || '#389e0d'}1f` : (style.backgroundColor || '#fff')),
          boxShadow: active
            ? 'inset 0 0 0 2px #1677ff'
            : (remoteCollaborator ? `inset 0 0 0 2px ${remoteCollaborator.color || '#389e0d'}` : 'none'),
          zIndex: frozenRow && frozenColumn ? 12 : (frozenRow || frozenColumn ? 8 : (active ? 4 : 1)),
          overflow: 'hidden',
          cursor: 'cell',
        }}
      >
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
            padding: '0 6px',
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
      </div>
    );
  };

  return (
    <section
      ref={editorRef}
      className={`relation-spreadsheet-editor${fillAvailableHeight ? ' relation-spreadsheet-editor--fill' : ''}${frameless ? ' relation-spreadsheet-editor--frameless' : ''}`}
      aria-label="在线表格编辑区"
      data-spreadsheet-editor-root="true"
      tabIndex={0}
      onPaste={handlePaste}
      onCopy={handleCopy}
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
          data-spreadsheet-menu-bar="true"
          style={{
            display: 'flex',
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
              disabled={!canEdit}
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
            disabled={!canEdit}
            hidden
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (canEdit && file) onImportXlsx?.(file);
            }}
          />
        </div>
        <div
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
          <SpreadsheetToolbarButton title="在上方插入行" disabled={!canEdit} icon={<InsertRowAboveOutlined />} onClick={insertRow} />
          <SpreadsheetToolbarButton title="删除当前行" disabled={!canEdit || activeSheet.rowCount <= 1} danger icon={<DeleteRowOutlined />} onClick={deleteRow} />
          <SpreadsheetToolbarButton title="在左侧插入列" disabled={!canEdit} icon={<InsertRowRightOutlined />} onClick={insertColumn} />
          <SpreadsheetToolbarButton title="删除当前列" disabled={!canEdit || activeSheet.columnCount <= 1} danger icon={<DeleteColumnOutlined />} onClick={deleteColumn} />
          <div style={{ width: 1, height: 20, background: '#d9d9d9', margin: '0 4px' }} />
          <Select
            aria-label="字体"
            size="small"
            disabled={!canEdit}
            value={selectedFontFamily}
            style={{ width: 118 }}
            options={FONT_FAMILY_OPTIONS.map(value => ({ value, label: value }))}
            onChange={value => updateRangeStyle({ fontFamily: value === DEFAULT_FONT_FAMILY ? null : value })}
          />
          <Select
            aria-label="字号"
            size="small"
            disabled={!canEdit}
            value={selectedFontSize}
            style={{ width: 72 }}
            options={FONT_SIZE_OPTIONS.map(value => ({ value, label: `${value}` }))}
            onChange={value => updateRangeStyle({ fontSize: value === DEFAULT_FONT_SIZE ? null : value })}
          />
          <SpreadsheetToolbarButton title="加粗" disabled={!canEdit} active={Boolean(selectedCellStyle.bold)} icon={<BoldOutlined />} onClick={() => updateRangeStyle({ bold: selectedCellStyle.bold ? null : true })} />
          <Tooltip title="斜体">
            <Button
              aria-label="斜体"
              type={selectedCellStyle.italic ? 'primary' : 'text'}
              size="small"
              disabled={!canEdit}
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
              disabled={!canEdit}
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
            <Button aria-label="文字颜色" type="text" size="small" disabled={!canEdit} style={{ color: selectedCellStyle.color || '#111827' }}>A</Button>
          </Dropdown>
          <Dropdown menu={{ items: FILL_COLOR_OPTIONS.map(value => ({
            key: value,
            label: <span><span style={{ display: 'inline-block', width: 12, height: 12, marginRight: 8, background: value, border: '1px solid #d9d9d9', verticalAlign: -1 }} />{value}</span>,
          })), onClick: ({ key }) => updateRangeStyle({ backgroundColor: key === '#ffffff' ? null : key }) }}>
            <Button aria-label="填充色" type="text" size="small" disabled={!canEdit} icon={<BgColorsOutlined />} />
          </Dropdown>
          <Dropdown menu={{ items: [
            { key: 'left', label: '左对齐' },
            { key: 'center', label: '居中' },
            { key: 'right', label: '右对齐' },
          ], onClick: ({ key }) => updateRangeStyle({ horizontalAlign: key === 'left' ? null : key }) }}>
            <Button aria-label="水平对齐" type="text" size="small" disabled={!canEdit}>
              {selectedCellStyle.horizontalAlign === 'center' ? '居中' : selectedCellStyle.horizontalAlign === 'right' ? '右' : '左'}
            </Button>
          </Dropdown>
          <Dropdown menu={{ items: [
            { key: 'top', label: '顶部对齐' },
            { key: 'middle', label: '垂直居中' },
            { key: 'bottom', label: '底部对齐' },
          ], onClick: ({ key }) => updateRangeStyle({ verticalAlign: key === 'middle' ? null : key }) }}>
            <Button aria-label="垂直对齐" type="text" size="small" disabled={!canEdit}>
              {selectedCellStyle.verticalAlign === 'top' ? '上' : selectedCellStyle.verticalAlign === 'bottom' ? '下' : '中'}
            </Button>
          </Dropdown>
          <Tooltip title="自动换行">
            <Button
              aria-label="自动换行"
              type={selectedCellStyle.wrap ? 'primary' : 'text'}
              size="small"
              disabled={!canEdit}
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
              disabled={!canEdit}
              onClick={() => updateRangeStyle({ border: selectedCellStyle.border ? null : { color: '#cbd5e1' } })}
            >
              □
            </Button>
          </Tooltip>
          <SpreadsheetToolbarButton title={findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex) ? '取消合并' : '合并选区'} disabled={!canEdit || (rangeIsSingleCell(currentSelection) && !findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex))} active={Boolean(findSpreadsheetMergedRange(activeSheet, activeRowIndex, activeColumnIndex))} icon={<MergeCellsOutlined />} onClick={toggleMerge} />
          <SpreadsheetToolbarButton title="清空内容" disabled={!canEdit} icon={<ClearOutlined />} onClick={() => clearSelection(false)} />
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
            <Button aria-label="常用公式" type="text" size="small" icon={<FunctionOutlined />} disabled={!canEdit} />
          </Dropdown>
          <SpreadsheetToolbarButton title="升序" disabled={!canEdit} icon={<SortAscendingOutlined />} onClick={() => sortSelection('asc')} />
          <SpreadsheetToolbarButton title="降序" disabled={!canEdit} icon={<SortDescendingOutlined />} onClick={() => sortSelection('desc')} />
          <SpreadsheetToolbarButton title="筛选为当前值" disabled={!canEdit} active={Boolean(activeSheet.filters?.length)} icon={<FilterOutlined />} onClick={filterCurrentValue} />
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
          size="small"
          prefix={<Text type="secondary">fx</Text>}
          value={selectedCellRawValue}
          readOnly={!canEdit}
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

      <div
        ref={viewportRef}
        role="grid"
        data-spreadsheet-grid="true"
        aria-rowcount={activeSheet.rowCount}
        aria-colcount={activeSheet.columnCount}
        onScroll={event => {
          const { scrollTop, scrollLeft } = event.currentTarget;
          setScrollState(current => ({
            ...current,
            top: scrollTop,
            left: scrollLeft,
          }));
        }}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', background: '#f8fafc' }}
      >
        <div style={{ position: 'relative', width: totalWidth, height: totalHeight, minWidth: '100%' }}>
          {columns.map(columnIndex => {
            const frozen = columnIndex < frozenColumns;
            const left = frozen
              ? scrollState.left + ROW_HEADER_WIDTH + columnOffsets[columnIndex]
              : ROW_HEADER_WIDTH + columnOffsets[columnIndex];
            return (
              <div key={`column-${columnIndex}`} style={{
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
                background: activeColumnIndex === columnIndex ? '#e6f4ff' : '#f3f4f6',
                color: '#4b5563',
                fontWeight: 600,
                zIndex: frozen ? 22 : 18,
                userSelect: 'none',
              }}>
                {spreadsheetColumnLabel(columnIndex)}
                {activeSheet.filters?.some(filter => Number(filter.columnIndex) === columnIndex) && (
                  <FilterOutlined style={{ marginLeft: 5, color: '#1677ff', fontSize: 11 }} />
                )}
                {canEdit && (
                  <span
                    aria-label={`调整 ${spreadsheetColumnLabel(columnIndex)} 列宽`}
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
            const top = frozen
              ? scrollState.top + COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition]
              : COLUMN_HEADER_HEIGHT + rowOffsets[rowPosition];
            return (
              <React.Fragment key={`row-${rowIndex}`}>
                <div style={{
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
                  background: activeRowIndex === rowIndex ? '#e6f4ff' : '#f3f4f6',
                  color: '#6b7280',
                  zIndex: frozen ? 22 : 16,
                  userSelect: 'none',
                }}>
                  {rowIndex + 1}
                  {canEdit && (
                    <span
                      aria-label={`调整第 ${rowIndex + 1} 行高度`}
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

      <div
        className="relation-spreadsheet-sheet-bar"
        data-spreadsheet-sheet-bar="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: fillAvailableHeight ? 4 : 8,
          minHeight: fillAvailableHeight ? 34 : undefined,
          padding: fillAvailableHeight ? '0 8px' : '7px 9px',
          borderTop: '1px solid #e5e7eb',
          background: '#fff',
        }}
      >
        <Tooltip title="新增工作表">
          <Button aria-label="新增工作表" size="small" type="text" icon={<PlusOutlined />} disabled={!canEdit} onClick={addSheet} />
        </Tooltip>
        <Space size={4} style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {workbook.sheets.map(sheet => (
            <Dropdown key={sheet.id} trigger={['contextMenu']} menu={{
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
            }}>
              <Button
                className={`relation-spreadsheet-sheet-tab${sheet.id === activeSheet.id ? ' relation-spreadsheet-sheet-tab--active' : ''}`}
                size="small"
                type={fillAvailableHeight ? 'text' : (sheet.id === activeSheet.id ? 'primary' : 'text')}
                aria-pressed={sheet.id === activeSheet.id}
                onClick={() => switchSheet(sheet.id)}
                onDoubleClick={() => canEdit && renameSheet(sheet)}
              >
                {sheet.name}
              </Button>
            </Dropdown>
          ))}
        </Space>
        {activeSheet.filters?.length > 0 && (
          <Button type="link" size="small" onClick={clearFilters}>清除筛选</Button>
        )}
        <Select
          className="relation-spreadsheet-zoom-select"
          size="small"
          value={zoom}
          variant={fillAvailableHeight ? 'borderless' : 'outlined'}
          style={{ width: fillAvailableHeight ? 76 : 82 }}
          options={[0.75, 1, 1.25, 1.5].map(value => ({ value, label: `${Math.round(value * 100)}%` }))}
          onChange={setZoom}
        />
      </div>
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
