import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Dropdown, Input, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  buildCollapsedDocumentBlockIds,
  buildDocumentBlockGuideMap,
  buildDocumentNumberedListValues,
  getDocumentBlockHierarchyIndent,
  isDocumentBlockHierarchyMember,
} from '../utils/documentBlockHierarchy';
import {
  createDocumentBodyBlock,
  documentBodyInlineHtmlToPlain,
  DOCUMENT_BODY_BLOCK_TYPES,
  normalizeDocumentBodyValue,
  parseDocumentBodyClipboard,
  sanitizeDocumentBodyInlineHtml,
} from '../utils/documentBodyBlocks';

const LIST_INDENT_WIDTH = 28;
const LIST_MARKER_WIDTH = 24;
const LIST_TEXT_GAP = 6;
const LIST_LINE_HEIGHT = 1.96;
const LIST_MARKER_COLOR = '#202124';
const LIST_GUIDE_COLOR = '#f0f0f0';
const MAX_LIST_INDENT = 9;

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
  onIndent,
  onPaste,
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

  const activate = () => onActivate?.(editorRef.current);
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
        }}
        onMouseUp={activate}
        onKeyUp={activate}
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
          if (event.key === 'Backspace' && !documentBodyInlineHtmlToPlain(editorRef.current?.innerHTML).trim()) {
            onBackspace?.(event);
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

export default function DocumentBodyEditor({ value, onChange, placeholder = '输入内容', readOnly = false, minHeight = 120 }) {
  const normalized = useMemo(() => normalizeDocumentBodyValue(value), [value]);
  const blocks = normalized.blocks;
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [openMenuBlockId, setOpenMenuBlockId] = useState(null);
  const [focusBlockId, setFocusBlockId] = useState(null);
  const [draggingBlockId, setDraggingBlockId] = useState(null);
  const hiddenBlockIds = useMemo(() => buildCollapsedDocumentBlockIds(blocks, MAX_LIST_INDENT), [blocks]);
  const guideMap = useMemo(() => buildDocumentBlockGuideMap(blocks, hiddenBlockIds, MAX_LIST_INDENT), [blocks, hiddenBlockIds]);
  const numberedMarkers = useMemo(() => {
    const markers = new Map();
    buildDocumentNumberedListValues(blocks, MAX_LIST_INDENT).forEach(({ index, indent }, blockId) => {
      markers.set(blockId, formatNumberedMarker(index, indent));
    });
    return markers;
  }, [blocks]);

  const emitBlocks = (nextBlocks, nextFocusId = null) => {
    onChange?.({ ...normalized, blocks: nextBlocks });
    if (nextFocusId) {
      setActiveBlockId(nextFocusId);
      setFocusBlockId(nextFocusId);
    }
  };

  const patchBlock = (id, patch) => emitBlocks(blocks.map(block => (block.id === id ? { ...block, ...patch } : block)));
  const patchBlockMeta = (id, patch) => emitBlocks(blocks.map(block => (
    block.id === id ? { ...block, meta: { ...(block.meta || {}), ...patch } } : block
  )));

  const insertPastedBlocks = (targetBlockId, pastedBlocks) => {
    if (!pastedBlocks.length) return;
    const targetIndex = blocks.findIndex(block => block.id === targetBlockId);
    const targetBlock = blocks[targetIndex];
    const nextBlocks = [...blocks];
    if (targetBlock && isBlankBlock(targetBlock)) nextBlocks.splice(targetIndex, 1, ...pastedBlocks);
    else nextBlocks.splice(targetIndex >= 0 ? targetIndex + 1 : nextBlocks.length, 0, ...pastedBlocks);
    emitBlocks(nextBlocks, pastedBlocks[0]?.id);
  };

  const handleBlockPaste = (event, blockId) => {
    if (readOnly || !event.clipboardData) return;
    const html = event.clipboardData.getData('text/html') || '';
    const text = event.clipboardData.getData('text/plain') || '';
    const parsed = parseDocumentBodyClipboard(html, text);
    const structural = /<(?:p|div|h[1-6]|ol|ul|li|table|tr|br)\b/i.test(html)
      || parsed.blocks.length > 1
      || parsed.blocks.some(item => item.type !== 'paragraph' || Number(item.meta?.indent || 0) > 0);
    if (!parsed.blocks.length || !structural) return;
    event.preventDefault();
    event.stopPropagation();
    insertPastedBlocks(blockId, parsed.blocks);
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

  const handleBlockMenuAction = (block, key) => {
    setOpenMenuBlockId(null);
    if (key.startsWith('type:')) {
      replaceBlockType(block.id, key.slice(5));
      return;
    }
    if (key === 'indent-less') changeIndent(block.id, -1);
    if (key === 'indent-more') changeIndent(block.id, 1);
    if (key === 'move-up') moveBlock(block.id, -1);
    if (key === 'move-down') moveBlock(block.id, 1);
    if (key === 'delete') removeBlock(block.id);
  };

  const buildBlockMenu = (block, index) => ({
    items: [
      ...groupedBlockTypeItems(),
      { type: 'divider' },
      { key: 'indent-less', icon: <ArrowLeftOutlined />, label: '减少缩进', disabled: getBlockIndent(block) === 0 },
      { key: 'indent-more', icon: <ArrowRightOutlined />, label: '增加缩进', disabled: index === 0 || getBlockIndent(block) >= MAX_LIST_INDENT },
      { key: 'move-up', icon: <ArrowUpOutlined />, label: '上移', disabled: index === 0 },
      { key: 'move-down', icon: <ArrowDownOutlined />, label: '下移', disabled: index === blocks.length - 1 },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent?.stopPropagation();
      handleBlockMenuAction(block, key);
    },
  });

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
      onActivate: () => setActiveBlockId(block.id),
      onEnter: () => handleEnter(block),
      onBackspace: (event) => {
        if (blocks.length <= 1) return;
        event.preventDefault();
        removeBlock(block.id);
      },
      onIndent: delta => changeIndent(block.id, delta),
      onPaste: event => handleBlockPaste(event, block.id),
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
      return (
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
    const blankParagraph = block.type === 'paragraph' && isBlankBlock(block);
    const handleVisible = !readOnly && (active || hovered || menuOpen || blankParagraph);
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
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 4,
          minWidth: 0,
          position: 'relative',
          padding: ['fold-list', 'bullet', 'numbered'].includes(block.type) ? '1px 8px 1px 0' : '3px 8px 3px 0',
          marginBottom: ['fold-list', 'bullet', 'numbered'].includes(block.type) ? 0 : 2,
          borderRadius: 6,
          background: menuOpen ? '#f8e6e8' : (draggingBlockId === block.id ? '#f8fafc' : 'transparent'),
        }}
      >
        {!readOnly && (
          <div style={{ width: 24, minWidth: 24, display: 'flex', justifyContent: 'center', paddingTop: blankParagraph ? 0 : 2, zIndex: 2 }}>
            <Tooltip title={blankParagraph ? '添加内容' : '块菜单'} placement="left">
              <Dropdown
                trigger={['click']}
                open={menuOpen}
                menu={buildBlockMenu(block, index)}
                onOpenChange={(open) => setOpenMenuBlockId(open ? block.id : null)}
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
                  onMouseDown={event => event.stopPropagation()}
                  onClick={event => event.stopPropagation()}
                  style={{
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    opacity: handleVisible ? 1 : 0,
                    pointerEvents: handleVisible ? 'auto' : 'none',
                    color: '#6b7280',
                    background: menuOpen ? '#eef2ff' : 'transparent',
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

  return (
    <div style={{ minHeight, background: '#fff', padding: '2px 0 16px' }}>
      <div>{blocks.map(renderBlock)}</div>
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
