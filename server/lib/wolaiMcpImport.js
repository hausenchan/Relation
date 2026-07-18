const crypto = require('crypto');

const DEFAULT_WOLAI_MCP_ENDPOINT = 'https://api.wolai.com/v1/mcp';
const DEFAULT_WOLAI_API_BASE = 'https://api.wolai.com/v1';
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

function buildWolaiPageUrl(blockId = '', fallback = '') {
  const id = String(blockId || '').trim();
  const source = String(fallback || '').trim();
  if (source && (!id || source.includes(id))) return source;
  return id ? `https://www.wolai.com/${encodeURIComponent(id)}` : source;
}

function hasMeaningfulTableRows(rows = []) {
  return Array.isArray(rows) && rows.some(row => (
    Array.isArray(row) && row.some(cell => stripHtml(cell).trim())
  ));
}

function debugWolaiImport(...args) {
  if (process.env.WOLAI_MCP_IMPORT_DEBUG !== '1') return;
  // eslint-disable-next-line no-console
  console.error('[wolai-mcp-import]', ...args);
}

async function wolaiApiRequest(token, path, options = {}) {
  const base = String(options.base || process.env.WOLAI_API_BASE || DEFAULT_WOLAI_API_BASE).trim();
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(String(path || '').replace(/^\/+/, ''), normalizedBase);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach(item => url.searchParams.append(key, String(item)));
    else url.searchParams.set(key, String(value));
  });
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
  };
  const response = await fetch(url.toString(), {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const rawText = await response.text();
  let payload = null;
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { message: rawText.trim().slice(0, 500) };
    }
  }
  const code = Number(payload?.code);
  if (!response.ok || (Number.isFinite(code) && code !== 1000)) {
    const detail = payload?.message || payload?.msg || payload?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(detail);
  }
  return payload;
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
  const name = String(tool?.name || '').toLowerCase();
  const text = getToolText(tool);
  if (/outline|structure|index|map/.test(name)) return true;
  if (/索引|结构/.test(text) && !/content|正文/.test(name)) return true;
  if (/search|query|find|lookup|搜索|检索|查找/.test(text)) return true;
  if (/all[_-]?pages|recent|目录|列表|最近/.test(text)) return true;
  if (/space|workspace|database|collection|空间/.test(text) && /list|tree|catalog|目录|列表|列出/.test(text)) return true;
  return /\blist\b|list_|_list|列出/.test(text) && !/block|child|children|content|正文|块|子级/.test(text);
}

function isContentTool(tool) {
  const name = String(tool?.name || '').toLowerCase();
  if (/(^|_)(create|update|delete|move|insert|patch|replace|rewrite)($|_)/.test(name)) return false;
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

function scoreChildTool(tool) {
  const text = getToolText(tool);
  let score = scoreTool(tool);
  if (/child|children|children_of|descendant|sub|block|section|子级|子块|下级|块/.test(text)) score += 16;
  if (/\blist\b|list_|_list|列出/.test(text) && /child|children|block|section|子级|子块|块/.test(text)) score += 12;
  if (/page|document|页面|文档/.test(text) && !/child|children|block|section|子级|子块|块/.test(text)) score -= 8;
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

function getChildContentTools(tools = []) {
  return tools
    .filter(isContentTool)
    .sort((a, b) => scoreChildTool(b) - scoreChildTool(a));
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
  if (/page.*id|page_id|pageid/.test(key)) return target.pageId || target.blockId || target.raw;
  if (/section.*id|section_id|sectionid/.test(key)) return target.sectionId || target.blockId || undefined;
  if (/block.*id|block_id|blockid|record.*key/.test(key)) return target.blockId || target.pageId || target.raw;
  if (/^id$|uuid|node/.test(key)) return target.blockId || target.pageId || target.raw;
  if (/query|keyword|search|title|text|q/.test(key)) return target.raw;
  if (/recursive|children|include|with.*content|content|blocks/.test(key) && schema?.type === 'boolean') return true;
  if (/limit|max|count|size|page_size|depth|length/.test(key) && ['number', 'integer'].includes(schema?.type)) {
    const min = Number.isFinite(Number(schema?.minimum)) ? Number(schema.minimum) : 0;
    const max = Number.isFinite(Number(schema?.maximum)) ? Number(schema.maximum) : 500;
    const preferred = /depth/.test(key) ? 9 : 500;
    return Math.max(min, Math.min(max, preferred));
  }
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
    if (target.blockId) {
      return [
        { page_id: target.pageId || target.blockId, section_id: target.blockId },
        { page_id: target.pageId || target.blockId, block_id: target.blockId },
        { pageId: target.pageId || target.blockId, sectionId: target.blockId },
        { pageId: target.pageId || target.blockId, blockId: target.blockId },
        { section_id: target.blockId },
        { block_id: target.blockId },
        { id: target.blockId },
        { sectionId: target.blockId },
        { blockId: target.blockId },
      ];
    }
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
      { ...base, id: target.blockId || target.pageId }
    );
  }
  if (target.blockId) {
    variants.push(
      { ...base, block_id: target.blockId },
      { ...base, blockId: target.blockId },
      { ...base, section_id: target.blockId },
      { ...base, sectionId: target.blockId },
      { ...base, id: target.blockId },
      { ...base, page_id: target.pageId || target.blockId, block_id: target.blockId },
      { ...base, page_id: target.pageId || target.blockId, section_id: target.blockId },
      { ...base, pageId: target.pageId || target.blockId, blockId: target.blockId },
      { ...base, pageId: target.pageId || target.blockId, sectionId: target.blockId }
    );
  } else if (target.pageId) {
    variants.push(
      { ...base, block_id: target.pageId },
      { ...base, blockId: target.pageId },
    );
  }
  variants.push({ ...base, query: target.raw });
  return variants
    .filter(item => required.every(name => item[name] !== undefined && item[name] !== null && item[name] !== ''))
    .filter((item, index, list) => (
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

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flattenArrayText(value) {
  if (!Array.isArray(value)) return String(value || '');
  return value.flat(Infinity).map(item => String(item ?? '')).join(' ');
}

function hasInlineMark(marks, pattern) {
  if (!marks) return false;
  if (typeof marks === 'string') return pattern.test(marks);
  if (Array.isArray(marks)) return pattern.test(flattenArrayText(marks));
  if (isPlainObject(marks)) {
    return Object.entries(marks).some(([key, value]) => {
      if (value === true) return pattern.test(key);
      if (value === false || value == null) return false;
      if (Array.isArray(value) || isPlainObject(value)) return hasInlineMark(value, pattern);
      const text = String(value || '').trim();
      if (!text || /^(false|null|undefined|0)$/i.test(text)) return false;
      return pattern.test(`${key}:${text}`);
    });
  }
  return false;
}

function pickInlineColor(marks, keys) {
  if (!marks) return '';
  const keyPattern = new RegExp(`^(${keys.join('|')})$`, 'i');
  const validColor = value => {
    const color = String(value || '').trim();
    const normalized = normalizeCssColor(color);
    if (normalized) return normalized;
    if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
    if (/^[a-z]+$/i.test(color)) return color;
    return '';
  };
  if (Array.isArray(marks)) {
    for (const item of marks) {
      if (Array.isArray(item) && item.length >= 2 && keyPattern.test(String(item[0] || ''))) {
        const color = validColor(item[1]);
        if (color) return color;
      }
      const nested = pickInlineColor(item, keys);
      if (nested) return nested;
    }
  }
  if (isPlainObject(marks)) {
    for (const [key, value] of Object.entries(marks)) {
      if (keyPattern.test(key)) {
        const color = validColor(value);
        if (color) return color;
      }
      if (Array.isArray(value) || isPlainObject(value)) {
        const nested = pickInlineColor(value, keys);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function pickInlineLink(value = {}, marks = {}) {
  const pickString = (...items) => items.map(item => String(item || '').trim()).find(Boolean) || '';
  const direct = pickString(
    value.href,
    value.url,
    value.link,
    value.page_url,
    value.pageUrl,
    value.source_url,
    value.sourceUrl,
    value.reference_url,
    value.referenceUrl,
    value.text?.link,
    value.text?.href,
    value.text?.url,
    marks?.href,
    marks?.url,
    marks?.link
  );
  if (direct) return direct;
  const pageId = pickString(
    value.page_id,
    value.pageId,
    value.page?.id,
    value.page?.page_id,
    value.mention?.page?.id,
    marks?.page_id,
    marks?.pageId
  );
  if (pageId) return `https://www.wolai.com/${encodeURIComponent(pageId)}`;
  return '';
}

function applyInlineMarks(html, marks) {
  let output = String(html || '');
  if (!stripHtml(output)) return output;
  const link = pickInlineLink({}, marks);
  if (hasInlineMark(marks, /bold|strong|加粗/i)) output = `<strong>${output}</strong>`;
  if (hasInlineMark(marks, /italic|em|斜体/i)) output = `<em>${output}</em>`;
  if (hasInlineMark(marks, /underline|下划线/i)) output = `<u>${output}</u>`;
  if (hasInlineMark(marks, /strike|strikethrough|delete|删除线/i)) output = `<s>${output}</s>`;
  if (hasInlineMark(marks, /code|代码/i)) output = `<code>${output}</code>`;
  const color = pickInlineColor(marks, ['color', 'textColor', 'text_color', 'frontColor', 'front_color']);
  const backgroundColor = pickInlineColor(marks, [
    'backgroundColor', 'background_color', 'backColor', 'back_color', 'bgColor', 'bg_color',
  ]);
  const style = [
    color ? `color: ${color}` : '',
    backgroundColor ? `background-color: ${backgroundColor}` : '',
  ].filter(Boolean).join('; ');
  if (style) output = `<span style="${escapeHtml(style)}">${output}</span>`;
  if (link) {
    output = `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${output}</a>`;
  }
  return output;
}

function pickInlineMarkSource(value = {}, annotations = null) {
  if (!isPlainObject(value)) return annotations || {};
  return {
    annotations,
    marks: value.marks,
    mark: value.mark,
    styles: value.styles,
    style: value.style,
    decorations: value.decorations,
    bold: value.bold,
    strong: value.strong,
    italic: value.italic,
    underline: value.underline,
    strikethrough: value.strikethrough,
    strike: value.strike,
    code: value.code,
    color: value.color,
    textColor: value.textColor,
    text_color: value.text_color,
    frontColor: value.frontColor,
    front_color: value.front_color,
    backgroundColor: value.backgroundColor,
    background_color: value.background_color,
    backColor: value.backColor,
    back_color: value.back_color,
    bgColor: value.bgColor,
    bg_color: value.bg_color,
  };
}

function isLikelyWolaiRecordKey(value = '') {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,}$/.test(key)) return false;
  return !/^(metadata|children|content|blocks|items|page|document|data)$/i.test(key);
}

function isWolaiBlockLikeObject(value, fallbackKey = '') {
  if (!isPlainObject(value)) return false;
  const explicitId = value.id || value.block_id || value.blockId;
  const keyedId = isLikelyWolaiRecordKey(fallbackKey) ? fallbackKey : '';
  const id = explicitId || keyedId;
  const hasText = value.title !== undefined
    || value.content !== undefined
    || value.text !== undefined
    || value.plain_text !== undefined
    || value.markdown !== undefined;
  const hasBlockMeta = value.parent_id !== undefined
    || value.parentId !== undefined
    || value.parent_type !== undefined
    || value.parentType !== undefined
    || value.type !== undefined
    || value.block_type !== undefined
    || value.blockType !== undefined
    || value.kind !== undefined;
  const hasTableMeta = value.rows !== undefined
    || value.table !== undefined
    || value.tableRows !== undefined
    || value.cells !== undefined
    || (value.properties !== undefined && /table|database|row/i.test(getNodeTypeHint(value)));
  if (!id) return false;
  if (hasBlockMeta || hasTableMeta) return true;
  return hasText && !/^(page|document|meta|metadata)$/i.test(String(fallbackKey || ''));
}

function isRichTextTuple(value) {
  return Array.isArray(value)
    && typeof value[0] === 'string'
    && value.length <= 3
    && (Array.isArray(value[1]) || isPlainObject(value[1]) || value[1] == null);
}

function getInlineReferenceTitle(value = {}) {
  if (!isPlainObject(value)) return '';
  return stripHtml(getNodeHtml(
    value.title
    || value.name
    || value.text
    || value.plain_text
    || value.plainText
    || value.page?.title
    || value.page?.name
    || value.mention?.page?.title
    || value.mention?.page?.name
  )).trim();
}

function buildInlineReferenceUrl(value = {}) {
  if (!isPlainObject(value)) return '';
  const direct = [
    value.href,
    value.url,
    value.link,
    value.page_url,
    value.pageUrl,
    value.source_url,
    value.sourceUrl,
    value.reference_url,
    value.referenceUrl,
    value.page?.url,
    value.page?.href,
    value.page?.link,
    value.mention?.page?.url,
  ].map(item => String(item || '').trim()).find(Boolean);
  if (direct) return direct;
  const pageId = [
    value.page_id,
    value.pageId,
    value.page?.id,
    value.page?.page_id,
    value.page?.pageId,
    value.mention?.page?.id,
  ].map(item => String(item || '').trim()).find(Boolean);
  return pageId ? `https://www.wolai.com/${encodeURIComponent(pageId)}` : '';
}

function isInlineReferenceObject(value = {}) {
  if (!isPlainObject(value)) return false;
  const hint = getNodeTypeHint(value);
  if (/bookmark|link|mention|reference|引用|链接/.test(hint)) return true;
  if (/^(page|document)$/.test(hint) && !value.parent_id && !value.parentId && !value.parent_block_id && !value.parentBlockId) return true;
  return Boolean(buildInlineReferenceUrl(value) && getInlineReferenceTitle(value));
}

function extractInlineHtml(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    if (isRichTextTuple(value)) return applyInlineMarks(escapeHtml(value[0]), value[1]);
    if (value.some(item => isWolaiBlockLikeObject(item))) return '';
    return value.map(item => extractInlineHtml(item)).join('');
  }
  if (!isPlainObject(value)) return '';
  if (isInlineReferenceObject(value)) {
    const title = getInlineReferenceTitle(value) || buildInlineReferenceUrl(value) || '链接';
    const url = buildInlineReferenceUrl(value);
    const safeTitle = escapeHtml(title);
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${safeTitle}</a>` : safeTitle;
  }
  if (value.blocks || value.children || value.items || value.rows || value.table) return '';

  const annotations = value.annotations || value.annotation || value.marks || value.mark || value.styles || value.style || value.decorations;
  const textObject = isPlainObject(value.text) ? value.text : null;
  const candidates = [
    value.plain_text,
    value.plainText,
    textObject?.content,
    textObject?.text,
    typeof value.text === 'string' ? value.text : undefined,
    value.content,
    value.title,
    value.value,
    value.name,
    value.markdown,
  ];
  for (const candidate of candidates) {
    const html = extractInlineHtml(candidate);
    if (stripHtml(html)) {
      const marks = pickInlineMarkSource(value, annotations);
      const link = pickInlineLink(value, marks);
      const withMarks = applyInlineMarks(html, marks);
      return link && !/<a\b/i.test(withMarks)
        ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${withMarks}</a>`
        : withMarks;
    }
  }
  return '';
}

function getNodeHtml(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node);
  if (!isPlainObject(node)) return extractInlineHtml(node);
  const candidates = [
    node.title,
    node.content,
    node.text,
    node.plain_text,
    node.plainText,
    node.markdown,
    node.value,
    node.name,
  ];
  for (const candidate of candidates) {
    const html = extractInlineHtml(candidate);
    if (stripHtml(html)) return html;
  }
  return '';
}

function getNodeText(node) {
  return stripHtml(getNodeHtml(node));
}

function getNodeTypeHint(node = {}) {
  return [
    node?.type,
    node?.block_type,
    node?.blockType,
    node?.kind,
    node?.format,
  ].map(item => String(item || '').toLowerCase()).filter(Boolean).join(' ');
}

function isFoldLikeTypeHint(value = '') {
  return /toggle|fold|collaps|expand|折叠|展开/.test(String(value || '').toLowerCase());
}

function isEnumListTypeHint(value = '') {
  return /enum[_\s-]*list|enumlist|number|ordered|(^|\s)ol($|\s)|数字列表|有序列表/.test(String(value || '').toLowerCase());
}

function isBulletListTypeHint(value = '') {
  return /bullet|bull[_\s-]*list|bulllist|unordered|(^|\s)ul($|\s)|无序列表|项目列表/.test(String(value || '').toLowerCase());
}

function hasFoldFlag(node = {}) {
  if (!isPlainObject(node)) return false;
  return Boolean(
    node.toggle
    || node.is_toggle
    || node.isToggle
    || node.collapsible
    || node.foldable
    || node.children_toggle
    || node.childrenToggle
  );
}

function getWolaiCollapsedState(source = {}, fallback = false) {
  const readBoolean = (value) => {
    if (value === true || value === false) return value;
    if (typeof value === 'string') {
      if (/^(true|1|yes|collapsed|folded|closed)$/i.test(value.trim())) return true;
      if (/^(false|0|no|expanded|open)$/i.test(value.trim())) return false;
    }
    return undefined;
  };
  const candidates = [
    source.collapsed,
    source.is_collapsed,
    source.isCollapsed,
    source.folded,
    source.is_folded,
    source.isFolded,
    source.closed,
    source.toggle?.collapsed,
    source.toggle?.is_collapsed,
    source.toggle?.isCollapsed,
    source.toggle?.folded,
  ];
  for (const candidate of candidates) {
    const value = readBoolean(candidate);
    if (value !== undefined) return value;
  }
  const expandedCandidates = [
    source.expanded,
    source.is_expanded,
    source.isExpanded,
    source.open,
    source.is_open,
    source.isOpen,
    source.toggle?.expanded,
    source.toggle?.is_expanded,
    source.toggle?.isExpanded,
    source.toggle?.open,
  ];
  for (const candidate of expandedCandidates) {
    const value = readBoolean(candidate);
    if (value !== undefined) return !value;
  }
  return fallback;
}

function getWolaiHasChildrenState(source = {}, fallback = undefined) {
  if (!isPlainObject(source)) return fallback;
  const readBoolean = (value) => {
    if (value === true || value === false) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value > 0;
    if (typeof value === 'string') {
      const text = value.trim();
      if (/^(true|1|yes|has_children|hascontent)$/i.test(text)) return true;
      if (/^(false|0|no|empty|none)$/i.test(text)) return false;
      const numeric = Number(text);
      if (Number.isFinite(numeric)) return numeric > 0;
    }
    return undefined;
  };
  const booleanCandidates = [
    source.has_children,
    source.hasChildren,
    source.has_child,
    source.hasChild,
    source.has_content,
    source.hasContent,
    source.children?.length,
    source.blocks?.length,
    source.items?.length,
    source.records?.length,
    source.toggle?.has_children,
    source.toggle?.hasChildren,
  ];
  for (const candidate of booleanCandidates) {
    const value = readBoolean(candidate);
    if (value !== undefined) return value;
  }
  const countCandidates = [
    source.children_count,
    source.childrenCount,
    source.child_count,
    source.childCount,
    source.content_count,
    source.contentCount,
    source.block_count,
    source.blockCount,
  ];
  for (const candidate of countCandidates) {
    const value = readBoolean(candidate);
    if (value !== undefined) return value;
  }
  return fallback;
}

function isTableRowTypeHint(value = '') {
  return /(^|\s)row($|\s)|table[_\s-]*row|database[_\s-]*row|collection[_\s-]*row|row[_\s-]*block|表格行|记录行/.test(String(value || '').toLowerCase());
}

function isTableLikeTypeHint(value = '') {
  const hint = String(value || '').toLowerCase();
  return /table|database|grid|sheet|表格|数据表/.test(hint) && !/table[_\s-]*of[_\s-]*contents|目录/.test(hint);
}

function isDatabaseLikeTypeHint(value = '') {
  const hint = String(value || '').toLowerCase();
  return /database|collection|grid|sheet|data[_\s-]*table|table[_\s-]*view|表格视图|数据表/.test(hint)
    && !/table[_\s-]*row|row[_\s-]*block|table[_\s-]*of[_\s-]*contents|目录/.test(hint);
}

function mapNodeType(node) {
  const raw = getNodeTypeHint(node);
  const level = Number(node?.level || node?.heading_level || raw.match(/heading[_-]?([1-6])/)?.[1] || 0);
  const headingLevel = Math.min(Math.max(level || 1, 1), 4);
  const isFold = isFoldLikeTypeHint(raw) || hasFoldFlag(node);
  if (/^(page|document)$/.test(raw) && buildInlineReferenceUrl(node)) return 'external-link';
  if ((/heading|title|header/.test(raw) || level) && isFold) return `fold-heading${Math.min(Math.max(headingLevel, 2), 4)}`;
  if (/heading|title|header/.test(raw) || level) return `heading${Math.min(Math.max(headingLevel, 1), 3)}`;
  if (/todo|check/.test(raw)) return 'todo';
  if (isFold) return 'fold-list';
  if (isDatabaseLikeNode(node)) return 'database-embed';
  if (isTableLikeTypeHint(raw)) return 'table-simple';
  if (isEnumListTypeHint(raw)) return 'numbered';
  if (isBulletListTypeHint(raw)) return 'bullet';
  if (/quote/.test(raw)) return 'quote';
  if (/code/.test(raw)) return 'code';
  if (/divider|hr|separator/.test(raw)) return 'divider';
  if (/image|picture/.test(raw)) return 'image';
  if (/video|movie|mp4|录屏|视频/.test(raw)) return 'video';
  if (/file|attachment|asset/.test(raw)) return 'attachment';
  return 'paragraph';
}

const wolaiColorMap = {
  gray: '#6b7280',
  brown: '#92400e',
  orange: '#ea580c',
  yellow: '#ca8a04',
  green: '#16a34a',
  blue: '#2563eb',
  purple: '#7c3aed',
  pink: '#db2777',
  red: '#dc2626',
  gray_background: '#f1f5f9',
  brown_background: '#fef3c7',
  orange_background: '#ffedd5',
  yellow_background: '#fef9c3',
  green_background: '#dcfce7',
  blue_background: '#dbeafe',
  purple_background: '#ede9fe',
  pink_background: '#fce7f3',
  red_background: '#fee2e2',
  light_gray_background: '#f3f4f6',
  fluorescent_purple_background: '#f3e8ff',
  fluorescent_green_background: '#d9f99d',
  fluorescent_yellow_background: '#fef08a',
  fluorescent_blue_background: '#bae6fd',
  fluorescent_red_background: '#fecaca',
  apricot_background: '#ffedd5',
  vivid_tangerine_background: '#fed7aa',
  light_pink_background: '#fce7f3',
};

function normalizeCssColor(value = '') {
  const color = String(value || '').trim();
  if (!color || /^(default|transparent|inherit|initial|none)$/i.test(color)) return '';
  const normalized = color.replace(/\s+/g, '_').toLowerCase();
  if (wolaiColorMap[normalized]) return wolaiColorMap[normalized];
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  if (/^[a-z]+$/i.test(color)) return color;
  return '';
}

function parseStyleString(style = '') {
  const result = {};
  String(style || '').split(';').forEach(part => {
    const index = part.indexOf(':');
    if (index < 0) return;
    const key = part.slice(0, index).trim().replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = part.slice(index + 1).trim();
    if (key) result[key] = value;
  });
  return result;
}

function isEmptyTableStyle(style = {}) {
  return !style.backgroundColor && !style.color;
}

function normalizeTableStyleFromSource(source = {}) {
  if (!isPlainObject(source)) return {};
  const styleSource = typeof source.style === 'string'
    ? parseStyleString(source.style)
    : (isPlainObject(source.style) ? source.style : {});
  const colorToken = source.color || source.textColor || source.text_color || styleSource.color;
  const backgroundToken = source.backgroundColor || source.background_color
    || source.bgColor || source.bg_color || source.back_color || source.backColor
    || source.background || source.fill
    || styleSource.backgroundColor || styleSource.background || styleSource.fill;
  const frontColorToken = source.front_color || source.frontColor;
  const normalizedColor = normalizeCssColor(colorToken);
  const normalizedFrontColor = normalizeCssColor(frontColorToken);
  const normalizedBackground = normalizeCssColor(backgroundToken);
  const token = String(source.color || '').trim().toLowerCase();
  const tokenBackground = /background|背景/.test(token) ? normalizeCssColor(token) : '';
  const tokenTextColor = token && !/background|背景/.test(token) ? normalizeCssColor(token) : '';
  return {
    ...(normalizedBackground || tokenBackground ? { backgroundColor: normalizedBackground || tokenBackground } : {}),
    ...(normalizedColor || normalizedFrontColor || tokenTextColor ? { color: normalizedColor || normalizedFrontColor || tokenTextColor } : {}),
  };
}

const databaseOptionColorPalette = ['#f3f4f6', '#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe', '#fce7f3'];

function normalizeDatabaseFieldType(value = '', columnIndex = 0, columnName = '') {
  const raw = String(value || '').trim().toLowerCase();
  const compact = raw.replace(/[\s-]+/g, '_');
  if (compact === 'single_select' || compact === 'select' || compact === 'status' || compact === 'enum' || compact === 'option') return 'select';
  if (compact === 'multi_select' || compact === 'multiple_select' || compact === 'multi') return 'multi_select';
  if (compact === 'title' || compact === 'name' || compact === 'primary') return 'title';
  if (compact === 'rich_text' || compact === 'plain_text' || compact === 'text') return 'text';
  if (compact === 'date' || compact === 'datetime' || compact === 'created_time' || compact === 'updated_time') return 'date';
  if (compact === 'person' || compact === 'people' || compact === 'user' || compact === 'users' || compact === 'member') return 'person';
  if (compact === 'number' || compact === 'integer' || compact === 'float' || compact === 'decimal') return 'number';
  if (compact === 'url' || compact === 'link') return 'url';
  if (compact === 'email') return 'email';
  if (compact === 'phone' || compact === 'tel' || compact === 'mobile') return 'phone';
  if (compact === 'checkbox' || compact === 'boolean' || compact === 'bool') return 'checkbox';
  if (!raw) return columnIndex === 0 ? 'title' : 'text';
  const label = stripHtml(getNodeHtml(columnName || '')).trim().toLowerCase();
  const source = raw || label;
  if (/multi[_\s-]*select|multiple|多选/.test(source)) return 'multi_select';
  if (/select|single|option|status|tag|enum|choice|标签|状态|优先级|类型|单选/.test(source)) return 'select';
  if (/title|name|名称|标题|任务/.test(source)) return 'title';
  if (/date|time|deadline|due|日期|时间|完成时间/.test(source)) return 'date';
  if (/person|people|user|owner|member|assignee|负责人|人员|成员/.test(source)) return 'person';
  if (/number|amount|price|count|score|数字|数量|金额|预算/.test(source)) return 'number';
  if (/url|link|链接|地址/.test(source)) return 'url';
  if (/email|mail|邮箱|邮件/.test(source)) return 'email';
  if (/phone|mobile|tel|电话|手机/.test(source)) return 'phone';
  if (/check|bool|done|完成|勾选/.test(source)) return 'checkbox';
  return columnIndex === 0 ? 'title' : 'text';
}

function normalizeDatabaseOption(option, index = 0) {
  const rawName = typeof option === 'string' || typeof option === 'number'
    ? option
    : (option?.name ?? option?.label ?? option?.title ?? option?.value ?? option?.text ?? '');
  const name = stripHtml(getNodeHtml(rawName || '')).trim();
  if (!name) return null;
  const rawColor = isPlainObject(option)
    ? (option.color || option.backgroundColor || option.background_color || option.bgColor || option.bg_color || option.fill)
    : '';
  return {
    name,
    color: normalizeCssColor(rawColor) || databaseOptionColorPalette[index % databaseOptionColorPalette.length],
  };
}

function extractDatabaseOptionsFromField(field = {}) {
  if (!isPlainObject(field)) return [];
  const candidates = [
    field.options,
    field.select?.options,
    field.single_select?.options,
    field.singleSelect?.options,
    field.multi_select?.options,
    field.multiSelect?.options,
    field.config?.options,
    field.property?.options,
    field.settings?.options,
    field.type_options?.options,
    field.typeOptions?.options,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const options = candidate.map((item, index) => normalizeDatabaseOption(item, index)).filter(Boolean);
      if (options.length) return options;
    }
    if (isPlainObject(candidate)) {
      const options = Object.entries(candidate)
        .map(([key, item], index) => normalizeDatabaseOption(isPlainObject(item) ? { name: key, ...item } : { name: item || key }, index))
        .filter(Boolean);
      if (options.length) return options;
    }
  }
  return [];
}

function normalizeDatabaseFieldSchema(source, index = 0) {
  if (typeof source === 'string' || typeof source === 'number') {
    const name = stripHtml(getNodeHtml(source)).trim() || `字段 ${index + 1}`;
    return { key: String(source), name, type: normalizeDatabaseFieldType('', index, name), options: [] };
  }
  if (!isPlainObject(source)) return null;
  const key = String(source.id || source.key || source.property_id || source.propertyId || source.name || source.title || index);
  const name = stripHtml(getNodeHtml(source.name ?? source.title ?? source.label ?? source.text ?? key)).trim() || key || `字段 ${index + 1}`;
  const typeObject = isPlainObject(source.type) ? source.type : null;
  const rawType = typeObject?.name || typeObject?.id || typeObject?.value
    || source.type || source.property_type || source.propertyType || source.value_type || source.valueType || source.kind || source.format;
  return {
    key,
    name,
    type: normalizeDatabaseFieldType(rawType, index, name),
    options: extractDatabaseOptionsFromField(source),
  };
}

function collectDatabaseSchemaSources(node = {}) {
  if (!isPlainObject(node)) return [];
  return [
    node.properties_schema,
    node.propertiesSchema,
    node.property_schema,
    node.propertySchema,
    node.schema?.properties,
    node.schema?.columns,
    node.schema?.fields,
    node.columns,
    node.fields,
    node.table?.columns,
    node.table?.fields,
    node.table?.schema,
    node.database?.properties,
    node.database?.schema,
    node.collection?.properties,
    node.collection?.schema,
    node.data?.properties_schema,
    node.data?.propertiesSchema,
    node.data?.schema?.properties,
    node.data?.schema?.columns,
    node.data?.columns,
    node.data?.fields,
  ].filter(Boolean);
}

function extractDatabaseSchema(node = {}) {
  for (const source of collectDatabaseSchemaSources(node)) {
    let fields = [];
    if (Array.isArray(source)) {
      fields = source.map(normalizeDatabaseFieldSchema).filter(Boolean);
    } else if (isPlainObject(source)) {
      fields = Object.entries(source)
        .map(([key, value], index) => normalizeDatabaseFieldSchema(isPlainObject(value) ? { key, ...value } : { key, name: value || key }, index))
        .filter(Boolean);
    }
    if (fields.length) {
      return {
        keys: fields.map(field => field.key),
        columns: fields.map(field => field.name),
        fieldTypes: fields.map(field => field.type),
        tagOptions: fields.reduce((acc, field, index) => {
          if (field.options?.length) acc[index] = field.options;
          return acc;
        }, {}),
      };
    }
  }
  return { keys: [], columns: [], fieldTypes: [], tagOptions: {} };
}

function hasDatabaseSchema(node = {}) {
  const schema = extractDatabaseSchema(node);
  const hasSemanticField = schema.fieldTypes.some((type, index) => {
    const fallback = index === 0 ? 'title' : 'text';
    return type && type !== fallback;
  });
  return Boolean(
    Object.keys(schema.tagOptions || {}).length
    || hasSemanticField
    || node?.database
    || node?.collection
    || node?.views
    || node?.view
  );
}

function isDatabaseLikeNode(node = {}) {
  if (!isPlainObject(node)) return false;
  const hint = getNodeTypeHint(node);
  if (isDatabaseLikeTypeHint(hint)) return true;
  return hasDatabaseSchema(node) && isTableLikeTypeHint(hint);
}

function splitDatabaseTagValue(value = '') {
  return stripHtml(value)
    .split(/\s*(?:[、,，;；|]|\n)\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function inferDatabaseTagOptions(rows = [], fieldTypes = []) {
  return fieldTypes.reduce((acc, type, columnIndex) => {
    if (!['select', 'multi_select', 'person'].includes(type)) return acc;
    const options = [];
    rows.forEach(row => {
      splitDatabaseTagValue(row?.[columnIndex] || '').forEach(name => {
        if (!options.some(item => item.name === name)) options.push(normalizeDatabaseOption(name, options.length));
      });
    });
    if (options.length) acc[columnIndex] = options;
    return acc;
  }, {});
}

function collectDatabaseViewSources(node = {}) {
  if (!isPlainObject(node)) return [];
  const candidates = [
    node.view,
    node.current_view,
    node.currentView,
    node.default_view,
    node.defaultView,
    node.table?.view,
    node.table?.current_view,
    node.database?.view,
    node.database?.current_view,
    node.collection?.view,
    node.collection?.current_view,
    node.data?.view,
    node.data?.current_view,
    node,
  ];
  [
    node.views,
    node.table?.views,
    node.database?.views,
    node.collection?.views,
    node.data?.views,
  ].forEach(source => {
    if (Array.isArray(source)) candidates.push(...source);
    else if (isPlainObject(source)) candidates.push(...Object.values(source));
  });
  const seen = new Set();
  return candidates.filter(source => {
    if (!isPlainObject(source)) return false;
    const key = source.id || source.key || source.name || JSON.stringify(Object.keys(source).sort());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDatabaseFieldReference(source = {}) {
  if (!isPlainObject(source)) return source;
  const candidates = [
    source.columnIndex,
    source.column_index,
    source.fieldIndex,
    source.field_index,
    source.property_id,
    source.propertyId,
    source.property,
    source.field_id,
    source.fieldId,
    source.field,
    source.column_id,
    source.columnId,
    source.column,
    source.key,
    source.id,
    source.name,
    source.title,
  ];
  return candidates.find(candidate => candidate !== undefined && candidate !== null && candidate !== '');
}

function normalizeDatabaseReferenceText(value) {
  if (isPlainObject(value)) return normalizeDatabaseReferenceText(getDatabaseFieldReference(value));
  return stripHtml(getNodeHtml(value || '')).trim();
}

function resolveDatabaseColumnIndex(reference, schema = {}, columns = []) {
  if (reference === undefined || reference === null || reference === '') return null;
  if (typeof reference === 'number' && Number.isInteger(reference) && reference >= 0 && reference < columns.length) return reference;
  const text = normalizeDatabaseReferenceText(reference);
  if (!text) return null;
  const numericIndex = Number(text);
  if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < columns.length) return numericIndex;
  const keys = Array.isArray(schema.keys) ? schema.keys : [];
  const keyIndex = keys.findIndex(key => String(key) === text);
  if (keyIndex >= 0) return keyIndex;
  const lowerText = text.toLowerCase();
  const columnIndex = columns.findIndex(column => stripHtml(getNodeHtml(column)).trim().toLowerCase() === lowerText);
  return columnIndex >= 0 ? columnIndex : null;
}

function normalizeImportedDatabaseDirection(rule = {}) {
  const raw = String(rule.direction || rule.order || rule.sort || rule.type || '').trim().toLowerCase();
  if (rule.ascending === false || rule.asc === false || rule.descending === true || rule.desc === true) return 'desc';
  return /desc|reverse|down|9|倒|降/.test(raw) ? 'desc' : 'asc';
}

function normalizeImportedDatabaseSorts(node = {}, schema = {}, columns = []) {
  const sources = collectDatabaseViewSources(node).flatMap(view => [
    view.sorts,
    view.sort,
    view.sorters,
    view.orders,
    view.order_by,
    view.orderBy,
  ]).filter(Boolean);
  const rules = [];
  sources.forEach(source => {
    const items = Array.isArray(source) ? source : [source];
    items.forEach(rule => {
      if (!rule || typeof rule !== 'object') return;
      const columnIndex = resolveDatabaseColumnIndex(getDatabaseFieldReference(rule), schema, columns);
      if (columnIndex === null) return;
      rules.push({ columnIndex, direction: normalizeImportedDatabaseDirection(rule) });
    });
  });
  return rules;
}

function normalizeImportedDatabaseFilterValues(value) {
  const values = [];
  const pushValue = item => {
    if (item === undefined || item === null) return;
    if (Array.isArray(item)) {
      item.forEach(pushValue);
      return;
    }
    if (isPlainObject(item)) {
      const option = normalizeDatabaseOption(item, values.length);
      if (option?.name) {
        values.push(option.name);
        return;
      }
      [
        item.value,
        item.values,
        item.name,
        item.title,
        item.text,
        item.label,
      ].forEach(pushValue);
      return;
    }
    const text = stripHtml(getNodeHtml(item || '')).trim();
    if (text) values.push(text);
  };
  pushValue(value);
  return Array.from(new Set(values));
}

function normalizeImportedDatabaseFilterOperator(rule = {}) {
  const raw = String(rule.operator || rule.condition || rule.type || rule.compare || '').trim().toLowerCase();
  if (/not.*empty|is_not_empty|not_empty|不为空/.test(raw)) return 'is_not_empty';
  if (/empty|为空/.test(raw)) return 'is_empty';
  if (/not|exclude|does_not|不包含/.test(raw)) return 'not_contains_any';
  return 'contains_any';
}

function normalizeImportedDatabaseFilters(node = {}, schema = {}, columns = []) {
  const sources = collectDatabaseViewSources(node).flatMap(view => [
    view.filters,
    view.filter,
    view.conditions,
    view.where,
  ]).filter(Boolean);
  const rules = [];
  sources.forEach(source => {
    const items = Array.isArray(source) ? source : [source];
    items.forEach(rule => {
      if (!rule || typeof rule !== 'object') return;
      const nestedRules = rule.filters || rule.children || rule.rules;
      if (Array.isArray(nestedRules)) {
        nestedRules.forEach(nestedRule => {
          const columnIndex = resolveDatabaseColumnIndex(getDatabaseFieldReference(nestedRule), schema, columns);
          if (columnIndex === null) return;
          rules.push({
            columnIndex,
            operator: normalizeImportedDatabaseFilterOperator(nestedRule),
            values: normalizeImportedDatabaseFilterValues(nestedRule.values ?? nestedRule.value ?? nestedRule.option ?? nestedRule.options),
          });
        });
        return;
      }
      const columnIndex = resolveDatabaseColumnIndex(getDatabaseFieldReference(rule), schema, columns);
      if (columnIndex === null) return;
      rules.push({
        columnIndex,
        operator: normalizeImportedDatabaseFilterOperator(rule),
        values: normalizeImportedDatabaseFilterValues(rule.values ?? rule.value ?? rule.option ?? rule.options),
      });
    });
  });
  return rules;
}

function normalizeImportedDatabaseGroup(node = {}, schema = {}, columns = []) {
  const candidates = collectDatabaseViewSources(node).flatMap(view => [
    view.group,
    view.group_by,
    view.groupBy,
    view.groups,
  ]).filter(Boolean);
  for (const candidate of candidates) {
    const source = Array.isArray(candidate) ? candidate[0] : candidate;
    if (!source) continue;
    const columnIndex = resolveDatabaseColumnIndex(getDatabaseFieldReference(source), schema, columns);
    if (columnIndex === null) continue;
    const visibleValues = normalizeImportedDatabaseFilterValues(source.visibleValues || source.visible_values || source.values || source.options || source.groups);
    return {
      columnIndex,
      visibleValues,
      collapsed: {},
    };
  }
  return { columnIndex: null, visibleValues: [], collapsed: {} };
}

function getDatabaseTableName(node = {}, fallback = '') {
  const candidates = [
    node.table_name,
    node.tableName,
    node.database_name,
    node.databaseName,
    node.collection_name,
    node.collectionName,
    node.name,
    node.title,
    node.database?.name,
    node.database?.title,
    node.collection?.name,
    node.collection?.title,
    node.view?.name,
    fallback,
  ];
  for (const candidate of candidates) {
    const text = stripHtml(getNodeHtml(candidate || '')).trim();
    if (text) return text;
  }
  return '';
}

function getWolaiDatabaseBlockId(node = {}) {
  if (!isPlainObject(node)) return '';
  const candidates = [
    node.block_id,
    node.blockId,
    node.id,
    node.database_block_id,
    node.databaseBlockId,
    node.database?.block_id,
    node.database?.blockId,
    node.table?.block_id,
    node.table?.blockId,
    node.collection?.block_id,
    node.collection?.blockId,
    node.data?.block_id,
    node.data?.blockId,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return '';
}

function getWolaiDatabaseSourceUrl(node = {}, blockId = '') {
  if (!isPlainObject(node)) return buildWolaiPageUrl(blockId);
  const candidates = [
    node.url,
    node.href,
    node.link,
    node.source_url,
    node.sourceUrl,
    node.page_url,
    node.pageUrl,
    node.database?.url,
    node.database?.href,
    node.table?.url,
    node.collection?.url,
    node.data?.url,
  ];
  const source = candidates.map(item => String(item || '').trim()).find(Boolean) || '';
  return buildWolaiPageUrl(blockId, source);
}

function looksLikeGenericColumns(columns = []) {
  return columns.every((column, index) => {
    const text = stripHtml(column).trim();
    return !text || new RegExp(`^字段\\s*${index + 1}$`).test(text);
  });
}

function buildDatabaseTableMeta(node = {}, tableMeta = null, fallbackTitle = '') {
  const schema = extractDatabaseSchema(node);
  const rawRows = Array.isArray(tableMeta?.rows) ? tableMeta.rows : [];
  const databaseBlockId = getWolaiDatabaseBlockId(node);
  const sourceUrl = getWolaiDatabaseSourceUrl(node, databaseBlockId);
  let rows = rawRows.map(row => (Array.isArray(row) ? row : []));
  let columns = schema.columns.length
    ? schema.columns
    : (Array.isArray(tableMeta?.columns) && tableMeta.columns.length ? tableMeta.columns : []);
  if (schema.columns.length && rows.length) {
    const firstRowText = rows[0].map(cell => stripHtml(cell).trim()).join('|');
    const schemaText = schema.columns.map(cell => stripHtml(cell).trim()).join('|');
    if (firstRowText && firstRowText === schemaText) rows = rows.slice(1);
  }
  if (!schema.columns.length && rows.length && (!columns.length || looksLikeGenericColumns(columns))) {
    columns = rows[0].map((cell, index) => stripHtml(cell).trim() || `字段 ${index + 1}`);
    rows = rows.slice(1);
  }
  const columnCount = Math.max(
    columns.length,
    ...rows.map(row => row.length),
    1
  );
  const normalizedColumns = Array.from({ length: columnCount }, (_, index) => {
    const name = stripHtml(columns[index] || '').trim();
    return name || (index === 0 ? '标题' : `字段 ${index + 1}`);
  });
  const normalizedRows = rows.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || ''));
  const fieldTypes = Array.from({ length: columnCount }, (_, index) => (
    normalizeDatabaseFieldType(schema.fieldTypes[index], index, normalizedColumns[index])
  ));
  const inferredTagOptions = inferDatabaseTagOptions(normalizedRows, fieldTypes);
  const tagOptions = {
    ...inferredTagOptions,
    ...(schema.tagOptions || {}),
  };
  const rowDataUnavailable = Boolean(
    databaseBlockId
    && isDatabaseLikeNode(node)
    && !hasMeaningfulTableRows(normalizedRows)
  );
  const importedSorts = normalizeImportedDatabaseSorts(node, schema, normalizedColumns);
  const importedFilters = normalizeImportedDatabaseFilters(node, schema, normalizedColumns);
  const importedGroup = normalizeImportedDatabaseGroup(node, schema, normalizedColumns);
  const columnWidths = Array.isArray(tableMeta?.columnWidths) && tableMeta.columnWidths.length
    ? Array.from({ length: columnCount }, (_, index) => Math.max(120, Number(tableMeta.columnWidths[index]) || (index === 0 ? 220 : 200)))
    : Array.from({ length: columnCount }, (_, index) => (index === 0 ? 220 : 200));
  return {
    ...(tableMeta || {}),
    tableName: getDatabaseTableName(node, fallbackTitle),
    columns: normalizedColumns,
    rows: rowDataUnavailable ? [] : (normalizedRows.length ? normalizedRows : [normalizedColumns.map(() => '')]),
    view: 'table',
    fieldTypes,
    tagOptions,
    columnWidths,
    columnColors: tableMeta?.columnColors || {},
    titleColorColumns: tableMeta?.titleColorColumns || {},
    sorts: importedSorts.length ? importedSorts : (Array.isArray(tableMeta?.sorts) ? tableMeta.sorts : []),
    filters: importedFilters.length ? importedFilters : (Array.isArray(tableMeta?.filters) ? tableMeta.filters : []),
    group: importedGroup.columnIndex !== null ? importedGroup : (tableMeta?.group || { columnIndex: null, visibleValues: [], collapsed: {} }),
    source_system: 'wolai_mcp',
    ...(databaseBlockId ? {
      wolaiDatabaseBlockId: databaseBlockId,
      source_url: sourceUrl,
      embedUrl: sourceUrl,
      liveEmbed: rowDataUnavailable,
      externalEmbed: rowDataUnavailable,
      rowDataUnavailable,
    } : {}),
  };
}

function collectWolaiDatabaseViewsFromPayload(payload, blockId = '') {
  const data = payload?.data || payload || {};
  const viewsByBlock = data.views || data.block_views || data.blockViews || data.block_database_views || data.blockDatabaseViews;
  const candidates = [];
  const pushViews = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      candidates.push(...value.filter(isPlainObject));
      return;
    }
    if (isPlainObject(value)) {
      if (Array.isArray(value.views)) pushViews(value.views);
      else candidates.push(value);
    }
  };
  if (blockId && isPlainObject(viewsByBlock)) pushViews(viewsByBlock[blockId]);
  pushViews(Array.isArray(viewsByBlock) ? viewsByBlock : null);
  pushViews(data[blockId]);
  pushViews(data.database_views || data.databaseViews);
  pushViews(payload?.views);

  const seen = new Set();
  return candidates.filter(view => {
    const id = String(view.view_id || view.viewId || view.id || view._id || JSON.stringify(view).slice(0, 80));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function choosePrimaryWolaiDatabaseView(views = []) {
  const activeViews = views.filter(view => view.status === undefined || Number(view.status) !== 0);
  return activeViews.find(view => String(view.type || '').toLowerCase() === 'table')
    || activeViews[0]
    || views[0]
    || null;
}

function countWolaiDatabaseFilters(filters) {
  if (!filters) return 0;
  if (Array.isArray(filters)) return filters.reduce((sum, item) => sum + countWolaiDatabaseFilters(item), 0);
  if (isPlainObject(filters)) {
    if (Array.isArray(filters.filters)) return countWolaiDatabaseFilters(filters.filters);
    if (Array.isArray(filters.children)) return countWolaiDatabaseFilters(filters.children);
    if (filters.property_id || filters.propertyId || filters.property || filters.operator) return 1;
  }
  return 0;
}

function normalizeWolaiDatabaseViewMeta(view = {}, blockId = '', sourceUrl = '') {
  const sorters = Array.isArray(view.sorters || view.sorts) ? (view.sorters || view.sorts) : [];
  const properties = Array.isArray(view.properties) ? view.properties : [];
  const groupSource = view.grouping || view.group || view.group_by || view.groupBy || {};
  const groupPropertyId = String(groupSource.property || groupSource.property_id || groupSource.propertyId || '').trim();
  const groupColumns = Array.isArray(view.columns) ? view.columns : [];
  const visibleGroups = groupColumns
    .filter(item => isPlainObject(item) && item.hidden !== true)
    .map(item => ({
      propertyId: String(item.property_id || item.propertyId || groupPropertyId || '').trim(),
      optionId: String(item.option_id || item.optionId || '').trim(),
      value: stripHtml(getNodeHtml(item.value ?? item.name ?? item.title ?? item.label ?? '')).trim(),
      sorter: stripHtml(getNodeHtml(item.sorter ?? '')).trim(),
    }))
    .filter(item => item.value || item.optionId);
  const visibleProperties = properties.map(item => ({
    id: String(item.id || item.property_id || item.propertyId || '').trim(),
    hidden: item.hidden === true,
    width: Number(item.width) || 0,
  })).filter(item => item.id);
  const viewTitle = stripHtml(getNodeHtml(view.title || view.name || '')).trim();
  return {
    wolaiDatabaseBlockId: blockId,
    wolaiTableId: String(view.table_id || view.tableId || '').trim(),
    wolaiViewId: String(view.view_id || view.viewId || view.id || view._id || '').trim(),
    wolaiViewTitle: viewTitle,
    wolaiViewType: String(view.type || '').trim() || 'table',
    wolaiViewVersion: Number(view.version) || 0,
    wolaiViewProperties: visibleProperties,
    wolaiViewGroups: visibleGroups,
    wolaiViewSorters: sorters.map(item => ({
      propertyId: String(item.property_id || item.propertyId || item.property || '').trim(),
      direction: String(item.direction || item.order || '').trim() || 'asc',
    })).filter(item => item.propertyId),
    wolaiViewFilterCount: countWolaiDatabaseFilters(view.filters || view.filter),
    wolaiViewPropertyCount: visibleProperties.filter(item => !item.hidden).length,
    wolaiViewGroupCount: visibleGroups.length,
    wolaiViewSorterCount: sorters.length,
    wolaiGroupPropertyId: groupPropertyId,
    embedUrl: buildWolaiPageUrl(blockId, sourceUrl),
    source_url: buildWolaiPageUrl(blockId, sourceUrl),
    liveEmbed: true,
    externalEmbed: true,
    rowDataUnavailable: true,
  };
}

function getWolaiApiData(payload = {}) {
  return payload?.data || payload || {};
}

function collectArrayOrObjectValues(value) {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) return Object.values(value);
  return [];
}

function collectWolaiTableViewsFromMetaPayload(payload = {}) {
  const data = getWolaiApiData(payload);
  const candidates = [
    data.views,
    data.table?.views,
    data.database?.views,
    data.collection?.views,
  ];
  return candidates.flatMap(collectArrayOrObjectValues).filter(isPlainObject);
}

function getWolaiTableObjectFromMetaPayload(payload = {}) {
  const data = getWolaiApiData(payload);
  return data.table || data.database || data.collection || data;
}

function chooseWolaiTableMetaView(views = [], preferredViewId = '') {
  const normalizedPreferredId = String(preferredViewId || '').trim();
  const activeViews = views.filter(view => view.status === undefined || Number(view.status) !== 0);
  return (normalizedPreferredId
    ? activeViews.find(view => String(view.view_id || view.viewId || view.id || view._id || '').trim() === normalizedPreferredId)
    : null)
    || activeViews.find(view => String(view.type || '').toLowerCase() === 'table')
    || activeViews[0]
    || views[0]
    || null;
}

function getWolaiViewPropertyItems(view = {}) {
  const source = view?.properties || view?.fields || view?.columns_properties || view?.columnsProperties;
  if (Array.isArray(source)) {
    return source.map(item => ({
      id: String(item?.id || item?.property_id || item?.propertyId || item?.key || '').trim(),
      hidden: item?.hidden === true || item?.visible === false,
      width: Number(item?.width || item?.column_width || item?.columnWidth) || 0,
    })).filter(item => item.id);
  }
  if (isPlainObject(source)) {
    return Object.entries(source).map(([id, item]) => ({
      id: String(item?.id || item?.property_id || item?.propertyId || id).trim(),
      hidden: item?.hidden === true || item?.visible === false,
      width: Number(item?.width || item?.column_width || item?.columnWidth) || 0,
    })).filter(item => item.id);
  }
  return [];
}

function normalizeWolaiTableOption(option, index = 0) {
  const normalized = normalizeDatabaseOption(option, index);
  if (!normalized) return null;
  const id = isPlainObject(option)
    ? String(option.id || option.option_id || option.optionId || option.key || option.value || normalized.name || '').trim()
    : String(option || normalized.name || '').trim();
  return {
    ...normalized,
    id: id || normalized.name,
  };
}

function extractWolaiTablePropertyOptions(property = {}) {
  if (!isPlainObject(property)) return [];
  const candidates = [
    property.options,
    property.select?.options,
    property.single_select?.options,
    property.singleSelect?.options,
    property.multi_select?.options,
    property.multiSelect?.options,
    property.status?.options,
    property.config?.options,
    property.type_options?.options,
    property.typeOptions?.options,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const options = candidate.map((item, index) => normalizeWolaiTableOption(item, index)).filter(Boolean);
      if (options.length) return options;
    }
    if (isPlainObject(candidate)) {
      const options = Object.entries(candidate)
        .map(([key, item], index) => normalizeWolaiTableOption(isPlainObject(item) ? { id: key, ...item } : { id: key, name: item || key }, index))
        .filter(Boolean);
      if (options.length) return options;
    }
  }
  return [];
}

function normalizeWolaiTableProperty(rawProperty, propertyId = '', index = 0) {
  const property = isPlainObject(rawProperty) ? rawProperty : { name: rawProperty };
  const id = String(property.id || property.property_id || property.propertyId || property.key || propertyId || index).trim();
  const name = stripHtml(getNodeHtml(property.name ?? property.title ?? property.label ?? property.text ?? propertyId ?? id)).trim() || `字段 ${index + 1}`;
  const typeObject = isPlainObject(property.type) ? property.type : null;
  const rawType = typeObject?.name || typeObject?.id || typeObject?.value
    || property.type
    || property.property_type
    || property.propertyType
    || property.value_type
    || property.valueType
    || property.kind
    || property.format;
  const options = extractWolaiTablePropertyOptions(property);
  const optionMap = new Map();
  options.forEach(option => {
    optionMap.set(String(option.id || '').trim(), option.name);
    optionMap.set(String(option.name || '').trim(), option.name);
  });
  return {
    id,
    name,
    type: normalizeDatabaseFieldType(rawType, index, name),
    options,
    optionMap,
    raw: property,
  };
}

function collectWolaiTablePropertiesFromMetaPayload(payload = {}) {
  const table = getWolaiTableObjectFromMetaPayload(payload);
  const source = table.properties || table.property_schema || table.propertySchema || table.schema?.properties || table.fields || table.columns;
  if (Array.isArray(source)) {
    return source.map((item, index) => normalizeWolaiTableProperty(item, item?.id || item?.property_id || item?.propertyId || item?.key || '', index)).filter(item => item.id);
  }
  if (isPlainObject(source)) {
    return Object.entries(source)
      .map(([id, item], index) => normalizeWolaiTableProperty(item, id, index))
      .filter(item => item.id);
  }
  return [];
}

function orderWolaiTableProperties(properties = [], view = {}) {
  const propertyById = new Map(properties.map(property => [property.id, property]));
  const viewPropertyItems = getWolaiViewPropertyItems(view);
  const ordered = [];
  const used = new Set();
  viewPropertyItems.forEach(item => {
    if (item.hidden || !propertyById.has(item.id)) return;
    ordered.push({
      ...propertyById.get(item.id),
      width: item.width,
    });
    used.add(item.id);
  });
  properties.forEach(property => {
    if (!used.has(property.id)) ordered.push(property);
  });
  return ordered;
}

function getWolaiTableTitle(table = {}, view = {}, fallback = '') {
  const candidates = [
    view?.title,
    view?.name,
    table?.title,
    table?.name,
    table?.table_name,
    table?.tableName,
    table?.database_name,
    table?.databaseName,
    fallback,
  ];
  for (const candidate of candidates) {
    const text = stripHtml(getNodeHtml(candidate || '')).trim();
    if (text) return text;
  }
  return '';
}

function getWolaiTablePropertyReference(value = {}) {
  if (!isPlainObject(value)) return value;
  return value.property_id || value.propertyId || value.property || value.field_id || value.fieldId || value.field || value.id || value.key;
}

function normalizeWolaiTableSorts(view = {}, propertyIndexById = new Map()) {
  const sorters = Array.isArray(view.sorters || view.sorts) ? (view.sorters || view.sorts) : [];
  return sorters.map(rule => {
    const propertyId = String(getWolaiTablePropertyReference(rule) || '').trim();
    if (!propertyIndexById.has(propertyId)) return null;
    return {
      columnIndex: propertyIndexById.get(propertyId),
      direction: normalizeImportedDatabaseDirection(rule),
    };
  }).filter(Boolean);
}

function normalizeWolaiTableGroup(view = {}, properties = [], propertyIndexById = new Map()) {
  const groupSource = view.grouping || view.group || view.group_by || view.groupBy || {};
  const groupColumns = Array.isArray(view.columns) ? view.columns : [];
  const inferredColumnPropertyId = groupColumns
    .map(item => String(item?.property_id || item?.propertyId || item?.property || '').trim())
    .find(Boolean) || '';
  const propertyId = String(getWolaiTablePropertyReference(groupSource) || inferredColumnPropertyId || '').trim();
  if (!propertyId || !propertyIndexById.has(propertyId)) return { columnIndex: null, visibleValues: [], collapsed: {} };
  const visibleValues = groupColumns
    .filter(item => isPlainObject(item) && item.hidden !== true)
    .filter(item => {
      const itemPropertyId = String(item.property_id || item.propertyId || item.property || propertyId).trim();
      return itemPropertyId === propertyId;
    })
    .map(item => stripHtml(getNodeHtml(item.value ?? item.name ?? item.title ?? item.label ?? '')).trim())
    .filter(Boolean);
  const property = properties.find(item => item.id === propertyId);
  const fallbackValues = property?.options?.map(option => option.name).filter(Boolean) || [];
  return {
    columnIndex: propertyIndexById.get(propertyId),
    visibleValues: visibleValues.length ? visibleValues : fallbackValues,
    collapsed: {},
  };
}

function getWolaiRowPropertySource(row = {}) {
  if (!isPlainObject(row)) return row;
  return row.properties
    || row.property_values
    || row.propertyValues
    || row.values
    || row.cells
    || row.data
    || row;
}

function pickWolaiRowPropertyValue(row = {}, property = {}, columnIndex = 0) {
  const source = getWolaiRowPropertySource(row);
  if (Array.isArray(source)) return source[columnIndex];
  if (!isPlainObject(source)) return undefined;
  return source[property.id]
    ?? source[property.name]
    ?? source[property.raw?.name]
    ?? source[property.raw?.id]
    ?? source[property.raw?.property_id]
    ?? source[property.raw?.propertyId];
}

function renderWolaiDatabaseCellValue(value, property = {}) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    const parts = value.map(item => renderWolaiDatabaseCellValue(item, property)).filter(item => stripHtml(item).trim());
    return ['select', 'multi_select', 'person'].includes(property.type) ? parts.map(stripHtml).join('、') : parts.join('<br>');
  }
  if (isPlainObject(value)) {
    const optionId = String(value.option_id || value.optionId || value.id || value.key || '').trim();
    if (optionId && property.optionMap?.has(optionId)) return escapeHtml(property.optionMap.get(optionId));
    const dateValue = value.start_date || value.startDate || value.date || value.start || value.timestamp;
    if (dateValue && property.type === 'date') return escapeHtml(String(dateValue).slice(0, 10));
    if (value.checked !== undefined && property.type === 'checkbox') return value.checked ? 'true' : '';
    const directValue = value.value ?? value.name ?? value.title ?? value.label ?? value.text ?? value.plain_text ?? value.plainText;
    if (directValue !== undefined && directValue !== value) return renderWolaiDatabaseCellValue(directValue, property);
    const html = getNodeHtml(value);
    return stripHtml(html).trim() ? html : '';
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (property.optionMap?.has(text)) return escapeHtml(property.optionMap.get(text));
  return escapeHtml(text);
}

function collectWolaiDatabaseRowsFromPayload(payload = {}) {
  const data = getWolaiApiData(payload);
  const candidates = [
    data.rows,
    data.records,
    data.items,
    data.list,
    data.data,
    Array.isArray(data) ? data : null,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isPlainObject);
    if (isPlainObject(candidate)) {
      const values = Object.values(candidate).filter(isPlainObject);
      if (values.length) return values;
    }
  }
  return [];
}

function getWolaiPayloadValueByKeys(source = {}, keys = []) {
  if (!isPlainObject(source)) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
}

function getWolaiRowsPaginationInfo(payload = {}) {
  const data = getWolaiApiData(payload);
  const pagination = data.pagination || data.pageInfo || data.page_info || data.meta || {};
  const nextCursor = String(getWolaiPayloadValueByKeys(data, [
    'next_cursor', 'nextCursor', 'cursor', 'next_page_token', 'nextPageToken', 'page_token', 'pageToken',
  ]) || getWolaiPayloadValueByKeys(pagination, [
    'next_cursor', 'nextCursor', 'cursor', 'next_page_token', 'nextPageToken', 'page_token', 'pageToken',
  ]) || '').trim();
  const hasMoreValue = getWolaiPayloadValueByKeys(data, ['has_more', 'hasMore', 'has_next', 'hasNext', 'more'])
    ?? getWolaiPayloadValueByKeys(pagination, ['has_more', 'hasMore', 'has_next', 'hasNext', 'more']);
  const total = Number(getWolaiPayloadValueByKeys(data, [
    'total', 'total_count', 'totalCount', 'row_count', 'rowCount', 'rows_count', 'rowsCount', 'count',
  ]) ?? getWolaiPayloadValueByKeys(pagination, [
    'total', 'total_count', 'totalCount', 'row_count', 'rowCount', 'rows_count', 'rowsCount', 'count',
  ]));
  return {
    nextCursor,
    hasMore: hasMoreValue === true || hasMoreValue === 'true' || hasMoreValue === 1 || hasMoreValue === '1',
    total: Number.isFinite(total) && total > 0 ? total : 0,
  };
}

function getWolaiDatabaseRowId(row = {}) {
  if (!isPlainObject(row)) return '';
  return String(row.id || row.row_id || row.rowId || row.record_id || row.recordId || row.block_id || row.blockId || row.uuid || '').trim();
}

function getWolaiDatabaseRowsPageSignature(rows = []) {
  return rows
    .slice(0, 5)
    .map(row => getWolaiDatabaseRowId(row) || sha256(JSON.stringify(row || {})).slice(0, 16))
    .join('|');
}

function buildWolaiRowsPayload(basePayload = {}, rows = [], total = 0) {
  const data = getWolaiApiData(basePayload);
  return {
    ...basePayload,
    data: {
      ...(isPlainObject(data) ? data : {}),
      rows,
      total: total || rows.length,
      imported_rows_count: rows.length,
    },
  };
}

function appendUniqueWolaiRows(targetRows = [], sourceRows = [], seenRowIds = new Set()) {
  let added = 0;
  sourceRows.forEach(row => {
    const rowId = getWolaiDatabaseRowId(row);
    if (rowId) {
      if (seenRowIds.has(rowId)) return;
      seenRowIds.add(rowId);
    }
    targetRows.push(row);
    added += 1;
  });
  return added;
}

function normalizeWolaiDatabaseRowsFromPayload(payload = {}, properties = []) {
  const rawRows = collectWolaiDatabaseRowsFromPayload(payload);
  return rawRows.map(row => (
    properties.map((property, columnIndex) => renderWolaiDatabaseCellValue(pickWolaiRowPropertyValue(row, property, columnIndex), property))
  )).filter(row => row.some(cell => stripHtml(cell).trim()));
}

function buildWolaiDatabaseMetaFromTablePayload(payload = {}, options = {}) {
  const table = getWolaiTableObjectFromMetaPayload(payload);
  const views = collectWolaiTableViewsFromMetaPayload(payload);
  const view = chooseWolaiTableMetaView(views, options.viewId);
  const allProperties = collectWolaiTablePropertiesFromMetaPayload(payload);
  const properties = orderWolaiTableProperties(allProperties, view || {});
  if (!properties.length) return null;
  const propertyIndexById = new Map(properties.map((property, index) => [property.id, index]));
  const columns = properties.map(property => property.name);
  const schema = { keys: properties.map(property => property.id) };
  const columnWidths = properties.map((property, index) => Math.max(120, Number(property.width) || (index === 0 ? 220 : 200)));
  const viewMeta = view ? normalizeWolaiDatabaseViewMeta(view, options.blockId, options.sourceUrl) : {};
  const filters = view ? normalizeImportedDatabaseFilters({ view }, schema, columns) : [];
  const group = view ? normalizeWolaiTableGroup(view, properties, propertyIndexById) : { columnIndex: null, visibleValues: [], collapsed: {} };
  return {
    meta: {
      ...(options.fallbackMeta || {}),
      source_system: 'wolai_mcp',
      tableName: getWolaiTableTitle(table, view || {}, options.fallbackTitle),
      columns,
      rows: [],
      view: 'table',
      fieldTypes: properties.map(property => property.type),
      tagOptions: properties.reduce((acc, property, index) => {
        if (property.options?.length) acc[index] = property.options;
        return acc;
      }, {}),
      columnWidths,
      columnColors: options.fallbackMeta?.columnColors || {},
      titleColorColumns: options.fallbackMeta?.titleColorColumns || {},
      sorts: normalizeWolaiTableSorts(view || {}, propertyIndexById),
      filters,
      group,
      wolaiPropertyIds: properties.map(property => property.id),
      wolaiRowsCount: Number(table.rows_count || table.rowsCount || 0) || 0,
      wolaiTableId: String(view?.table_id || view?.tableId || options.tableId || options.fallbackMeta?.wolaiTableId || '').trim(),
      ...viewMeta,
      source_url: buildWolaiPageUrl(options.blockId, options.sourceUrl),
      embedUrl: buildWolaiPageUrl(options.blockId, options.sourceUrl),
      liveEmbed: false,
      externalEmbed: false,
      rowDataUnavailable: true,
    },
    properties,
  };
}

async function fetchWolaiDatabaseTableMeta(token = '', tableId = '', blockId = '') {
  if (!token || !tableId) return null;
  return wolaiApiRequest(token, 'database/tableMeta', {
    query: {
      table_id: tableId,
      block_id: blockId,
    },
  });
}

async function fetchWolaiDatabaseRowsPage(token = '', tableId = '', query = {}) {
  if (!token || !tableId) return null;
  return wolaiApiRequest(token, 'database/rows', {
    query: {
      table_id: tableId,
      timezoneOffset: -480,
      ...query,
    },
  });
}

async function fetchWolaiDatabaseRows(token = '', tableId = '', options = {}) {
  if (!token || !tableId) return null;
  const expectedRows = Math.max(0, Number(options.expectedRows || 0) || 0);
  const firstPayload = await fetchWolaiDatabaseRowsPage(token, tableId, {
    limit: Number.MAX_SAFE_INTEGER,
    snapshot: '',
  });
  const firstRows = collectWolaiDatabaseRowsFromPayload(firstPayload);
  const firstPagination = getWolaiRowsPaginationInfo(firstPayload);
  debugWolaiImport('database rows first result', {
    tableId,
    rows: firstRows.length,
    expectedRows,
    pagination: firstPagination,
  });
  if (!firstRows.length) return firstPayload;
  if (!expectedRows || firstRows.length >= expectedRows) {
    return buildWolaiRowsPayload(firstPayload, firstRows, firstPagination.total || expectedRows || firstRows.length);
  }

  const pageSize = Math.min(100, Math.max(50, expectedRows || 50));
  const maxPages = Number(process.env.WOLAI_ROWS_MAX_PAGES || 200);
  const allRows = [...firstRows];
  const seenRowIds = new Set();
  firstRows.forEach(row => {
    const rowId = getWolaiDatabaseRowId(row);
    if (rowId) seenRowIds.add(rowId);
  });
  const seenPageSignatures = new Set();
  const firstSignature = getWolaiDatabaseRowsPageSignature(firstRows);
  if (firstSignature) seenPageSignatures.add(firstSignature);
  let lastPayload = firstPayload;
  let offset = firstRows.length;
  let nextCursor = firstPagination.nextCursor || '';
  let total = firstPagination.total || expectedRows || 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (expectedRows && allRows.length >= expectedRows) break;
    const queryCandidates = nextCursor
      ? {
        cursor: [
          { limit: pageSize, cursor: nextCursor },
          { limit: pageSize, start_cursor: nextCursor },
          { limit: pageSize, startCursor: nextCursor },
          { limit: pageSize, page_token: nextCursor },
          { limit: pageSize, pageToken: nextCursor },
        ],
      }
      : {
        offset: [
          { limit: pageSize, offset },
          { limit: pageSize, start: offset },
          { limit: pageSize, skip: offset },
          { limit: pageSize, page: pageIndex + 2 },
        ],
      };
    const candidates = nextCursor ? queryCandidates.cursor : queryCandidates.offset;
    let accepted = false;
    for (const query of candidates) {
      debugWolaiImport('fetch database rows page', { tableId, pageIndex: pageIndex + 2, query });
      // eslint-disable-next-line no-await-in-loop
      const payload = await fetchWolaiDatabaseRowsPage(token, tableId, query);
      lastPayload = payload;
      const pageRows = collectWolaiDatabaseRowsFromPayload(payload);
      const pagination = getWolaiRowsPaginationInfo(payload);
      debugWolaiImport('database rows page result', {
        tableId,
        pageIndex: pageIndex + 2,
        rows: pageRows.length,
        pagination,
      });
      if (!pageRows.length) continue;
      const pageSignature = getWolaiDatabaseRowsPageSignature(pageRows);
      if (pageSignature && seenPageSignatures.has(pageSignature)) continue;
      if (pageSignature) seenPageSignatures.add(pageSignature);
      const added = appendUniqueWolaiRows(allRows, pageRows, seenRowIds);
      if (!added) continue;
      if (pagination.total) total = Math.max(total, pagination.total);
      if (pagination.nextCursor && pagination.nextCursor !== nextCursor) nextCursor = pagination.nextCursor;
      else nextCursor = '';
      offset = allRows.length;
      accepted = true;
      break;
    }
    if (!accepted) break;
    const shouldContinue = nextCursor
      || (total > 0 && allRows.length < total)
      || (expectedRows > 0 && allRows.length < expectedRows);
    if (!shouldContinue) break;
  }

  debugWolaiImport('database rows combined', {
    tableId,
    rows: allRows.length,
    total,
    expectedRows,
  });
  return buildWolaiRowsPayload(lastPayload || firstPayload, allRows, total || expectedRows || allRows.length);
}

function getWolaiImportedRowsNotice(importedRows = 0, expectedRows = 0) {
  const imported = Number(importedRows) || 0;
  const expected = Number(expectedRows) || 0;
  if (expected > 0 && imported > 0 && imported < expected) {
    return `Wolai 数据表格行数据未完整返回，只导入 ${imported}/${expected} 行，请检查 Token 是否具备数据库行读取权限`;
  }
  if (expected > 0 && imported <= 0) {
    return `Wolai 数据表格行数据接口未授权或未返回记录，当前应有 ${expected} 行，请检查 Token 是否具备数据库行读取权限`;
  }
  return '';
}

function makeWolaiDatabaseRowsBlockingError(message = '') {
  const error = new Error(message || 'Wolai 数据表格行数据未完整返回');
  error.isWolaiDatabaseRowsBlocking = true;
  return error;
}

function isWolaiDatabaseRowsBlockingError(error) {
  return Boolean(error?.isWolaiDatabaseRowsBlocking);
}

function databaseMetaNeedsWolaiLiveEmbed(meta = {}) {
  if (meta.source_system !== 'wolai_mcp') return false;
  if (!meta.wolaiDatabaseBlockId) return false;
  if (meta.rowDataUnavailable || meta.liveEmbed || meta.externalEmbed) return true;
  return !hasMeaningfulTableRows(meta.rows);
}

async function enrichWolaiDatabaseBlocks(blocks = [], token = '') {
  const targets = blocks
    .filter(block => block?.type === 'database-embed' && databaseMetaNeedsWolaiLiveEmbed(block.meta || {}))
    .map(block => String(block.meta?.wolaiDatabaseBlockId || '').trim())
    .filter(Boolean);
  const blockIds = Array.from(new Set(targets));
  if (!blockIds.length) return { blocks, warnings: [] };

  let payload = null;
  try {
    debugWolaiImport('fetch block database views', { blockIds });
    payload = await wolaiApiRequest(token, 'database/blockDatabaseViews', {
      method: 'POST',
      body: {
        block_ids: blockIds,
        timezoneOffset: -480,
      },
    });
  } catch (error) {
    const nextBlocks = blocks.map(block => {
      if (block?.type !== 'database-embed' || !databaseMetaNeedsWolaiLiveEmbed(block.meta || {})) return block;
      const blockId = String(block.meta?.wolaiDatabaseBlockId || '').trim();
      const sourceUrl = buildWolaiPageUrl(blockId, block.meta?.source_url || block.meta?.embedUrl);
      return {
        ...block,
        meta: {
          ...(block.meta || {}),
          source_url: sourceUrl,
          embedUrl: sourceUrl,
          liveEmbed: false,
          externalEmbed: false,
          rowDataUnavailable: true,
        },
      };
    });
    return {
      blocks: nextBlocks,
      warnings: [`Wolai 数据表格视图元数据读取失败：${error.message || '未知错误'}，已显示为本地表格结构`],
    };
  }

  let enrichedCount = 0;
  let tableMetaCount = 0;
  let importedRowCount = 0;
  let rowDataUnavailableCount = 0;
  let rowDataIncompleteCount = 0;
  const detailWarnings = [];
  const blockingErrors = [];
  const nextBlocks = [];
  for (const block of blocks) {
    if (block?.type !== 'database-embed' || !databaseMetaNeedsWolaiLiveEmbed(block.meta || {})) {
      nextBlocks.push(block);
      continue;
    }
    const blockId = String(block.meta?.wolaiDatabaseBlockId || '').trim();
    const sourceUrl = buildWolaiPageUrl(blockId, block.meta?.source_url || block.meta?.embedUrl);
    const views = collectWolaiDatabaseViewsFromPayload(payload, blockId);
    const primaryView = choosePrimaryWolaiDatabaseView(views);
    const viewMeta = primaryView ? normalizeWolaiDatabaseViewMeta(primaryView, blockId, sourceUrl) : {};
    if (primaryView) enrichedCount += 1;
    let nextMeta = {
      ...(block.meta || {}),
      source_url: sourceUrl,
      embedUrl: sourceUrl,
      ...viewMeta,
      liveEmbed: false,
      externalEmbed: false,
      rowDataUnavailable: true,
    };
    const tableId = String(nextMeta.wolaiTableId || block.meta?.wolaiTableId || '').trim();
    debugWolaiImport('database block meta', {
      blockId,
      tableId,
      viewId: nextMeta.wolaiViewId || '',
      rowsCount: nextMeta.wolaiRowsCount || 0,
    });
    if (tableId) {
      try {
        debugWolaiImport('fetch table meta', { tableId, blockId });
        const tablePayload = await fetchWolaiDatabaseTableMeta(token, tableId, blockId);
        const tableBuild = buildWolaiDatabaseMetaFromTablePayload(tablePayload, {
          blockId,
          sourceUrl,
          tableId,
          viewId: nextMeta.wolaiViewId,
          fallbackMeta: nextMeta,
          fallbackTitle: nextMeta.tableName || nextMeta.wolaiViewTitle || '',
        });
        if (tableBuild?.meta) {
          tableMetaCount += 1;
          nextMeta = {
            ...nextMeta,
            ...tableBuild.meta,
          };
          try {
            const expectedRows = Number(nextMeta.wolaiRowsCount || 0) || 0;
            debugWolaiImport('fetch table rows start', { tableId, expectedRows });
            const rowsPayload = await fetchWolaiDatabaseRows(token, tableId, { expectedRows });
            const importedRows = normalizeWolaiDatabaseRowsFromPayload(rowsPayload, tableBuild.properties || []);
            const rowDataIncomplete = Boolean(expectedRows && importedRows.length > 0 && importedRows.length < expectedRows);
            debugWolaiImport('fetch table rows normalized', {
              tableId,
              importedRows: importedRows.length,
              expectedRows,
              rowDataIncomplete,
            });
            if (importedRows.length) {
              importedRowCount += importedRows.length;
              if (rowDataIncomplete) {
                rowDataIncompleteCount += 1;
                rowDataUnavailableCount += 1;
                const notice = getWolaiImportedRowsNotice(importedRows.length, expectedRows);
                if (notice) {
                  detailWarnings.push(notice);
                  blockingErrors.push(notice);
                }
              }
              nextMeta = {
                ...nextMeta,
                rows: importedRows,
                wolaiImportedRowsCount: importedRows.length,
                rowDataExpectedCount: expectedRows || importedRows.length,
                rowDataIncomplete,
                rowDataUnavailable: rowDataIncomplete,
                liveEmbed: false,
                externalEmbed: false,
              };
            } else if (!Number(nextMeta.wolaiRowsCount || 0)) {
              nextMeta = {
                ...nextMeta,
                rows: [],
                wolaiImportedRowsCount: 0,
                rowDataExpectedCount: 0,
                rowDataIncomplete: false,
                rowDataUnavailable: false,
                liveEmbed: false,
                externalEmbed: false,
              };
            } else {
              rowDataUnavailableCount += 1;
              const notice = getWolaiImportedRowsNotice(0, expectedRows);
              if (notice) {
                detailWarnings.push(notice);
                blockingErrors.push(notice);
              }
              nextMeta = {
                ...nextMeta,
                wolaiImportedRowsCount: 0,
                rowDataExpectedCount: expectedRows,
                rowDataIncomplete: false,
                rowDataUnavailable: true,
                liveEmbed: false,
                externalEmbed: false,
              };
            }
          } catch (error) {
            debugWolaiImport('fetch table rows failed', { tableId, message: error.message || String(error) });
            rowDataUnavailableCount += 1;
            const expectedRows = Number(nextMeta.wolaiRowsCount || 0) || 0;
            const notice = getWolaiImportedRowsNotice(0, expectedRows);
            const errorNotice = notice
              ? `${notice}：${error.message || '未知错误'}`
              : `Wolai 数据表格行数据读取失败：${error.message || '未知错误'}`;
            detailWarnings.push(errorNotice);
            blockingErrors.push(errorNotice);
            nextMeta = {
              ...nextMeta,
              wolaiImportedRowsCount: 0,
              rowDataExpectedCount: expectedRows,
              rowDataIncomplete: false,
              liveEmbed: false,
              externalEmbed: false,
              rowDataUnavailable: true,
            };
          }
        }
      } catch (error) {
        detailWarnings.push(`Wolai 数据表格字段元数据读取失败：${error.message || '未知错误'}`);
      }
    }
    nextBlocks.push({
      ...block,
      meta: nextMeta,
    });
  }
  const warnings = [];
  if (importedRowCount > 0) warnings.push(`Wolai 数据表格已导入 ${importedRowCount} 行记录`);
  if (rowDataIncompleteCount > 0) {
    warnings.push('Wolai 数据表格存在未完整导入的行数据，已保留已读取记录并标记为不完整');
  }
  if (tableMetaCount > 0 && rowDataUnavailableCount > 0) {
    warnings.push('Wolai 数据表格行数据接口未授权或未返回完整记录，已导入字段/选项/视图并显示为本地表格结构');
  }
  warnings.push(...Array.from(new Set(detailWarnings.filter(Boolean))));
  if (!warnings.length) {
    warnings.push(enrichedCount
      ? 'Wolai 数据表格行数据未通过 MCP 返回，已显示为本地表格结构'
      : 'Wolai 数据表格行数据未通过 MCP 返回，已保留原表链接');
  }
  return {
    blocks: nextBlocks,
    warnings,
    errors: Array.from(new Set(blockingErrors.filter(Boolean))),
  };
}

function tableCellKey(rowIndex, columnIndex) {
  return `${Number(rowIndex)}:${Number(columnIndex)}`;
}

function getTagAttribute(tag = '', name = '') {
  const quotedPattern = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const quoted = String(tag || '').match(quotedPattern)?.[2];
  if (quoted !== undefined) return quoted;
  const plainPattern = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i');
  return String(tag || '').match(plainPattern)?.[1] || '';
}

function getInnerHtml(fragment = '') {
  return String(fragment || '').replace(/^<[^>]+>/, '').replace(/<\/[^>]+>\s*$/, '');
}

function sanitizeImportedHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function parseHtmlTableMeta(html = '') {
  const source = String(html || '');
  if (!/<table[\s>]/i.test(source)) return null;
  const tableHtml = source.match(/<table\b[\s\S]*?<\/table>/i)?.[0] || source;
  const rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  if (!rowMatches.length) return null;

  const matrix = [];
  const mergedCells = [];
  const cellStyles = {};
  const occupied = new Set();
  rowMatches.forEach((rowHtml, rowIndex) => {
    matrix[rowIndex] = matrix[rowIndex] || [];
    const rowTag = rowHtml.match(/^<tr\b[^>]*>/i)?.[0] || '';
    const rowStyle = normalizeTableStyleFromSource({ style: getTagAttribute(rowTag, 'style') });
    const cellMatches = rowHtml.match(/<(td|th)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
    let columnIndex = 0;
    cellMatches.forEach(cellHtml => {
      while (occupied.has(tableCellKey(rowIndex, columnIndex))) columnIndex += 1;
      const openingTag = cellHtml.match(/^<(td|th)\b[^>]*>/i)?.[0] || '';
      const rowSpan = Math.max(1, Number(getTagAttribute(openingTag, 'rowspan')) || 1);
      const colSpan = Math.max(1, Number(getTagAttribute(openingTag, 'colspan')) || 1);
      const cellStyle = {
        ...rowStyle,
        ...normalizeTableStyleFromSource({ style: getTagAttribute(openingTag, 'style') }),
      };
      const inner = sanitizeImportedHtml(getInnerHtml(cellHtml)
        .replace(/<\/(p|div|h[1-6])>\s*<(p|div|h[1-6])[^>]*>/gi, '<br/>')
        .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, ''));
      matrix[rowIndex][columnIndex] = inner.trim();
      if (!isEmptyTableStyle(cellStyle)) cellStyles[tableCellKey(rowIndex, columnIndex)] = cellStyle;
      if (rowSpan > 1 || colSpan > 1) mergedCells.push({ rowIndex, columnIndex, rowSpan, colSpan });
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        matrix[r] = matrix[r] || [];
        for (let c = columnIndex; c < columnIndex + colSpan; c += 1) {
          occupied.add(tableCellKey(r, c));
          if (r !== rowIndex || c !== columnIndex) matrix[r][c] = matrix[r][c] || '';
        }
      }
      columnIndex += colSpan;
    });
  });
  return buildTableMetaFromMatrix(matrix, { mergedCells, cellStyles });
}

function getRawHtmlTableCandidate(node = {}) {
  if (!isPlainObject(node)) return '';
  const candidates = [
    node.html,
    node.content_html,
    node.contentHtml,
    node.inner_html,
    node.innerHtml,
    node.markdown,
    typeof node.content === 'string' ? node.content : '',
    typeof node.text === 'string' ? node.text : '',
    typeof node.value === 'string' ? node.value : '',
  ];
  return candidates.find(candidate => /<table[\s>]/i.test(String(candidate || ''))) || '';
}

function getTableCellHtml(cell) {
  if (cell == null) return '';
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return escapeHtml(cell);
  if (Array.isArray(cell)) return extractInlineHtml(cell);
  if (!isPlainObject(cell)) return '';

  const typedValue = cell.type && cell[cell.type] !== undefined ? cell[cell.type] : undefined;
  const relationValues = Array.isArray(cell.relation) ? cell.relation.map(item => item.title || item.name || item.id).filter(Boolean).join('、') : '';
  const selectValue = cell.select?.name || cell.option?.name || '';
  const multiSelectValue = Array.isArray(cell.multi_select) ? cell.multi_select.map(item => item.name || item.title).filter(Boolean).join('、') : '';
  const dateValue = cell.date?.start || cell.date?.end || '';
  const candidates = [
    cell.rich_text,
    cell.richText,
    cell.plain_text,
    cell.plainText,
    cell.title,
    cell.content,
    cell.text,
    cell.name,
    cell.value,
    typedValue,
    selectValue,
    multiSelectValue,
    dateValue,
    relationValues,
    cell.number,
    cell.url,
    cell.email,
    cell.phone_number,
    cell.phoneNumber,
    cell.checkbox,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const html = Array.isArray(candidate)
      ? extractInlineHtml(candidate)
      : getNodeHtml(candidate);
    if (stripHtml(html)) return String(html).replace(/\r?\n/g, '<br/>');
    if (typeof candidate === 'boolean') return candidate ? '是' : '否';
    if (typeof candidate === 'number') return escapeHtml(candidate);
  }
  return '';
}

function getTableCellSpan(cell = {}, keys = []) {
  if (!isPlainObject(cell)) return 1;
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), cell);
    const span = Number(value);
    if (Number.isFinite(span) && span > 1) return Math.round(span);
  }
  return 1;
}

function normalizeTableCell(cell, inheritedStyle = {}) {
  const ownStyle = normalizeTableStyleFromSource(cell);
  return {
    html: getTableCellHtml(cell),
    rowSpan: getTableCellSpan(cell, ['rowSpan', 'row_span', 'rowspan', 'span.rows', 'span.rowSpan']),
    colSpan: getTableCellSpan(cell, ['colSpan', 'col_span', 'colspan', 'span.cols', 'span.columns', 'span.colSpan']),
    style: {
      ...inheritedStyle,
      ...ownStyle,
    },
  };
}

function extractTableColumnHints(node = {}) {
  const sources = [
    node?.columns,
    node?.headers,
    node?.fields,
    node?.schema?.columns,
    node?.table?.columns,
    node?.data?.columns,
    node?.properties_schema,
    node?.propertiesSchema,
  ].filter(Boolean);
  for (const source of sources) {
    if (Array.isArray(source) && source.length) {
      const hints = source.map((item, index) => {
        if (typeof item === 'string' || typeof item === 'number') {
          const name = stripHtml(getNodeHtml(item));
          return { key: String(item), name: name || `字段 ${index + 1}` };
        }
        const key = String(item?.id || item?.key || item?.name || item?.title || index);
        const name = stripHtml(getNodeHtml(item?.name ?? item?.title ?? item?.label ?? item?.text)) || key || `字段 ${index + 1}`;
        return { key, name };
      }).filter(item => item.key || item.name);
      if (hints.length) return hints;
    }
    if (isPlainObject(source) && Object.keys(source).length) {
      return Object.entries(source).map(([key, value], index) => ({
        key,
        name: stripHtml(getNodeHtml(value?.name ?? value?.title ?? value?.label ?? value)) || key || `字段 ${index + 1}`,
      }));
    }
  }
  return [];
}

function getRowCellSource(row, columnHints = []) {
  if (Array.isArray(row)) return row;
  if (!isPlainObject(row)) return [];
  const arraySources = [
    row.cells,
    row.columns,
    row.values,
    row.row,
    row.table_row?.cells,
    row.tableRow?.cells,
    row.data?.cells,
  ];
  const directArray = arraySources.find(Array.isArray);
  if (directArray) return directArray;
  if (isPlainObject(row.properties)) {
    const propertyKeys = columnHints
      .map(item => item.key)
      .filter(key => row.properties[key] !== undefined);
    const keys = propertyKeys.length ? propertyKeys : Object.keys(row.properties);
    return keys.map(key => row.properties[key]);
  }
  if (isPlainObject(row.data?.properties)) {
    const propertyKeys = columnHints
      .map(item => item.key)
      .filter(key => row.data.properties[key] !== undefined);
    const keys = propertyKeys.length ? propertyKeys : Object.keys(row.data.properties);
    return keys.map(key => row.data.properties[key]);
  }
  const html = getTableCellHtml(row);
  return stripHtml(html) ? [row] : [];
}

function normalizeTableRow(row, columnHints = []) {
  const rowStyle = normalizeTableStyleFromSource(row);
  const cells = getRowCellSource(row, columnHints)
    .map(cell => normalizeTableCell(cell, rowStyle));
  return cells.filter(cell => stripHtml(cell.html) || cell.rowSpan > 1 || cell.colSpan > 1 || !isEmptyTableStyle(cell.style));
}

function collectTableRowCandidates(node = {}, childRows = []) {
  const hint = getNodeTypeHint(node);
  const isTableNode = isTableLikeTypeHint(hint);
  const sources = [
    node?.rows,
    node?.table?.rows,
    node?.data?.rows,
    node?.table_content,
    node?.tableContent,
    node?.tableRows,
    node?.records,
    node?.items,
    ...(isTableNode ? [node?.children, node?.blocks] : []),
    childRows,
  ].filter(Array.isArray);
  const rows = sources.flatMap(source => source);
  if (isTableRowTypeHint(hint) || (Array.isArray(node?.cells) && node.cells.length)) rows.unshift(node);
  return rows;
}

function extractTableColumnWidths(node = {}, columnCount = 0) {
  const sources = [
    node?.table_setting?.column_widths,
    node?.table_setting?.columnWidths,
    node?.tableSetting?.column_widths,
    node?.tableSetting?.columnWidths,
    node?.setting?.column_widths,
    node?.settings?.column_widths,
    node?.column_widths,
    node?.columnWidths,
  ].filter(Array.isArray);
  const widths = sources[0] || [];
  const normalized = widths
    .slice(0, columnCount || widths.length)
    .map(width => Math.max(80, Number(width) || 0))
    .filter(Boolean);
  return normalized.length ? normalized : [];
}

function buildTableMetaFromMatrix(matrix = [], options = {}) {
  const visibleRows = matrix
    .map(row => (Array.isArray(row) ? row : []))
    .filter(row => row.length);
  while (visibleRows.length && visibleRows[visibleRows.length - 1].every(cell => !stripHtml(cell))) {
    visibleRows.pop();
  }
  if (!visibleRows.length) return null;
  const columnCount = Math.max(...visibleRows.map(row => row.length), 1);
  const rows = visibleRows.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || ''));
  const mergedCells = (options.mergedCells || []).filter(item => (
    item.rowIndex < rows.length && item.columnIndex < columnCount
  ));
  const cellStyles = Object.entries(options.cellStyles || {}).reduce((acc, [key, style]) => {
    const [rowText, columnText] = key.split(':');
    const rowIndex = Number(rowText);
    const columnIndex = Number(columnText);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return acc;
    if (rowIndex < 0 || rowIndex >= rows.length || columnIndex < 0 || columnIndex >= columnCount) return acc;
    if (!isEmptyTableStyle(style)) acc[tableCellKey(rowIndex, columnIndex)] = style;
    return acc;
  }, {});
  const columnWidths = Array.isArray(options.columnWidths)
    ? options.columnWidths.slice(0, columnCount).map(width => Math.max(80, Number(width) || 0)).filter(Boolean)
    : [];
  return {
    columns: Array.from({ length: columnCount }, (_, index) => `字段 ${index + 1}`),
    rows,
    mergedCells,
    cellStyles,
    ...(columnWidths.length ? { columnWidths: Array.from({ length: columnCount }, (_, index) => columnWidths[index] || 160) } : {}),
  };
}

function normalizeTableRows(node, childRows = []) {
  const htmlMeta = parseHtmlTableMeta(getRawHtmlTableCandidate(node));
  const columnHints = extractTableColumnHints(node);
  const rowCandidates = collectTableRowCandidates(node, childRows);
  const matrix = [];
  const mergedCells = [];
  const cellStyles = {};
  const occupied = new Set();

  rowCandidates.forEach(row => {
    const normalizedCells = normalizeTableRow(row, columnHints);
    if (!normalizedCells.length) return;
    const rowIndex = matrix.length;
    matrix[rowIndex] = matrix[rowIndex] || [];
    let columnIndex = 0;
    normalizedCells.forEach(cell => {
      while (occupied.has(tableCellKey(rowIndex, columnIndex))) columnIndex += 1;
      matrix[rowIndex][columnIndex] = cell.html || '';
      if (!isEmptyTableStyle(cell.style)) cellStyles[tableCellKey(rowIndex, columnIndex)] = cell.style;
      if (cell.rowSpan > 1 || cell.colSpan > 1) {
        mergedCells.push({
          rowIndex,
          columnIndex,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        });
      }
      for (let r = rowIndex; r < rowIndex + cell.rowSpan; r += 1) {
        matrix[r] = matrix[r] || [];
        for (let c = columnIndex; c < columnIndex + cell.colSpan; c += 1) {
          occupied.add(tableCellKey(r, c));
          if (r !== rowIndex || c !== columnIndex) matrix[r][c] = matrix[r][c] || '';
        }
      }
      columnIndex += cell.colSpan;
    });
  });

  const hasVisibleColumnHints = columnHints.some(item => stripHtml(item.name));
  const firstRowText = (matrix[0] || []).map(cell => normalizePlainText(cell)).join('|');
  const columnHintText = columnHints.map(item => normalizePlainText(item.name)).filter(Boolean).join('|');
  if (matrix.length && hasVisibleColumnHints && columnHintText && firstRowText !== columnHintText) {
    matrix.unshift(columnHints.map(item => escapeHtml(item.name || '')));
    Object.keys(cellStyles).forEach(key => {
      const [rowText, columnText] = key.split(':');
      const nextKey = tableCellKey(Number(rowText) + 1, Number(columnText));
      cellStyles[nextKey] = cellStyles[key];
      delete cellStyles[key];
    });
    mergedCells.forEach(item => { item.rowIndex += 1; });
  }

  const structuredMeta = buildTableMetaFromMatrix(matrix, {
    mergedCells,
    cellStyles,
    columnWidths: extractTableColumnWidths(node, Math.max(...matrix.map(row => row.length), 0)),
  });
  if (!structuredMeta) return htmlMeta;
  if (!htmlMeta) return structuredMeta;
  const structuredSize = structuredMeta.rows.length * structuredMeta.columns.length;
  const htmlSize = htmlMeta.rows.length * htmlMeta.columns.length;
  return htmlSize > structuredSize ? htmlMeta : structuredMeta;
}

const mediaImageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
const mediaVideoExtensions = new Set(['mp4', 'mov', 'm4v', 'webm', 'ogg', 'ogv', 'avi', 'mkv']);
const mediaPreviewExtensions = new Set([
  ...mediaImageExtensions,
  ...mediaVideoExtensions,
  'pdf', 'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yaml', 'yml',
]);

function normalizeMediaUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^(https?:|data:image\/|blob:|\/uploads\/)/i.test(text)) return text;
    return '';
  }
  if (isPlainObject(value)) {
    return normalizeMediaUrl(
      value.url || value.href || value.src || value.download_url || value.downloadUrl
        || value.preview_url || value.previewUrl || value.file_url || value.fileUrl
        || value.source_url || value.sourceUrl
    );
  }
  return '';
}

function getMediaUrlFromNode(node = {}, fallbackKey = '') {
  if (!isPlainObject(node)) return '';
  const mediaContext = /image|picture|photo|file|attachment|asset|media|resource/i.test(String(fallbackKey || ''));
  const urlKeys = [
    'url', 'src', 'href', 'download_url', 'downloadUrl', 'preview_url', 'previewUrl',
    'file_url', 'fileUrl', 'image_url', 'imageUrl', 'media_url', 'mediaUrl',
    'attachment_url', 'attachmentUrl', 'signed_url', 'signedUrl',
    'raw_url', 'rawUrl',
    ...(mediaContext ? ['source_url', 'sourceUrl', 'source'] : ['source']),
  ];
  for (const key of urlKeys) {
    const url = normalizeMediaUrl(node[key]);
    if (url) return url;
  }
  for (const key of ['file', 'image', 'picture', 'photo', 'attachment', 'asset', 'media', 'resource', 'data']) {
    const url = normalizeMediaUrl(node[key]);
    if (url) return url;
  }
  return '';
}

function getFirstMediaText(node = {}, keys = []) {
  if (!isPlainObject(node)) return '';
  for (const key of keys) {
    const value = node[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = stripHtml(String(value || '')).trim();
      if (text) return text;
    }
    if (Array.isArray(value)) {
      const text = stripHtml(getNodeHtml(value)).trim();
      if (text) return text;
    }
    if (isPlainObject(value)) {
      const nested = getFirstMediaText(value, keys);
      if (nested) return nested;
    }
  }
  return '';
}

function getMediaExtFromUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) {
    const mimeExt = raw.match(/^data:[^/]+\/([^;,]+)/i)?.[1] || '';
    return mimeExt === 'jpeg' ? 'jpg' : mimeExt.toLowerCase();
  }
  try {
    const parsed = new URL(raw, 'https://placeholder.local');
    const basename = String(parsed.pathname || '').split('/').pop() || '';
    return basename.includes('.') ? basename.split('.').pop().toLowerCase() : '';
  } catch {
    const basename = raw.split('?')[0].split('#')[0].split('/').pop() || '';
    return basename.includes('.') ? basename.split('.').pop().toLowerCase() : '';
  }
}

function isWolaiPageCoverUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, 'https://placeholder.local');
    const host = String(parsed.hostname || '').toLowerCase();
    const pathname = decodeURIComponent(String(parsed.pathname || '')).toLowerCase();
    return /(^|\.)wostatic\.cn$/.test(host) && pathname.includes('/cover/');
  } catch {
    return /wostatic\.cn\/cover\//i.test(raw);
  }
}

function normalizeMediaKind(node = {}, url = '', fallbackKey = '') {
  const hint = [
    fallbackKey,
    node.type,
    node.block_type,
    node.blockType,
    node.kind,
    node.mime_type,
    node.mimetype,
    node.content_type,
    node.contentType,
  ].map(item => String(item || '').toLowerCase()).join(' ');
  const ext = getMediaExtFromUrl(url);
  if (/image|picture|photo|图片|图像/.test(hint)) return 'image';
  if (String(node.mime_type || node.mimetype || node.content_type || node.contentType || '').toLowerCase().startsWith('image/')) return 'image';
  if (mediaImageExtensions.has(ext)) return 'image';
  if (/video|movie|mp4|录屏|视频/.test(hint)) return 'video';
  if (String(node.mime_type || node.mimetype || node.content_type || node.contentType || '').toLowerCase().startsWith('video/')) return 'video';
  if (mediaVideoExtensions.has(ext)) return 'video';
  if (/file|attachment|asset|resource|附件|文件/.test(hint)) return 'attachment';
  if (ext && !/^https?:$/i.test(ext)) return 'attachment';
  return '';
}

function getMediaPreviewStatus(media = {}) {
  const mime = String(media.mimetype || '').toLowerCase();
  const ext = String(media.file_ext || '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('text/')) return 'supported';
  if (mime === 'application/pdf' || mediaPreviewExtensions.has(ext)) return 'supported';
  return 'unsupported';
}

function extractMediaFromNode(node = {}, fallbackKey = '') {
  if (!isPlainObject(node)) return null;
  const url = getMediaUrlFromNode(node, fallbackKey);
  if (!url) return null;
  const mimetype = getFirstMediaText(node, ['mimetype', 'mime_type', 'mimeType', 'content_type', 'contentType']);
  const kind = normalizeMediaKind(node, url, fallbackKey);
  if (!kind) return null;
  const filename = getFirstMediaText(node, [
    'filename', 'file_name', 'fileName', 'display_name', 'displayName',
    'name', 'title', 'alt', 'caption',
  ]) || decodeURIComponent(getMediaExtFromUrl(url) ? String(url).split('?')[0].split('/').pop() : '') || (kind === 'image' ? 'Wolai 图片' : 'Wolai 附件');
  const fileExt = getFirstMediaText(node, ['file_ext', 'fileExt', 'extension', 'ext']) || getMediaExtFromUrl(filename) || getMediaExtFromUrl(url);
  const normalizedMime = mimetype || (kind === 'video' && fileExt === 'mp4' ? 'video/mp4' : '');
  const media = {
    kind,
    url,
    filename,
    display_name: filename,
    mimetype: normalizedMime,
    file_ext: fileExt,
    size: Number(getObjectValueByKeys(node, ['size', 'file_size', 'fileSize']) || 0) || 0,
    alt: getFirstMediaText(node, ['alt', 'caption', 'description']) || filename,
  };
  return {
    ...media,
    preview_status: getMediaPreviewStatus(media),
  };
}

function getRecordMediaMeta(record = {}, options = {}) {
  const dimensions = isPlainObject(record.raw?.dimensions) ? record.raw.dimensions : null;
  const indent = Number(options.indent);
  return {
    wolai_record_id: record.id || '',
    wolai_parent_id: record.parentId || '',
    wolai_parent_type: record.parentType || '',
    wolai_order: Number(record.order || 0),
    ...(Number.isFinite(indent) ? { indent } : {}),
    ...(dimensions ? { dimensions } : {}),
  };
}

function getMediaCommonMeta(media = {}) {
  return {
    url: media.url || '',
    filename: media.filename || media.display_name || '',
    display_name: media.display_name || media.filename || '',
    attachment_id: media.attachment_id || null,
    filepath: media.filepath || '',
    mimetype: media.mimetype || '',
    file_ext: media.file_ext || getMediaExtFromUrl(media.filename || media.url || ''),
    size: Number(media.size || 0),
    preview_status: media.preview_status || getMediaPreviewStatus(media),
    source_system: 'wolai_mcp',
    remote: media.remote !== false,
    original_url: media.original_url || media.url || '',
    alt: media.alt || media.display_name || media.filename || '',
    ...(media.wolai_record_id ? { wolai_record_id: media.wolai_record_id } : {}),
    ...(media.wolai_parent_id ? { wolai_parent_id: media.wolai_parent_id } : {}),
    ...(media.wolai_parent_type ? { wolai_parent_type: media.wolai_parent_type } : {}),
    ...(Number.isFinite(Number(media.wolai_order)) ? { wolai_order: Number(media.wolai_order) } : {}),
    ...(Number.isFinite(Number(media.indent)) ? { indent: Math.max(0, Math.min(8, Math.floor(Number(media.indent)))) } : {}),
    ...(media.dimensions ? { dimensions: media.dimensions } : {}),
  };
}

function makeMediaBlock(makeBlock, media = {}) {
  const displayName = media.display_name || media.filename || (media.kind === 'image' ? 'Wolai 图片' : 'Wolai 附件');
  const commonMeta = getMediaCommonMeta({
    ...media,
    filename: media.filename || displayName,
    display_name: displayName,
  });
  if (media.kind === 'image') {
    return makeBlock('image', media.url, {
      meta: {
        ...commonMeta,
        embedOnly: true,
      },
    });
  }
  if (media.kind === 'video') {
    return makeBlock('video', media.url, {
      meta: {
        ...commonMeta,
        filename: media.filename || displayName,
        display_name: displayName,
        download_url: media.url || '',
        embedOnly: true,
      },
    });
  }
  return makeBlock('attachment', displayName, {
    meta: {
      ...commonMeta,
      filename: media.filename || displayName,
      display_name: displayName,
    },
  });
}

function imageGridItemFromBlock(block = {}) {
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  const url = meta.url || block.content || '';
  return {
    url,
    filename: meta.filename || meta.display_name || '',
    display_name: meta.display_name || meta.filename || '',
    attachment_id: meta.attachment_id || null,
    filepath: meta.filepath || '',
    mimetype: meta.mimetype || '',
    file_ext: meta.file_ext || getMediaExtFromUrl(meta.filename || url),
    size: Number(meta.size || 0),
    preview_status: meta.preview_status || 'supported',
    source_system: 'wolai_mcp',
    remote: meta.remote !== false,
    embedOnly: true,
    original_url: meta.original_url || url,
    alt: meta.alt || meta.filename || 'Wolai 图片',
    ...(meta.wolai_record_id ? { wolai_record_id: meta.wolai_record_id } : {}),
    ...(meta.wolai_parent_id ? { wolai_parent_id: meta.wolai_parent_id } : {}),
    ...(meta.wolai_parent_type ? { wolai_parent_type: meta.wolai_parent_type } : {}),
    ...(Number.isFinite(Number(meta.wolai_order)) ? { wolai_order: Number(meta.wolai_order) } : {}),
    ...(meta.dimensions ? { dimensions: meta.dimensions } : {}),
  };
}

function shouldGroupWolaiColumnImage(block = {}) {
  if (block?.type !== 'image') return false;
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  if (meta.layout === 'grid' || Array.isArray(meta.items)) return false;
  if (meta.source_system !== 'wolai_mcp') return false;
  return String(meta.wolai_parent_type || '').toLowerCase() === 'column';
}

function makeWolaiImageGridBlock(group = []) {
  if (group.length < 2) return group[0] || null;
  const first = group[0];
  const firstMeta = first.meta && typeof first.meta === 'object' ? first.meta : {};
  const items = group.map(imageGridItemFromBlock);
  return {
    ...first,
    content: items[0]?.url || first.content || '',
    meta: {
      ...firstMeta,
      url: items[0]?.url || firstMeta.url || first.content || '',
      filename: items[0]?.filename || firstMeta.filename || '',
      display_name: items[0]?.display_name || firstMeta.display_name || '',
      layout: 'grid',
      columns: Math.min(Math.max(items.length, 2), 5),
      items,
      embedOnly: true,
      source_system: 'wolai_mcp',
    },
  };
}

function groupConsecutiveWolaiColumnImages(blocks = []) {
  const result = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    if (group.length === 1) result.push(group[0]);
    else result.push(makeWolaiImageGridBlock(group));
    group = [];
  };
  blocks.forEach(block => {
    if (shouldGroupWolaiColumnImage(block)) {
      group.push(block);
      return;
    }
    flush();
    result.push(block);
  });
  flush();
  return result;
}

function collectStructuredNodes(value, nodes = [], options = {}) {
  if (!value) return nodes;
  if (Array.isArray(value)) {
    value.forEach(item => collectStructuredNodes(item, nodes, options));
    return nodes;
  }
  if (typeof value !== 'object') return nodes;
  const hasBlockType = Boolean(value.type || value.block_type || value.blockType || value.kind);
  const hasBodyText = value.text !== undefined
    || value.content !== undefined
    || value.plain_text !== undefined
    || value.markdown !== undefined
    || value.value !== undefined;
  const hasTable = Boolean(
    value.rows || value.table || value.tableRows || value.cells
    || isTableLikeTypeHint(getNodeTypeHint(value))
    || isTableRowTypeHint(getNodeTypeHint(value))
    || (isPlainObject(value.properties) && /table|database|row/i.test(getNodeTypeHint(value)))
  );
  const hasMedia = Boolean(extractMediaFromNode(value, options.fallbackKey || ''));
  if (
    hasBlockType || hasBodyText || hasTable || hasMedia
  ) {
    nodes.push(value);
  }
  ['page', 'document', 'data', 'blocks', 'children', 'content'].forEach(key => {
    if (value[key] && value[key] !== value) collectStructuredNodes(value[key], nodes, { ...options, fallbackKey: key });
  });
  if (options.allowCollectionKeys) {
    ['items', 'rows', 'cells', 'columns', 'records', 'images', 'image', 'attachments', 'attachment', 'files', 'file', 'media', 'assets'].forEach(key => {
      if (value[key] && value[key] !== value) collectStructuredNodes(value[key], nodes, { ...options, fallbackKey: key });
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
    if (!text && block?.type !== 'divider' && block?.type !== 'table-simple' && block?.type !== 'database-embed') return;
    const key = `${block?.type || ''}:${text}:${JSON.stringify(block?.meta || {})}`;
    if (seen.has(key)) return;
    seen.add(key);
    filtered.push(block);
  });
  if (filtered.length >= 6) {
    const headingLike = filtered.filter(block => /^heading/.test(block?.type || '') || block?.type === 'paragraph');
    const textLikeRatio = headingLike.length / filtered.length;
    const listLikeRatio = filtered.filter(block => isListBlock(block)).length / filtered.length;
    const shortHeadingRatio = headingLike.length
      ? headingLike.filter(block => stripHtml(block.content).length <= 40).length / headingLike.length
      : 0;
    if (textLikeRatio > 0.7 && listLikeRatio < 0.2 && shortHeadingRatio > 0.85 && !containsTargetReference(filtered, target)) return [];
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
  const typeHint = getNodeTypeHint(value);
  const contentTitle = /^(page|document)$/.test(typeHint) ? value.content : null;
  const candidate = value.title || value.name || value.page_title || value.pageTitle || value.document_title || value.documentTitle || contentTitle;
  const titleText = stripHtml(getNodeHtml(candidate || ''));
  if (titleText) return titleText;
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

function normalizeRecordId(value = '') {
  return String(value || '').trim();
}

function normalizeRecordDepth(value) {
  const depth = Number(value);
  if (!Number.isFinite(depth)) return null;
  return Math.max(0, Math.min(8, Math.floor(depth)));
}

function getWolaiChildIds(rawRecord = {}) {
  if (!isPlainObject(rawRecord)) return [];
  const candidates = [
    rawRecord.children?.ids,
    rawRecord.children,
    rawRecord.child_ids,
    rawRecord.childIds,
    rawRecord.block_ids,
    rawRecord.blockIds,
  ];
  const source = candidates.find(Array.isArray) || [];
  return source
    .map(item => normalizeRecordId(isPlainObject(item) ? (item.id || item.block_id || item.blockId) : item))
    .filter(Boolean);
}

function getObjectValueByKeys(value, keys = []) {
  if (!isPlainObject(value)) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined) return value[key];
  }
  return undefined;
}

function normalizeWolaiRecord(rawRecord = {}, order = 0, fallbackId = '') {
  const id = normalizeRecordId(
    getObjectValueByKeys(rawRecord, ['id', 'block_id', 'blockId'])
      || (isLikelyWolaiRecordKey(fallbackId) ? fallbackId : '')
  );
  const media = extractMediaFromNode(rawRecord, fallbackId);
  const html = getNodeHtml({
    title: rawRecord.title,
    content: rawRecord.content,
    text: rawRecord.text,
    plain_text: rawRecord.plain_text ?? rawRecord.plainText,
    markdown: rawRecord.markdown,
    value: rawRecord.value,
    name: rawRecord.name,
  });
  const plainText = stripHtml(html);
  const typeHint = getNodeTypeHint(rawRecord);
  const tableMeta = normalizeTableRows(rawRecord);
  const isTableRecord = isTableLikeTypeHint(typeHint) || isTableRowTypeHint(typeHint) || Boolean(tableMeta);
  if (!plainText && !media && !isTableRecord) return null;
  return {
    id: id || `wolai_record_${order}`,
    parentId: normalizeRecordId(getObjectValueByKeys(rawRecord, ['parent_id', 'parentId', 'parent_block_id', 'parentBlockId'])),
    parentType: String(getObjectValueByKeys(rawRecord, ['parent_type', 'parentType']) || ''),
    type: String(getObjectValueByKeys(rawRecord, ['type', 'block_type', 'blockType', 'kind']) || ''),
    level: Number(getObjectValueByKeys(rawRecord, ['level', 'heading_level', 'headingLevel']) || 0),
    depth: normalizeRecordDepth(getObjectValueByKeys(rawRecord, ['depth', 'indent', 'list_level', 'listLevel'])),
    checked: Boolean(getObjectValueByKeys(rawRecord, ['checked', 'done', 'completed'])),
    language: String(getObjectValueByKeys(rawRecord, ['language', 'lang']) || ''),
    html,
    media,
    tableMeta,
    childIds: getWolaiChildIds(rawRecord),
    raw: rawRecord,
    order,
  };
}

function collectWolaiRecordsFromPayload(value, records = [], state = { order: 0, parentId: '', parentType: '', depth: -1 }, fallbackKey = '') {
  if (!value) return records;
  if (Array.isArray(value)) {
    value.forEach(item => collectWolaiRecordsFromPayload(item, records, state));
    return records;
  }
  if (!isPlainObject(value)) return records;

  let currentRecord = null;
  if (isWolaiBlockLikeObject(value, fallbackKey)) {
    const record = normalizeWolaiRecord(value, state.order, fallbackKey);
    state.order += 1;
    if (record) {
      if (!record.parentId && state.parentId) record.parentId = state.parentId;
      if (!record.parentType && state.parentType) record.parentType = state.parentType;
      if (record.depth === null && Number.isFinite(Number(state.depth)) && Number(state.depth) >= 0) {
        record.depth = normalizeRecordDepth(state.depth);
      }
      records.push(record);
      currentRecord = record;
    }
  }

  const childState = currentRecord
    ? {
      ...state,
      parentId: currentRecord.id,
      parentType: currentRecord.type || currentRecord.parentType || '',
      depth: (currentRecord.depth ?? normalizeRecordDepth(state.depth) ?? -1) + 1,
    }
    : state;
  const childContainerKeys = new Set(['blocks', 'children', 'items', 'records', 'rows', 'cells']);
  Object.entries(value).forEach(([key, child]) => {
    if (['title', 'content', 'text', 'plain_text', 'plainText', 'markdown', 'value', 'name'].includes(key)) return;
    if (child && typeof child === 'object') {
      const nextState = childContainerKeys.has(key) ? { ...childState, order: state.order } : state;
      collectWolaiRecordsFromPayload(child, records, nextState, key);
      if (nextState !== state) state.order = nextState.order;
    }
  });
  return records;
}

function parseJsonLikeScalar(value = '') {
  const raw = String(value || '').trim().replace(/[,;]\s*$/g, '');
  if (!raw) return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw.replace(/^["']|["']$/g, '');
  }
}

function appendJsonLikeRecord(records, current) {
  if (!current || !Array.isArray(current.titleParts) || !current.titleParts.length) return;
  const html = current.titleParts.map(part => escapeHtml(part)).join('');
  if (!stripHtml(html)) return;
  records.push({
    id: current.id || `wolai_text_record_${records.length}`,
    parentId: current.parentId || '',
    parentType: current.parentType || '',
    type: current.type || '',
    level: Number(current.level || 0),
    checked: Boolean(current.checked),
    language: current.language || '',
    html,
    order: records.length,
  });
}

function extractWolaiRecordsFromJsonLikeText(text = '') {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const records = [];
  let current = null;
  const ensureCurrent = () => {
    if (!current) current = { titleParts: [] };
    return current;
  };

  lines.forEach(line => {
    const match = line.match(/^["']?([A-Za-z_][\w-]*)["']?\s*:\s*([\s\S]+)$/);
    if (!match) return;
    const key = match[1];
    const value = parseJsonLikeScalar(match[2]);
    if (key === 'id' || key === 'block_id' || key === 'blockId') {
      if (current?.id || current?.titleParts?.length) {
        appendJsonLikeRecord(records, current);
        current = null;
      }
      ensureCurrent().id = String(value || '');
      return;
    }
    if (['title', 'content', 'text', 'plain_text', 'plainText', 'markdown', 'value'].includes(key)) {
      const part = stripHtml(getNodeHtml(value));
      if (part) ensureCurrent().titleParts.push(part);
      return;
    }
    if (!current) return;
    if (['parent_id', 'parentId', 'parent_block_id', 'parentBlockId'].includes(key)) current.parentId = String(value || '');
    else if (['parent_type', 'parentType'].includes(key)) current.parentType = String(value || '');
    else if (['type', 'block_type', 'blockType', 'kind'].includes(key)) current.type = String(value || '');
    else if (['level', 'heading_level', 'headingLevel'].includes(key)) current.level = Number(value || 0);
    else if (['checked', 'done', 'completed'].includes(key)) current.checked = value === true || value === 'true';
    else if (['language', 'lang'].includes(key)) current.language = String(value || '');
  });
  appendJsonLikeRecord(records, current);
  return records;
}

function inferWolaiRecordType(record = {}) {
  const hasOwnTypeHint = Boolean(record.type || record.inferredType);
  const hint = `${record.type || ''} ${record.inferredType || ''} ${hasOwnTypeHint ? '' : (record.parentType || '')}`.toLowerCase();
  const isFold = isFoldLikeTypeHint(hint) || hasFoldFlag(record.raw || {});
  if (record.media?.kind) return record.media.kind;
  if ((/heading|header|title/.test(hint) || record.level) && isFold) return `fold-heading${Math.min(Math.max(Number(record.level) || 2, 2), 4)}`;
  if (/heading|header|title/.test(hint) || record.level) return `heading${Math.min(Math.max(Number(record.level) || 2, 1), 3)}`;
  if (/todo|check/.test(hint)) return 'todo';
  if (isTableRowTypeHint(hint)) return 'table-row';
  if (isDatabaseLikeRecord(record)) return 'database-embed';
  if (isTableLikeTypeHint(hint) || record.tableMeta) return 'table-simple';
  if (/quote/.test(hint)) return 'quote';
  if (/code/.test(hint)) return 'code';
  if (/divider|hr|separator/.test(hint)) return 'divider';
  if (/image|picture/.test(hint)) return 'image';
  if (/file|attachment|asset/.test(hint)) return 'attachment';
  if (isFold) return 'fold-list';
  if (isEnumListTypeHint(hint)) return 'numbered';
  if (isBulletListTypeHint(hint)) return 'bullet';
  return 'paragraph';
}

function isWolaiTableRowRecord(record = {}) {
  return inferWolaiRecordType(record) === 'table-row'
    || (Array.isArray(record.raw?.cells) && record.raw.cells.length);
}

function isDatabaseLikeRecord(record = {}) {
  const hasOwnTypeHint = Boolean(record.type || record.inferredType);
  const hint = `${record.type || ''} ${record.inferredType || ''} ${hasOwnTypeHint ? '' : (record.parentType || '')}`.toLowerCase();
  if (isDatabaseLikeTypeHint(hint)) return true;
  return isDatabaseLikeNode(record.raw || {});
}

function isWolaiTableRecord(record = {}) {
  return inferWolaiRecordType(record) === 'table-simple';
}

function hasRenderableWolaiRecord(record = {}) {
  return Boolean(
    stripHtml(record.html)
    || record.media?.url
    || record.tableMeta
    || isDatabaseLikeRecord(record)
    || isWolaiTableRecord(record)
    || isWolaiTableRowRecord(record)
  );
}

function isPageContainerRecord(record = {}) {
  const hint = String(record.type || record.inferredType || '').toLowerCase();
  return /^(page|document)$/.test(hint);
}

function getWolaiRecordUrl(record = {}) {
  const raw = record.raw || {};
  const url = [
    raw.url,
    raw.href,
    raw.link,
    raw.page_url,
    raw.pageUrl,
    raw.source_url,
    raw.sourceUrl,
    raw.share_url,
    raw.shareUrl,
    raw.web_url,
    raw.webUrl,
  ].map(item => String(item || '').trim()).find(Boolean);
  if (url) return url;
  const id = normalizeRecordId(record.id || raw.page_id || raw.pageId || raw.id);
  return id ? `https://www.wolai.com/${encodeURIComponent(id)}` : '';
}

function isLinkedPageRecord(record = {}, rootPageId = '') {
  if (!isPageContainerRecord(record)) return false;
  if (!record.id || record.id === rootPageId) return false;
  return Boolean(stripHtml(record.html) || getWolaiRecordUrl(record));
}

function getWolaiExpansionQueueIds(records = [], targetPageId = '', knownRecords = records) {
  const knownIds = new Set((knownRecords || []).map(record => normalizeRecordId(record?.id)).filter(Boolean));
  const missingParentIds = [];
  const recordIds = [];
  const addUnique = (list, value) => {
    const id = normalizeRecordId(value);
    if (!id || list.includes(id)) return;
    list.push(id);
  };

  (records || []).forEach(record => {
    if (!record || record.id === targetPageId) return;
    const parentId = normalizeRecordId(record.parentId);
    const parentType = String(record.parentType || '').toLowerCase();
    if (parentId && !knownIds.has(parentId) && !/^(page|document)$/.test(parentType)) {
      addUnique(missingParentIds, parentId);
    }
  });
  (records || []).forEach(record => {
    if (!record || record.id === targetPageId || isLinkedPageRecord(record, targetPageId)) return;
    addUnique(recordIds, record.id);
  });
  return [...missingParentIds, ...recordIds.filter(id => !missingParentIds.includes(id))];
}

function buildFoldBodyHtml(records = [], getDepth = () => 0, rootDepth = 0) {
  const lines = [];
  records.forEach((record, index) => {
    const type = inferWolaiRecordType(record);
    if (type === 'table-row') return;
    const depth = Math.max(0, getDepth(record) - rootDepth - 1);
    const indent = '&nbsp;'.repeat(depth * 4);
    const text = record.media?.url
      ? `<a href="${escapeHtml(record.media.url)}" target="_blank" rel="noreferrer">${escapeHtml(record.media.filename || record.media.name || record.media.url)}</a>`
      : (record.html || '');
    if (!stripHtml(text)) return;
    let prefix = '';
    if (type === 'bullet' || type === 'fold-list') prefix = '• ';
    if (type === 'numbered') prefix = `${index + 1}. `;
    const line = `${indent}${escapeHtml(prefix)}${text}`;
    lines.push(/^heading/.test(type) || /^fold-heading/.test(type) ? `<strong>${line}</strong>` : line);
  });
  return lines.join('<br/>');
}

function recordsToBlocks(records = [], seed) {
  const normalized = records
    .filter(record => record && hasRenderableWolaiRecord(record))
    .filter((record, index, list) => (
      index === list.findIndex(other => (
        other.id === record.id
        && stripHtml(other.html) === stripHtml(record.html)
        && (other.media?.url || '') === (record.media?.url || '')
        && JSON.stringify(other.tableMeta || null) === JSON.stringify(record.tableMeta || null)
      ))
    ))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!normalized.length) return [];

  const byId = new Map();
  normalized.forEach(record => byId.set(record.id, record));
  normalized.forEach(record => {
    const parent = byId.get(record.parentId);
    if (parent && record.parentType && !parent.inferredType) parent.inferredType = record.parentType;
  });

  const depthMemo = new Map();
  const getDepth = (record, stack = new Set()) => {
    if (depthMemo.has(record.id)) return depthMemo.get(record.id);
    if (record?.depth !== null && record?.depth !== undefined && Number.isFinite(Number(record.depth))) {
      const explicitDepth = Math.max(0, Math.min(8, Math.floor(Number(record.depth))));
      depthMemo.set(record.id, explicitDepth);
      return explicitDepth;
    }
    if (!record?.parentId || stack.has(record.id)) return 0;
    const parent = byId.get(record.parentId);
    if (!parent) {
      depthMemo.set(record.id, 0);
      return 0;
    }
    stack.add(record.id);
    const depth = Math.min(getDepth(parent, stack) + 1, 8);
    stack.delete(record.id);
    depthMemo.set(record.id, depth);
    return depth;
  };

  const childrenByParentId = new Map();
  normalized.forEach(record => {
    const parentId = record.parentId || '';
    if (!parentId || !byId.has(parentId)) return;
    if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
    childrenByParentId.get(parentId).push(record);
  });
  const declaredChildOrder = new Map();
  normalized.forEach(parent => {
    (parent.childIds || []).forEach((childId, index) => {
      declaredChildOrder.set(`${parent.id}:${childId}`, index);
    });
  });
  childrenByParentId.forEach((children, parentId) => children.sort((a, b) => {
    const aDeclared = declaredChildOrder.get(`${parentId}:${a.id}`);
    const bDeclared = declaredChildOrder.get(`${parentId}:${b.id}`);
    if (aDeclared !== undefined || bDeclared !== undefined) {
      if (aDeclared === undefined) return 1;
      if (bDeclared === undefined) return -1;
      if (aDeclared !== bDeclared) return aDeclared - bDeclared;
    }
    return (a.order || 0) - (b.order || 0);
  }));

  const rootPageId = extractWolaiPageId(seed);
  const linkedPageDescendantIds = new Set();
  const collectLinkedPageDescendantIds = (record, stack = new Set()) => {
    if (!record?.id || stack.has(record.id)) return;
    stack.add(record.id);
    (childrenByParentId.get(record.id) || []).forEach(child => {
      linkedPageDescendantIds.add(child.id);
      collectLinkedPageDescendantIds(child, stack);
    });
    stack.delete(record.id);
  };
  normalized
    .filter(record => isLinkedPageRecord(record, rootPageId))
    .forEach(record => collectLinkedPageDescendantIds(record));

  const ordered = [];
  const emitted = new Set();
  const appendTree = (record) => {
    if (!record || emitted.has(record.id) || linkedPageDescendantIds.has(record.id)) return;
    emitted.add(record.id);
    ordered.push(record);
    if (isPageContainerRecord(record) && record.id !== rootPageId) return;
    (childrenByParentId.get(record.id) || []).forEach(appendTree);
  };
  normalized
    .filter(record => record.id === rootPageId || !record.parentId || !byId.has(record.parentId))
    .forEach(appendTree);
  normalized.forEach(appendTree);

  const makeBlock = makeBlockFactory(seed);
  const consumedRecordIds = new Set();
  const collectDescendantIds = (record, output = new Set()) => {
    (childrenByParentId.get(record.id) || []).forEach(child => {
      if (output.has(child.id)) return;
      output.add(child.id);
      collectDescendantIds(child, output);
    });
    return output;
  };
  const getDescendantRecords = (record) => {
    const ids = collectDescendantIds(record);
    return ordered.filter(item => ids.has(item.id));
  };
  const hasRenderableDescendantRecords = (record, stack = new Set()) => {
    const children = childrenByParentId.get(record.id) || [];
    return children.some(child => {
      if (!child?.id || stack.has(child.id)) return false;
      stack.add(child.id);
      const renderable = hasRenderableWolaiRecord(child);
      const nestedRenderable = hasRenderableDescendantRecords(child, stack);
      stack.delete(child.id);
      return renderable || nestedRenderable;
    });
  };
  const isWolaiListTreeRecord = (record, stack = new Set()) => {
    if (!record || stack.has(record.id)) return false;
    const type = inferWolaiRecordType(record);
    if (type === 'numbered' || type === 'bullet' || type === 'fold-list') return true;
    const parent = byId.get(record.parentId);
    if (!parent) return false;
    stack.add(record.id);
    const result = isWolaiListTreeRecord(parent, stack);
    stack.delete(record.id);
    return result;
  };
  const tableRows = ordered.filter(isWolaiTableRowRecord);
  const tableRowsByParentId = new Map();
  tableRows.forEach(row => {
    const parentId = row.parentId || '';
    if (!parentId) return;
    if (!tableRowsByParentId.has(parentId)) tableRowsByParentId.set(parentId, []);
    tableRowsByParentId.get(parentId).push(row);
  });

  const makeTableBlock = (record, rows = []) => {
    const databaseRecord = isDatabaseLikeRecord(record);
    const meta = normalizeTableRows(record.raw || {}, rows.map(row => row.raw || row)) || record.tableMeta;
    if (databaseRecord && !meta && !stripHtml(record.html) && !getDatabaseTableName(record.raw || {}, '')) return null;
    if (!meta && !databaseRecord) return null;
    rows.forEach(row => consumedRecordIds.add(row.id));
    if (databaseRecord) {
      return makeBlock('database-embed', '', {
        meta: buildDatabaseTableMeta(record.raw || {}, meta, record.html),
      });
    }
    return makeBlock('table-simple', '', { meta });
  };

  const blocks = [];
  ordered.forEach(record => {
    if (consumedRecordIds.has(record.id)) return;
    const type = inferWolaiRecordType(record);
    if (isLinkedPageRecord(record, rootPageId)) {
      collectDescendantIds(record).forEach(id => consumedRecordIds.add(id));
      const depth = getDepth(record);
      blocks.push(makeBlock('external-link', record.html || getWolaiRecordUrl(record), {
        meta: {
          url: getWolaiRecordUrl(record),
          title: stripHtml(record.html) || 'Wolai 文档链接',
          source_system: 'wolai_mcp',
          reference_type: 'page',
          wolai_record_id: record.id || '',
          wolai_parent_id: record.parentId || '',
          wolai_parent_type: record.parentType || '',
          wolai_order: Number(record.order || 0),
          ...(depth > 0 ? { indent: depth } : {}),
        },
      }));
      return;
    }
    if ((type === 'image' || type === 'attachment' || type === 'video') && record.media?.url) {
      const depth = getDepth(record);
      blocks.push(makeMediaBlock(makeBlock, {
        ...record.media,
        ...getRecordMediaMeta(record, depth > 0 && isWolaiListTreeRecord(record) ? { indent: depth } : {}),
        kind: type,
      }));
      return;
    }
    if (type === 'database-embed' || type === 'table-simple') {
      const tableBlock = makeTableBlock(record, tableRowsByParentId.get(record.id) || []);
      if (tableBlock) blocks.push(tableBlock);
      return;
    }
    if (type === 'table-row') {
      const siblingRows = tableRows.filter(row => (row.parentId || '') === (record.parentId || ''));
      const isFirstSibling = siblingRows[0]?.id === record.id;
      if (isFirstSibling) {
        const tableBlock = makeTableBlock({ ...record, raw: {} }, siblingRows);
        if (tableBlock) blocks.push(tableBlock);
      }
      consumedRecordIds.add(record.id);
      return;
    }
    const meta = {
      source_system: 'wolai_mcp',
      wolai_record_id: record.id || '',
      wolai_parent_id: record.parentId || '',
      wolai_parent_type: record.parentType || '',
      wolai_order: Number(record.order || 0),
    };
    const depth = getDepth(record);
    if (type === 'numbered' || type === 'bullet' || type === 'fold-list') meta.indent = depth;
    else if (depth > 0 && isWolaiListTreeRecord(record)) meta.indent = depth;
    if (type === 'fold-list') {
      const derivedHasChildren = hasRenderableDescendantRecords(record);
      const explicitHasChildren = getWolaiHasChildrenState(record.raw || {}, undefined);
      meta.collapsed = getWolaiCollapsedState(record.raw || {}, true);
      meta.hasChildren = derivedHasChildren || explicitHasChildren === true;
    }
    if (type?.startsWith('fold-heading')) {
      const descendants = getDescendantRecords(record);
      descendants.forEach(item => consumedRecordIds.add(item.id));
      meta.collapsed = getWolaiCollapsedState(record.raw || {}, true);
      meta.body = buildFoldBodyHtml(descendants, getDepth, getDepth(record));
    }
    if (record.language) meta.language = record.language;
    blocks.push(makeBlock(type, type === 'divider' ? '' : record.html, {
      checked: record.checked,
      meta,
    }));
  });
  return groupConsecutiveWolaiColumnImages(blocks.filter(Boolean));
}

function looksLikeJsonDumpText(text = '') {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 4) return false;
  const jsonFieldLines = lines.filter(line => /^["']?[A-Za-z_][\w-]*["']?\s*:/.test(line)).length;
  const quotedIdLines = lines.filter(line => /^["'][A-Za-z0-9_-]{8,}["'][,;:]?$/.test(line)).length;
  const hasWolaiFields = lines.some(line => /^["']?(title|parent_id|parent_type|created_at|edited_at|version)["']?\s*:/.test(line));
  return hasWolaiFields && (jsonFieldLines + quotedIdLines) / lines.length > 0.35;
}

function parseToolContent(result) {
  const { text, structured } = collectTextFromToolResult(result);
  const parsedTextJson = tryParseJson(text);
  const payloads = [...structured, parsedTextJson].filter(Boolean);
  const wolaiRecords = [];
  payloads.forEach(payload => collectWolaiRecordsFromPayload(payload, wolaiRecords));
  if (!wolaiRecords.length && text) {
    wolaiRecords.push(...extractWolaiRecordsFromJsonLikeText(text));
  }
  return {
    text,
    structured,
    parsedTextJson,
    payloads,
    wolaiRecords,
  };
}

function mergeWolaiRecords(records = []) {
  const byKey = new Map();
  records.forEach((record, index) => {
    if (!record || !record.id || !hasRenderableWolaiRecord(record)) return;
    const key = record.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...record, order: Number.isFinite(Number(record.order)) ? Number(record.order) : index });
      return;
    }
    byKey.set(key, {
      ...existing,
      ...record,
      html: stripHtml(record.html).length >= stripHtml(existing.html).length ? record.html : existing.html,
      media: record.media?.url ? record.media : existing.media,
      tableMeta: record.tableMeta || existing.tableMeta,
      childIds: record.childIds?.length ? record.childIds : existing.childIds,
      raw: record.raw || existing.raw,
      parentId: record.parentId || existing.parentId,
      parentType: record.parentType || existing.parentType,
      type: record.type || existing.type,
      inferredType: record.inferredType || existing.inferredType,
      order: Number.isFinite(Number(existing.order)) ? Number(existing.order) : (Number(record.order) || index),
    });
  });
  return Array.from(byKey.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function normalizeRecoveredWolaiParentRecords(records = [], blockId = '', targetPageId = '') {
  const requestedRecord = records.find(record => record.id === blockId);
  if (!requestedRecord) return { matched: false, records };
  const nextRecords = [...records];
  if (!requestedRecord.parentId && targetPageId) {
    requestedRecord.parentId = targetPageId;
    requestedRecord.parentType = requestedRecord.parentType || 'page';
  }
  if (/^bi[_-]?link$/i.test(String(requestedRecord.type || ''))) {
    const supplements = nextRecords.filter(record => (
      record.id !== blockId
      && record.parentId === targetPageId
      && /^(text|paragraph)?$/i.test(String(record.type || ''))
      && stripHtml(record.html)
    ));
    const titleHtml = String(requestedRecord.html || '').replace(/^\s*\[/, '').replace(/\]\s*$/, '');
    requestedRecord.html = [titleHtml, ...supplements.map(record => record.html)].filter(Boolean).join(' ');
    const supplementIds = new Set(supplements.map(record => record.id));
    return {
      matched: true,
      records: nextRecords.filter(record => !supplementIds.has(record.id)),
    };
  }
  return { matched: true, records: nextRecords };
}

function buildWolaiChildTarget(blockId = '', target = {}, records = []) {
  const missingParentRequest = !records.some(record => record.id === blockId)
    && records.some(record => record.parentId === blockId);
  return {
    raw: blockId,
    url: '',
    pageId: missingParentRequest ? blockId : (target.pageId || blockId),
    blockId,
  };
}

async function expandWolaiRecordsWithChildCalls({ client, tools = [], target, records, maxCalls = 160 }) {
  let mergedRecords = mergeWolaiRecords(records);
  if (!mergedRecords.length || mergedRecords.length > 80) return mergedRecords;

  const childTools = getChildContentTools(tools).slice(0, 8);
  if (!childTools.length) return mergedRecords;

  const seenCallIds = new Set([target.pageId].filter(Boolean));
  const queuedIds = new Set();
  const queue = [];
  const enqueue = (id) => {
    const normalized = normalizeRecordId(id);
    if (!normalized || seenCallIds.has(normalized) || queuedIds.has(normalized)) return;
    queuedIds.add(normalized);
    queue.push(normalized);
  };
  getWolaiExpansionQueueIds(mergedRecords, target.pageId, mergedRecords).forEach(enqueue);

  let callCount = 0;
  while (queue.length && callCount < maxCalls) {
    const blockId = queue.shift();
    queuedIds.delete(blockId);
    if (!blockId || seenCallIds.has(blockId)) continue;
    seenCallIds.add(blockId);

    const childTarget = buildWolaiChildTarget(blockId, target, mergedRecords);
    let foundChildrenForBlock = false;
    for (const childTool of childTools) {
      const argsVariants = buildArgumentsForTool(childTool, childTarget).slice(0, 4);
      for (const args of argsVariants) {
        callCount += 1;
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await client.callTool(childTool.name, args);
          const toolErrorMessage = getMcpToolResultErrorMessage(result, childTarget);
          if (toolErrorMessage) continue;
          const parsed = parseToolContent(result);
          let nextRecords = mergeWolaiRecords(parsed.wolaiRecords);
          if (!nextRecords.length) continue;
          const parentRecord = mergedRecords.find(item => item.id === blockId);
          if (!parentRecord) {
            const recovered = normalizeRecoveredWolaiParentRecords(nextRecords, blockId, target.pageId);
            if (!recovered.matched) continue;
            nextRecords = recovered.records;
          }
          const existingIds = new Set(mergedRecords.map(record => record.id));
          const newRecords = nextRecords.filter(record => record.id && !existingIds.has(record.id));
          const metadataChanged = nextRecords.some(record => {
            const existing = mergedRecords.find(item => item.id === record.id);
            return existing && ((!existing.parentId && record.parentId) || (!existing.type && record.type) || (!existing.parentType && record.parentType));
          });
          if (!newRecords.length && !metadataChanged) continue;
          const parentOrder = Number(parentRecord?.order);
          const waitingChildOrder = Math.min(...mergedRecords
            .filter(item => item.parentId === blockId)
            .map(item => Number(item.order))
            .filter(Number.isFinite));
          const orderBase = Number.isFinite(parentOrder)
            ? parentOrder
            : (Number.isFinite(waitingChildOrder) ? waitingChildOrder - 0.5 : mergedRecords.length + 1);
          nextRecords.forEach((record, index) => {
            if (!record.parentId && record.id !== blockId) record.parentId = blockId;
            const existingRecord = mergedRecords.find(item => item.id === record.id);
            if (!existingRecord) {
              record.order = record.id === blockId
                ? orderBase
                : orderBase + ((index + 1) / 1000);
            }
          });
          mergedRecords = mergeWolaiRecords([...mergedRecords, ...nextRecords]);
          getWolaiExpansionQueueIds(newRecords, target.pageId, mergedRecords).forEach(enqueue);
          foundChildrenForBlock = true;
          break;
        } catch {
          // Try the next argument variant; child blocks often reject leaf ids.
        }
        if (callCount >= maxCalls) break;
      }
      if (foundChildrenForBlock || callCount >= maxCalls) break;
    }
  }
  return mergedRecords;
}

function nodesToBlocks(nodes, seed) {
  const makeBlock = makeBlockFactory(seed);
  const blocks = [];
  const hasRenderableNodeContent = (node) => {
    if (!node) return false;
    if (!isPlainObject(node)) return Boolean(stripHtml(getNodeHtml(node)));
    const type = mapNodeType(node);
    return Boolean(
      stripHtml(getNodeHtml(node))
      || extractMediaFromNode(node, '')?.url
      || type === 'database-embed'
      || normalizeTableRows(node)
    );
  };
  const getNestedNodeContainers = (node = {}) => {
    const containers = [node.children, node.blocks, node.items, node.records, node.sub_blocks, node.subBlocks]
      .filter(Array.isArray);
    if (Array.isArray(node.content) && node.content.some(item => isWolaiBlockLikeObject(item))) {
      containers.push(node.content);
    }
    return containers;
  };
  const hasRenderableNestedNodeContent = (node, stack = new Set()) => {
    if (!isPlainObject(node) || stack.has(node)) return false;
    stack.add(node);
    const result = getNestedNodeContainers(node).some(children => children.some(child => (
      hasRenderableNodeContent(child) || hasRenderableNestedNodeContent(child, stack)
    )));
    stack.delete(node);
    return result;
  };
  nodes.forEach(node => {
    const type = mapNodeType(node);
    if (type === 'database-embed') {
      const meta = normalizeTableRows(node);
      blocks.push(makeBlock('database-embed', '', {
        meta: buildDatabaseTableMeta(node, meta, getNodeHtml(node)),
      }));
      return;
    }
    if (type === 'table-simple') {
      const meta = normalizeTableRows(node);
      if (meta) blocks.push(makeBlock('table-simple', '', { meta }));
      return;
    }
    if (type === 'divider') {
      blocks.push(makeBlock('divider'));
      return;
    }
    if (type === 'image' || type === 'attachment' || type === 'video') {
      const media = extractMediaFromNode(node, type);
      if (media?.url) blocks.push(makeMediaBlock(makeBlock, { ...media, kind: type }));
      return;
    }
    if (type === 'external-link') {
      const url = buildInlineReferenceUrl(node);
      const html = getNodeHtml(node) || escapeHtml(url);
      if (url) {
        blocks.push(makeBlock('external-link', html, {
          meta: {
            url,
            title: stripHtml(html) || 'Wolai 文档链接',
            source_system: 'wolai_mcp',
          },
        }));
      }
      return;
    }
    const html = getNodeHtml(node);
    const text = stripHtml(html);
    if (!text && !['todo'].includes(type)) return;
    blocks.push(makeBlock(type, html, {
      checked: Boolean(node.checked || node.done || node.completed),
      meta: {
        source_system: 'wolai_mcp',
        ...((type === 'bullet' || type === 'numbered' || type === 'fold-list')
          ? { indent: Number(node.indent ?? node.depth ?? node.level ?? 0) || 0 }
          : {}),
        ...(type === 'fold-list'
          ? {
            collapsed: getWolaiCollapsedState(node, true),
            hasChildren: hasRenderableNestedNodeContent(node) || getWolaiHasChildrenState(node, false) === true,
          }
          : {}),
        ...(type?.startsWith('fold-heading') ? { collapsed: getWolaiCollapsedState(node, true), body: '' } : {}),
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

function parseMarkdownUrlToken(value = '') {
  return String(value || '').trim().replace(/^<|>$/g, '').replace(/\s+["'][^"']*["']$/, '');
}

function markdownMediaToBlock(makeBlock, url = '', label = '', forceKind = '') {
  const normalizedUrl = parseMarkdownUrlToken(url);
  if (!normalizedUrl) return null;
  const ext = getMediaExtFromUrl(label) || getMediaExtFromUrl(normalizedUrl);
  if (!forceKind && !ext) {
    return makeBlock('external-link', normalizedUrl, {
      meta: {
        url: normalizedUrl,
        filename: label || normalizedUrl,
      },
    });
  }
  const media = {
    kind: forceKind || (mediaImageExtensions.has(ext) ? 'image' : 'attachment'),
    url: normalizedUrl,
    filename: label || decodeURIComponent(String(normalizedUrl).split('?')[0].split('/').pop() || ''),
    display_name: label || decodeURIComponent(String(normalizedUrl).split('?')[0].split('/').pop() || ''),
    file_ext: ext,
    mimetype: '',
    size: 0,
    alt: label || '',
  };
  media.preview_status = getMediaPreviewStatus(media);
  return makeMediaBlock(makeBlock, media);
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
    const imageOnly = trimmed.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (imageOnly) {
      const block = markdownMediaToBlock(makeBlock, imageOnly[2], imageOnly[1], 'image');
      if (block) blocks.push(block);
      continue;
    }
    const linkOnly = trimmed.match(/^\[([^\]]+)]\(([^)]+)\)$/);
    if (linkOnly) {
      const block = markdownMediaToBlock(makeBlock, linkOnly[2], linkOnly[1]);
      if (block) {
        blocks.push(block);
        continue;
      }
    }
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
    const leadingSpaces = line.match(/^\s*/)?.[0]?.replace(/\t/g, '    ').length || 0;
    const indent = Math.min(Math.floor(leadingSpaces / 2), 8);
    const todo = trimmed.match(/^[-*]\s+\[([ xX])]\s+(.+)$/);
    if (todo) {
      blocks.push(makeBlock('todo', escapeHtml(todo[2]), { checked: todo[1].toLowerCase() === 'x' }));
      continue;
    }
    const foldBullet = trimmed.match(/^[-*]\s+(?:▶|▸|▾|▿|▼|\[toggle\]|\[fold\])\s*(.+)$/i)
      || trimmed.match(/^(?:▶|▸|▾|▿|▼)\s*(.+)$/);
    if (foldBullet) {
      const collapsed = /▶|▸|\[toggle\]|\[fold\]/i.test(foldBullet[0]);
      blocks.push(makeBlock('fold-list', escapeHtml(foldBullet[1]), { meta: { indent, collapsed } }));
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push(makeBlock('bullet', escapeHtml(bullet[1]), { meta: { indent } }));
      continue;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      blocks.push(makeBlock('numbered', escapeHtml(numbered[1]), { meta: { indent } }));
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
    if (block?.type === 'table-simple' || block?.type === 'database-embed') {
      const tableName = block.meta?.tableName || '';
      const columns = Array.isArray(block.meta?.columns) ? block.meta.columns.join('\t') : '';
      const rows = Array.isArray(block.meta?.rows) ? block.meta.rows.map(row => row.join('\t')).join('\n') : '';
      return [tableName, columns, rows].filter(Boolean).join('\n');
    }
    return stripHtml(block?.content || block?.meta?.url || '');
  }).filter(Boolean).join('\n');
}

function normalizePlainText(value = '') {
  return stripHtml(value)
    .replace(/\s+/g, '')
    .trim();
}

function isListBlock(block) {
  return block?.type === 'bullet' || block?.type === 'numbered' || block?.type === 'fold-list';
}

function hasWolaiHierarchyIndent(block) {
  return block?.meta?.source_system === 'wolai_mcp' && Number.isFinite(Number(block?.meta?.indent));
}

function normalizeListIndents(blocks = []) {
  const listBlocks = blocks.filter(block => isListBlock(block) || hasWolaiHierarchyIndent(block));
  if (!listBlocks.length) return blocks;
  const indents = listBlocks
    .map(block => Number(block?.meta?.indent))
    .filter(value => Number.isFinite(value));
  if (!indents.length) return blocks;
  const minIndent = Math.min(...indents);
  if (minIndent <= 0) return blocks;
  return blocks.map(block => {
    if (!isListBlock(block) && !hasWolaiHierarchyIndent(block)) return block;
    const indent = Number(block?.meta?.indent);
    if (!Number.isFinite(indent)) return block;
    return {
      ...block,
      meta: {
        ...(block.meta || {}),
        indent: Math.max(0, indent - minIndent),
      },
    };
  });
}

function removeLeadingDuplicateTitleBlock(blocks = [], title = '') {
  const normalizedTitle = normalizePlainText(title);
  if (!normalizedTitle) return blocks;
  const nextBlocks = [...blocks];
  while (nextBlocks.length) {
    const first = nextBlocks[0];
    const firstText = normalizePlainText(first?.content || first?.meta?.url || '');
    if (firstText !== normalizedTitle) break;
    nextBlocks.shift();
  }
  return nextBlocks;
}

function cleanImportedBlocks(blocks = [], title = '') {
  const withoutTitle = removeLeadingDuplicateTitleBlock(blocks, title);
  const withoutPageCover = withoutTitle.filter(block => {
    if (block?.type !== 'image') return true;
    const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
    const urls = [meta.original_url, meta.url, block.content].filter(Boolean);
    return !urls.some(isWolaiPageCoverUrl);
  });
  return normalizeListIndents(withoutPageCover);
}

function rankImportedContent(imported) {
  if (!imported || !Array.isArray(imported.blocks) || !imported.blocks.length) return -1;
  const textLength = collectBlocksText(imported.blocks).length;
  const blockScore = imported.blocks.length * 1000;
  const matchScore = imported.target_matched ? 200 : 0;
  return blockScore + Math.min(textLength, 999) + matchScore;
}

function chooseBetterImportedContent(current, candidate) {
  if (!candidate?.blocks?.length) return current;
  if (!current?.blocks?.length) return candidate;
  return rankImportedContent(candidate) > rankImportedContent(current) ? candidate : current;
}

function isStrongImportedContent(imported) {
  if (!imported?.blocks?.length) return false;
  const textLength = collectBlocksText(imported.blocks).length;
  const recursiveWarning = (imported.warnings || []).some(item => /递归读取/.test(String(item || '')));
  return recursiveWarning && imported.blocks.length >= 8 && textLength >= 120;
}

function isSubstantialImportedContent(imported) {
  if (!imported?.blocks?.length) return false;
  return imported.blocks.length >= 20 && collectBlocksText(imported.blocks).length >= 500;
}

function isFullPageBlocksTool(tool = {}) {
  const name = String(tool?.name || '').toLowerCase();
  return /page.*blocks|blocks.*page|document.*blocks|blocks.*document|get_doc/.test(name);
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
  const { text } = collectTextFromToolResult(result);
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
  const parsedContent = parseToolContent(result);
  const { payloads, wolaiRecords } = parsedContent;
  let blocks = [];
  if (wolaiRecords.length) {
    blocks = filterBlocks(recordsToBlocks(wolaiRecords, target.raw), target);
  }
  const nodes = [];
  if (!blocks.length) {
    payloads.forEach(payload => collectStructuredNodes(payload, nodes, { allowCollectionKeys: true }));
    blocks = filterBlocks(nodesToBlocks(nodes, target.raw), target);
  }
  if (!blocks.length && text && !looksLikeDiscoveryText(text, target) && !looksLikeJsonDumpText(text)) {
    blocks = filterBlocks(parseTextToBlocks(text, target.raw), target);
  }

  const title = payloads.map(findTitle).find(Boolean) || '';
  blocks = cleanImportedBlocks(blocks, title);
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
    wolai_records: wolaiRecords,
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
    blockId: '',
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
  let bestImported = null;
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
        let imported = normalizeImportedContent({ result, target, tool });
        if (imported.wolai_records?.length) {
          // eslint-disable-next-line no-await-in-loop
          const expandedRecords = await expandWolaiRecordsWithChildCalls({
            client,
            tools: contentCandidates,
            target,
            records: imported.wolai_records,
          });
          if (expandedRecords.length > imported.wolai_records.length) {
            const expandedBlocks = cleanImportedBlocks(
              filterBlocks(recordsToBlocks(expandedRecords, target.raw), target),
              imported.title
            );
            if (expandedBlocks.length > imported.blocks.length) {
              imported = {
                ...imported,
                warnings: [...(imported.warnings || []), `已递归读取 ${expandedRecords.length - imported.wolai_records.length} 个 Wolai 子块`],
                blocks: expandedBlocks,
                content_text: collectBlocksText(expandedBlocks),
                wolai_records: expandedRecords,
              };
            }
          }
        }
        if (imported.blocks.length) {
          const finalTitle = options.title || imported.title || 'Wolai MCP 导入文档';
          let finalBlocks = cleanImportedBlocks(imported.blocks, finalTitle);
          // eslint-disable-next-line no-await-in-loop
          const databaseEnrichment = await enrichWolaiDatabaseBlocks(finalBlocks, token);
          if (databaseEnrichment.errors?.length && process.env.WOLAI_MCP_ALLOW_INCOMPLETE_DATABASE !== '1') {
            throw makeWolaiDatabaseRowsBlockingError(databaseEnrichment.errors.join('；'));
          }
          finalBlocks = databaseEnrichment.blocks;
          const finalImported = {
            ...imported,
            title: finalTitle,
            blocks: finalBlocks,
            content_text: collectBlocksText(finalBlocks),
            source_url: imported.source_url || target.url,
            tool_name: tool.name,
            tool_arguments: args,
            available_tools: tools.map(item => item.name),
            warnings: [...(imported.warnings || []), ...(databaseEnrichment.warnings || [])],
          };
          bestImported = chooseBetterImportedContent(bestImported, finalImported);
          if (isStrongImportedContent(bestImported) || (isFullPageBlocksTool(tool) && isSubstantialImportedContent(finalImported))) {
            return bestImported;
          }
          break;
        }
        errors.push(`${tool.name}: 未解析出正文`);
      } catch (error) {
        if (isWolaiDatabaseRowsBlockingError(error)) throw error;
        errors.push(`${tool.name}: ${error.message || '调用失败'}`);
      }
    }
  }

  if (bestImported?.blocks?.length) return bestImported;
  throw new Error(`未能通过 Wolai MCP 读取目标页面正文。已跳过搜索/列表类工具：${skippedDiscoveryTools.join('、') || '无'}。可用工具：${tools.map(tool => tool.name).join('、')}。尝试结果：${errors.slice(0, 6).join('；') || '没有发现可读取页面正文的工具'}`);
}

module.exports = {
  importWolaiMcpToBlocks,
  collectBlocksText,
  extractWolaiPageId,
  __test: {
    buildWolaiChildTarget,
    cleanImportedBlocks,
    getWolaiExpansionQueueIds,
    getNodeHtml,
    normalizeRecoveredWolaiParentRecords,
    recordsToBlocks,
  },
};
