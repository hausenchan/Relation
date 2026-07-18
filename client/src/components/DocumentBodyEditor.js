import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Dropdown, Input, Space, Tooltip } from 'antd';
import {
  BgColorsOutlined,
  BoldOutlined,
  ClearOutlined,
  DeleteOutlined,
  DownOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  MenuOutlined,
  MinusOutlined,
  PlusOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  createDocumentBodyBlock,
  documentBodyInlineHtmlToPlain,
  DOCUMENT_BODY_BLOCK_TYPES,
  normalizeDocumentBodyValue,
  parseDocumentBodyClipboard,
  sanitizeDocumentBodyInlineHtml,
} from '../utils/documentBodyBlocks';

const COLOR_OPTIONS = ['#1f2937', '#d4380d', '#1677ff', '#389e0d'];
const BACKGROUND_OPTIONS = ['#fff1b8', '#d6e4ff', '#d9f7be', '#ffd6e7'];

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

function getBulletMarker(indent) {
  return ['•', '◦', '◆'][Math.max(0, Number(indent) || 0) % 3];
}

function InlineBlockEditor({ value, placeholder, readOnly, style, onChange, onActivate, onEnter, onBackspace, onPaste }) {
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

  const emitChange = () => {
    const html = sanitizeDocumentBodyInlineHtml(editorRef.current?.innerHTML || '');
    localHtmlRef.current = html;
    onChange?.(html);
  };

  const activate = () => onActivate?.(editorRef.current);

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      {!documentBodyInlineHtmlToPlain(value).trim() && placeholder && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: '0 auto auto 0', color: '#9ca3af', pointerEvents: 'none', ...style }}>
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
          if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
            event.preventDefault();
            onEnter?.();
          } else if (event.key === 'Backspace' && !documentBodyInlineHtmlToPlain(editorRef.current?.innerHTML).trim()) {
            onBackspace?.(event);
          }
        }}
        style={{ minHeight: 24, outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}
      />
    </div>
  );
}

function blockTypeMenu(onSelect) {
  const groups = [...new Set(DOCUMENT_BODY_BLOCK_TYPES.map(item => item.group))];
  return {
    items: groups.map(group => ({
      type: 'group',
      label: group,
      children: DOCUMENT_BODY_BLOCK_TYPES
        .filter(item => item.group === group)
        .map(item => ({ key: item.value, label: item.label })),
    })),
    onClick: ({ key }) => onSelect(key),
  };
}

export default function DocumentBodyEditor({ value, onChange, placeholder = '输入内容', readOnly = false, minHeight = 120 }) {
  const normalized = useMemo(() => normalizeDocumentBodyValue(value), [value]);
  const blocks = normalized.blocks;
  const [activeBlockId, setActiveBlockId] = useState(null);
  const activeEditorRef = useRef(null);
  const savedRangeRef = useRef(null);

  const emitBlocks = (nextBlocks) => onChange?.({ ...normalized, blocks: nextBlocks });
  const patchBlock = (id, patch) => emitBlocks(blocks.map(block => (block.id === id ? { ...block, ...patch } : block)));
  const patchBlockMeta = (id, patch) => emitBlocks(blocks.map(block => (
    block.id === id ? { ...block, meta: { ...(block.meta || {}), ...patch } } : block
  )));

  const insertPastedBlocks = (targetBlockId, pastedBlocks) => {
    if (!pastedBlocks.length) return;
    const targetIndex = blocks.findIndex(block => block.id === targetBlockId);
    const insertIndex = targetIndex >= 0 ? targetIndex : blocks.length - 1;
    const targetBlock = blocks[insertIndex];
    const targetIsEmpty = targetBlock
      && targetBlock.type !== 'divider'
      && targetBlock.type !== 'table-simple'
      && !documentBodyInlineHtmlToPlain(targetBlock.content).trim()
      && !documentBodyInlineHtmlToPlain(targetBlock.meta?.body).trim();
    const replacesTemplatePrompt = Boolean(
      targetBlock?.meta?.template_question_key
      && documentBodyInlineHtmlToPlain(pastedBlocks[0]?.content).trim()
        === documentBodyInlineHtmlToPlain(targetBlock.content).trim(),
    );
    const nextBlocks = [...blocks];
    if (targetIsEmpty || replacesTemplatePrompt) nextBlocks.splice(insertIndex, 1, ...pastedBlocks);
    else nextBlocks.splice(insertIndex + 1, 0, ...pastedBlocks);
    emitBlocks(nextBlocks);
    setActiveBlockId(pastedBlocks[0]?.id || null);
  };

  const handleBlockPaste = (event, blockId) => {
    if (readOnly || !event.clipboardData) return;
    const html = event.clipboardData.getData('text/html') || '';
    const text = event.clipboardData.getData('text/plain') || '';
    const parsed = parseDocumentBodyClipboard(html, text);
    const hasStructuralHtml = /<(?:p|div|h[1-6]|ol|ul|li|table|tr|br)\b/i.test(html);
    const hasStructuredBlocks = parsed.blocks.length > 1
      || parsed.blocks.some(item => item.type !== 'paragraph' || Number(item.meta?.indent || 0) > 0);
    if (!parsed.blocks.length || (!hasStructuralHtml && !hasStructuredBlocks)) return;
    event.preventDefault();
    event.stopPropagation();
    insertPastedBlocks(blockId, parsed.blocks);
  };

  const rememberSelection = (blockId, editor) => {
    setActiveBlockId(blockId);
    activeEditorRef.current = editor;
    const selection = window.getSelection?.();
    if (selection?.rangeCount && editor?.contains(selection.anchorNode)) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || !savedRangeRef.current) return false;
    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
    activeEditorRef.current?.focus?.();
    return true;
  };

  const formatSelection = (command, commandValue) => {
    if (!restoreSelection()) return;
    document.execCommand(command, false, commandValue);
    activeEditorRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const insertBlock = (type = 'paragraph', afterId = blocks[blocks.length - 1]?.id, extra = {}) => {
    const nextBlock = createDocumentBodyBlock(type, '', extra);
    const index = blocks.findIndex(block => block.id === afterId);
    const nextBlocks = [...blocks];
    nextBlocks.splice(index >= 0 ? index + 1 : nextBlocks.length, 0, nextBlock);
    emitBlocks(nextBlocks);
    setActiveBlockId(nextBlock.id);
  };

  const removeBlock = (id) => {
    if (blocks.length === 1) {
      patchBlock(id, { type: 'paragraph', content: '', checked: false, meta: {} });
      return;
    }
    emitBlocks(blocks.filter(block => block.id !== id));
  };

  const moveBlock = (id, delta) => {
    const from = blocks.findIndex(block => block.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    emitBlocks(next);
  };

  const renderBlockEditor = (block, index) => {
    const headingLevel = Number(block.type.replace('heading', '')) || 0;
    const indent = Math.max(0, Math.min(6, Number(block.meta?.indent || 0)));
    const commonProps = {
      value: block.content,
      placeholder: index === 0 ? placeholder : '输入内容',
      readOnly,
      onChange: content => patchBlock(block.id, { content }),
      onActivate: editor => rememberSelection(block.id, editor),
      onEnter: () => insertBlock(
        ['bullet', 'numbered', 'todo'].includes(block.type) ? block.type : 'paragraph',
        block.id,
        ['bullet', 'numbered', 'todo'].includes(block.type) ? { meta: { indent } } : {},
      ),
      onBackspace: event => {
        if (blocks.length <= 1) return;
        event.preventDefault();
        removeBlock(block.id);
      },
      onPaste: event => handleBlockPaste(event, block.id),
      style: {
        fontSize: headingLevel ? [0, 28, 23, 19, 16][headingLevel] : 15,
        fontWeight: headingLevel ? 700 : 400,
        lineHeight: headingLevel ? 1.4 : 1.75,
        color: block.type === 'quote' ? '#475569' : '#1f2937',
        fontStyle: block.type === 'quote' ? 'italic' : 'normal',
      },
    };

    if (block.type === 'divider') return <div style={{ borderTop: '1px solid #d1d5db', margin: '14px 0' }} />;
    if (block.type === 'table-simple') {
      const rows = Array.isArray(block.meta?.rows) && block.meta.rows.length ? block.meta.rows : [['', ''], ['', '']];
      const columnCount = Math.max(1, ...rows.map(row => (Array.isArray(row) ? row.length : 0)));
      const updateCell = (rowIndex, columnIndex, cellValue) => {
        const nextRows = rows.map(row => Array.from({ length: columnCount }, (_, index) => row?.[index] || ''));
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
                    <td key={`${block.id}-cell-${rowIndex}-${columnIndex}`} style={{ border: '1px solid #d1d5db', padding: 0 }}>
                      <Input
                        bordered={false}
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
          {!readOnly && (
            <Space size={4} style={{ marginTop: 6 }}>
              <Button size="small" onClick={() => patchBlockMeta(block.id, { rows: [...rows, Array(columnCount).fill('')] })}>添加行</Button>
              <Button size="small" onClick={() => patchBlockMeta(block.id, { rows: rows.map(row => [...row, '']) })}>添加列</Button>
              <Button size="small" disabled={rows.length <= 1} onClick={() => patchBlockMeta(block.id, { rows: rows.slice(0, -1) })}>删除末行</Button>
              <Button size="small" disabled={columnCount <= 1} onClick={() => patchBlockMeta(block.id, { rows: rows.map(row => row.slice(0, -1)) })}>删除末列</Button>
            </Space>
          )}
        </div>
      );
    }
    if (block.type === 'fold-list') {
      const collapsed = Boolean(block.meta?.collapsed);
      return (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Button
              type="text"
              size="small"
              icon={collapsed ? <MenuOutlined /> : <DownOutlined />}
              aria-label={collapsed ? '展开折叠列表' : '收起折叠列表'}
              onClick={() => patchBlockMeta(block.id, { collapsed: !collapsed })}
              style={{ width: 24, minWidth: 24, marginTop: 2 }}
            />
            <InlineBlockEditor {...commonProps} placeholder="折叠列表标题" />
          </div>
          {!collapsed && (
            <div style={{ margin: '6px 0 4px 32px', paddingLeft: 12, borderLeft: '2px solid #e5e7eb' }}>
              <InlineBlockEditor
                value={block.meta?.body || ''}
                placeholder="折叠内容"
                readOnly={readOnly}
                onChange={body => patchBlockMeta(block.id, { body })}
                onActivate={editor => rememberSelection(block.id, editor)}
                style={{ fontSize: 15, lineHeight: 1.75, color: '#374151', minHeight: 48 }}
              />
            </div>
          )}
        </div>
      );
    }
    if (block.type === 'todo') {
      return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingLeft: indent * 24 }}>
          <Checkbox checked={block.checked} disabled={readOnly} onChange={event => patchBlock(block.id, { checked: event.target.checked })} style={{ marginTop: 6 }} />
          <InlineBlockEditor {...commonProps} placeholder="待办事项" />
        </div>
      );
    }
    if (block.type === 'bullet' || block.type === 'numbered') {
      let number = 0;
      for (let cursor = index; cursor >= 0; cursor -= 1) {
        const candidate = blocks[cursor];
        const candidateIndent = Math.max(0, Math.min(6, Number(candidate.meta?.indent || 0)));
        if (cursor < index && candidateIndent < indent) break;
        if (candidate.type === 'numbered' && candidateIndent === indent) number += 1;
      }
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingLeft: indent * 24 }}>
          <span style={{ width: 22, minWidth: 22, paddingTop: 4, textAlign: 'right', color: '#374151' }}>
            {block.type === 'numbered' ? formatNumberedMarker(number, indent) : getBulletMarker(indent)}
          </span>
          <InlineBlockEditor {...commonProps} placeholder={block.type === 'numbered' ? '数字列表项' : '列表项'} />
        </div>
      );
    }
    if (block.type === 'quote') {
      return <div style={{ borderLeft: '3px solid #94a3b8', paddingLeft: 12 }}><InlineBlockEditor {...commonProps} placeholder="引述文字" /></div>;
    }
    return (
      <div style={{ paddingLeft: indent * 24 }}>
        <InlineBlockEditor {...commonProps} />
      </div>
    );
  };

  return (
    <div style={{ border: '1px solid #d1d5db', background: '#fff', minHeight }}>
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, padding: '6px 8px', borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
          {[
            ['bold', <BoldOutlined />, '加粗'],
            ['italic', <ItalicOutlined />, '斜体'],
            ['underline', <UnderlineOutlined />, '下划线'],
            ['strikeThrough', <StrikethroughOutlined />, '删除线'],
          ].map(([command, icon, title]) => (
            <Tooltip title={title} key={command}>
              <Button type="text" size="small" icon={icon} disabled={!activeBlockId} onMouseDown={event => event.preventDefault()} onClick={() => formatSelection(command)} />
            </Tooltip>
          ))}
          <Dropdown menu={{ items: COLOR_OPTIONS.map(color => ({ key: color, label: <span style={{ color, fontWeight: 700 }}>A {color}</span> })), onClick: ({ key }) => formatSelection('foreColor', key) }} trigger={['click']}>
            <Tooltip title="文字颜色"><Button type="text" size="small" icon={<FontColorsOutlined />} disabled={!activeBlockId} /></Tooltip>
          </Dropdown>
          <Dropdown menu={{ items: BACKGROUND_OPTIONS.map(color => ({ key: color, label: <span style={{ display: 'inline-block', width: 76, background: color }}>背景色</span> })), onClick: ({ key }) => formatSelection('backColor', key) }} trigger={['click']}>
            <Tooltip title="背景颜色"><Button type="text" size="small" icon={<BgColorsOutlined />} disabled={!activeBlockId} /></Tooltip>
          </Dropdown>
          <Tooltip title="清除格式"><Button type="text" size="small" icon={<ClearOutlined />} disabled={!activeBlockId} onClick={() => formatSelection('removeFormat')} /></Tooltip>
          <span style={{ width: 1, height: 20, background: '#d1d5db', margin: '0 4px' }} />
          <Dropdown menu={blockTypeMenu(type => insertBlock(type))} trigger={['click']}>
            <Button type="text" size="small" icon={<PlusOutlined />}>添加内容</Button>
          </Dropdown>
        </div>
      )}
      <div style={{ padding: '10px 12px 14px' }}>
        {blocks.map((block, index) => (
          <div key={block.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 0', minHeight: 34 }}>
            {!readOnly && (
              <Space.Compact size="small" style={{ width: 28, minWidth: 28, flexDirection: 'column' }}>
                <Dropdown menu={blockTypeMenu(type => patchBlock(block.id, {
                  type,
                  checked: false,
                  meta: type === 'fold-list' ? { body: '' } : (type === 'table-simple' ? { rows: [['', ''], ['', '']] } : {}),
                }))} trigger={['click']}>
                  <Tooltip title="更改样式"><Button type="text" size="small" icon={<MenuOutlined />} /></Tooltip>
                </Dropdown>
              </Space.Compact>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>{renderBlockEditor(block, index)}</div>
            {!readOnly && activeBlockId === block.id && (
              <Space.Compact size="small">
                {['bullet', 'numbered', 'todo'].includes(block.type) && (
                  <>
                    <Tooltip title="减少缩进"><Button type="text" icon={<MinusOutlined />} onClick={() => patchBlockMeta(block.id, { indent: Math.max(0, Number(block.meta?.indent || 0) - 1) })} /></Tooltip>
                    <Tooltip title="增加缩进"><Button type="text" icon={<PlusOutlined />} onClick={() => patchBlockMeta(block.id, { indent: Math.min(6, Number(block.meta?.indent || 0) + 1) })} /></Tooltip>
                  </>
                )}
                <Tooltip title="上移"><Button type="text" icon={<UpOutlined />} disabled={index === 0} onClick={() => moveBlock(block.id, -1)} /></Tooltip>
                <Tooltip title="下移"><Button type="text" icon={<DownOutlined />} disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} /></Tooltip>
                <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeBlock(block.id)} /></Tooltip>
              </Space.Compact>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
