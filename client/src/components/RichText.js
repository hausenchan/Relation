import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ol', 'ul', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
];
const ALLOWED_ATTR = ['style', 'data-row', 'colspan', 'rowspan'];
const SAFE_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'border',
  'border-collapse',
  'border-color',
  'border-style',
  'border-width',
  'padding',
  'text-align',
  'vertical-align',
  'width',
  'min-width',
]);

const sanitizeOptions = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'img', 'video', 'audio', 'a'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'href', 'src', 'srcset'],
};

if (typeof window !== 'undefined' && DOMPurify.addHook) {
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      const safe = String(data.attrValue || '')
        .split(';')
        .map(s => s.trim())
        .filter((style) => {
          const match = /^([a-z-]+)\s*:\s*([^;]+)$/i.exec(style);
          if (!match) return false;
          const property = match[1].toLowerCase();
          const value = match[2].trim();
          return SAFE_STYLE_PROPERTIES.has(property) && !/(url\s*\(|expression\s*\(|javascript:)/i.test(value);
        })
        .join('; ');
      data.attrValue = safe;
      if (!safe) data.keepAttr = false;
    }
  });
}

export function sanitizeRichText(html) {
  if (html == null) return '';
  return DOMPurify.sanitize(String(html), sanitizeOptions);
}

const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;

export function normalizeRichText(value) {
  if (value == null || value === '') return '';
  const s = String(value);
  if (HTML_TAG_RE.test(s)) return s;
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
}

export function richTextToPlain(value) {
  if (!value) return '';
  if (typeof document === 'undefined') return String(value).replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = sanitizeRichText(value);
  div.querySelectorAll('td, th').forEach(cell => cell.insertAdjacentText('beforeend', ' '));
  div.querySelectorAll('tr, p, li').forEach(block => block.insertAdjacentText('beforeend', ' '));
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

const DEFAULT_TOOLBAR = [
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

const BASE_FORMATS = [
  'size', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'list',
];
const TABLE_FORMATS = ['table', 'table-row', 'table-body', 'table-container'];
const INLINE_COLORS = ['#1f2937', '#d4380d', '#1677ff', '#389e0d'];
const INLINE_BACKGROUNDS = ['#fff1b8', '#d6e4ff', '#d9f7be', '#ffd6e7'];

const RICH_TEXT_TABLE_CSS = `
  .rich-text-editor .ql-editor table,
  .rich-text-view table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
    margin: 8px 0;
  }
  .rich-text-editor .ql-editor td,
  .rich-text-editor .ql-editor th,
  .rich-text-view td,
  .rich-text-view th {
    border: 1px solid #d9d9d9;
    min-width: 96px;
    padding: 8px 10px;
    vertical-align: top;
  }
  .rich-text-editor .ql-editor td,
  .rich-text-view td {
    outline: none;
  }
`;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function closestTableCell(node) {
  if (!node) return null;
  const element = node.nodeType === 1 ? node : node.parentElement;
  return element?.closest?.('td, th') || null;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 140,
  readOnly = false,
  enableTables = false,
}) {
  const quillRef = useRef(null);
  const lastSelectionRef = useRef(null);
  const [tableContext, setTableContext] = useState({ active: false });
  const [floatingToolbar, setFloatingToolbar] = useState(null);

  const modules = useMemo(() => ({
    toolbar: DEFAULT_TOOLBAR,
    history: { delay: 800, maxStack: 100, userOnly: true },
    ...(enableTables ? { table: true } : {}),
  }), [enableTables]);

  const formats = useMemo(() => [
    ...BASE_FORMATS,
    ...(enableTables ? TABLE_FORMATS : []),
  ], [enableTables]);

  const getQuill = () => {
    try {
      return quillRef.current?.getEditor?.() || null;
    } catch {
      return null;
    }
  };

  const refreshTableSelection = () => {
    if (!enableTables || readOnly || typeof window === 'undefined') return;
    const quill = getQuill();
    const tableModule = quill?.getModule?.('table');
    if (!quill || !tableModule) return;

    const quillRange = quill.getSelection();
    if (quillRange) lastSelectionRef.current = quillRange;
    const [, , tableCell] = tableModule.getTable(quillRange || undefined);
    const active = Boolean(tableCell);
    setTableContext(prev => (prev.active === active ? prev : { active }));

    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || selection.isCollapsed || !quill.root.contains(selection.anchorNode) || !quill.root.contains(selection.focusNode)) {
      setFloatingToolbar(null);
      return;
    }

    const nativeRange = selection.getRangeAt(0);
    const cell = closestTableCell(nativeRange.commonAncestorContainer) || closestTableCell(selection.anchorNode);
    if (!cell || !quill.root.contains(cell) || !String(selection.toString()).trim()) {
      setFloatingToolbar(null);
      return;
    }

    const rects = Array.from(nativeRange.getClientRects?.() || []);
    const rect = rects.find(item => item.width || item.height) || nativeRange.getBoundingClientRect?.() || cell.getBoundingClientRect();
    if (!rect) {
      setFloatingToolbar(null);
      return;
    }

    const width = Math.min(308, Math.max(240, window.innerWidth - 24));
    const left = clamp(rect.left + (rect.width / 2) - (width / 2), 12, Math.max(12, window.innerWidth - width - 12));
    const top = rect.top > 52 ? rect.top - 46 : rect.bottom + 10;
    const format = quillRange ? quill.getFormat(quillRange) : {};
    setFloatingToolbar({ top, left, width, format });
  };

  useEffect(() => {
    if (!enableTables || readOnly || typeof window === 'undefined') return undefined;
    const quill = getQuill();
    let frame = null;

    const scheduleRefresh = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refreshTableSelection);
    };

    quill?.on?.('selection-change', scheduleRefresh);
    quill?.on?.('text-change', scheduleRefresh);
    document.addEventListener('selectionchange', scheduleRefresh);
    window.addEventListener('mouseup', scheduleRefresh, true);
    window.addEventListener('keyup', scheduleRefresh, true);
    window.addEventListener('scroll', scheduleRefresh, true);
    window.addEventListener('resize', scheduleRefresh);
    const timer = window.setTimeout(scheduleRefresh, 0);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      quill?.off?.('selection-change', scheduleRefresh);
      quill?.off?.('text-change', scheduleRefresh);
      document.removeEventListener('selectionchange', scheduleRefresh);
      window.removeEventListener('mouseup', scheduleRefresh, true);
      window.removeEventListener('keyup', scheduleRefresh, true);
      window.removeEventListener('scroll', scheduleRefresh, true);
      window.removeEventListener('resize', scheduleRefresh);
    };
  }, [enableTables, readOnly]);

  const insertTable = () => {
    const quill = getQuill();
    const tableModule = quill?.getModule?.('table');
    if (!quill || !tableModule) return;
    quill.focus();
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.setSelection(range.index, range.length, 'silent');
    tableModule.insertTable(3, 3);
    window.setTimeout(refreshTableSelection, 0);
  };

  const runTableAction = (action) => {
    const quill = getQuill();
    const tableModule = quill?.getModule?.('table');
    if (!quill || !tableModule?.[action]) return;
    const range = quill.getSelection() || lastSelectionRef.current;
    if (range) quill.setSelection(range.index, range.length, 'silent');
    quill.focus();
    tableModule[action]();
    window.setTimeout(refreshTableSelection, 0);
  };

  const applySelectionFormat = (name, value) => {
    const quill = getQuill();
    if (!quill) return;
    const range = quill.getSelection() || lastSelectionRef.current;
    if (!range) return;
    quill.focus();
    quill.setSelection(range.index, range.length, 'silent');

    if (name === 'clean') {
      quill.removeFormat(range.index, range.length, 'user');
    } else if (value === undefined) {
      const current = quill.getFormat(range)[name];
      quill.format(name, current ? false : true, 'user');
    } else {
      quill.format(name, value, 'user');
    }

    lastSelectionRef.current = range;
    window.setTimeout(refreshTableSelection, 0);
  };

  return (
    <div className="rich-text-editor" style={{ background: '#fff' }}>
      {enableTables && !readOnly && (
        <div className="rich-text-table-tools" onMouseDown={event => event.preventDefault()}>
          <button type="button" onClick={insertTable}>插入表格</button>
          {tableContext.active && (
            <>
              <span />
              <button type="button" onClick={() => runTableAction('insertRowAbove')}>上方行</button>
              <button type="button" onClick={() => runTableAction('insertRowBelow')}>下方行</button>
              <button type="button" onClick={() => runTableAction('insertColumnLeft')}>左侧列</button>
              <button type="button" onClick={() => runTableAction('insertColumnRight')}>右侧列</button>
              <button type="button" onClick={() => runTableAction('deleteRow')}>删行</button>
              <button type="button" onClick={() => runTableAction('deleteColumn')}>删列</button>
              <button type="button" onClick={() => runTableAction('deleteTable')}>删表</button>
            </>
          )}
        </div>
      )}
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ minHeight }}
      />
      {enableTables && floatingToolbar && !readOnly && (
        <div
          className="rich-text-floating-toolbar"
          data-rich-table-toolbar="true"
          style={{ top: floatingToolbar.top, left: floatingToolbar.left, width: floatingToolbar.width }}
          onMouseDown={event => event.preventDefault()}
        >
          {[
            ['bold', 'B', '加粗'],
            ['italic', 'I', '斜体'],
            ['underline', 'U', '下划线'],
            ['strike', 'S', '删除线'],
          ].map(([name, label, title]) => (
            <button
              key={name}
              type="button"
              title={title}
              className={floatingToolbar.format?.[name] ? 'active' : ''}
              onClick={() => applySelectionFormat(name)}
            >
              {label}
            </button>
          ))}
          <i />
          {INLINE_COLORS.map(color => (
            <button
              key={color}
              type="button"
              title="文字颜色"
              className="swatch"
              style={{ color, borderColor: floatingToolbar.format?.color === color ? '#1677ff' : '#d9d9d9' }}
              onClick={() => applySelectionFormat('color', color)}
            >
              A
            </button>
          ))}
          {INLINE_BACKGROUNDS.map(color => (
            <button
              key={color}
              type="button"
              title="背景色"
              className="swatch"
              style={{ backgroundColor: color, borderColor: floatingToolbar.format?.background === color ? '#1677ff' : '#d9d9d9' }}
              onClick={() => applySelectionFormat('background', color)}
            />
          ))}
          <i />
          <button type="button" title="清除格式" onClick={() => applySelectionFormat('clean')}>清除</button>
        </div>
      )}
      <style>{`
        .rich-text-editor .ql-container { min-height: ${minHeight}px; font-size: 14px; }
        .rich-text-editor .ql-editor { min-height: ${minHeight}px; }
        .rich-text-table-tools {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          padding: 8px;
          border: 1px solid #ccc;
          border-bottom: 0;
          background: #fafafa;
        }
        .rich-text-table-tools button {
          height: 26px;
          padding: 0 8px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          background: #fff;
          color: #1f2937;
          cursor: pointer;
          font-size: 12px;
          line-height: 24px;
        }
        .rich-text-table-tools button:hover {
          color: #1677ff;
          border-color: #1677ff;
        }
        .rich-text-table-tools span {
          width: 1px;
          height: 18px;
          background: #d9d9d9;
        }
        .rich-text-floating-toolbar {
          position: fixed;
          z-index: 2200;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px;
          border: 1px solid #d9d9d9;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.16);
        }
        .rich-text-floating-toolbar button {
          min-width: 26px;
          height: 26px;
          padding: 0 7px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: #1f2937;
          cursor: pointer;
          font-size: 12px;
          line-height: 24px;
        }
        .rich-text-floating-toolbar button:hover,
        .rich-text-floating-toolbar button.active {
          background: #f0f5ff;
          border-color: #adc6ff;
          color: #1677ff;
        }
        .rich-text-floating-toolbar button.swatch {
          width: 26px;
          padding: 0;
          border-color: #d9d9d9;
          font-weight: 600;
        }
        .rich-text-floating-toolbar i {
          width: 1px;
          height: 18px;
          background: #e5e7eb;
        }
        ${RICH_TEXT_TABLE_CSS}
      `}</style>
    </div>
  );
}

export function RichTextView({ value, style, className }) {
  const html = useMemo(() => sanitizeRichText(normalizeRichText(value)), [value]);
  if (!html) return <span style={{ color: '#bfbfbf' }}>-</span>;
  return (
    <>
      <div
        className={['rich-text-view', className].filter(Boolean).join(' ')}
        style={{ wordBreak: 'break-word', ...style }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{RICH_TEXT_TABLE_CSS}</style>
    </>
  );
}

export default RichTextEditor;
