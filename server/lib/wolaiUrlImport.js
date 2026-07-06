const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_CDP = 'http://127.0.0.1:9222';
const repoRoot = path.resolve(__dirname, '..', '..');
const defaultChromeProfileDir = path.join(repoRoot, 'tmp', 'chrome-wolai-profile');

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
  const tokenPattern = /<(h[1-6]|p|ul|ol|li|blockquote|pre|table|img|a)\b[^>]*>[\s\S]*?(?:<\/\1>|$)|<img\b[^>]*\/?>/gi;
  let match;

  while ((match = tokenPattern.exec(clean))) {
    const fragment = match[0];
    const tag = (match[1] || 'img').toLowerCase();
    if (tag === 'table') {
      const tableBlock = parseHtmlTable(fragment, makeBlock);
      if (tableBlock) blocks.push(tableBlock);
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      const listType = tag === 'ol' ? 'numbered' : 'bullet';
      const itemMatches = fragment.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
      itemMatches.forEach(itemHtml => {
        const text = stripHtmlTags(itemHtml);
        if (text) blocks.push(makeBlock(listType, text, { meta: { indent: 0 } }));
      });
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

function getWolaiUrlKey(value) {
  try {
    const url = new URL(value);
    if (!url.hostname.toLowerCase().includes('wolai')) return '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

function resolveExecutableOnPath(command) {
  if (!command || command.includes(path.sep)) return '';
  const searchPaths = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of searchPaths) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return '';
}

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.platform === 'win32' ? 'chrome.exe' : null,
    process.platform === 'linux' ? 'chromium' : null,
    process.platform === 'linux' ? 'chromium-browser' : null,
    process.platform === 'linux' ? 'google-chrome' : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep)) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
      const resolved = resolveExecutableOnPath(candidate);
      if (resolved) return resolved;
    } catch {}
  }
  return '';
}

function getRandomDebugPort() {
  return 9300 + Math.floor(Math.random() * 600);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForChromeCdp(cdpBase, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const version = await fetchJson(`${cdpBase}/json/version`);
      if (version?.webSocketDebuggerUrl) return version;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(lastError?.message || '自动 Chrome 调试端口启动超时');
}

function buildManagedChromeArgs({ port, profileDir, headless }) {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-features=Translate,BackForwardCache',
    '--disable-blink-features=AutomationControlled',
    '--remote-allow-origins=*',
    '--window-size=1440,1200',
    'about:blank',
  ];
  if (headless) {
    args.unshift('--headless=new');
    args.unshift('--disable-gpu');
    if (process.platform === 'linux') args.unshift('--no-sandbox');
  }
  return args;
}

async function captureByManagedChrome(url, options = {}) {
  const chrome = resolveChromeExecutable();
  if (!chrome) throw new Error('未找到可用的 Chrome/Chromium');
  const profileDir = path.resolve(
    options.autoChromeProfileDir
      || process.env.WOLAI_CHROME_PROFILE_DIR
      || defaultChromeProfileDir
  );
  fs.mkdirSync(profileDir, { recursive: true });
  const port = Number(options.autoChromePort) || getRandomDebugPort();
  const cdp = `http://127.0.0.1:${port}`;
  const headless = options.autoChromeHeadless !== undefined
    ? Boolean(options.autoChromeHeadless)
    : process.env.WOLAI_AUTO_CHROME_HEADLESS === '1';
  const chromeArgs = buildManagedChromeArgs({ port, profileDir, headless });
  const child = spawn(chrome, chromeArgs, {
    detached: false,
    stdio: 'ignore',
  });
  let closed = false;
  let launchError = null;
  child.once('error', error => {
    launchError = error;
    closed = true;
  });
  child.once('exit', () => { closed = true; });
  try {
    await sleep(200);
    if (launchError) throw launchError;
    await waitForChromeCdp(cdp, Number(options.autoChromeStartupMs || 12000));
    const captured = await captureByChrome(url, {
      ...options,
      cdp,
      useOpenTab: false,
      waitMs: Math.max(Number(options.waitMs || 3000), 5000),
    });
    return {
      ...captured,
      method: headless ? 'chrome-auto-headless' : 'chrome-auto',
    };
  } catch (error) {
    if (closed) {
      throw new Error(`自动 Chrome 启动失败，请确认服务器可运行 Chrome/Chromium。${error.message}`);
    }
    throw error;
  } finally {
    try {
      if (!closed) child.kill();
    } catch {}
  }
}

function findMatchingWolaiTab(tabs, targetUrl) {
  const targetKey = getWolaiUrlKey(targetUrl);
  if (!targetKey) return null;
  const pages = (Array.isArray(tabs) ? tabs : [])
    .filter(tab => tab?.type === 'page' && tab.id && /^https?:/i.test(tab.url || ''));
  return pages.find(tab => getWolaiUrlKey(tab.url) === targetKey)
    || pages.find(tab => String(tab.url || '').includes(targetUrl))
    || null;
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

function isLikelyWolaiErrorPage(title, text, url) {
  let isWolaiHost = false;
  try {
    isWolaiHost = new URL(url).hostname.toLowerCase().includes('wolai');
  } catch {
    isWolaiHost = false;
  }
  if (!isWolaiHost) return false;
  const normalized = `${title || ''}\n${text || ''}`
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  if (/网络可能有一点问题|请重新加载|加载失败|页面加载失败|重新加载/.test(normalized)
    && /我来\s*wolai|不仅仅是未来的云端协作平台|重新加载|网络可能/.test(normalized)) {
    return true;
  }
  if (/无权限|没有权限|访问受限|页面不存在|文档不存在|已被删除/.test(normalized)) return true;
  return false;
}

function assertUsableWolaiCapture(title, text, url) {
  if (isLikelyAuthPage(title, text, url)) {
    throw new Error('Wolai 页面需要登录态，未读取到正文');
  }
  if (isLikelyWolaiErrorPage(title, text, url)) {
    throw new Error('Wolai 页面加载失败，只读取到错误页。通常是该 URL 需要登录态、访问权限，或 Wolai 未向当前 Chrome profile 返回正文');
  }
}

function sanitizeInlineHtml(value) {
  const raw = String(value || '');
  if (!raw) return '';
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s(?:on\w+|class|id|data-[\w-]+|spellcheck|contenteditable|placeholder)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:src|srcset)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\shref=(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/<\/?(?!strong\b|b\b|em\b|i\b|u\b|s\b|strike\b|del\b|code\b|span\b|mark\b|a\b|br\b)[a-z][^>]*>/gi, '')
    .replace(/\sstyle=(["'])([\s\S]*?)\1/gi, (_match, quote, styleText) => {
      const allowed = String(styleText || '')
        .split(';')
        .map(item => item.trim())
        .filter(item => /^(font-weight|font-style|text-decoration|color|background-color)\s*:/i.test(item))
        .join('; ');
      return allowed ? ` style=${quote}${allowed}${quote}` : '';
    })
    .trim();
}

function normalizeBrowserBlocks(rawBlocks, pageUrl, seed) {
  const makeBlock = makeBlockFactory(seed || pageUrl || JSON.stringify(rawBlocks || []).slice(0, 80));
  const validTypes = new Set([
    'paragraph', 'heading1', 'heading2', 'heading3', 'heading4',
    'bullet', 'numbered', 'todo', 'quote', 'code',
    'table-simple', 'image', 'external-link',
  ]);
  const blocks = [];
  (Array.isArray(rawBlocks) ? rawBlocks : []).forEach(rawBlock => {
    const type = validTypes.has(rawBlock?.type) ? rawBlock.type : 'paragraph';
    const content = type === 'divider' ? '' : sanitizeInlineHtml(rawBlock?.content ?? rawBlock?.text ?? '');
    const plain = stripHtmlTags(content);
    if (!plain && !['image', 'external-link', 'table-simple'].includes(type)) return;
    const meta = rawBlock?.meta && typeof rawBlock.meta === 'object' ? { ...rawBlock.meta } : {};
    if (type === 'bullet' || type === 'numbered') {
      const indent = Number(meta.indent);
      meta.indent = Number.isFinite(indent) ? Math.max(0, Math.min(8, Math.round(indent))) : 0;
    }
    blocks.push(makeBlock(type, content, {
      checked: Boolean(rawBlock?.checked),
      meta,
    }));
  });
  return blocks;
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
  assertUsableWolaiCapture(title, text, url);
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
  const openTabs = await fetchJson(`${cdpBase}/json/list`).catch(() => []);
  const existingTab = options.useOpenTab !== false ? findMatchingWolaiTab(openTabs, url) : null;
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  let targetId;
  let sessionId;
  let createdTarget = false;
  try {
    if (existingTab) {
      targetId = existingTab.id;
    } else {
      const target = await client.send('Target.createTarget', { url: 'about:blank' });
      targetId = target.targetId;
      createdTarget = true;
    }
    const attached = await client.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = attached.sessionId;
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    if (!existingTab) await client.send('Page.navigate', { url }, sessionId);
    await new Promise(resolve => setTimeout(resolve, Number(options.waitMs || 3000)));
    const snapshot = await evaluate(client, sessionId, async function extract(expectedUrl, waitMs) {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
      const isWolaiErrorText = value => /网络可能有一点问题|请重新加载|加载失败|页面加载失败/.test(String(value || ''));
      const clickReloadIfNeeded = async () => {
        const bodyText = textOf(document.body);
        if (!isWolaiErrorText(bodyText)) return false;
        const reloadNode = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'))
          .filter(isVisible)
          .find(element => textOf(element) === '重新加载');
        if (!reloadNode) return false;
        reloadNode.click();
        await sleep(Math.max(Number(waitMs || 0), 3000));
        return true;
      };
      await clickReloadIfNeeded();

      function cleanInlineHtml(element) {
        const clone = element.cloneNode(true);
        clone.querySelectorAll('script, style, noscript, svg, button, input, textarea, select, [aria-hidden="true"]').forEach(node => node.remove());
        clone.querySelectorAll('*').forEach(node => {
          [...node.attributes].forEach(attr => {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
            if (['class', 'id', 'contenteditable', 'spellcheck', 'placeholder'].includes(attr.name) || attr.name.startsWith('data-')) {
              node.removeAttribute(attr.name);
            }
          });
          const style = node.getAttribute('style') || '';
          const allowedStyle = style.split(';')
            .map(item => item.trim())
            .filter(item => /^(font-weight|font-style|text-decoration|color|background-color)\s*:/i.test(item))
            .join('; ');
          if (allowedStyle) node.setAttribute('style', allowedStyle);
          else node.removeAttribute('style');
          if (node.getAttribute('href')) {
            try { node.setAttribute('href', new URL(node.getAttribute('href'), location.href).toString()); } catch {}
          }
        });
        return clone.innerHTML || textOf(element);
      }

      function getWolaiEditor() {
        return document.querySelector('#wolai-main-editor-wrapper')
          || document.querySelector('#wolai-main-editor')
          || document.querySelector('.mac-editor')
          || document.querySelector('[class*="editor"]');
      }

      function countWolaiIndent(element, editor) {
        let indent = 0;
        for (let node = element.parentElement; node && node !== editor; node = node.parentElement) {
          if (node.getAttribute?.('data-type') === 'subnode') indent += 1;
        }
        return Math.max(0, Math.min(indent, 8));
      }

      function inferBlockType(element, wrapper) {
        const blockType = String(wrapper?.getAttribute?.('data-block-type') || '').toLowerCase();
        const placeholder = String(element.getAttribute('placeholder') || '').toLowerCase();
        if (/enum|number|ordered|数字/.test(`${blockType} ${placeholder}`)) return 'numbered';
        if (/bullet|unordered|list|无序|项目符号/.test(`${blockType} ${placeholder}`)) return 'bullet';
        if (/todo|check|待办/.test(`${blockType} ${placeholder}`)) return 'todo';
        if (/quote|引用/.test(`${blockType} ${placeholder}`)) return 'quote';
        if (/code|代码/.test(`${blockType} ${placeholder}`)) return 'code';
        if (/head|title|标题/.test(`${blockType} ${placeholder}`)) {
          const levelMatch = `${blockType} ${placeholder}`.match(/[1-4]/);
          return `heading${levelMatch ? Number(levelMatch[0]) : 2}`;
        }
        const style = window.getComputedStyle(element);
        const fontSize = Number.parseFloat(style.fontSize || '0');
        const fontWeight = Number.parseInt(style.fontWeight || '400', 10);
        if (fontWeight >= 600 && fontSize >= 26) return 'heading1';
        if (fontWeight >= 600 && fontSize >= 21) return 'heading2';
        if (fontWeight >= 600 && fontSize >= 17) return 'heading3';
        return 'paragraph';
      }

      function collectVisibleWolaiBlocks(seen) {
        const editor = getWolaiEditor();
        if (!editor) return [];
        const editables = Array.from(editor.querySelectorAll('[contenteditable="true"]'))
          .filter(element => !element.classList.contains('wolai-page-title'))
          .filter(element => !element.closest('.wolai-page-title'))
          .filter(isVisible);
        const collected = [];
        editables.forEach((element, index) => {
          const text = textOf(element);
          if (!text) return;
          const wrapper = element.closest('[data-block-type]') || element.parentElement;
          const blockId = wrapper?.getAttribute?.('data-block-id')
            || wrapper?.getAttribute?.('data-id')
            || wrapper?.id
            || `${index}:${text}`;
          if (seen.has(blockId)) return;
          const type = inferBlockType(element, wrapper);
          const meta = {};
          if (type === 'numbered' || type === 'bullet') {
            meta.indent = countWolaiIndent(element, editor);
            const marker = wrapper?.getAttribute?.('data-enum');
            if (marker) meta.sourceMarker = marker;
          }
          const block = {
            id: blockId,
            type,
            content: cleanInlineHtml(element),
            text,
            meta,
            source_block_type: wrapper?.getAttribute?.('data-block-type') || '',
          };
          seen.set(blockId, block);
          collected.push(block);
        });
        return collected;
      }

      function getScrollElement() {
        const editor = getWolaiEditor();
        const candidates = [];
        for (let node = editor; node; node = node.parentElement) candidates.push(node);
        candidates.push(document.scrollingElement, document.documentElement, document.body);
        return candidates
          .filter(Boolean)
          .filter(element => element.scrollHeight > element.clientHeight + 80)
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]
          || document.scrollingElement
          || document.documentElement;
      }

      function scrollTopOf(element) {
        if (element === document.body || element === document.documentElement || element === document.scrollingElement) {
          return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        }
        return element.scrollTop || 0;
      }

      function scrollToTop(element, top) {
        if (element === document.body || element === document.documentElement || element === document.scrollingElement) {
          window.scrollTo(0, top);
        } else {
          element.scrollTop = top;
        }
      }

      async function collectWolaiBlocksAcrossScroll() {
        const editor = getWolaiEditor();
        if (!editor) return [];
        const seen = new Map();
        const scrollElement = getScrollElement();
        const originalTop = scrollTopOf(scrollElement);
        const maxScroll = Math.max(0, (scrollElement.scrollHeight || document.documentElement.scrollHeight || 0)
          - (scrollElement.clientHeight || window.innerHeight || 0));
        const step = Math.max(Math.floor((scrollElement.clientHeight || window.innerHeight || 800) * 0.75), 420);
        scrollToTop(scrollElement, 0);
        await sleep(120);
        collectVisibleWolaiBlocks(seen);
        for (let y = step; y <= maxScroll + step; y += step) {
          scrollToTop(scrollElement, Math.min(y, maxScroll));
          await sleep(160);
          collectVisibleWolaiBlocks(seen);
        }
        scrollToTop(scrollElement, originalTop || 0);
        await sleep(80);
        return Array.from(seen.values());
      }

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
      const wolaiTitle = document.querySelector('.wolai-page-title[contenteditable="true"], .wolai-page-title');
      const wolaiBlocks = await collectWolaiBlocksAcrossScroll();
      const wolaiPlainText = wolaiBlocks.map(block => block.text).filter(Boolean).join('\n');
      return {
        title: textOf(wolaiTitle) || textOf(h1) || document.title || '',
        pageUrl: location.href,
        html: clone.innerHTML,
        plainText: wolaiPlainText || textOf(root),
        blocks: wolaiBlocks,
        expectedUrl,
      };
    }, url, Number(options.waitMs || 3000));
    const title = cleanTitle(snapshot.title);
    const browserBlocks = normalizeBrowserBlocks(snapshot.blocks, snapshot.pageUrl || url, url);
    const blocks = browserBlocks.length
      ? browserBlocks
      : parseHtmlToBlocks(snapshot.html || snapshot.plainText, snapshot.pageUrl || url, url);
    const text = collectBlocksText(blocks) || snapshot.plainText || '';
    assertUsableWolaiCapture(title, text, snapshot.pageUrl || url);
    if (getWolaiUrlKey(url) && text.trim().length < 20) {
      throw new Error('Chrome 页面没有读取到足够的 Wolai 正文，可能是页面尚未加载完成或当前 Chrome profile 无访问权限');
    }
    return {
      method: existingTab ? 'chrome-open-tab' : 'chrome',
      title,
      pageUrl: snapshot.pageUrl || url,
      html: snapshot.html || '',
      plainText: text,
      blocks,
    };
  } finally {
    try { if (sessionId) await client.send('Target.detachFromTarget', { sessionId }); } catch {}
    try { if (createdTarget && targetId) await client.send('Target.closeTarget', { targetId }); } catch {}
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
  if (!captured && options.autoLaunchChrome !== false) {
    try {
      captured = await captureByManagedChrome(url, options);
    } catch (error) {
      warnings.push(`auto-chrome:${error.message}`);
    }
  }
  if (!captured) {
    try {
      captured = await captureByFetch(url);
    } catch (error) {
      warnings.push(`fetch:${error.message}`);
      throw new Error(`无法导入 URL。${warnings.join('；')}`);
    }
  }
  const contentText = collectBlocksText(captured.blocks);
  return {
    title: cleanTitle(options.title || captured.title),
    source_url: captured.pageUrl || url,
    source_record_key: `url:${sha256(url).slice(0, 24)}`,
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
