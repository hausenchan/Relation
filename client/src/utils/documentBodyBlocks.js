import DOMPurify from 'dompurify';

export const DOCUMENT_BODY_FORMAT = 'relation_document_blocks_v1';
export const DOCUMENT_BODY_CLIPBOARD_MIME = 'application/x-relation-document-blocks';

export const DOCUMENT_BODY_BLOCK_TYPES = [
  { value: 'paragraph', label: '文本', group: '基础' },
  { value: 'heading1', label: '主标题', group: '标题' },
  { value: 'heading2', label: '大标题', group: '标题' },
  { value: 'heading3', label: '中标题', group: '标题' },
  { value: 'heading4', label: '小标题', group: '标题' },
  { value: 'bullet', label: '列表', group: '列表' },
  { value: 'numbered', label: '数字列表', group: '列表' },
  { value: 'fold-list', label: '折叠列表', group: '列表' },
  { value: 'todo', label: '待办列表', group: '列表' },
  { value: 'quote', label: '引述文字', group: '样式' },
  { value: 'table-simple', label: '简单表格', group: '样式' },
  { value: 'divider', label: '分割线', group: '样式' },
];

const VALID_BLOCK_TYPES = new Set(DOCUMENT_BODY_BLOCK_TYPES.map(item => item.value));
const INLINE_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'span', 'mark', 'a', 'br'];
const INLINE_ATTRS = ['style', 'href', 'target', 'rel'];
const SAFE_INLINE_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-decoration',
  'white-space',
]);
const CLIPBOARD_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,table,div';

function sanitizeInlineStyle(value = '') {
  return String(value || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const match = /^([a-z-]+)\s*:\s*([^;]+)$/i.exec(item);
      if (!match) return false;
      return SAFE_INLINE_STYLE_PROPERTIES.has(match[1].toLowerCase())
        && !/(url\s*\(|expression\s*\(|javascript:)/i.test(match[2]);
    })
    .join('; ');
}

function normalizeLegacyInlineMarkup(value = '') {
  const raw = String(value || '');
  if (!raw || typeof document === 'undefined') return raw;
  const container = document.createElement('div');
  container.innerHTML = raw;
  container.querySelectorAll('font').forEach((font) => {
    const wrapper = document.createElement('span');
    const color = font.getAttribute('color') || font.style?.color || '';
    const size = font.style?.fontSize || '';
    const family = font.getAttribute('face') || font.style?.fontFamily || '';
    const style = sanitizeInlineStyle([
      color ? `color: ${color}` : '',
      size ? `font-size: ${size}` : '',
      family ? `font-family: ${family}` : '',
    ].filter(Boolean).join('; '));
    if (style) wrapper.setAttribute('style', style);
    while (font.firstChild) wrapper.appendChild(font.firstChild);
    font.replaceWith(wrapper);
  });
  container.querySelectorAll('[style]').forEach((element) => {
    const style = sanitizeInlineStyle(element.getAttribute('style'));
    if (style) element.setAttribute('style', style);
    else element.removeAttribute('style');
  });
  return container.innerHTML;
}

export function sanitizeDocumentBodyInlineHtml(value = '') {
  return DOMPurify.sanitize(normalizeLegacyInlineMarkup(value), {
    ALLOWED_TAGS: INLINE_TAGS,
    ALLOWED_ATTR: INLINE_ATTRS,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'img', 'video', 'audio'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'src', 'srcset'],
  });
}

export function documentBodyInlineHtmlToPlain(value = '') {
  if (!value) return '';
  if (typeof document === 'undefined') return String(value).replace(/<[^>]+>/g, '');
  const container = document.createElement('div');
  container.innerHTML = sanitizeDocumentBodyInlineHtml(value);
  return (container.textContent || '').replace(/\u00a0/g, ' ');
}

export function createDocumentBodyBlock(type = 'paragraph', content = '', extra = {}) {
  const normalizedType = VALID_BLOCK_TYPES.has(type) ? type : 'paragraph';
  return {
    id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: normalizedType,
    content: normalizedType === 'divider' ? '' : String(content || ''),
    checked: false,
    meta: normalizedType === 'table-simple'
      ? { rows: [['', ''], ['', '']] }
      : {},
    ...extra,
  };
}

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') return createDocumentBodyBlock();
  const type = VALID_BLOCK_TYPES.has(block.type) ? block.type : 'paragraph';
  return {
    id: block.id || createDocumentBodyBlock().id,
    type,
    content: type === 'divider' ? '' : String(block.content ?? block.text ?? ''),
    checked: Boolean(block.checked),
    meta: block.meta && typeof block.meta === 'object' ? { ...block.meta } : {},
  };
}

function getClipboardListIndent(element) {
  let listIndent = 0;
  let wolaiIndent = 0;
  let parent = element?.parentElement;
  while (parent) {
    if (String(parent.tagName || '').toLowerCase() === 'li') listIndent += 1;
    if (String(parent.getAttribute?.('data-type') || '').toLowerCase() === 'subnode') wolaiIndent += 1;
    parent = parent.parentElement;
  }
  const explicitIndent = Number(
    element?.getAttribute?.('data-indent')
    || element?.getAttribute?.('data-list-level')
    || element?.getAttribute?.('data-level')
    || element?.getAttribute?.('data-depth')
    || element?.getAttribute?.('aria-level'),
  );
  const typeValue = String(element?.closest?.('ol')?.getAttribute?.('type') || '').toLowerCase();
  const orderedTypeIndent = typeValue === 'a' ? 1 : (typeValue === 'i' ? 2 : 0);
  let visualIndent = 0;
  let cursor = element;
  while (cursor) {
    const hint = [
      cursor.getAttribute?.('data-list-level'),
      cursor.getAttribute?.('data-level'),
      cursor.getAttribute?.('data-depth'),
      cursor.getAttribute?.('aria-level'),
      cursor.getAttribute?.('class'),
    ].map(value => String(value || '')).join(' ');
    const levelMatch = hint.match(/(?:indent|level|depth)[-_\s:]*(\d+)/i);
    if (levelMatch) visualIndent = Math.max(visualIndent, Math.max(0, Number(levelMatch[1]) - 1));
    const style = String(cursor.getAttribute?.('style') || '');
    const pixels = [...style.matchAll(/(?:margin-left|padding-left|text-indent)\s*:\s*([0-9.]+)px/ig)]
      .map(match => Number(match[1]))
      .filter(Number.isFinite);
    if (pixels.length) visualIndent = Math.max(visualIndent, Math.round(Math.max(...pixels) / 28));
    cursor = cursor.parentElement;
  }
  return Math.max(0, Math.min(6, Math.max(
    listIndent,
    wolaiIndent,
    orderedTypeIndent,
    visualIndent,
    Number.isFinite(explicitIndent) ? explicitIndent : 0,
  )));
}

function normalizeClipboardInlineHtml(value = '') {
  const sanitized = sanitizeDocumentBodyInlineHtml(value);
  if (!sanitized || typeof document === 'undefined') {
    return sanitized.replace(/[\t\r\n ]+/g, ' ').trim();
  }
  const container = document.createElement('div');
  container.innerHTML = sanitized;
  const normalizeNode = (node) => {
    Array.from(node.childNodes || []).forEach((child) => {
      if (child.nodeType === 3) {
        child.nodeValue = String(child.nodeValue || '').replace(/[\t\r\n ]+/g, ' ');
        return;
      }
      normalizeNode(child);
    });
  };
  normalizeNode(container);
  const first = container.firstChild;
  const last = container.lastChild;
  if (first?.nodeType === 3) first.nodeValue = String(first.nodeValue || '').replace(/^\s+/, '');
  if (last?.nodeType === 3) last.nodeValue = String(last.nodeValue || '').replace(/\s+$/, '');
  return container.innerHTML.trim();
}

function getClipboardBlockContent(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('ol,ul,table,[data-type="subnode"],[data-role="subnode"]').forEach(node => node.remove());
  const ownStyle = sanitizeInlineStyle(element.getAttribute?.('style') || '');
  const content = normalizeClipboardInlineHtml(clone.innerHTML || clone.textContent || '');
  return ownStyle && content ? `<span style="${ownStyle}">${content}</span>` : content;
}

function inferClipboardBlockType(element) {
  const tag = String(element?.tagName || '').toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `heading${Math.min(4, Number(tag.slice(1)) || 1)}`;
  if (tag === 'li') return String(element.parentElement?.tagName || '').toLowerCase() === 'ol' ? 'numbered' : 'bullet';
  const typeHint = [
    element?.getAttribute?.('data-block-type'),
    element?.getAttribute?.('data-list'),
    element?.getAttribute?.('placeholder'),
    element?.getAttribute?.('class'),
    element?.parentElement?.getAttribute?.('data-block-type'),
    element?.parentElement?.getAttribute?.('class'),
  ].map(item => String(item || '').toLowerCase()).join(' ');
  if (/enum|number|ordered|数字/.test(typeHint)) return 'numbered';
  if (/bull[_-]?list|bullet|unordered|无序|项目符号/.test(typeHint)) return 'bullet';
  const style = String(element?.getAttribute?.('style') || '');
  const fontSizeMatch = style.match(/font-size\s*:\s*([0-9.]+)\s*(px|pt)/i);
  const fontSize = Number(fontSizeMatch?.[1]) * (fontSizeMatch?.[2]?.toLowerCase() === 'pt' ? 1.333 : 1);
  const bold = /font-weight\s*:\s*(bold|[6-9]00)/i.test(style) || /<(strong|b)\b/i.test(element?.innerHTML || '');
  if (bold && Number.isFinite(fontSize)) {
    if (fontSize >= 26) return 'heading1';
    if (fontSize >= 21) return 'heading2';
    if (fontSize >= 17) return 'heading3';
  }
  return 'paragraph';
}

function inferTextListType(value = '') {
  const text = String(value || '').trim();
  if (/^(?:\d+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)、]\s+/.test(text)) return 'numbered';
  if (/^[-*•◦▪]\s+/.test(text)) return 'bullet';
  return '';
}

function inferOrderedMarkerIndent(value = '') {
  const marker = String(value || '').trim().match(/^(\d+|[a-zA-Z]+)[.)、]\s+/)?.[1] || '';
  if (!marker) return 0;
  if (/^\d+$/.test(marker)) return 0;
  if (/^[ivxlcdm]+$/i.test(marker) && (marker.length > 1 || /^[ivx]$/i.test(marker))) return 2;
  return 1;
}

function stripLeadingTextListMarker(content = '', type = '') {
  if (!type || typeof document === 'undefined') return content;
  const container = document.createElement('div');
  container.innerHTML = content;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (String(node.nodeValue || '').trim()) {
      node.nodeValue = String(node.nodeValue || '').replace(
        type === 'numbered'
          ? /^\s*(?:\d+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)、]\s+/
          : /^\s*[-*•◦▪]\s+/,
        '',
      );
      break;
    }
    node = walker.nextNode();
  }
  return sanitizeDocumentBodyInlineHtml(container.innerHTML);
}

function parseClipboardTable(table) {
  const rows = Array.from(table.querySelectorAll('tr')).map(row => (
    Array.from(row.querySelectorAll('th,td')).map(cell => sanitizeDocumentBodyInlineHtml(cell.innerHTML || cell.textContent || ''))
  )).filter(row => row.length);
  return rows.length ? createDocumentBodyBlock('table-simple', '', { meta: { rows } }) : null;
}

function parseClipboardHtml(html = '') {
  if (!html || typeof document === 'undefined') return [];
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: [
      'html', 'body', 'section', 'article', 'div', 'p', 'br',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'font', ...INLINE_TAGS,
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'type', 'start', 'colspan', 'rowspan', 'color', 'face', 'size', 'placeholder',
      'data-type', 'data-role', 'data-block-type', 'data-list', 'data-indent', 'data-list-level', 'data-level',
      'data-depth', 'aria-level',
      ...INLINE_ATTRS,
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'src', 'srcset'],
  });
  const blocks = [];
  Array.from(container.querySelectorAll(CLIPBOARD_BLOCK_SELECTOR)).forEach((element) => {
    const tag = String(element.tagName || '').toLowerCase();
    if (tag !== 'table' && element.closest('table')) return;
    if (tag !== 'li' && element.closest('li')) return;
    if (tag === 'div' && element.querySelector(CLIPBOARD_BLOCK_SELECTOR)) return;
    if (tag === 'table') {
      const table = parseClipboardTable(element);
      if (table) blocks.push(table);
      return;
    }
    let content = getClipboardBlockContent(element);
    if (!documentBodyInlineHtmlToPlain(content).trim()) return;
    let type = inferClipboardBlockType(element);
    if (type === 'paragraph') {
      const textListType = inferTextListType(documentBodyInlineHtmlToPlain(content));
      if (textListType) {
        type = textListType;
        content = stripLeadingTextListMarker(content, type);
      }
    }
    blocks.push(createDocumentBodyBlock(type, content, {
      meta: ['bullet', 'numbered'].includes(type) ? {
        indent: Math.max(
          getClipboardListIndent(element),
          type === 'numbered' ? inferOrderedMarkerIndent(documentBodyInlineHtmlToPlain(content)) : 0,
        ),
      } : {},
    }));
  });
  return blocks;
}

function parseClipboardPlainText(text = '') {
  const blocks = [];
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
    if (!line.trim()) return;
    const leading = line.match(/^\s*/)?.[0] || '';
    const whitespaceIndent = Math.max(0, Math.min(6, leading.replace(/\t/g, '  ').length >= 2
      ? Math.floor(leading.replace(/\t/g, '  ').length / 2)
      : 0));
    const trimmed = line.trim();
    const numbered = trimmed.match(/^(\d+|[a-zA-Z]+)[.)、]\s+(.+)$/);
    const bullet = trimmed.match(/^[-*•◦▪]\s+(.+)$/);
    if (numbered) {
      const indent = Math.max(whitespaceIndent, inferOrderedMarkerIndent(trimmed));
      blocks.push(createDocumentBodyBlock('numbered', sanitizeDocumentBodyInlineHtml(numbered[2]), { meta: { indent } }));
    } else if (bullet) {
      blocks.push(createDocumentBodyBlock('bullet', sanitizeDocumentBodyInlineHtml(bullet[1]), { meta: { indent: whitespaceIndent } }));
    } else {
      blocks.push(createDocumentBodyBlock('paragraph', sanitizeDocumentBodyInlineHtml(trimmed), {
        meta: whitespaceIndent ? { indent: whitespaceIndent, hierarchy: 'list' } : {},
      }));
    }
  });
  return blocks;
}

function normalizeClipboardComparisonText(value = '') {
  return documentBodyInlineHtmlToPlain(value).replace(/\s+/g, '').trim();
}

function mergeClipboardBlockHierarchy(htmlBlocks, textBlocks) {
  if (!htmlBlocks.length) return textBlocks;
  if (!textBlocks.length || htmlBlocks.length !== textBlocks.length) return htmlBlocks;
  const aligned = htmlBlocks.every((block, index) => {
    const htmlText = normalizeClipboardComparisonText(block.content);
    const textText = normalizeClipboardComparisonText(textBlocks[index]?.content);
    return htmlText === textText || htmlText.includes(textText) || textText.includes(htmlText);
  });
  if (!aligned) return htmlBlocks;
  return htmlBlocks.map((block, index) => {
    const textBlock = textBlocks[index];
    const htmlIndent = Number(block.meta?.indent || 0);
    const textIndent = Number(textBlock.meta?.indent || 0);
    const type = block.type === 'paragraph' && ['numbered', 'bullet'].includes(textBlock.type)
      ? textBlock.type
      : block.type;
    return {
      ...block,
      type,
      meta: ['numbered', 'bullet'].includes(type) || Math.max(htmlIndent, textIndent) > 0
        ? { ...(block.meta || {}), indent: Math.max(htmlIndent, textIndent), hierarchy: 'list' }
        : { ...(block.meta || {}) },
    };
  });
}

export function parseDocumentBodyClipboard(html = '', text = '') {
  const htmlBlocks = parseClipboardHtml(html);
  const textBlocks = parseClipboardPlainText(text);
  const blocks = mergeClipboardBlockHierarchy(htmlBlocks, textBlocks);
  return {
    format: DOCUMENT_BODY_FORMAT,
    blocks,
  };
}

function escapeClipboardHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cloneClipboardMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return { ...meta };
  }
}

function documentBodyBlockToClipboardText(block) {
  if (!block) return '';
  if (block.type === 'divider') return '---';
  if (block.type === 'table-simple') {
    return (block.meta?.rows || [])
      .map(row => (Array.isArray(row) ? row.map(cell => documentBodyInlineHtmlToPlain(cell)).join('\t') : ''))
      .filter(Boolean)
      .join('\n');
  }
  const indent = Math.max(0, Number(block.meta?.indent || 0));
  const text = documentBodyInlineHtmlToPlain(block.content || '');
  const prefix = block.type === 'numbered'
    ? '1. '
    : (['bullet', 'fold-list'].includes(block.type)
      ? '- '
      : (block.type === 'todo' ? `[${block.checked ? 'x' : ' '}] ` : ''));
  const body = block.type === 'fold-list' ? documentBodyInlineHtmlToPlain(block.meta?.body || '') : '';
  return `${'  '.repeat(indent)}${prefix}${text}${body ? `\n${'  '.repeat(indent + 1)}${body}` : ''}`;
}

function documentBodyBlockToClipboardHtml(block) {
  if (!block) return '';
  if (block.type === 'divider') return '<hr>';
  if (block.type === 'table-simple') {
    const rows = (block.meta?.rows || []).map(row => (
      `<tr>${(Array.isArray(row) ? row : []).map(cell => `<td>${sanitizeDocumentBodyInlineHtml(cell)}</td>`).join('')}</tr>`
    )).join('');
    return rows ? `<table data-document-table-block="true"><tbody>${rows}</tbody></table>` : '';
  }
  const indent = Math.max(0, Number(block.meta?.indent || 0));
  const content = sanitizeDocumentBodyInlineHtml(block.content || '');
  const headingLevel = String(block.type || '').match(/^heading([1-4])$/)?.[1];
  const tag = headingLevel ? `h${headingLevel}` : (block.type === 'quote' ? 'blockquote' : 'div');
  const attributes = [
    `data-block-type="${escapeClipboardHtml(block.type || 'paragraph')}"`,
    `data-indent="${indent}"`,
    `aria-level="${indent + 1}"`,
  ];
  if (block.type === 'todo') attributes.push(`data-checked="${block.checked ? 'true' : 'false'}"`);
  return `<${tag} ${attributes.join(' ')}>${content}</${tag}>`;
}

export function buildDocumentBodyClipboardPayload(blocks = []) {
  const source = (Array.isArray(blocks) ? blocks : []).filter(Boolean);
  return {
    text: source.map(documentBodyBlockToClipboardText).filter(Boolean).join('\n'),
    html: source.map(documentBodyBlockToClipboardHtml).filter(Boolean).join(''),
    blocks: source.map(block => ({
      type: block.type || 'paragraph',
      content: block.type === 'divider' ? '' : String(block.content || ''),
      checked: Boolean(block.checked),
      meta: cloneClipboardMeta(block.meta),
    })),
  };
}

export function parseDocumentBodyClipboardData(clipboardData) {
  const raw = clipboardData?.getData?.(DOCUMENT_BODY_CLIPBOARD_MIME) || '';
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.blocks)) {
        return parsed.blocks.map(block => createDocumentBodyBlock(block?.type || 'paragraph', block?.content || '', {
          checked: Boolean(block?.checked),
          meta: cloneClipboardMeta(block?.meta),
        }));
      }
    } catch {
      // Fall through to the standard HTML/plain-text parser.
    }
  }
  const html = clipboardData?.getData?.('text/html') || '';
  const text = clipboardData?.getData?.('text/plain') || '';
  return parseDocumentBodyClipboard(html, text).blocks;
}

export function getDocumentBodySelectionBlockIds(root, selection = globalThis.window?.getSelection?.()) {
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
  return Array.from(root.querySelectorAll('[data-document-body-block-id]'))
    .filter(node => ranges.some((range) => {
      try {
        return range.intersectsNode(node);
      } catch {
        return false;
      }
    }))
    .map(node => node.getAttribute('data-document-body-block-id'))
    .filter(Boolean);
}

export function rebaseDocumentBodyClipboardBlocks(blocks = [], targetIndent = 0) {
  const source = Array.isArray(blocks) ? blocks : [];
  const hierarchyBlocks = source.filter(block => (
    ['numbered', 'bullet', 'fold-list'].includes(block?.type)
    || Number(block?.meta?.indent || 0) > 0
  ));
  if (!hierarchyBlocks.length) return source;
  const minimumIndent = Math.min(...hierarchyBlocks.map(block => Math.max(0, Number(block.meta?.indent || 0))));
  const delta = Math.max(0, Number(targetIndent || 0) - minimumIndent);
  if (!delta) return source;
  return source.map((block) => {
    const indent = Number(block?.meta?.indent || 0);
    if (!['numbered', 'bullet', 'fold-list'].includes(block?.type) && indent <= 0) return block;
    return {
      ...block,
      meta: {
        ...(block.meta || {}),
        indent: Math.min(9, Math.max(0, indent) + delta),
        hierarchy: 'list',
      },
    };
  });
}

export function documentBodyHasContent(value) {
  return normalizeDocumentBodyValue(value).blocks.some((block) => {
    if (block.type === 'divider') return true;
    if (block.type === 'table-simple') {
      return (block.meta?.rows || []).some(row => (
        Array.isArray(row) && row.some(cell => documentBodyInlineHtmlToPlain(cell).trim())
      ));
    }
    return Boolean(documentBodyInlineHtmlToPlain(block.content).trim())
      || Boolean(documentBodyInlineHtmlToPlain(block.meta?.body).trim());
  });
}

export function normalizeDocumentBodyValue(value) {
  if (value && typeof value === 'object' && Array.isArray(value.blocks)) {
    const blocks = value.blocks.map(normalizeBlock);
    return {
      format: DOCUMENT_BODY_FORMAT,
      blocks: blocks.length ? blocks : [createDocumentBodyBlock()],
    };
  }
  if (Array.isArray(value)) {
    const blocks = value.map(normalizeBlock);
    return {
      format: DOCUMENT_BODY_FORMAT,
      blocks: blocks.length ? blocks : [createDocumentBodyBlock()],
    };
  }
  if (typeof value === 'string' && value && typeof document !== 'undefined' && /<(p|h[1-6]|li|table|ol|ul|blockquote|div)\b/i.test(value)) {
    const blocks = parseClipboardHtml(value);
    if (blocks.length) return { format: DOCUMENT_BODY_FORMAT, blocks };
  }
  return {
    format: DOCUMENT_BODY_FORMAT,
    blocks: [createDocumentBodyBlock('paragraph', String(value || ''))],
  };
}

export function documentBodyToPlain(value, htmlToPlain = input => String(input || '').replace(/<[^>]+>/g, ' ')) {
  return normalizeDocumentBodyValue(value).blocks
    .map((block) => {
      if (block.type === 'divider') return '';
      const content = htmlToPlain(block.content || '').trim();
      const body = block.type === 'fold-list' ? htmlToPlain(block.meta?.body || '').trim() : '';
      if (block.type === 'table-simple') {
        return (block.meta?.rows || [])
          .map(row => (Array.isArray(row) ? row.map(cell => htmlToPlain(cell || '').trim()).filter(Boolean).join(' | ') : ''))
          .filter(Boolean)
          .join('\n');
      }
      return [content, body].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n');
}
