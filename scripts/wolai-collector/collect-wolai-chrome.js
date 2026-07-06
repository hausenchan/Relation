#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultCdp = 'http://127.0.0.1:9222';
const defaultOutputDir = path.join(repoRoot, 'tmp', 'wolai-export');

function parseArgs(argv) {
  const args = {
    cdp: defaultCdp,
    output: '',
    workspace: '产品运营周重点',
    folderPath: '01-产品设计/003-支付宝产品',
    batch: `wolai_chrome_${formatDateToken(new Date())}`,
    waitMs: 3000,
    scroll: true,
    fromOpenTabs: false,
    matchUrl: 'wolai',
    matchTitle: '',
    closeTabs: true,
    limit: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === '--url-file') args.urlFile = next();
    else if (token === '--url') args.urls = [...(args.urls || []), next()];
    else if (token === '--from-open-tabs') args.fromOpenTabs = true;
    else if (token === '--cdp') args.cdp = next();
    else if (token === '--output' || token === '-o') args.output = next();
    else if (token === '--workspace') args.workspace = next();
    else if (token === '--folder-path') args.folderPath = next();
    else if (token === '--batch') args.batch = next();
    else if (token === '--wait-ms') args.waitMs = Number(next()) || 0;
    else if (token === '--no-scroll') args.scroll = false;
    else if (token === '--keep-tabs') args.closeTabs = false;
    else if (token === '--match-url') args.matchUrl = next();
    else if (token === '--match-title') args.matchTitle = next();
    else if (token === '--limit') args.limit = Number(next()) || 0;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`未知参数: ${token}`);
  }

  if (!args.output) {
    args.output = path.join(defaultOutputDir, '003-支付宝产品', `${args.batch}.json`);
  }
  args.output = path.resolve(repoRoot, args.output);
  if (args.urlFile) args.urlFile = path.resolve(repoRoot, args.urlFile);
  return args;
}

function printHelp() {
  console.log(`
Wolai Chrome 采集 Demo

前置条件:
  1. 先执行 npm run wolai:chrome
  2. 在打开的 Chrome 里登录 Wolai
  3. 准备 URL 清单，或把 7 个 Wolai 页面打开成标签页

URL 清单采集:
  npm run wolai:collect -- \\
    --url-file scripts/wolai-collector/examples/alipay-product-urls.template.json \\
    --output tmp/wolai-export/003-支付宝产品/chrome-capture.json

采集当前已打开标签页:
  npm run wolai:collect -- \\
    --from-open-tabs \\
    --match-url wolai \\
    --match-title 支付宝 \\
    --output tmp/wolai-export/003-支付宝产品/chrome-capture.json

常用参数:
  --url-file <path>      URL 清单，支持 JSON 数组、{documents:[...]}, 或一行一个 URL 的 txt
  --url <url>            追加单个 URL，可重复
  --from-open-tabs       不新开页面，采集当前 Chrome 里匹配的标签页
  --match-url <text>     from-open-tabs 时按 URL 过滤，默认 wolai
  --match-title <text>   from-open-tabs 时按标题过滤
  --workspace <name>     输出 workspaceName，默认 产品运营周重点
  --folder-path <path>   输出 folderPath，默认 01-产品设计/003-支付宝产品
  --output <path>        输出 JSON 文件
  --wait-ms <n>          页面加载后额外等待，默认 3000
  --no-scroll            不自动滚动页面
  --keep-tabs            URL 清单模式下采集后不关闭新开的标签页
  --cdp <url>            Chrome 调试地址，默认 http://127.0.0.1:9222
`);
}

function formatDateToken(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeCdpBase(value) {
  return String(value || defaultCdp).replace(/\/$/, '');
}

async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`无法连接 Chrome 调试端口 ${url}。请先运行 npm run wolai:chrome，并在打开的 Chrome 里登录 Wolai。原始错误: ${error.message}`);
  }
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`);
  return response.json();
}

function loadUrlEntries(args) {
  const entries = [];
  if (args.urlFile) {
    if (!fs.existsSync(args.urlFile)) throw new Error(`URL 清单不存在: ${args.urlFile}`);
    const raw = fs.readFileSync(args.urlFile, 'utf8').trim();
    if (raw) {
      if (args.urlFile.endsWith('.json')) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.pages || parsed.urls || []);
        list.forEach(item => {
          if (typeof item === 'string') entries.push({ pageUrl: item });
          else if (item?.url || item?.pageUrl || item?.page_url) {
            entries.push({
              title: item.title || item.pageTitle || item.page_title || '',
              pageUrl: item.pageUrl || item.page_url || item.url,
              folderPath: item.folderPath || item.folder_path || args.folderPath,
              workspaceName: item.workspaceName || item.workspace_name || args.workspace,
            });
          }
        });
      } else {
        raw.split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
          .forEach(line => entries.push({ pageUrl: line }));
      }
    }
  }
  (args.urls || []).forEach(url => entries.push({ pageUrl: url }));
  return args.limit > 0 ? entries.slice(0, args.limit) : entries;
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.webSocketUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', event => reject(new Error(`Chrome WebSocket 连接失败: ${event.message || 'unknown error'}`)));
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
      const callbacks = this.listeners.get(message.method) || [];
      callbacks.forEach(callback => callback(message));
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

  on(method, callback) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(callback);
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function connectBrowser(cdpBase) {
  const version = await fetchJson(`${cdpBase}/json/version`);
  if (!version.webSocketDebuggerUrl) {
    throw new Error('Chrome 调试端口未返回 webSocketDebuggerUrl，请确认 Chrome 以 --remote-debugging-port 启动');
  }
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  return client;
}

async function listOpenTabs(cdpBase, args) {
  const tabs = await fetchJson(`${cdpBase}/json/list`);
  const matchUrl = String(args.matchUrl || '').toLowerCase();
  const matchTitle = String(args.matchTitle || '').toLowerCase();
  const rows = tabs
    .filter(tab => tab.type === 'page' && /^https?:/i.test(tab.url || ''))
    .filter(tab => !matchUrl || String(tab.url || '').toLowerCase().includes(matchUrl))
    .filter(tab => !matchTitle || String(tab.title || '').toLowerCase().includes(matchTitle))
    .map(tab => ({
      targetId: tab.id,
      pageUrl: tab.url,
      title: tab.title || '',
      workspaceName: args.workspace,
      folderPath: args.folderPath,
    }));
  return args.limit > 0 ? rows.slice(0, args.limit) : rows;
}

async function createPageSession(client, url) {
  const target = await client.send('Target.createTarget', { url: 'about:blank' });
  const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await navigateAndWait(client, sessionId, url);
  return { targetId: target.targetId, sessionId };
}

async function attachPageSession(client, targetId) {
  const attached = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.sessionId;
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  return { targetId, sessionId };
}

async function navigateAndWait(client, sessionId, url) {
  const loadPromise = waitForCdpEvent(client, 'Page.loadEventFired', sessionId, 20000).catch(() => null);
  await client.send('Page.navigate', { url }, sessionId);
  await loadPromise;
}

function waitForCdpEvent(client, method, sessionId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} 等待超时`)), timeoutMs);
    const callback = message => {
      if (sessionId && message.sessionId !== sessionId) return;
      clearTimeout(timer);
      resolve(message);
    };
    client.on(method, callback);
  });
}

async function evaluate(client, sessionId, fn, ...args) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || '页面执行脚本失败');
  }
  return result.result?.value;
}

async function preparePageForCapture(client, sessionId, args) {
  if (args.waitMs > 0) await sleep(args.waitMs);
  if (!args.scroll) return;
  await evaluate(client, sessionId, async function autoScroll() {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.max(Math.floor(window.innerHeight * 0.85), 500);
    for (let y = 0; y <= maxScroll; y += step) {
      window.scrollTo(0, y);
      await sleep(180);
    }
    window.scrollTo(0, 0);
    await sleep(300);
    return true;
  });
}

async function capturePage(client, entry, args) {
  const createdByScript = !entry.targetId;
  const session = entry.targetId
    ? await attachPageSession(client, entry.targetId)
    : await createPageSession(client, entry.pageUrl);
  try {
    await preparePageForCapture(client, session.sessionId, args);
    const data = await evaluate(client, session.sessionId, extractPageSnapshot, {
      expectedTitle: entry.title || '',
      workspaceName: entry.workspaceName || args.workspace,
      folderPath: entry.folderPath || args.folderPath,
    });
    return {
      title: entry.title || data.title || data.pageTitle || '',
      pageTitle: data.pageTitle || entry.title || '',
      pageUrl: data.pageUrl || entry.pageUrl,
      workspaceName: entry.workspaceName || args.workspace,
      folderPath: entry.folderPath || args.folderPath,
      capturedAt: new Date().toISOString(),
      plainText: data.plainText || '',
      html: data.html || '',
      images: data.images || [],
      attachments: data.attachments || [],
      captureMeta: {
        mode: entry.targetId ? 'open_tab' : 'url_list',
        blockCount: data.blockCount || 0,
        textLength: (data.plainText || '').length,
      },
    };
  } finally {
    try { await client.send('Target.detachFromTarget', { sessionId: session.sessionId }); } catch {}
    if (createdByScript && args.closeTabs) {
      try { await client.send('Target.closeTarget', { targetId: session.targetId }); } catch {}
    }
  }
}

function extractPageSnapshot(context) {
  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) !== 0
      && rect.width > 0
      && rect.height > 0;
  }

  function textOf(element) {
    return String(element?.innerText || element?.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cleanTitle(value) {
    return String(value || '')
      .replace(/\s*[-|]\s*wolai.*$/i, '')
      .replace(/\s*[-|]\s*我来.*$/i, '')
      .trim();
  }

  function scoreRoot(element) {
    const text = textOf(element);
    if (!text) return 0;
    const rect = element.getBoundingClientRect();
    const tag = element.tagName.toLowerCase();
    let score = Math.min(text.length, 50000);
    if (['main', 'article'].includes(tag)) score += 8000;
    if (element.querySelector('h1')) score += 5000;
    if (element.querySelector('[contenteditable="true"]')) score += 4000;
    if (/sidebar|menu|nav|header|footer/i.test(element.className || '')) score -= 12000;
    if (rect.width < window.innerWidth * 0.35) score -= 5000;
    return score;
  }

  function pickRoot() {
    const selectors = [
      'main',
      'article',
      '[role="main"]',
      '[class*="editor"]',
      '[class*="document"]',
      '[class*="doc"]',
      '[class*="page"]',
      '[class*="content"]',
      '[contenteditable="true"]',
    ];
    const candidates = [...new Set(selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))))]
      .filter(isVisible)
      .filter(element => textOf(element).length >= 20);
    candidates.push(document.body);
    return candidates
      .map(element => ({ element, score: scoreRoot(element) }))
      .sort((a, b) => b.score - a.score)[0]?.element || document.body;
  }

  function absolutizeUrl(value) {
    if (!value) return '';
    try {
      return new URL(value, location.href).toString();
    } catch {
      return String(value || '');
    }
  }

  function cloneForHtml(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, svg, button, input, textarea, select, [aria-hidden="true"]').forEach(node => node.remove());
    clone.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      });
      if (node.getAttribute('src')) node.setAttribute('src', absolutizeUrl(node.getAttribute('src')));
      if (node.getAttribute('href')) node.setAttribute('href', absolutizeUrl(node.getAttribute('href')));
    });
    return clone.innerHTML;
  }

  function collectImages(root) {
    return Array.from(root.querySelectorAll('img'))
      .filter(isVisible)
      .map(img => ({
        name: img.getAttribute('alt') || img.getAttribute('title') || '',
        url: absolutizeUrl(img.currentSrc || img.src || img.getAttribute('src') || ''),
        alt: img.getAttribute('alt') || '',
      }))
      .filter(item => item.url)
      .filter((item, index, list) => list.findIndex(other => other.url === item.url) === index)
      .slice(0, 80);
  }

  function looksLikeFileLink(anchor) {
    const href = anchor.href || anchor.getAttribute('href') || '';
    const text = textOf(anchor);
    return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt|md)(\?|#|$)/i.test(href)
      || /下载|附件|文件|\.pdf|\.doc|\.xls|\.ppt|\.zip/i.test(text);
  }

  function collectAttachments(root) {
    return Array.from(root.querySelectorAll('a[href]'))
      .filter(isVisible)
      .filter(looksLikeFileLink)
      .map(anchor => ({
        name: textOf(anchor) || anchor.getAttribute('title') || anchor.href,
        url: absolutizeUrl(anchor.getAttribute('href') || anchor.href),
      }))
      .filter(item => item.url)
      .filter((item, index, list) => list.findIndex(other => other.url === item.url) === index)
      .slice(0, 80);
  }

  const root = pickRoot();
  const h1 = Array.from(document.querySelectorAll('h1')).find(isVisible);
  const pageTitle = cleanTitle(context.expectedTitle || textOf(h1) || document.title || '');
  const plainText = textOf(root);
  return {
    title: pageTitle,
    pageTitle,
    pageUrl: location.href,
    plainText,
    html: cloneForHtml(root),
    images: collectImages(root),
    attachments: collectAttachments(root),
    blockCount: root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,table,img,a,[contenteditable="true"]').length,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const cdpBase = normalizeCdpBase(args.cdp);
  const entries = args.fromOpenTabs
    ? await listOpenTabs(cdpBase, args)
    : loadUrlEntries(args);
  if (!entries.length) {
    throw new Error(args.fromOpenTabs
      ? '没有找到匹配的 Chrome 标签页。请确认页面已在调试 Chrome 中打开，并检查 --match-url / --match-title。'
      : '没有可采集的 URL。请提供 --url-file 或 --url。');
  }

  const client = await connectBrowser(cdpBase);
  const documents = [];
  const failures = [];
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      process.stdout.write(`采集 ${index + 1}/${entries.length}: ${entry.title || entry.pageUrl} ... `);
      try {
        const doc = await capturePage(client, entry, args);
        documents.push(doc);
        process.stdout.write(`完成，${doc.plainText.length} 字\n`);
      } catch (error) {
        failures.push({ entry, error: error.message });
        process.stdout.write(`失败: ${error.message}\n`);
      }
    }
  } finally {
    client.close();
  }

  ensureDir(path.dirname(args.output));
  const output = {
    sourceSystem: 'wolai',
    captureMode: args.fromOpenTabs ? 'chrome_open_tabs' : 'chrome_url_list',
    batchNo: args.batch,
    workspaceName: args.workspace,
    folderPath: args.folderPath,
    capturedAt: new Date().toISOString(),
    documents,
    failures,
  };
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`采集完成：成功 ${documents.length}，失败 ${failures.length}`);
  console.log(`输出：${args.output}`);
}

run().catch(error => {
  console.error(`Wolai Chrome 采集失败：${error.message}`);
  process.exit(1);
});
