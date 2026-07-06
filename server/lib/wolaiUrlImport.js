const crypto = require('crypto');

const DEFAULT_CDP = 'http://127.0.0.1:9222';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function stripHtmlTags(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
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

function sanitizeHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function absolutizeUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return String(value || '');
  }
}

function makeBlockFactory(seed) {
  let index = 0;
  const prefix = `b_wolai_${sha256(seed).slice(0, 8)}`;
  return (type = 'paragraph', content = '', extra = {}) => {
    index += 1;
    return {
      id: `${prefix}_${String(index).padStart(4, '0')}`,
      type,
      content: type === 'divider' ? '' : String(content || ''),
      highlight: '',
      checked: Boolean(extra.checked),
      meta: extra.meta || {},
      ...extra,
    };
  };
}

function parseHtmlTable(html, makeBlock) {
  const rows = [];
  const rowMatches = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  rowMatches.forEach(rowHtml => {
    const cells = [];
    const cellMatches = rowHtml.match(/<(td|th)[^>]*>[\s\S]*?<\/\1>/gi) || [];
    cellMatches.forEach(cellHtml => cells.push(stripHtmlTags(cellHtml)));
    if (cells.length) rows.push(cells);
  });
  if (!rows.length) return null;
  const columnCount = Math.max(...rows.map(row => row.length), 1);
  return makeBlock('table-simple', '', {
    meta: {
      columns: Array.from({ length: columnCount }, (_, index) => `字段 ${index + 1}`),
      rows: rows.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || '')),
      mergedCells: [],
    },
  });
}

function looksLikeFileLink(href, text) {
  return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt|md)(\?|#|$)/i.test(href || '')
    || /下载|附件|文件|\.pdf|\.doc|\.xls|\.ppt|\.zip/i.test(text || '');
}

function parseHtmlToBlocks(html, pageUrl, seed) {
  const clean = sanitizeHtml(html);
  const makeBlock = makeBlockFactory(seed || pageUrl || clean.slice(0, 80));
  const blocks = [];
  const tokenPattern = /<(h[1-6]|p|li|blockquote|pre|table|img|a)\b[^>]*>[\s\S]*?(?:<\/\1>|$)|<img\b[^>]*\/?>/gi;
  let match;

  while ((match = tokenPattern.exec(clean))) {
    const fragment = match[0];
    const tag = (match[1] || 'img').toLowerCase();
    if (tag === 'table') {
      const tableBlock = parseHtmlTable(fragment, makeBlock);
      if (tableBlock) blocks.push(tableBlock);
      continue;
    }
    if (tag === 'img') {
      const src = fragment.match(/\ssrc=["']([^"']+)["']/i)?.[1];
      if (!src) continue;
      const alt = fragment.match(/\salt=["']([^"']*)["']/i)?.[1] || '';
      const url = absolutizeUrl(src, pageUrl);
      blocks.push(makeBlock('image', url, {
        meta: {
          url,
          filename: alt || url.split('/').pop()?.split('?')[0] || '图片',
          attachment_id: null,
          embedOnly: true,
        },
      }));
      continue;
    }
    if (tag === 'a') {
      const href = fragment.match(/\shref=["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      const url = absolutizeUrl(href, pageUrl);
      const text = stripHtmlTags(fragment) || url;
      if (looksLikeFileLink(url, text)) {
        blocks.push(makeBlock('external-link', url, { meta: { url, filename: text } }));
      }
      continue;
    }
    const text = stripHtmlTags(fragment);
    if (!text) continue;
    if (/^h[1-6]$/.test(tag)) {
      blocks.push(makeBlock(`heading${Math.min(4, Number(tag.slice(1)))}`, text));
    } else if (tag === 'li') {
      blocks.push(makeBlock('bullet', text, { meta: { indent: 0 } }));
    } else if (tag === 'blockquote') {
      blocks.push(makeBlock('quote', text));
    } else if (tag === 'pre') {
      blocks.push(makeBlock('code', text));
    } else {
      blocks.push(makeBlock('paragraph', text));
    }
  }

  if (!blocks.length) {
    stripHtmlTags(clean).split(/\n{2,}|\r?\n/).map(line => line.trim()).filter(Boolean)
      .forEach(line => blocks.push(makeBlock('paragraph', line)));
  }
  return blocks.length ? blocks : [makeBlock('paragraph', '')];
}

function collectBlocksText(blocks) {
  const parts = [];
  const visit = value => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = stripHtmlTags(String(value)).trim();
      if (text) parts.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      ['content', 'text', 'title', 'meta', 'url', 'filename', 'display_name', 'columns', 'rows', 'cells', 'body', 'value'].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key]);
      });
    }
  };
  visit(blocks);
  return parts.join('\n').slice(0, 20000);
}

function cleanTitle(value, fallback = '未命名文档') {
  const title = String(value || '')
    .replace(/\s*[-|]\s*wolai.*$/i, '')
    .replace(/\s*[-|]\s*我来.*$/i, '')
    .trim();
  return title || fallback;
}

function isLikelyAuthPage(title, text, url) {
  const haystack = `${title || ''}\n${text || ''}`.toLowerCase();
  let isWolaiHost = false;
  try {
    isWolaiHost = new URL(url).hostname.toLowerCase().includes('wolai');
  } catch {
    isWolaiHost = false;
  }
  if (!isWolaiHost) return false;
  if ((text || '').length > 120 && !/登录|扫码|login|sign in/i.test(haystack)) return false;
  return /登录|扫码|login|sign in|验证码/.test(haystack) || (text || '').length < 40;
}

async function captureByFetch(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 Relation-Wolai-Importer/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const html = await response.text();
  const title = cleanTitle(stripHtmlTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
    || stripHtmlTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]));
  const blocks = parseHtmlToBlocks(html, url, url);
  const text = collectBlocksText(blocks);
  if (isLikelyAuthPage(title, text, url)) {
    throw new Error('Wolai 页面需要登录态，普通 fetch 无法读取正文');
  }
  return { method: 'fetch', title, pageUrl: url, html, plainText: text, blocks };
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.webSocketUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', event => reject(new Error(event.message || 'Chrome WebSocket 连接失败')));
      this.ws.addEventListener('message', event => this.handleMessage(event.data));
      this.ws.addEventListener('close', () => {
        this.pending.forEach(({ reject: rejectPending }) => rejectPending(new Error('Chrome WebSocket 已关闭')));
        this.pending.clear();
      });
    });
  }

  handleMessage(data) {
    const message = JSON.parse(String(data));
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    if (message.method) {
      (this.listeners.get(message.method) || []).forEach(callback => callback(message));
    }
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP 调用超时: ${method}`));
      }, 30000);
    });
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Chrome 调试端口不可用: ${response.status}`);
  return response.json();
}

async function evaluate(client, sessionId, fn, ...args) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面执行脚本失败');
  return result.result?.value;
}

async function captureByChrome(url, options = {}) {
  const cdpBase = String(options.cdp || DEFAULT_CDP).replace(/\/$/, '');
  const version = await fetchJson(`${cdpBase}/json/version`);
  if (!version.webSocketDebuggerUrl) throw new Error('Chrome 调试端口未开启');
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  let targetId;
  let sessionId;
  try {
    const target = await client.send('Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await client.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = attached.sessionId;
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Page.navigate', { url }, sessionId);
    await new Promise(resolve => setTimeout(resolve, Number(options.waitMs || 3000)));
    await evaluate(client, sessionId, async function scrollPage() {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const step = Math.max(Math.floor(window.innerHeight * 0.85), 500);
      for (let y = 0; y <= max; y += step) {
        window.scrollTo(0, y);
        await sleep(120);
      }
      window.scrollTo(0, 0);
      await sleep(200);
      return true;
    });
    const snapshot = await evaluate(client, sessionId, function extract() {
      const isVisible = element => {
        if (!element || !(element instanceof Element)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const textOf = element => String(element?.innerText || element?.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      const scoreRoot = element => {
        const text = textOf(element);
        if (!text) return 0;
        const rect = element.getBoundingClientRect();
        let score = Math.min(text.length, 50000);
        if (['MAIN', 'ARTICLE'].includes(element.tagName)) score += 8000;
        if (element.querySelector('h1')) score += 5000;
        if (element.querySelector('[contenteditable="true"]')) score += 4000;
        if (/sidebar|menu|nav|header|footer/i.test(element.className || '')) score -= 12000;
        if (rect.width < window.innerWidth * 0.35) score -= 5000;
        return score;
      };
      const selectors = ['main', 'article', '[role="main"]', '[class*="editor"]', '[class*="document"]', '[class*="doc"]', '[class*="page"]', '[class*="content"]', '[contenteditable="true"]'];
      const candidates = [...new Set(selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))))]
        .filter(isVisible)
        .filter(element => textOf(element).length >= 20);
      candidates.push(document.body);
      const root = candidates.map(element => ({ element, score: scoreRoot(element) })).sort((a, b) => b.score - a.score)[0]?.element || document.body;
      const clone = root.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, svg, button, input, textarea, select, [aria-hidden="true"]').forEach(node => node.remove());
      clone.querySelectorAll('*').forEach(node => {
        [...node.attributes].forEach(attr => {
          if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
        });
        if (node.getAttribute('src')) node.setAttribute('src', new URL(node.getAttribute('src'), location.href).toString());
        if (node.getAttribute('href')) node.setAttribute('href', new URL(node.getAttribute('href'), location.href).toString());
      });
      const h1 = Array.from(document.querySelectorAll('h1')).find(isVisible);
      return {
        title: textOf(h1) || document.title || '',
        pageUrl: location.href,
        html: clone.innerHTML,
        plainText: textOf(root),
      };
    });
    const title = cleanTitle(snapshot.title);
    const blocks = parseHtmlToBlocks(snapshot.html || snapshot.plainText, snapshot.pageUrl || url, url);
    const text = collectBlocksText(blocks) || snapshot.plainText || '';
    if (isLikelyAuthPage(title, text, url)) {
      throw new Error('Chrome 页面没有读取到 Wolai 正文，请确认专用 Chrome 已登录并能打开该 URL');
    }
    return {
      method: 'chrome',
      title,
      pageUrl: snapshot.pageUrl || url,
      html: snapshot.html || '',
      plainText: text,
      blocks,
    };
  } finally {
    try { if (sessionId) await client.send('Target.detachFromTarget', { sessionId }); } catch {}
    try { if (targetId) await client.send('Target.closeTarget', { targetId }); } catch {}
    client.close();
  }
}

async function importWolaiUrlToBlocks(url, options = {}) {
  const warnings = [];
  let captured;
  if (options.preferChrome !== false) {
    try {
      captured = await captureByChrome(url, options);
    } catch (error) {
      warnings.push(`chrome:${error.message}`);
    }
  }
  if (!captured) {
    try {
      captured = await captureByFetch(url);
    } catch (error) {
      warnings.push(`fetch:${error.message}`);
      throw new Error(`无法导入 Wolai URL。${warnings.join('；')}`);
    }
  }
  const contentText = collectBlocksText(captured.blocks);
  return {
    title: cleanTitle(options.title || captured.title),
    source_url: captured.pageUrl || url,
    source_record_key: `wolai:url:${sha256(url).slice(0, 24)}`,
    source_payload_hash: sha256(JSON.stringify({
      url,
      title: captured.title,
      text: contentText,
      html: captured.html,
    })),
    capture_method: captured.method,
    warnings,
    blocks: captured.blocks,
    content_text: contentText,
  };
}

module.exports = {
  importWolaiUrlToBlocks,
  parseHtmlToBlocks,
  collectBlocksText,
};
