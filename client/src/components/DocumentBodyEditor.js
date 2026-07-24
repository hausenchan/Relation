import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Divider, Dropdown, Input, Space, Tooltip, message } from 'antd';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import {
  buildCollapsedDocumentBlockIds,
  buildDocumentBlockGuideMap,
  buildDocumentNumberedListValues,
  getDocumentBlockHierarchyIndent,
  isDocumentBlockHierarchyMember,
} from '../utils/documentBlockHierarchy';
import {
  buildDocumentBodyClipboardPayload,
  cloneDocumentBodyBlocks,
  createDocumentBodyBlock,
  DOCUMENT_BODY_CLIPBOARD_HTML_ATTR,
  DOCUMENT_BODY_CLIPBOARD_MIME,
  documentBodyInlineHtmlToPlain,
  DOCUMENT_BODY_BLOCK_TYPES,
  getDocumentBodyBlockUnitIds,
  getDocumentBodySelectionBlockIds,
  normalizeDocumentBodyValue,
  parseDocumentBodyClipboard,
  parseDocumentBodyClipboardData,
  rebaseDocumentBodyClipboardBlocks,
  sanitizeDocumentBodyInlineHtml,
} from '../utils/documentBodyBlocks';
import {
  documentClipboardHasEmbeddedBlocks,
  flattenDocumentClipboardHtml,
} from '../utils/documentClipboard';
import MentionPicker, {
  getContentEditableMentionTrigger,
  insertMentionIntoContentEditable,
  preloadMentionCandidates,
  removeAdjacentMentionFromContentEditable,
  scheduleMentionNotification,
} from './MentionPicker';

const LIST_INDENT_WIDTH = 28;
const LIST_MARKER_WIDTH = 24;
const LIST_TEXT_GAP = 6;
const LIST_LINE_HEIGHT = 1.96;
const LIST_MARKER_COLOR = '#202124';
const LIST_GUIDE_COLOR = '#f0f0f0';
const MAX_LIST_INDENT = 9;
const DOCUMENT_BODY_SELECTION_EVENT = 'relation-document-body-selection-activate';

function formatAlphaNumber(value) {
  let number = Math.max(1, Number(value) || 1);
  let text = '';
  while (number > 0) {
    number -= 1;
    text = String.fromCharCode(97 + (number % 26)) + text;
    number = Math.floor(number / 26);
  }
  return text;
}

function formatRomanNumber(value) {
  const pairs = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let number = Math.max(1, Math.min(3999, Number(value) || 1));
  let text = '';
  pairs.forEach(([amount, roman]) => {
    while (number >= amount) {
      text += roman;
      number -= amount;
    }
  });
  return text;
}

function formatNumberedMarker(value, indent) {
  const mode = Math.max(0, Number(indent) || 0) % 3;
  if (mode === 1) return `${formatAlphaNumber(value)}.`;
  if (mode === 2) return `${formatRomanNumber(value)}.`;
  return `${Math.max(1, Number(value) || 1)}.`;
}

function renderBulletMarker(indent) {
  const level = Math.max(0, Number(indent) || 0) % 3;
  const common = {
    display: 'block',
    width: 5.5,
    height: 5.5,
    boxSizing: 'border-box',
  };
  if (level === 1) return <span aria-hidden="true" style={{ ...common, border: `1.25px solid ${LIST_MARKER_COLOR}`, borderRadius: '50%' }} />;
  if (level === 2) return <span aria-hidden="true" style={{ ...common, background: LIST_MARKER_COLOR, transform: 'rotate(45deg)' }} />;
  return <span aria-hidden="true" style={{ ...common, background: LIST_MARKER_COLOR, borderRadius: '50%' }} />;
}

function FoldTriangle({ collapsed }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      style={{
        display: 'block',
        width: 14,
        height: 14,
        transform: collapsed ? 'translateX(0.5px)' : 'translateY(0.5px)',
      }}
    >
      <path
        d={collapsed ? 'M5 3.8 L10 7 L5 10.2 Z' : 'M3.8 5 L10.2 5 L7 10 Z'}
        fill={LIST_MARKER_COLOR}
        stroke={LIST_MARKER_COLOR}
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BlockHandleIcon({ add = false }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        color: '#6b7280',
        fontSize: add ? 18 : 16,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {add ? '+' : '::'}
    </span>
  );
}

function getCollapsedInlineCaretOffset(editor) {
  if (!editor || typeof document === 'undefined') return null;
  const selection = window.getSelection?.();
  if (!selection || !selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(editor);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function getCollapsedInlineRange(editor) {
  if (!editor || typeof document === 'undefined') return null;
  const selection = window.getSelection?.();
  if (!selection || !selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  return { selection, range };
}

function getDeepInlineLeaf(node, direction) {
  let current = node;
  while (current?.nodeType === 1 && current.childNodes?.length) {
    current = direction === 'backward' ? current.lastChild : current.firstChild;
  }
  return current;
}

function getAdjacentInlineLeaf(editor, container, offset, direction) {
  if (container?.nodeType === 1) {
    const childIndex = direction === 'backward' ? offset - 1 : offset;
    if (childIndex >= 0 && childIndex < container.childNodes.length) {
      return getDeepInlineLeaf(container.childNodes[childIndex], direction);
    }
  }

  let current = container;
  while (current && current !== editor) {
    const sibling = direction === 'backward' ? current.previousSibling : current.nextSibling;
    if (sibling) return getDeepInlineLeaf(sibling, direction);
    current = current.parentNode;
  }
  return null;
}

function findAdjacentInlineContent(editor, container, offset, direction) {
  let candidate = getAdjacentInlineLeaf(editor, container, offset, direction);
  let attempts = 0;
  while (candidate && candidate !== editor && attempts < 100) {
    if (candidate.nodeType === 3 && candidate.data?.length) return candidate;
    if (candidate.nodeType === 1 && candidate.tagName === 'BR') return candidate;
    const next = getAdjacentInlineLeaf(editor, candidate, 0, direction);
    if (next === candidate) return null;
    candidate = next;
    attempts += 1;
  }
  return null;
}

function setCollapsedInlineSelection(selection, node, offset) {
  const range = document.createRange();
  range.setStart(node, Math.max(0, offset));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchInlineDeleteInput(editor, inputType) {
  const inputEvent = typeof window.InputEvent === 'function'
    ? new window.InputEvent('input', { bubbles: true, inputType })
    : new Event('input', { bubbles: true });
  editor.dispatchEvent(inputEvent);
}

function deleteInlineCharacter(editor, direction) {
  const caret = getCollapsedInlineRange(editor);
  if (!caret) return false;
  const { selection, range } = caret;
  const container = range.startContainer;
  const offset = range.startOffset;

  if (container.nodeType === 3) {
    const text = container.data || '';
    if (direction === 'backward' && offset > 0) {
      const prefixCharacters = Array.from(text.slice(0, offset));
      const previousCharacter = prefixCharacters[prefixCharacters.length - 1] || '';
      const start = Math.max(0, offset - previousCharacter.length);
      container.deleteData(start, offset - start);
      setCollapsedInlineSelection(selection, container, start);
      dispatchInlineDeleteInput(editor, 'deleteContentBackward');
      return true;
    }
    if (direction === 'forward' && offset < text.length) {
      const nextCharacter = Array.from(text.slice(offset))[0] || '';
      container.deleteData(offset, nextCharacter.length);
      setCollapsedInlineSelection(selection, container, offset);
      dispatchInlineDeleteInput(editor, 'deleteContentForward');
      return true;
    }
  }

  const adjacent = findAdjacentInlineContent(editor, container, offset, direction);
  if (!adjacent) return false;
  if (adjacent.nodeType === 3) {
    const text = adjacent.data || '';
    if (!text) return false;
    if (direction === 'backward') {
      const characters = Array.from(text);
      const previousCharacter = characters[characters.length - 1] || '';
      const start = Math.max(0, text.length - previousCharacter.length);
      adjacent.deleteData(start, text.length - start);
      setCollapsedInlineSelection(selection, adjacent, start);
      dispatchInlineDeleteInput(editor, 'deleteContentBackward');
      return true;
    }
    const nextCharacter = Array.from(text)[0] || '';
    adjacent.deleteData(0, nextCharacter.length);
    setCollapsedInlineSelection(selection, adjacent, 0);
    dispatchInlineDeleteInput(editor, 'deleteContentForward');
    return true;
  }
  if (adjacent.nodeType === 1 && adjacent.tagName === 'BR') {
    const parent = adjacent.parentNode;
    const childIndex = parent ? Array.prototype.indexOf.call(parent.childNodes, adjacent) : -1;
    if (!parent || childIndex < 0) return false;
    parent.removeChild(adjacent);
    setCollapsedInlineSelection(selection, parent, childIndex);
    dispatchInlineDeleteInput(editor, direction === 'backward' ? 'deleteContentBackward' : 'deleteContentForward');
    return true;
  }
  return false;
}

function escapeInlineClipboardText(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInlineClipboardHtml(html = '', text = '') {
  const flattened = sanitizeDocumentBodyInlineHtml(flattenDocumentClipboardHtml(html));
  if (flattened) return flattened;
  return sanitizeDocumentBodyInlineHtml(
    escapeInlineClipboardText(String(text || '').replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>')
  );
}

function insertInlineClipboardHtml(editor, html) {
  const editable = Boolean(
    editor?.isContentEditable || editor?.getAttribute?.('contenteditable') === 'true'
  );
  if (!editable || !html || typeof document === 'undefined') return false;
  editor.focus();
  const selection = window.getSelection?.();
  if (!selection) return false;
  let range = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function InlineBlockEditor({
  value,
  placeholder,
  readOnly,
  style,
  autoFocus,
  onAutoFocusDone,
  onChange,
  onActivate,
  onEnter,
  onBackspace,
  onDelete,
  onIndent,
  onPaste,
  onMentionTrigger,
}) {
  const editorRef = useRef(null);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const localHtmlRef = useRef(sanitizeDocumentBodyInlineHtml(value));

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || composingRef.current) return;
    const html = sanitizeDocumentBodyInlineHtml(value);
    if (focusedRef.current && html === localHtmlRef.current) return;
    if (editor.innerHTML !== html) editor.innerHTML = html;
    localHtmlRef.current = html;
  }, [value]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!autoFocus || readOnly || !editor) return;
    editor.focus();
    const selection = window.getSelection?.();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    onAutoFocusDone?.();
  }, [autoFocus, onAutoFocusDone, readOnly]);

  const emitChange = () => {
    const html = sanitizeDocumentBodyInlineHtml(editorRef.current?.innerHTML || '');
    localHtmlRef.current = html;
    onChange?.(html);
  };

  const detectMention = () => {
    if (readOnly || composingRef.current) return;
    const trigger = getContentEditableMentionTrigger(editorRef.current);
    onMentionTrigger?.(trigger || null);
  };

  const activate = () => {
    const editor = editorRef.current;
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const commonAncestor = range?.commonAncestorContainer;
    onActivate?.(
      editor,
      range && editor && commonAncestor && (commonAncestor === editor || editor.contains(commonAncestor))
        ? range.cloneRange()
        : null,
    );
  };
  const empty = !documentBodyInlineHtmlToPlain(value).trim();

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      {empty && placeholder && (
        <span
          aria-hidden="true"
          style={{ position: 'absolute', inset: '0 auto auto 0', color: '#b8bcc2', pointerEvents: 'none', ...style }}
        >
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onFocus={() => {
          focusedRef.current = true;
          activate();
        }}
        onBlur={() => {
          focusedRef.current = false;
          composingRef.current = false;
          emitChange();
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => {
          composingRef.current = false;
          emitChange();
        }}
        onInput={() => {
          if (!composingRef.current) emitChange();
          window.setTimeout(detectMention, 0);
        }}
        onMouseUp={activate}
        onKeyUp={(event) => {
          activate();
          if (event.key === '@' || event.key === 'Backspace' || event.key === 'Delete' || event.key.length === 1) {
            window.setTimeout(detectMention, 0);
          }
        }}
        onPaste={onPaste}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            onIndent?.(event.shiftKey ? -1 : 1);
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
            event.preventDefault();
            onEnter?.();
            return;
          }
          const simpleDelete = !event.metaKey && !event.ctrlKey && !event.altKey && !composingRef.current;
          if (event.key === 'Backspace' && simpleDelete) {
            if (removeAdjacentMentionFromContentEditable(editorRef.current, event)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (deleteInlineCharacter(editorRef.current, 'backward')) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const content = sanitizeDocumentBodyInlineHtml(editorRef.current?.innerHTML || '');
            const empty = !documentBodyInlineHtmlToPlain(content).trim();
            const atStart = getCollapsedInlineCaretOffset(editorRef.current) === 0;
            if ((empty || atStart) && onBackspace?.(event, { atStart, content, empty })) {
              event.preventDefault();
              event.stopPropagation();
            }
            return;
          }
          if (event.key === 'Delete' && simpleDelete) {
            if (removeAdjacentMentionFromContentEditable(editorRef.current, event)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (deleteInlineCharacter(editorRef.current, 'forward')) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const content = sanitizeDocumentBodyInlineHtml(editorRef.current?.innerHTML || '');
            const hasCollapsedCaret = getCollapsedInlineCaretOffset(editorRef.current) !== null;
            if (hasCollapsedCaret && onDelete?.(event, { content })) {
              event.preventDefault();
              event.stopPropagation();
            }
          }
        }}
        style={{ minHeight: 29, outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}
      />
    </div>
  );
}

function groupedBlockTypeItems(prefix = 'type:') {
  return [...new Set(DOCUMENT_BODY_BLOCK_TYPES.map(item => item.group))].map(group => ({
    type: 'group',
    label: group,
    children: DOCUMENT_BODY_BLOCK_TYPES
      .filter(item => item.group === group)
      .map(item => ({ key: `${prefix}${item.value}`, label: item.label })),
  }));
}

function getBlockIndent(block) {
  return getDocumentBlockHierarchyIndent(block, MAX_LIST_INDENT);
}

function isBlankBlock(block) {
  if (!block || block.type === 'divider' || block.type === 'table-simple') return false;
  return !documentBodyInlineHtmlToPlain(block.content).trim()
    && !documentBodyInlineHtmlToPlain(block.meta?.body).trim();
}

function getSubtreeEndIndex(blocks, startIndex) {
  const block = blocks[startIndex];
  if (!isDocumentBlockHierarchyMember(block)) return startIndex;
  const indent = getBlockIndent(block);
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < blocks.length; index += 1) {
    if (!isDocumentBlockHierarchyMember(blocks[index]) || getBlockIndent(blocks[index]) <= indent) break;
    endIndex = index;
  }
  return endIndex;
}

function cloneDocumentBodyValue(value) {
  return JSON.parse(JSON.stringify(normalizeDocumentBodyValue(value)));
}

function serializeDocumentBodyValue(value) {
  return JSON.stringify(normalizeDocumentBodyValue(value));
}

export default function DocumentBodyEditor({
  value,
  onChange,
  onSave,
  onDirtyChange,
  mentionContext,
  placeholder = '输入内容',
  readOnly = false,
  minHeight = 120,
  style,
}) {
  const normalized = useMemo(() => normalizeDocumentBodyValue(value), [value]);
  const serializedValue = useMemo(() => serializeDocumentBodyValue(normalized), [normalized]);
  const blocks = normalized.blocks;
  const editorRootRef = useRef(null);
  const blocksRootRef = useRef(null);
  const undoHistoryRef = useRef([]);
  const lastEmittedValueRef = useRef('');
  const pendingLocalValueRef = useRef(false);
  const activeInlineEditorRef = useRef(null);
  const inlineSelectionRangeRef = useRef(null);
  const clipboardBlockIdsRef = useRef([]);
  const blockSelectionAnchorRef = useRef(null);
  const selectAllBlocksActiveRef = useRef(false);
  const manualBlockSelectionActiveRef = useRef(false);
  const blockSelectionDragRef = useRef(null);
  const selectionScopeIdRef = useRef(`document-body-editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [inlineToolbarOpen, setInlineToolbarOpen] = useState(false);
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [openMenuBlockId, setOpenMenuBlockId] = useState(null);
  const [focusBlockId, setFocusBlockId] = useState(null);
  const [draggingBlockId, setDraggingBlockId] = useState(null);
  const [clipboardBlockIds, setClipboardBlockIds] = useState([]);
  const [mentionState, setMentionState] = useState(null);
  const hiddenBlockIds = useMemo(() => buildCollapsedDocumentBlockIds(blocks, MAX_LIST_INDENT), [blocks]);
  const guideMap = useMemo(() => buildDocumentBlockGuideMap(blocks, hiddenBlockIds, MAX_LIST_INDENT), [blocks, hiddenBlockIds]);
  const numberedMarkers = useMemo(() => {
    const markers = new Map();
    buildDocumentNumberedListValues(blocks, MAX_LIST_INDENT).forEach(({ index, indent }, blockId) => {
      markers.set(blockId, formatNumberedMarker(index, indent));
    });
    return markers;
  }, [blocks]);

  useEffect(() => {
    if (lastEmittedValueRef.current === serializedValue) {
      lastEmittedValueRef.current = '';
      pendingLocalValueRef.current = false;
      return;
    }
    if (pendingLocalValueRef.current) {
      pendingLocalValueRef.current = false;
      lastEmittedValueRef.current = '';
      return;
    }
    undoHistoryRef.current = [];
  }, [serializedValue]);

  useEffect(() => {
    if (!mentionContext?.entity_type || !mentionContext?.entity_id || readOnly) return;
    preloadMentionCandidates(mentionContext).catch(() => {});
  }, [mentionContext?.entity_type, mentionContext?.entity_id, mentionContext?.scope, readOnly]);

  const emitBlocks = (nextBlocks, nextFocusId = null, { recordUndo = true } = {}) => {
    const currentSnapshot = cloneDocumentBodyValue(normalized);
    const nextValue = { ...normalized, blocks: nextBlocks };
    const nextSerializedValue = serializeDocumentBodyValue(nextValue);
    if (nextSerializedValue === serializedValue) return;
    if (recordUndo) {
      const lastSnapshot = undoHistoryRef.current[undoHistoryRef.current.length - 1];
      if (!lastSnapshot || serializeDocumentBodyValue(lastSnapshot) !== serializeDocumentBodyValue(currentSnapshot)) {
        undoHistoryRef.current = [...undoHistoryRef.current, currentSnapshot].slice(-80);
      }
    }
    lastEmittedValueRef.current = nextSerializedValue;
    pendingLocalValueRef.current = true;
    onChange?.(nextValue);
    onDirtyChange?.(true);
    if (nextFocusId) {
      setActiveBlockId(nextFocusId);
      setFocusBlockId(nextFocusId);
    }
  };

  const closeMentionPicker = () => setMentionState(null);

  const handleMentionTrigger = (blockId, trigger) => {
    if (!trigger) {
      closeMentionPicker();
      return;
    }
    if (!mentionContext?.entity_type || !mentionContext?.entity_id || readOnly) return;
    setMentionState({ ...trigger, blockId });
  };

  const handleMentionSelect = (user) => {
    const userName = user?.name || user?.display_name || user?.username || '';
    const lineContent = insertMentionIntoContentEditable(mentionState, userName) || mentionState?.lineContent || '';
    closeMentionPicker();
    scheduleMentionNotification({
      context: mentionContext,
      user,
      lineContent,
    });
  };

  const undoLastChange = () => {
    const snapshot = undoHistoryRef.current.pop();
    if (!snapshot) {
      message.info('没有可撤回的操作');
      return;
    }
    lastEmittedValueRef.current = serializeDocumentBodyValue(snapshot);
    pendingLocalValueRef.current = true;
    onChange?.(cloneDocumentBodyValue(snapshot));
    onDirtyChange?.(true);
    const nextActiveId = snapshot.blocks.some(block => block.id === activeBlockId)
      ? activeBlockId
      : snapshot.blocks[0]?.id;
    setActiveBlockId(nextActiveId || null);
    if (nextActiveId) setFocusBlockId(nextActiveId);
    message.success('已撤回上一次操作');
  };

  const rememberInlineSelection = (blockId, editor, range) => {
    setActiveBlockId(blockId);
    activeInlineEditorRef.current = editor || null;
    if (range && !range.collapsed) {
      inlineSelectionRangeRef.current = range.cloneRange();
      setInlineToolbarOpen(true);
    } else {
      inlineSelectionRangeRef.current = null;
      setInlineToolbarOpen(false);
    }
  };

  const restoreInlineSelection = () => {
    const editor = activeInlineEditorRef.current;
    const range = inlineSelectionRangeRef.current;
    if (!editor || !range || range.collapsed || !document.contains(editor)) return null;
    const selection = window.getSelection?.();
    if (!selection) return null;
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range.cloneRange());
    return selection.getRangeAt(0);
  };

  const commitInlineMutation = (node) => {
    const editor = activeInlineEditorRef.current;
    if (!editor) return;
    const selection = window.getSelection?.();
    if (selection && node) {
      const nextRange = document.createRange();
      nextRange.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      inlineSelectionRangeRef.current = nextRange.cloneRange();
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    setInlineToolbarOpen(true);
  };

  const wrapInlineSelection = (tagName, configure) => {
    const range = restoreInlineSelection();
    if (!range) {
      message.info('请先选择要设置样式的文字');
      return;
    }
    const wrapper = document.createElement(tagName);
    configure?.(wrapper);
    try {
      range.surroundContents(wrapper);
    } catch {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    }
    commitInlineMutation(wrapper);
  };

  const applyInlineStyle = (style) => {
    if (style === 'bold') wrapInlineSelection('strong');
    if (style === 'italic') wrapInlineSelection('em');
    if (style === 'underline') wrapInlineSelection('u');
    if (style === 'strike') wrapInlineSelection('s');
    if (style === 'code') wrapInlineSelection('code');
    if (style === 'link') {
      const href = window.prompt('请输入链接地址', 'https://');
      if (!href) return;
      wrapInlineSelection('a', node => {
        node.setAttribute('href', href);
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noreferrer');
      });
    }
  };

  const applyInlineColor = (color) => {
    wrapInlineSelection('span', node => node.setAttribute('style', `color: ${color}`));
  };

  const setClipboardBlockSelection = (ids = [], {
    selectAll = false,
    manual = false,
    sourceBlocks = blocks,
  } = {}) => {
    const idSet = new Set(ids.filter(Boolean));
    const nextIds = sourceBlocks.map(block => block.id).filter(id => idSet.has(id));
    clipboardBlockIdsRef.current = nextIds;
    selectAllBlocksActiveRef.current = Boolean(selectAll && nextIds.length);
    manualBlockSelectionActiveRef.current = Boolean(manual && nextIds.length);
    setClipboardBlockIds(current => (
      current.length === nextIds.length && current.every((id, index) => id === nextIds[index])
        ? current
        : nextIds
    ));
  };

  const clearClipboardBlockSelection = () => {
    clipboardBlockIdsRef.current = [];
    selectAllBlocksActiveRef.current = false;
    manualBlockSelectionActiveRef.current = false;
    blockSelectionAnchorRef.current = null;
    setClipboardBlockIds(current => (current.length ? [] : current));
  };

  const getBlockSelectionUnitIds = blockId => getDocumentBodyBlockUnitIds(blocks, blockId);

  const selectBlockFromHandle = (event, blockId) => {
    const unitIds = getBlockSelectionUnitIds(blockId);
    if (!unitIds.length) return [];
    activateClipboardSelectionScope();
    window.getSelection?.()?.removeAllRanges();

    if (event?.shiftKey && blockSelectionAnchorRef.current) {
      const anchorUnitIds = getBlockSelectionUnitIds(blockSelectionAnchorRef.current);
      const anchorIndexes = anchorUnitIds.map(id => blocks.findIndex(block => block.id === id)).filter(index => index >= 0);
      const targetIndexes = unitIds.map(id => blocks.findIndex(block => block.id === id)).filter(index => index >= 0);
      if (anchorIndexes.length && targetIndexes.length) {
        const from = Math.min(...anchorIndexes, ...targetIndexes);
        const to = Math.max(...anchorIndexes, ...targetIndexes);
        const rangeIds = blocks.slice(from, to + 1).map(block => block.id);
        setClipboardBlockSelection(rangeIds, { manual: true });
        setActiveBlockId(blockId);
        return rangeIds;
      }
    }

    if (event?.metaKey || event?.ctrlKey) {
      const current = new Set(clipboardBlockIdsRef.current);
      const removeUnit = unitIds.every(id => current.has(id));
      unitIds.forEach(id => (removeUnit ? current.delete(id) : current.add(id)));
      const nextIds = current.size ? [...current] : unitIds;
      setClipboardBlockSelection(nextIds, { manual: true });
      blockSelectionAnchorRef.current = blockId;
      setActiveBlockId(blockId);
      return nextIds;
    }

    blockSelectionAnchorRef.current = blockId;
    setClipboardBlockSelection(unitIds, { manual: true });
    setActiveBlockId(blockId);
    return unitIds;
  };

  const activateClipboardSelectionScope = () => {
    document.dispatchEvent(new CustomEvent(DOCUMENT_BODY_SELECTION_EVENT, {
      detail: { sourceId: selectionScopeIdRef.current },
    }));
  };

  useEffect(() => {
    const handleOtherEditorSelection = (event) => {
      if (event.detail?.sourceId === selectionScopeIdRef.current) return;
      if (clipboardBlockIdsRef.current.length) clearClipboardBlockSelection();
    };
    document.addEventListener(DOCUMENT_BODY_SELECTION_EVENT, handleOtherEditorSelection);
    return () => document.removeEventListener(DOCUMENT_BODY_SELECTION_EVENT, handleOtherEditorSelection);
  }, []);

  const getVisibleClipboardBlockIds = () => (
    Array.from(blocksRootRef.current?.querySelectorAll?.('[data-document-body-block-id]') || [])
      .map(node => node.getAttribute('data-document-body-block-id'))
      .filter(Boolean)
  );

  const getClipboardBlockIdFromPoint = (clientX, clientY, visibleIds = []) => {
    const root = blocksRootRef.current;
    if (!root) return null;
    const directNode = document.elementFromPoint?.(clientX, clientY)?.closest?.('[data-document-body-block-id]');
    if (directNode && root.contains(directNode)) {
      return directNode.getAttribute('data-document-body-block-id');
    }
    const nodes = Array.from(root.querySelectorAll('[data-document-body-block-id]'))
      .filter(node => !visibleIds.length || visibleIds.includes(node.getAttribute('data-document-body-block-id')));
    const nodeAtY = nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    if (nodeAtY) return nodeAtY.getAttribute('data-document-body-block-id');
    if (!nodes.length) return null;
    if (clientY < nodes[0].getBoundingClientRect().top) return nodes[0].getAttribute('data-document-body-block-id');
    if (clientY > nodes[nodes.length - 1].getBoundingClientRect().bottom) {
      return nodes[nodes.length - 1].getAttribute('data-document-body-block-id');
    }
    return null;
  };

  const setClipboardBlockRangeSelection = (startId, endId, visibleIds) => {
    const startIndex = visibleIds.indexOf(startId);
    const endIndex = visibleIds.indexOf(endId);
    if (startIndex < 0 || endIndex < 0) return;
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    setClipboardBlockSelection(visibleIds.slice(from, to + 1), { manual: true });
    setActiveBlockId(endId);
    setOpenMenuBlockId(null);
  };

  const handleEditorMouseDown = (event) => {
    activateClipboardSelectionScope();
    if (clipboardBlockIdsRef.current.length) clearClipboardBlockSelection();
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target.closest?.('button, input, textarea, a, [role="button"]')) return;
    const startNode = event.target.closest?.('[data-document-body-block-id]');
    const startId = startNode?.getAttribute('data-document-body-block-id');
    if (!startId) return;
    const visibleIds = getVisibleClipboardBlockIds();
    const startX = event.clientX;
    const startY = event.clientY;

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      blockSelectionDragRef.current = null;
    };
    const handleMouseMove = (moveEvent) => {
      const state = blockSelectionDragRef.current;
      if (!state) return;
      const moved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      const currentId = getClipboardBlockIdFromPoint(moveEvent.clientX, moveEvent.clientY, visibleIds);
      if (!state.dragging && (moved < 6 || !currentId || currentId === startId)) return;
      if (!currentId) return;
      state.dragging = true;
      moveEvent.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      setClipboardBlockRangeSelection(startId, currentId, visibleIds);
    };
    const handleMouseUp = (upEvent) => {
      const state = blockSelectionDragRef.current;
      cleanup();
      if (state?.dragging) upEvent.preventDefault();
    };

    blockSelectionDragRef.current = { dragging: false, cleanup };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => () => blockSelectionDragRef.current?.cleanup?.(), []);

  useEffect(() => {
    const validIds = clipboardBlockIdsRef.current.filter(id => blocks.some(block => block.id === id));
    if (validIds.length !== clipboardBlockIdsRef.current.length) {
      setClipboardBlockSelection(validIds, { selectAll: selectAllBlocksActiveRef.current });
    }
  }, [serializedValue]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (selectAllBlocksActiveRef.current || manualBlockSelectionActiveRef.current) return;
      const selectedIds = getDocumentBodySelectionBlockIds(blocksRootRef.current);
      setClipboardBlockSelection(selectedIds.length > 1 ? selectedIds : []);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  });

  useEffect(() => {
    const handleEditorShortcut = (event) => {
      if (!editorRootRef.current?.contains(document.activeElement)) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'a' && !event.shiftKey) {
        const activeElement = document.activeElement;
        if (activeElement?.closest?.('input, textarea, [data-document-body-table-cell="true"]')) return;
        event.preventDefault();
        activateClipboardSelectionScope();
        window.getSelection?.()?.removeAllRanges();
        setClipboardBlockSelection(blocks.map(block => block.id), { selectAll: true });
        return;
      }
      if (readOnly) return;
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoLastChange();
        return;
      }
      if (key === 's' && !event.shiftKey) {
        event.preventDefault();
        Promise.resolve(onSave?.()).catch(() => {});
      }
    };
    window.addEventListener('keydown', handleEditorShortcut);
    return () => window.removeEventListener('keydown', handleEditorShortcut);
  });

  const patchBlock = (id, patch) => emitBlocks(blocks.map(block => (block.id === id ? { ...block, ...patch } : block)));
  const patchBlockMeta = (id, patch) => emitBlocks(blocks.map(block => (
    block.id === id ? { ...block, meta: { ...(block.meta || {}), ...patch } } : block
  )));

  const insertPastedBlocks = (targetBlockId, pastedBlocks) => {
    if (!pastedBlocks.length) return;
    const targetIndex = blocks.findIndex(block => block.id === targetBlockId);
    const targetBlock = blocks[targetIndex];
    const targetIndent = targetBlock
      ? getBlockIndent(targetBlock) + (targetBlock.type === 'fold-list' ? 1 : 0)
      : 0;
    const preparedBlocks = rebaseDocumentBodyClipboardBlocks(pastedBlocks, targetIndent);
    const nextBlocks = [...blocks];
    if (targetBlock && isBlankBlock(targetBlock)) nextBlocks.splice(targetIndex, 1, ...preparedBlocks);
    else nextBlocks.splice(targetIndex >= 0 ? targetIndex + 1 : nextBlocks.length, 0, ...preparedBlocks);
    emitBlocks(nextBlocks, preparedBlocks[0]?.id);
  };

  const handleBlockPaste = (event, blockId) => {
    if (readOnly || !event.clipboardData) return;
    const html = event.clipboardData.getData('text/html') || '';
    const text = event.clipboardData.getData('text/plain') || '';
    const hasRelationBlocks = Boolean(event.clipboardData.getData(DOCUMENT_BODY_CLIPBOARD_MIME))
      || html.includes(DOCUMENT_BODY_CLIPBOARD_HTML_ATTR);
    const inlineEditor = event.currentTarget?.isContentEditable
      ? event.currentTarget
      : event.target?.closest?.('[contenteditable="true"]');
    const structuralHtml = /<(?:ol|ul|li|table|tr|h[1-6]|blockquote)\b/i.test(html);
    const structuralPlainText = !html && String(text || '').replace(/\r\n?/g, '\n').split('\n')
      .filter(line => line.trim())
      .some(line => /^\s*(?:[-*•◦▪]\s+|(?:\d+|[a-zA-Z]+)[.)、]\s+)/.test(line));
    const shouldPasteInline = Boolean(
      inlineEditor
      && !hasRelationBlocks
      && !structuralHtml
      && !structuralPlainText
      && !documentClipboardHasEmbeddedBlocks(html)
    );
    if (shouldPasteInline) {
      const inlineHtml = getInlineClipboardHtml(html, text);
      if (!inlineHtml) return;
      event.preventDefault();
      event.stopPropagation();
      clearClipboardBlockSelection();
      insertInlineClipboardHtml(inlineEditor, inlineHtml);
      return;
    }
    const pastedBlocks = hasRelationBlocks
      ? parseDocumentBodyClipboardData(event.clipboardData)
      : parseDocumentBodyClipboard(html, text).blocks;
    const structural = hasRelationBlocks
      || /<(?:p|div|h[1-6]|ol|ul|li|table|tr|br)\b/i.test(html)
      || pastedBlocks.length > 1
      || pastedBlocks.some(item => item.type !== 'paragraph' || Number(item.meta?.indent || 0) > 0);
    if (!pastedBlocks.length || !structural) return;
    event.preventDefault();
    event.stopPropagation();
    clearClipboardBlockSelection();
    insertPastedBlocks(blockId, pastedBlocks);
  };

  const handleEditorCopy = (event) => {
    let selectedIds = clipboardBlockIdsRef.current;
    if (!selectAllBlocksActiveRef.current && !manualBlockSelectionActiveRef.current) {
      const nativeSelectedIds = getDocumentBodySelectionBlockIds(blocksRootRef.current);
      if (nativeSelectedIds.length < 2) return;
      selectedIds = nativeSelectedIds;
    }
    const selectedSet = new Set(selectedIds);
    const selectedBlocks = blocks.filter(block => selectedSet.has(block.id));
    if (!selectedBlocks.length || !event.clipboardData) return;
    const payload = buildDocumentBodyClipboardPayload(selectedBlocks);
    event.clipboardData.setData('text/plain', payload.text);
    if (payload.html) event.clipboardData.setData('text/html', payload.html);
    event.clipboardData.setData(DOCUMENT_BODY_CLIPBOARD_MIME, JSON.stringify({ blocks: payload.blocks }));
    event.preventDefault();
    event.stopPropagation();
    message.success('已复制');
  };

  const getBlockActionIds = (blockId) => {
    const selectedIds = clipboardBlockIdsRef.current;
    return selectedIds.includes(blockId) && selectedIds.length
      ? selectedIds
      : getBlockSelectionUnitIds(blockId);
  };

  const copyBlockIdsToClipboard = async (ids = []) => {
    const idSet = new Set(ids);
    const selectedBlocks = blocks.filter(block => idSet.has(block.id));
    if (!selectedBlocks.length) return false;
    const payload = buildDocumentBodyClipboardPayload(selectedBlocks);
    if (navigator.clipboard?.write && window.ClipboardItem && window.isSecureContext) {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/plain': new Blob([payload.text], { type: 'text/plain' }),
        'text/html': new Blob([payload.html], { type: 'text/html' }),
      })]);
      return true;
    }
    if (typeof document.execCommand === 'function') {
      editorRootRef.current?.focus?.();
      if (document.execCommand('copy')) return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.text);
      return true;
    }
    return false;
  };

  const duplicateBlocksByIds = (ids = []) => {
    const idSet = new Set(ids);
    const selectedBlocks = blocks.filter(block => idSet.has(block.id));
    if (!selectedBlocks.length) return false;
    const copies = cloneDocumentBodyBlocks(selectedBlocks);
    const lastSelectedIndex = Math.max(...selectedBlocks.map(block => blocks.findIndex(item => item.id === block.id)));
    const nextBlocks = [...blocks];
    nextBlocks.splice(lastSelectedIndex + 1, 0, ...copies);
    emitBlocks(nextBlocks, copies[0]?.id);
    blockSelectionAnchorRef.current = copies[0]?.id || null;
    setClipboardBlockSelection(copies.map(block => block.id), {
      manual: true,
      sourceBlocks: nextBlocks,
    });
    return true;
  };

  const deleteBlocksByIds = (ids = []) => {
    const deleteSet = new Set(ids);
    const firstDeletedIndex = blocks.findIndex(block => deleteSet.has(block.id));
    if (firstDeletedIndex < 0) return false;
    let nextBlocks = blocks.filter(block => !deleteSet.has(block.id));
    if (!nextBlocks.length) nextBlocks = [createDocumentBodyBlock('paragraph', '')];
    const nextFocus = nextBlocks[Math.min(firstDeletedIndex, nextBlocks.length - 1)] || nextBlocks[0];
    clearClipboardBlockSelection();
    emitBlocks(nextBlocks, nextFocus?.id);
    return true;
  };

  const createBlockAfter = (type, afterId = blocks[blocks.length - 1]?.id, options = {}) => {
    const afterIndex = blocks.findIndex(block => block.id === afterId);
    const afterBlock = afterIndex >= 0 ? blocks[afterIndex] : null;
    const currentIndent = afterBlock ? getBlockIndent(afterBlock) : 0;
    const listType = ['bullet', 'numbered', 'fold-list'].includes(type);
    const inheritedIndent = afterBlock?.type === 'fold-list' ? currentIndent + 1 : currentIndent;
    let meta = {};
    if (type === 'table-simple') meta = { rows: [['', ''], ['', '']] };
    if (listType) meta = { indent: Math.min(MAX_LIST_INDENT, options.indent ?? inheritedIndent), hierarchy: 'list' };
    if (type === 'fold-list') meta = { ...meta, collapsed: false };
    if (!listType && inheritedIndent > 0) meta = { ...meta, indent: inheritedIndent, hierarchy: 'list' };
    meta = { ...meta, ...(options.meta || {}) };
    const nextBlock = createDocumentBodyBlock(type, options.content || '', { meta });
    const nextBlocks = [...blocks];
    nextBlocks.splice(afterIndex >= 0 ? afterIndex + 1 : nextBlocks.length, 0, nextBlock);
    emitBlocks(nextBlocks, nextBlock.id);
    return nextBlock;
  };

  const replaceBlockType = (blockId, type) => {
    const block = blocks.find(item => item.id === blockId);
    if (!block) return;
    const indent = getBlockIndent(block);
    const nextMeta = type === 'table-simple'
      ? { rows: Array.isArray(block.meta?.rows) ? block.meta.rows : [['', ''], ['', '']] }
      : {
        ...(block.meta || {}),
        ...(['bullet', 'numbered', 'fold-list'].includes(type) || indent > 0 ? { indent, hierarchy: 'list' } : {}),
        ...(type === 'fold-list' ? { collapsed: false } : {}),
      };
    patchBlock(blockId, { type, checked: false, meta: nextMeta });
    setFocusBlockId(blockId);
  };

  const changeIndent = (blockId, delta) => {
    const index = blocks.findIndex(block => block.id === blockId);
    if (index < 0) return;
    if (index === 0 && delta > 0) return;
    const block = blocks[index];
    const currentIndent = getBlockIndent(block);
    const previousIndent = index > 0 ? getBlockIndent(blocks[index - 1]) : 0;
    const nextIndent = Math.max(0, Math.min(MAX_LIST_INDENT, currentIndent + delta, previousIndent + 1));
    if (nextIndent === currentIndent) return;
    patchBlockMeta(blockId, { indent: nextIndent, hierarchy: 'list' });
    setFocusBlockId(blockId);
  };

  const removeBlock = (blockId) => {
    const index = blocks.findIndex(block => block.id === blockId);
    if (index < 0) return;
    if (blocks.length === 1) {
      const replacement = createDocumentBodyBlock('paragraph', '');
      emitBlocks([replacement], replacement.id);
      return;
    }
    const block = blocks[index];
    const indent = getBlockIndent(block);
    const endIndex = block.type === 'fold-list' ? getSubtreeEndIndex(blocks, index) : index;
    const nextBlocks = blocks
      .filter(item => item.id !== blockId)
      .map((item, nextIndex) => {
        const originalIndex = nextIndex >= index ? nextIndex + 1 : nextIndex;
        if (block.type !== 'fold-list' || originalIndex <= index || originalIndex > endIndex) return item;
        return { ...item, meta: { ...(item.meta || {}), indent: Math.max(indent, getBlockIndent(item) - 1) } };
      });
    const previous = nextBlocks[Math.max(0, index - 1)] || nextBlocks[0];
    emitBlocks(nextBlocks, previous?.id);
  };

  const mergeBlockWithPreviousAtStart = (blockId, currentContent = '') => {
    const index = blocks.findIndex(block => block.id === blockId);
    if (index <= 0) return false;
    const current = blocks[index];
    const previous = blocks[index - 1];
    if (!current || !previous) return false;
    if (isBlankBlock(current)) {
      removeBlock(blockId);
      return true;
    }
    const unsupportedTypes = new Set(['divider', 'table-simple']);
    if (unsupportedTypes.has(current.type) || unsupportedTypes.has(previous.type)) return false;
    const mergedContent = sanitizeDocumentBodyInlineHtml(
      `${previous.content || ''}${currentContent || current.content || ''}`
    );
    const nextBlocks = [...blocks];
    nextBlocks[index - 1] = { ...previous, content: mergedContent };
    nextBlocks.splice(index, 1);
    emitBlocks(nextBlocks, previous.id);
    return true;
  };

  const mergeBlockWithNextAtEnd = (blockId, currentContent = '') => {
    const index = blocks.findIndex(block => block.id === blockId);
    if (index < 0 || index >= blocks.length - 1) return false;
    const current = blocks[index];
    const next = blocks[index + 1];
    if (!current || !next) return false;
    const unsupportedTypes = new Set(['divider', 'table-simple']);
    if (unsupportedTypes.has(current.type) || unsupportedTypes.has(next.type)) return false;
    const mergedContent = sanitizeDocumentBodyInlineHtml(
      `${currentContent || current.content || ''}${next.content || ''}`
    );
    const nextBlocks = [...blocks];
    nextBlocks[index] = { ...current, content: mergedContent };
    nextBlocks.splice(index + 1, 1);
    emitBlocks(nextBlocks, current.id);
    return true;
  };

  const moveBlock = (blockId, delta) => {
    const start = blocks.findIndex(block => block.id === blockId);
    if (start < 0) return;
    const end = getSubtreeEndIndex(blocks, start);
    const indent = getBlockIndent(blocks[start]);
    if (delta < 0) {
      let previousStart = start - 1;
      while (previousStart >= 0 && getBlockIndent(blocks[previousStart]) > indent) previousStart -= 1;
      if (previousStart < 0 || getBlockIndent(blocks[previousStart]) !== indent) return;
      const group = blocks.slice(start, end + 1);
      const nextBlocks = [...blocks.slice(0, previousStart), ...group, ...blocks.slice(previousStart, start), ...blocks.slice(end + 1)];
      emitBlocks(nextBlocks, blockId);
      return;
    }
    const nextStart = end + 1;
    if (nextStart >= blocks.length || getBlockIndent(blocks[nextStart]) !== indent) return;
    const nextEnd = getSubtreeEndIndex(blocks, nextStart);
    const group = blocks.slice(start, end + 1);
    const nextBlocks = [...blocks.slice(0, start), ...blocks.slice(nextStart, nextEnd + 1), ...group, ...blocks.slice(nextEnd + 1)];
    emitBlocks(nextBlocks, blockId);
  };

  const handleDrop = (event, targetBlockId) => {
    event.preventDefault();
    const sourceId = draggingBlockId || event.dataTransfer?.getData('text/plain');
    if (!sourceId || sourceId === targetBlockId) return;
    const sourceStart = blocks.findIndex(block => block.id === sourceId);
    const targetIndex = blocks.findIndex(block => block.id === targetBlockId);
    if (sourceStart < 0 || targetIndex < 0) return;
    const sourceEnd = getSubtreeEndIndex(blocks, sourceStart);
    if (targetIndex >= sourceStart && targetIndex <= sourceEnd) return;
    const group = blocks.slice(sourceStart, sourceEnd + 1);
    const remaining = [...blocks.slice(0, sourceStart), ...blocks.slice(sourceEnd + 1)];
    const remainingTargetIndex = remaining.findIndex(block => block.id === targetBlockId);
    remaining.splice(remainingTargetIndex < 0 ? remaining.length : remainingTargetIndex, 0, ...group);
    emitBlocks(remaining, sourceId);
    setDraggingBlockId(null);
  };

  const handleEnter = (block) => {
    const indent = getBlockIndent(block);
    if (block.type === 'fold-list') {
      createBlockAfter('numbered', block.id, {
        indent: Math.min(MAX_LIST_INDENT, indent + 1),
        meta: {
          hierarchy: 'list',
          template_question_parent: block.meta?.template_question_key,
        },
      });
      return;
    }
    if (['bullet', 'numbered'].includes(block.type)) {
      createBlockAfter(block.type, block.id, { indent, meta: { hierarchy: 'list' } });
      return;
    }
    createBlockAfter('paragraph', block.id, { meta: indent ? { indent, hierarchy: 'list' } : {} });
  };

  const handleBlockMenuAction = async (block, key) => {
    setOpenMenuBlockId(null);
    const actionIds = getBlockActionIds(block.id);
    if (key.startsWith('type:')) {
      replaceBlockType(block.id, key.slice(5));
      return;
    }
    if (key === 'copy') {
      try {
        const copied = await copyBlockIdsToClipboard(actionIds);
        if (!copied) throw new Error('clipboard unavailable');
        message.success(actionIds.length > 1 ? `已复制 ${actionIds.length} 个块` : '已复制');
      } catch {
        message.error('复制失败，请使用 Ctrl/Cmd+C');
      }
      return;
    }
    if (key === 'duplicate') {
      duplicateBlocksByIds(actionIds);
      return;
    }
    if (key === 'indent-less') changeIndent(block.id, -1);
    if (key === 'indent-more') changeIndent(block.id, 1);
    if (key === 'move-up') moveBlock(block.id, -1);
    if (key === 'move-down') moveBlock(block.id, 1);
    if (key === 'delete') deleteBlocksByIds(actionIds);
  };

  const buildBlockMenu = (block, index) => {
    const actionCount = Math.max(1, getBlockActionIds(block.id).length);
    return {
      items: [
      ...groupedBlockTypeItems(),
      { type: 'divider' },
      { key: 'copy', icon: <CopyOutlined />, label: actionCount > 1 ? `复制 ${actionCount} 个块` : '复制' },
      { key: 'duplicate', icon: <SnippetsOutlined />, label: actionCount > 1 ? `拷贝 ${actionCount} 个块的副本` : '拷贝副本' },
      { type: 'divider' },
      { key: 'indent-less', icon: <ArrowLeftOutlined />, label: '减少缩进', disabled: getBlockIndent(block) === 0 },
      { key: 'indent-more', icon: <ArrowRightOutlined />, label: '增加缩进', disabled: index === 0 || getBlockIndent(block) >= MAX_LIST_INDENT },
      { key: 'move-up', icon: <ArrowUpOutlined />, label: '上移', disabled: index === 0 },
      { key: 'move-down', icon: <ArrowDownOutlined />, label: '下移', disabled: index === blocks.length - 1 },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: actionCount > 1 ? `删除 ${actionCount} 个块` : '删除', danger: true },
      ],
      onClick: ({ key, domEvent }) => {
        domEvent?.stopPropagation();
        handleBlockMenuAction(block, key);
      },
    };
  };

  const renderGuides = (block, centerY, markerOffset) => {
    const guide = guideMap.get(block.id);
    const indent = getBlockIndent(block);
    if ((!guide?.ancestorLines?.length && !guide?.hasChildren) || indent < 0) return null;
    const lineStyle = { position: 'absolute', width: 2, background: LIST_GUIDE_COLOR, pointerEvents: 'none', zIndex: 0 };
    return (
      <>
        {(guide.ancestorLines || []).map(({ level, continuesBelow }) => (
          <span
            key={`${block.id}-guide-${level}`}
            style={{
              ...lineStyle,
              left: level * LIST_INDENT_WIDTH + markerOffset,
              top: -8,
              ...(continuesBelow ? { bottom: -8 } : { height: centerY + 9 }),
            }}
          />
        ))}
        {guide.hasChildren && (
          <span style={{ ...lineStyle, left: indent * LIST_INDENT_WIDTH + markerOffset, top: centerY, bottom: -8 }} />
        )}
      </>
    );
  };

  const renderBlockInput = (block, index) => {
    const indent = getBlockIndent(block);
    const active = activeBlockId === block.id;
    const fontSize = 15;
    const lineHeightPx = fontSize * LIST_LINE_HEIGHT;
    const commonProps = {
      value: block.content,
      placeholder: active ? (index === 0 ? placeholder : '输入内容') : '',
      readOnly,
      autoFocus: focusBlockId === block.id,
      onAutoFocusDone: () => setFocusBlockId(null),
      onChange: content => patchBlock(block.id, { content }),
      onActivate: (editor, range) => rememberInlineSelection(block.id, editor, range),
      onEnter: () => handleEnter(block),
      onBackspace: (_event, context) => (
        blocks.length > 1 && mergeBlockWithPreviousAtStart(block.id, context?.content)
      ),
      onDelete: (_event, context) => (
        blocks.length > 1 && mergeBlockWithNextAtEnd(block.id, context?.content)
      ),
      onIndent: delta => changeIndent(block.id, delta),
      onPaste: event => handleBlockPaste(event, block.id),
      onMentionTrigger: trigger => handleMentionTrigger(block.id, trigger),
      style: { fontSize, lineHeight: LIST_LINE_HEIGHT, color: '#202124', fontWeight: 400, padding: 0 },
    };

    if (block.type === 'divider') return <div style={{ borderTop: '1px solid #e5e7eb', margin: '14px 0' }} />;
    if (block.type === 'table-simple') {
      const rows = Array.isArray(block.meta?.rows) && block.meta.rows.length ? block.meta.rows : [['', ''], ['', '']];
      const columnCount = Math.max(1, ...rows.map(row => (Array.isArray(row) ? row.length : 0)));
      const updateCell = (rowIndex, columnIndex, cellValue) => {
        const nextRows = rows.map(row => Array.from({ length: columnCount }, (_, cursor) => row?.[cursor] || ''));
        nextRows[rowIndex][columnIndex] = cellValue;
        patchBlockMeta(block.id, { rows: nextRows });
      };
      const resizeTable = (rowDelta, columnDelta) => {
        const nextRowCount = Math.max(1, rows.length + rowDelta);
        const nextColumnCount = Math.max(1, columnCount + columnDelta);
        const nextRows = Array.from({ length: nextRowCount }, (_, rowIndex) => (
          Array.from({ length: nextColumnCount }, (_, columnIndex) => rows[rowIndex]?.[columnIndex] || '')
        ));
        patchBlockMeta(block.id, { rows: nextRows });
      };
      return (
        <div>
          {!readOnly && active && (
            <Space size={4} wrap style={{ marginBottom: 8 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={() => resizeTable(1, 0)}>行</Button>
              <Button size="small" icon={<PlusOutlined />} onClick={() => resizeTable(0, 1)}>列</Button>
              <Tooltip title="删除末行">
                <Button size="small" icon={<DeleteOutlined />} disabled={rows.length <= 1} onClick={() => resizeTable(-1, 0)} />
              </Tooltip>
              <Tooltip title="删除末列">
                <Button size="small" icon={<DeleteOutlined />} disabled={columnCount <= 1} onClick={() => resizeTable(0, -1)} />
              </Tooltip>
            </Space>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: columnCount * 120, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`${block.id}-row-${rowIndex}`}>
                    {Array.from({ length: columnCount }, (_, columnIndex) => (
                      <td key={`${block.id}-cell-${rowIndex}-${columnIndex}`} style={{ border: '1px solid #e5e7eb', padding: 0 }}>
                        <Input
                          variant="borderless"
                          value={row?.[columnIndex] || ''}
                          readOnly={readOnly}
                          onFocus={() => setActiveBlockId(block.id)}
                          onChange={event => updateCell(rowIndex, columnIndex, event.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (['fold-list', 'bullet', 'numbered'].includes(block.type)) {
      const collapsed = Boolean(block.meta?.collapsed);
      const markerOffset = block.type === 'numbered' ? LIST_MARKER_WIDTH - 6 : LIST_MARKER_WIDTH / 2;
      const markerStyle = {
        width: LIST_MARKER_WIDTH,
        minWidth: LIST_MARKER_WIDTH,
        height: lineHeightPx,
        display: 'flex',
        alignItems: 'center',
        justifyContent: block.type === 'numbered' ? 'flex-end' : 'center',
        position: 'relative',
        zIndex: 1,
        color: LIST_MARKER_COLOR,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize,
        lineHeight: `${lineHeightPx}px`,
      };
      const marker = block.type === 'fold-list' ? (
        <button
          type="button"
          aria-label={collapsed ? '展开折叠列表' : '收起折叠列表'}
          onClick={(event) => {
            event.stopPropagation();
            patchBlockMeta(block.id, { collapsed: !collapsed });
          }}
          style={{ ...markerStyle, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', appearance: 'none' }}
        >
          <FoldTriangle collapsed={collapsed} />
        </button>
      ) : block.type === 'bullet' ? (
        <span style={markerStyle}>{renderBulletMarker(indent)}</span>
      ) : (
        <span style={markerStyle}>{numberedMarkers.get(block.id) || formatNumberedMarker(1, indent)}</span>
      );
      return (
        <div style={{ position: 'relative', paddingLeft: indent * LIST_INDENT_WIDTH }}>
          {renderGuides(block, lineHeightPx / 2 + 1, markerOffset)}
          <div style={{ display: 'flex', gap: block.type === 'fold-list' ? 7 : LIST_TEXT_GAP, alignItems: 'flex-start' }}>
            {marker}
            <InlineBlockEditor
              {...commonProps}
              placeholder={active
                ? (block.type === 'fold-list' ? '折叠列表标题' : block.type === 'numbered' ? '数字列表项' : '列表项')
                : ''}
              style={{ ...commonProps.style, minHeight: lineHeightPx }}
            />
          </div>
        </div>
      );
    }

    if (block.type === 'todo') {
      return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingLeft: indent * LIST_INDENT_WIDTH }}>
          <Checkbox checked={Boolean(block.checked)} disabled={readOnly} onChange={event => patchBlock(block.id, { checked: event.target.checked })} style={{ paddingTop: 5 }} />
          <InlineBlockEditor {...commonProps} placeholder={active ? '待办事项' : ''} />
        </div>
      );
    }

    const headingLevel = Number(block.type.replace('heading', '')) || 0;
    if (block.type === 'quote') {
      return <div style={{ borderLeft: '3px solid #94a3b8', paddingLeft: 12 }}><InlineBlockEditor {...commonProps} placeholder={active ? '引述文字' : ''} /></div>;
    }
    return (
      <div style={{ paddingLeft: indent * LIST_INDENT_WIDTH }}>
        <InlineBlockEditor
          {...commonProps}
          style={{
            ...commonProps.style,
            fontSize: headingLevel ? [0, 30, 24, 19, 16][headingLevel] : fontSize,
            fontWeight: headingLevel ? 700 : 400,
            lineHeight: headingLevel ? 1.35 : LIST_LINE_HEIGHT,
          }}
        />
      </div>
    );
  };

  const renderBlock = (block, index) => {
    if (hiddenBlockIds.has(block.id)) return null;
    const active = activeBlockId === block.id;
    const hovered = hoveredBlockId === block.id;
    const menuOpen = openMenuBlockId === block.id;
    const clipboardSelected = clipboardBlockIds.includes(block.id);
    const blankParagraph = block.type === 'paragraph' && isBlankBlock(block);
    const selectedVisibleBlockIds = clipboardBlockIds.filter(id => !hiddenBlockIds.has(id));
    const groupHandleBlockId = selectedVisibleBlockIds.length > 1 ? selectedVisibleBlockIds[0] : null;
    const canShowGroupHandle = !groupHandleBlockId || groupHandleBlockId === block.id || menuOpen;
    const handleVisible = !readOnly && canShowGroupHandle && (active || hovered || menuOpen || clipboardSelected || blankParagraph);
    return (
      <div
        key={block.id}
        data-document-body-block-id={block.id}
        onDragOver={event => {
          if (!readOnly) event.preventDefault();
        }}
        onDrop={event => handleDrop(event, block.id)}
        onMouseEnter={() => setHoveredBlockId(block.id)}
        onMouseLeave={() => setHoveredBlockId(current => (current === block.id ? null : current))}
        onClick={() => setActiveBlockId(block.id)}
        data-copy-selected={clipboardSelected ? 'true' : undefined}
        data-block-selected={clipboardSelected ? 'true' : undefined}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 4,
          minWidth: 0,
          position: 'relative',
          padding: ['fold-list', 'bullet', 'numbered'].includes(block.type) ? '1px 8px 1px 0' : '3px 8px 3px 0',
          marginBottom: ['fold-list', 'bullet', 'numbered'].includes(block.type) ? 0 : 2,
          borderRadius: 6,
          background: clipboardSelected
            ? '#f8e6e8'
            : (menuOpen ? '#f8e6e8' : (draggingBlockId === block.id ? '#f8fafc' : 'transparent')),
        }}
      >
        {!readOnly && (
          <div style={{ width: 24, minWidth: 24, display: 'flex', justifyContent: 'center', paddingTop: blankParagraph ? 0 : 2, zIndex: 2 }}>
            <Tooltip title={blankParagraph ? '添加内容' : '块菜单'} placement="left">
              <Dropdown
                trigger={['click']}
                open={menuOpen}
                menu={buildBlockMenu(block, index)}
                onOpenChange={(open) => {
                  if (open && !clipboardBlockIdsRef.current.includes(block.id)) selectBlockFromHandle(null, block.id);
                  setOpenMenuBlockId(open ? block.id : null);
                }}
                placement="bottomLeft"
              >
                <Button
                  type="text"
                  size="small"
                  icon={<BlockHandleIcon add={blankParagraph} />}
                  aria-label={blankParagraph ? '添加内容' : '块菜单'}
                  draggable={!blankParagraph}
                  onDragStart={(event) => {
                    setDraggingBlockId(block.id);
                    event.dataTransfer?.setData('text/plain', block.id);
                    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggingBlockId(null)}
                  onMouseDown={event => {
                    event.stopPropagation();
                    if (!blankParagraph) selectBlockFromHandle(event, block.id);
                  }}
                  onClick={event => event.stopPropagation()}
                  style={{
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    opacity: handleVisible ? 1 : 0,
                    pointerEvents: handleVisible ? 'auto' : 'none',
                    color: '#6b7280',
                    background: menuOpen || clipboardSelected ? '#f8e6e8' : 'transparent',
                  }}
                />
              </Dropdown>
            </Tooltip>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{renderBlockInput(block, index)}</div>
      </div>
    );
  };

  const lastVisibleBlock = [...blocks].reverse().find(block => !hiddenBlockIds.has(block.id));
  const appendMenu = {
    items: groupedBlockTypeItems('append:'),
    onClick: ({ key, domEvent }) => {
      domEvent?.stopPropagation();
      if (key.startsWith('append:')) createBlockAfter(key.slice(7), blocks[blocks.length - 1]?.id);
    },
  };

  const inlineColorOptions = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#ffffff', '#92400e'];
  const inlineToolbar = !readOnly && inlineToolbarOpen ? (
    <div
      data-document-body-inline-toolbar="true"
      onMouseDown={event => event.preventDefault()}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        width: 'fit-content',
        maxWidth: '100%',
        marginBottom: 8,
        padding: 5,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
      }}
    >
      <Space size={2} wrap>
        {[
          ['bold', 'B', '加粗'],
          ['italic', 'I', '斜体'],
          ['underline', 'U', '下划线'],
          ['strike', 'S', '删除线'],
          ['code', '{}', '行内代码'],
          ['link', <LinkOutlined />, '链接'],
        ].map(([key, label, title]) => (
          <Tooltip key={key} title={title}>
            <Button
              size="small"
              type="text"
              aria-label={title}
              onClick={() => applyInlineStyle(key)}
              style={{
                width: 28,
                minWidth: 28,
                padding: 0,
                fontWeight: key === 'bold' ? 800 : 600,
                fontStyle: key === 'italic' ? 'italic' : 'normal',
                textDecoration: key === 'underline' ? 'underline' : key === 'strike' ? 'line-through' : 'none',
              }}
            >
              {label}
            </Button>
          </Tooltip>
        ))}
        <Divider type="vertical" style={{ marginInline: 4 }} />
        <Dropdown
          trigger={['click']}
          dropdownRender={() => (
            <div
              onMouseDown={event => event.preventDefault()}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 24px)', gap: 6, padding: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)' }}
            >
              {inlineColorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={`文字颜色 ${color}`}
                  onClick={() => applyInlineColor(color)}
                  style={{ width: 24, height: 24, borderRadius: 4, border: color === '#ffffff' ? '1px solid #d1d5db' : '1px solid transparent', background: color, cursor: 'pointer' }}
                />
              ))}
            </div>
          )}
        >
          <Tooltip title="文字颜色">
            <Button size="small" type="text" aria-label="文字颜色" style={{ width: 28, minWidth: 28, padding: 0, fontWeight: 800 }}>A</Button>
          </Tooltip>
        </Dropdown>
      </Space>
    </div>
  ) : null;

  return (
    <div
      ref={editorRootRef}
      tabIndex={0}
      aria-label="正文编辑区"
      onCopy={handleEditorCopy}
      onMouseDown={handleEditorMouseDown}
      onKeyDownCapture={(event) => {
        if ((!selectAllBlocksActiveRef.current && !manualBlockSelectionActiveRef.current)
          || event.metaKey || event.ctrlKey || event.altKey) return;
        clearClipboardBlockSelection();
      }}
      style={{ minHeight, background: '#fff', padding: '2px 0 16px', outline: 'none', ...style }}
    >
      {inlineToolbar}
      <div ref={blocksRootRef}>{blocks.map(renderBlock)}</div>
      <MentionPicker
        open={Boolean(mentionState)}
        context={mentionContext}
        query={mentionState?.query || ''}
        position={mentionState?.position}
        onSelect={handleMentionSelect}
        onClose={closeMentionPicker}
      />
      {!readOnly && !(lastVisibleBlock?.type === 'paragraph' && isBlankBlock(lastVisibleBlock)) && (
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 38, padding: '4px 8px 4px 0', marginTop: 4 }}>
          <div style={{ width: 24, minWidth: 24, display: 'flex', justifyContent: 'center' }}>
            <Dropdown trigger={['click']} menu={appendMenu} placement="bottomLeft">
              <Tooltip title="添加内容" placement="left">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  aria-label="添加内容"
                  onMouseDown={event => event.preventDefault()}
                  style={{ width: 24, height: 24, minWidth: 24, color: '#6b7280' }}
                />
              </Tooltip>
            </Dropdown>
          </div>
          <button
            type="button"
            onClick={() => createBlockAfter('paragraph', blocks[blocks.length - 1]?.id)}
            style={{
              border: 0,
              background: 'transparent',
              color: '#b8bcc2',
              cursor: 'text',
              fontSize: 15,
              lineHeight: 1.8,
              padding: '0 8px',
              textAlign: 'left',
            }}
          >
            输入 / 选择样式内容
          </button>
        </div>
      )}
    </div>
  );
}
