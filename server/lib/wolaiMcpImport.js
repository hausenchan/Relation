const crypto = require('crypto');

const DEFAULT_WOLAI_MCP_ENDPOINT = 'https://api.wolai.com/v1/mcp';
const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function makeBlockFactory(seed) {
  let index = 0;
  const prefix = `b_wolai_mcp_${sha256(seed).slice(0, 8)}`;
  return (type = 'paragraph', content = '', extra = {}) => {
    index += 1;
    return {
      id: `${prefix}_${String(index).padStart(4, '0')}`,
      type,
      content: type === 'divider' ? '' : String(content || ''),
      checked: Boolean(extra.checked),
      highlight: extra.highlight || '',
      meta: extra.meta || {},
      ...extra,
    };
  };
}

function parseSsePayload(text = '', expectedId) {
  const chunks = [];
  let current = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if (!line.trim()) {
      if (current.length) {
        chunks.push(current.join('\n'));
        current = [];
      }
      return;
    }
    if (line.startsWith('data:')) current.push(line.slice(5).trim());
  });
  if (current.length) chunks.push(current.join('\n'));

  const parsed = chunks
    .filter(chunk => chunk && chunk !== '[DONE]')
    .map(chunk => {
      try {
        return JSON.parse(chunk);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!parsed.length) return null;
  return parsed.find(item => item.id === expectedId) || parsed[parsed.length - 1];
}

async function parseMcpResponse(response, expectedId) {
  const sessionId = response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id') || '';
  if (response.status === 202 || response.status === 204) return { payload: null, sessionId };
  const rawText = await response.text();
  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') || rawText.includes('\ndata:')) {
    payload = parseSsePayload(rawText, expectedId);
  } else if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { message: rawText.trim().slice(0, 500) };
    }
  }
  if (Array.isArray(payload)) payload = payload.find(item => item.id === expectedId) || payload[0];
  return { payload, sessionId };
}

class McpHttpClient {
  constructor({ endpoint, token }) {
    this.endpoint = endpoint || DEFAULT_WOLAI_MCP_ENDPOINT;
    this.token = token;
    this.nextId = 1;
    this.sessionId = '';
    this.protocolVersion = MCP_PROTOCOL_VERSIONS[0];
  }

  async send(method, params, { notification = false } = {}) {
    const id = notification ? undefined : this.nextId++;
    const body = {
      jsonrpc: '2.0',
      method,
      ...(notification ? {} : { id }),
      ...(params === undefined ? {} : { params }),
    };
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.token}`,
      'MCP-Protocol-Version': this.protocolVersion,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const { payload, sessionId } = await parseMcpResponse(response, id);
    if (sessionId) this.sessionId = sessionId;
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `${response.status} ${response.statusText}`;
      throw new Error(`Wolai MCP 请求失败：${detail}`);
    }
    if (payload?.error) throw new Error(payload.error.message || 'Wolai MCP 返回错误');
    return payload?.result ?? payload ?? null;
  }

  async initialize() {
    let lastError = null;
    for (const version of MCP_PROTOCOL_VERSIONS) {
      try {
        this.protocolVersion = version;
        const result = await this.send('initialize', {
          protocolVersion: version,
          capabilities: {},
          clientInfo: {
            name: 'Relation Document Center',
            version: '1.0.0',
          },
        });
        await this.send('notifications/initialized', {}, { notification: true }).catch(() => {});
        return result;
      } catch (error) {
        lastError = error;
        this.sessionId = '';
      }
    }
    throw lastError || new Error('Wolai MCP 初始化失败');
  }

  listTools() {
    return this.send('tools/list', {});
  }

  callTool(name, args) {
    return this.send('tools/call', {
      name,
      arguments: args || {},
    });
  }
}

function extractWolaiPageId(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const queryId = url.searchParams.get('page_id') || url.searchParams.get('pageId') || url.searchParams.get('id');
    if (queryId) return queryId;
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '').replace(/\.html?$/i, '');
  } catch {
    return raw;
  }
}

function isLikelyUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function getToolText(tool) {
  const name = String(tool?.name || '').toLowerCase();
  const desc = String(tool?.description || '').toLowerCase();
  return `${name} ${desc}`;
}

function isDiscoveryTool(tool) {
  const text = getToolText(tool);
  if (/search|query|find|lookup|搜索|检索|查找/.test(text)) return true;
  if (/all[_-]?pages|recent|目录|列表|最近/.test(text)) return true;
  if (/space|workspace|database|collection|空间/.test(text) && /list|tree|catalog|目录|列表|列出/.test(text)) return true;
  return /\blist\b|list_|_list|列出/.test(text) && !/block|child|children|content|正文|块|子级/.test(text);
}

function isContentTool(tool) {
  const text = getToolText(tool);
  if (isDiscoveryTool(tool)) return false;
  const hasReadVerb = /get|read|fetch|retrieve|export|detail|load|open|获取|读取|导出|详情/.test(text)
    || (/\blist\b|list_|_list|列出/.test(text) && /block|child|children|content|正文|块|子级/.test(text));
  const hasContentTarget = /page|block|document|doc|content|child|children|正文|页面|文档|内容|块|子级/.test(text);
  return hasReadVerb && hasContentTarget;
}

function scoreTool(tool) {
  const text = getToolText(tool);
  let score = 0;
  if (/page|block|document|doc|content|children|页面|文档|内容|块/.test(text)) score += 8;
  if (/get|read|fetch|retrieve|export|detail|获取|读取|导出|详情/.test(text)) score += 8;
  if (/\blist\b|list_|_list|列出/.test(text) && /block|child|children|content|正文|块|子级/.test(text)) score += 4;
  if (/wolai|我来/.test(text)) score += 2;
  if (isDiscoveryTool(tool)) score -= 30;
  if (/create|update|delete|write|新增|删除|更新/.test(text)) score -= 10;
  return score;
}

function normalizeTools(listResult) {
  const tools = Array.isArray(listResult?.tools)
    ? listResult.tools
    : Array.isArray(listResult)
      ? listResult
      : [];
  return tools
    .filter(tool => tool?.name)
    .sort((a, b) => scoreTool(b) - scoreTool(a));
}

function getSchemaProperties(tool) {
  return tool?.inputSchema?.properties
    || tool?.input_schema?.properties
    || tool?.schema?.properties
    || {};
}

function getSchemaRequired(tool) {
  const required = tool?.inputSchema?.required || tool?.input_schema?.required || tool?.schema?.required || [];
  return Array.isArray(required) ? required : [];
}

function valueForProperty(name, schema, target) {
  const key = String(name || '').toLowerCase();
  if (/url|link|href/.test(key)) return target.url || target.raw;
  if (/page.*id|page_id|pageid|block.*id|block_id|blockid|section.*id|section_id|sectionid|record.*key/.test(key)) return target.pageId || target.raw;
  if (/^id$|uuid|node/.test(key)) return target.pageId || target.raw;
  if (/query|keyword|search|title|text|q/.test(key)) return target.raw;
  if (/recursive|children|include|with.*content|content|blocks/.test(key) && schema?.type === 'boolean') return true;
  if (/limit|max|count|size|page_size/.test(key) && ['number', 'integer'].includes(schema?.type)) return 500;
  if (schema?.type === 'boolean') return false;
  if (['number', 'integer'].includes(schema?.type)) return 0;
  if (Array.isArray(schema?.enum) && schema.enum.length) return schema.enum[0];
  return target.raw;
}

function buildArgumentsForTool(tool, target) {
  const properties = getSchemaProperties(tool);
  const propertyNames = Object.keys(properties);
  const required = getSchemaRequired(tool);
  if (!propertyNames.length) {
    return [
      target.url ? { url: target.url } : null,
      { page_id: target.pageId || target.raw },
      { pageId: target.pageId || target.raw },
      { id: target.pageId || target.raw },
      { section_id: target.pageId || target.raw },
      { sectionId: target.pageId || target.raw },
      { query: target.raw },
      {},
    ].filter(Boolean);
  }

  const base = {};
  propertyNames.forEach(name => {
    const value = valueForProperty(name, properties[name], target);
    const key = String(name).toLowerCase();
    const shouldSet = required.includes(name)
      || /url|link|href|page.*id|page_id|pageid|block.*id|block_id|blockid|section.*id|section_id|sectionid|^id$|query|keyword|search|title|text|q|recursive|children|include|limit|max|count|size|page_size/.test(key);
    if (shouldSet && value !== undefined) base[name] = value;
  });

  const variants = [base];
  if (target.url) variants.push({ ...base, url: target.url }, { ...base, page_url: target.url });
  if (target.pageId) {
    variants.push(
      { ...base, page_id: target.pageId },
      { ...base, pageId: target.pageId },
      { ...base, block_id: target.pageId },
      { ...base, blockId: target.pageId },
      { ...base, section_id: target.pageId },
      { ...base, sectionId: target.pageId },
      { ...base, id: target.pageId }
    );
  }
  variants.push({ ...base, query: target.raw });
  return variants.filter((item, index, list) => (
    index === list.findIndex(other => JSON.stringify(other) === JSON.stringify(item))
  ));
}

function collectTextFromToolResult(result) {
  const textParts = [];
  const structured = [];
  if (result?.structuredContent !== undefined) structured.push(result.structuredContent);
  if (result?.structured_content !== undefined) structured.push(result.structured_content);
  if (result?.data !== undefined) structured.push(result.data);

  const content = Array.isArray(result?.content) ? result.content : [];
  content.forEach(item => {
    if (!item) return;
    if (item.type === 'text' && item.text) textParts.push(String(item.text));
    else if (item.text) textParts.push(String(item.text));
    else if (item.type === 'resource' && item.resource?.text) textParts.push(String(item.resource.text));
    else if (item.json !== undefined) structured.push(item.json);
    else if (typeof item === 'object') structured.push(item);
  });

  if (!content.length && typeof result === 'string') textParts.push(result);
  return {
    text: textParts.join('\n').trim(),
    structured,
  };
}

function tryParseJson(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getNodeText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const candidate = node.content ?? node.text ?? node.title ?? node.name ?? node.plain_text ?? node.markdown ?? node.value ?? '';
  if (Array.isArray(candidate)) return candidate.map(getNodeText).filter(Boolean).join('');
  if (typeof candidate === 'object') return getNodeText(candidate);
  return String(candidate || '');
}

function mapNodeType(node) {
  const raw = String(node?.type || node?.block_type || node?.kind || '').toLowerCase();
  const level = Number(node?.level || node?.heading_level || raw.match(/heading[_-]?([1-6])/)?.[1] || 0);
  if (/heading|title|header/.test(raw) || level) return `heading${Math.min(Math.max(level || 1, 1), 3)}`;
  if (/todo|check/.test(raw)) return 'todo';
  if (/number|ordered/.test(raw)) return 'numbered';
  if (/bullet|list/.test(raw)) return 'bullet';
  if (/quote/.test(raw)) return 'quote';
  if (/code/.test(raw)) return 'code';
  if (/divider|hr|separator/.test(raw)) return 'divider';
  if (/image|picture/.test(raw)) return 'image';
  if (/table|database/.test(raw)) return 'table-simple';
  return 'paragraph';
}

function normalizeTableRows(node) {
  const rows = node?.rows || node?.table?.rows || node?.data?.rows || [];
  if (!Array.isArray(rows)) return null;
  const matrix = rows
    .map(row => {
      if (Array.isArray(row)) return row.map(cell => stripHtml(getNodeText(cell)));
      if (Array.isArray(row?.cells)) return row.cells.map(cell => stripHtml(getNodeText(cell)));
      if (Array.isArray(row?.columns)) return row.columns.map(cell => stripHtml(getNodeText(cell)));
      return [];
    })
    .filter(row => row.length);
  if (!matrix.length) return null;
  const columnCount = Math.max(...matrix.map(row => row.length), 1);
  return {
    columns: Array.from({ length: columnCount }, (_, index) => {
      const header = node?.columns?.[index];
      return stripHtml(getNodeText(header)) || `字段 ${index + 1}`;
    }),
    rows: matrix.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || '')),
    mergedCells: [],
  };
}

function collectStructuredNodes(value, nodes = [], options = {}) {
  if (!value) return nodes;
  if (Array.isArray(value)) {
    value.forEach(item => collectStructuredNodes(item, nodes, options));
    return nodes;
  }
  if (typeof value !== 'object') return nodes;
  const hasBlockType = Boolean(value.type || value.block_type || value.kind);
  const hasBodyText = value.text !== undefined
    || value.content !== undefined
    || value.plain_text !== undefined
    || value.markdown !== undefined
    || value.value !== undefined;
  const hasTable = Boolean(value.rows || value.table);
  if (
    hasBlockType || hasBodyText || hasTable
  ) {
    nodes.push(value);
  }
  ['page', 'document', 'data', 'blocks', 'children', 'content'].forEach(key => {
    if (value[key] && value[key] !== value) collectStructuredNodes(value[key], nodes, options);
  });
  if (options.allowCollectionKeys) {
    ['items', 'rows', 'cells'].forEach(key => {
      if (value[key] && value[key] !== value) collectStructuredNodes(value[key], nodes, options);
    });
  }
  return nodes;
}

function containsTargetReference(value, target) {
  const needles = [
    target.url,
    target.raw,
    target.pageId,
    target.pageId ? decodeURIComponent(target.pageId) : '',
  ]
    .map(item => String(item || '').trim())
    .filter(item => item.length >= 6);
  if (!needles.length) return false;
  const haystack = typeof value === 'string'
    ? value
    : JSON.stringify(value || {});
  return needles.some(needle => haystack.includes(needle));
}

function looksLikeMcpToolErrorText(text = '', target = {}) {
  const normalized = stripHtml(text)
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;

  const errorPatterns = [
    /section\s*不(?:存在|可用)/i,
    /(?:page|block|document|content)\s*(?:not found|does not exist|is missing)/i,
    /(?:页面|文档|块|内容|资源)\s*(?:不存在|未找到|找不到|已删除)/,
    /(?:无权限|没有权限|访问受限|未授权|鉴权失败|认证失败)/,
    /(?:unauthorized|forbidden|permission denied|invalid token|token expired)/i,
  ];
  if (!errorPatterns.some(pattern => pattern.test(normalized))) return false;

  const isShortError = normalized.length <= 260 && normalized.split(/[。.!?！？]/).filter(Boolean).length <= 3;
  if (isShortError) return true;
  return containsTargetReference(normalized, target) && normalized.length <= 800;
}

function getMcpToolResultErrorMessage(result, target) {
  const { text } = collectTextFromToolResult(result);
  const explicitError = result?.isError === true || result?.is_error === true;
  const normalizedText = stripHtml(text).replace(/\s+/g, ' ').trim();
  if (explicitError) {
    return normalizedText.slice(0, 240) || 'MCP 工具返回错误结果';
  }
  if (looksLikeMcpToolErrorText(normalizedText, target)) {
    return normalizedText.slice(0, 240);
  }
  return '';
}

function looksLikeDiscoveryText(text = '', target) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 6) return false;
  const shortLineRatio = lines.filter(line => line.length <= 40).length / lines.length;
  const hasTarget = containsTargetReference(text, target);
  return shortLineRatio > 0.75 && !hasTarget;
}

function filterBlocks(blocks = [], target) {
  const seen = new Set();
  const filtered = [];
  blocks.forEach(block => {
    const text = stripHtml(block?.content || block?.meta?.url || '').trim();
    if (!text && block?.type !== 'divider' && block?.type !== 'table-simple') return;
    const key = `${block?.type || ''}:${text}:${JSON.stringify(block?.meta || {})}`;
    if (seen.has(key)) return;
    seen.add(key);
    filtered.push(block);
  });
  if (filtered.length >= 6) {
    const headingLike = filtered.filter(block => /^heading/.test(block?.type || '') || block?.type === 'paragraph');
    const shortHeadingRatio = headingLike.length
      ? headingLike.filter(block => stripHtml(block.content).length <= 40).length / headingLike.length
      : 0;
    if (shortHeadingRatio > 0.85 && !containsTargetReference(filtered, target)) return [];
  }
  return filtered;
}

function findTitle(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const title = findTitle(item);
      if (title) return title;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const candidate = value.title || value.name || value.page_title || value.document_title;
  if (candidate && typeof candidate !== 'object') return stripHtml(candidate);
  for (const key of ['page', 'document', 'data', 'meta', 'metadata']) {
    const title = findTitle(value[key]);
    if (title) return title;
  }
  return '';
}

function findSourceUrl(value) {
  if (!value || typeof value !== 'object') return '';
  const candidate = value.url || value.source_url || value.page_url || value.link || value.href;
  if (candidate && typeof candidate !== 'object') return String(candidate);
  for (const key of ['page', 'document', 'data', 'meta', 'metadata']) {
    const url = findSourceUrl(value[key]);
    if (url) return url;
  }
  return '';
}

function nodesToBlocks(nodes, seed) {
  const makeBlock = makeBlockFactory(seed);
  const blocks = [];
  nodes.forEach(node => {
    const type = mapNodeType(node);
    if (type === 'table-simple') {
      const meta = normalizeTableRows(node);
      if (meta) blocks.push(makeBlock('table-simple', '', { meta }));
      return;
    }
    if (type === 'divider') {
      blocks.push(makeBlock('divider'));
      return;
    }
    if (type === 'image') {
      const url = node.url || node.src || node.source || node.file_url || getNodeText(node);
      if (url) blocks.push(makeBlock('image', String(url), { meta: { url: String(url), alt: node.alt || node.caption || '' } }));
      return;
    }
    const text = getNodeText(node);
    if (!text && !['todo'].includes(type)) return;
    blocks.push(makeBlock(type, escapeHtml(text), {
      checked: Boolean(node.checked || node.done || node.completed),
      meta: {
        ...(node.indent !== undefined ? { indent: Number(node.indent) || 0 } : {}),
        ...(node.language ? { language: node.language } : {}),
      },
    }));
  });
  return blocks;
}

function parseMarkdownTable(lines, startIndex, makeBlock) {
  const header = lines[startIndex];
  const divider = lines[startIndex + 1];
  if (!header || !divider || !/^\s*\|?.+\|.+\|?\s*$/.test(header) || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(divider)) {
    return null;
  }
  const readRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  const columns = readRow(header).map((cell, index) => cell || `字段 ${index + 1}`);
  const rows = [];
  let cursor = startIndex + 2;
  while (cursor < lines.length && /^\s*\|?.+\|.+\|?\s*$/.test(lines[cursor])) {
    rows.push(readRow(lines[cursor]));
    cursor += 1;
  }
  if (!rows.length) return null;
  return {
    block: makeBlock('table-simple', '', {
      meta: {
        columns,
        rows: rows.map(row => Array.from({ length: columns.length }, (_, index) => row[index] || '')),
        mergedCells: [],
      },
    }),
    nextIndex: cursor,
  };
}

function parseTextToBlocks(text, seed) {
  const makeBlock = makeBlockFactory(seed);
  const blocks = [];
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let inCode = false;
  let codeLanguage = '';
  let codeLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const fence = trimmed.match(/^```(\w+)?/);
    if (fence) {
      if (inCode) {
        blocks.push(makeBlock('code', escapeHtml(codeLines.join('\n')), { meta: { language: codeLanguage } }));
        inCode = false;
        codeLanguage = '';
        codeLines = [];
      } else {
        inCode = true;
        codeLanguage = fence[1] || '';
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!trimmed) continue;
    const table = parseMarkdownTable(lines, index, makeBlock);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex - 1;
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push(makeBlock(`heading${Math.min(heading[1].length, 3)}`, escapeHtml(heading[2])));
      continue;
    }
    const todo = trimmed.match(/^[-*]\s+\[([ xX])]\s+(.+)$/);
    if (todo) {
      blocks.push(makeBlock('todo', escapeHtml(todo[2]), { checked: todo[1].toLowerCase() === 'x' }));
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push(makeBlock('bullet', escapeHtml(bullet[1]), { meta: { indent: 0 } }));
      continue;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      blocks.push(makeBlock('numbered', escapeHtml(numbered[1]), { meta: { indent: 0 } }));
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      blocks.push(makeBlock('divider'));
      continue;
    }
    blocks.push(makeBlock('paragraph', escapeHtml(trimmed)));
  }
  if (inCode && codeLines.length) {
    blocks.push(makeBlock('code', escapeHtml(codeLines.join('\n')), { meta: { language: codeLanguage } }));
  }
  return blocks;
}

function collectBlocksText(blocks = []) {
  return blocks.map(block => {
    if (block?.type === 'divider') return '';
    if (block?.type === 'table-simple') {
      const columns = Array.isArray(block.meta?.columns) ? block.meta.columns.join('\t') : '';
      const rows = Array.isArray(block.meta?.rows) ? block.meta.rows.map(row => row.join('\t')).join('\n') : '';
      return [columns, rows].filter(Boolean).join('\n');
    }
    return stripHtml(block?.content || block?.meta?.url || '');
  }).filter(Boolean).join('\n');
}

function normalizeImportedContent({ result, target, tool }) {
  const toolName = tool?.name || '';
  if (!isContentTool(tool)) {
    return {
      title: '',
      source_url: target.url || '',
      source_record_key: `wolai_mcp:${target.pageId || sha256(target.raw).slice(0, 24)}`,
      source_payload_hash: sha256(JSON.stringify({ target: target.raw, skipped_tool: toolName })),
      capture_method: `wolai-mcp:${toolName}`,
      warnings: [`已跳过 MCP 发现/搜索工具 ${toolName}，避免把搜索结果当正文导入`],
      blocks: [],
      content_text: '',
    };
  }
  const { text, structured } = collectTextFromToolResult(result);
  const toolErrorMessage = getMcpToolResultErrorMessage(result, target);
  if (toolErrorMessage) {
    return {
      title: '',
      source_url: target.url || '',
      source_record_key: `wolai_mcp:${target.pageId || sha256(target.raw).slice(0, 24)}`,
      source_payload_hash: sha256(JSON.stringify({ target: target.raw, tool_error: toolErrorMessage })),
      capture_method: `wolai-mcp:${toolName}`,
      warnings: [`MCP 工具 ${toolName} 返回错误：${toolErrorMessage}`],
      blocks: [],
      content_text: '',
      tool_error: toolErrorMessage,
    };
  }
  const parsedTextJson = tryParseJson(text);
  const payloads = [...structured, parsedTextJson].filter(Boolean);
  const nodes = [];
  payloads.forEach(payload => collectStructuredNodes(payload, nodes, { allowCollectionKeys: true }));
  let blocks = filterBlocks(nodesToBlocks(nodes, target.raw), target);
  if (!blocks.length && text && !looksLikeDiscoveryText(text, target)) {
    blocks = filterBlocks(parseTextToBlocks(text, target.raw), target);
  }

  const title = payloads.map(findTitle).find(Boolean) || '';
  const sourceUrl = payloads.map(findSourceUrl).find(Boolean) || target.url || '';
  const contentText = collectBlocksText(blocks);
  const targetMatched = containsTargetReference(payloads, target) || containsTargetReference(sourceUrl, target);
  return {
    title,
    source_url: sourceUrl,
    source_record_key: `wolai_mcp:${target.pageId || sha256(target.raw).slice(0, 24)}`,
    source_payload_hash: sha256(JSON.stringify({ target: target.raw, text, payloads })),
    capture_method: `wolai-mcp:${toolName}`,
    warnings: [
      ...(!targetMatched && blocks.length ? ['MCP 结果未显式包含目标页面标识，已按读取工具返回内容导入'] : []),
      ...(!blocks.length ? ['MCP 已返回结果，但未解析出目标页面正文'] : []),
    ],
    blocks,
    content_text: contentText,
    target_matched: targetMatched,
  };
}

async function importWolaiMcpToBlocks(options = {}) {
  const token = String(options.token || process.env.WOLAI_MCP_TOKEN || '').trim();
  if (!token) throw new Error('请填写 Wolai MCP Token，或在服务器配置 WOLAI_MCP_TOKEN');
  const rawTarget = String(options.target || options.url || options.page_id || options.pageId || '').trim();
  if (!rawTarget) throw new Error('请填写 Wolai 页面 URL 或页面 ID');
  const endpoint = String(options.endpoint || process.env.WOLAI_MCP_ENDPOINT || DEFAULT_WOLAI_MCP_ENDPOINT).trim();
  const target = {
    raw: rawTarget,
    url: isLikelyUrl(rawTarget) ? rawTarget : '',
    pageId: extractWolaiPageId(rawTarget),
  };

  const client = new McpHttpClient({ endpoint, token });
  await client.initialize();
  const toolsResult = await client.listTools();
  const tools = normalizeTools(toolsResult);
  if (!tools.length) throw new Error('Wolai MCP 未返回可用工具');

  const errors = [];
  const skippedDiscoveryTools = tools.filter(isDiscoveryTool).map(tool => tool.name);
  const contentCandidates = tools.filter(isContentTool).slice(0, 10);
  const fallbackCandidates = contentCandidates.length ? contentCandidates : [];
  for (const tool of fallbackCandidates) {
    const argsVariants = buildArgumentsForTool(tool, target).slice(0, 8);
    for (const args of argsVariants) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.callTool(tool.name, args);
        const toolErrorMessage = getMcpToolResultErrorMessage(result, target);
        if (toolErrorMessage) {
          errors.push(`${tool.name}: ${toolErrorMessage}`);
          continue;
        }
        const imported = normalizeImportedContent({ result, target, tool });
        if (imported.blocks.length) {
          return {
            ...imported,
            title: options.title || imported.title || 'Wolai MCP 导入文档',
            source_url: imported.source_url || target.url,
            tool_name: tool.name,
            tool_arguments: args,
            available_tools: tools.map(item => item.name),
          };
        }
        errors.push(`${tool.name}: 未解析出正文`);
      } catch (error) {
        errors.push(`${tool.name}: ${error.message || '调用失败'}`);
      }
    }
  }

  throw new Error(`未能通过 Wolai MCP 读取目标页面正文。已跳过搜索/列表类工具：${skippedDiscoveryTools.join('、') || '无'}。可用工具：${tools.map(tool => tool.name).join('、')}。尝试结果：${errors.slice(0, 6).join('；') || '没有发现可读取页面正文的工具'}`);
}

module.exports = {
  importWolaiMcpToBlocks,
  collectBlocksText,
  extractWolaiPageId,
};
