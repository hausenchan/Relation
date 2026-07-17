export const DOCUMENT_BODY_FORMAT = 'relation_document_blocks_v1';

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
  if (typeof value === 'string' && value && typeof document !== 'undefined' && /<(p|h[1-4]|li)\b/i.test(value)) {
    const container = document.createElement('div');
    container.innerHTML = value;
    const blocks = Array.from(container.querySelectorAll('p,h1,h2,h3,h4,li')).map((element) => {
      const tag = element.tagName.toLowerCase();
      let type = 'paragraph';
      if (/^h[1-4]$/.test(tag)) type = `heading${tag.slice(1)}`;
      if (tag === 'li') {
        const listMode = element.getAttribute('data-list');
        type = listMode === 'ordered' || element.parentElement?.tagName?.toLowerCase() === 'ol' ? 'numbered' : 'bullet';
      }
      return createDocumentBodyBlock(type, element.innerHTML || element.textContent || '');
    });
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
