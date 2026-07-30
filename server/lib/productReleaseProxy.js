'use strict';

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const PROXY_PROTOCOLS = new Set(['http', 'https']);
const PROXY_STATUSES = new Set(['enabled', 'disabled']);
const DEFAULT_PRIORITY = 100;

function text(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeProxyHost(value) {
  let host = text(value);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host || /[\s\u0000-\u001f/\\@]/.test(host)) return { error: '代理主机/IP 格式不合法' };
  if (net.isIP(host) === 0 && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) {
    return { error: '代理主机/IP 格式不合法' };
  }
  return { value: host.toLowerCase() };
}

function normalizeDomainSuffix(value) {
  let suffix = text(value).toLowerCase();
  if (suffix === '*') return { value: '*' };
  suffix = suffix.replace(/^\*\./, '').replace(/^\./, '');
  if (!suffix || /[\s\u0000-\u001f/:?#@]/.test(suffix)) return { error: `域名后缀格式不合法：${value}` };
  try {
    const parsed = new URL(`https://${suffix}`);
    if (parsed.hostname !== suffix || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return { error: `域名后缀格式不合法：${value}` };
    }
    return { value: parsed.hostname.toLowerCase() };
  } catch {
    return { error: `域名后缀格式不合法：${value}` };
  }
}

function normalizeDomainSuffixes(value, { required = true } = {}) {
  const raw = Array.isArray(value)
    ? value
    : text(value).split(/[\n,，;；]/);
  const values = [];
  const errors = [];
  raw.forEach(item => {
    const candidate = text(item);
    if (!candidate) return;
    const result = normalizeDomainSuffix(candidate);
    if (result.error) errors.push(result.error);
    else if (!values.includes(result.value)) values.push(result.value);
  });
  if (required && values.length === 0) errors.push('至少配置一个域名后缀，可使用 * 作为默认代理');
  return errors.length ? { errors, values } : { values };
}

function normalizeProxyPayload(payload = {}, { partial = false } = {}) {
  const errors = [];
  const values = {};
  const fields = ['name', 'protocol', 'host', 'port', 'username', 'password', 'domain_suffixes', 'priority', 'status', 'remark'];

  fields.forEach(field => {
    if (!partial || Object.prototype.hasOwnProperty.call(payload, field)) values[field] = payload[field];
  });

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) {
    values.name = text(values.name);
    if (!values.name) errors.push('代理名称必填');
    if (values.name.length > 100) errors.push('代理名称不能超过 100 个字符');
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'protocol')) {
    values.protocol = text(values.protocol || 'http').toLowerCase();
    if (!PROXY_PROTOCOLS.has(values.protocol)) errors.push('代理协议只支持 HTTP 或 HTTPS');
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'host')) {
    const host = normalizeProxyHost(values.host);
    if (host.error) errors.push(host.error);
    else values.host = host.value;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'port')) {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('代理端口必须是 1-65535 的整数');
    else values.port = port;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'username')) {
    values.username = text(values.username);
    if (values.username.length > 200) errors.push('代理账号不能超过 200 个字符');
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'password')) {
    values.password = text(values.password);
    if (values.password.length > 500) errors.push('代理密码不能超过 500 个字符');
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'domain_suffixes')) {
    const suffixes = normalizeDomainSuffixes(values.domain_suffixes);
    if (suffixes.errors) errors.push(...suffixes.errors);
    else values.domain_suffixes = suffixes.values;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'priority')) {
    const priority = values.priority === '' || values.priority == null ? DEFAULT_PRIORITY : Number(values.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100000) errors.push('代理优先级必须是 0-100000 的整数');
    else values.priority = priority;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'status')) {
    values.status = text(values.status || 'enabled').toLowerCase();
    if (!PROXY_STATUSES.has(values.status)) errors.push('代理状态不合法');
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'remark')) {
    values.remark = text(values.remark);
    if (values.remark.length > 2000) errors.push('代理备注不能超过 2000 个字符');
  }

  return errors.length ? { errors, values } : { values };
}

function getProxyHostForConnection(host) {
  return net.isIP(host) === 6 ? `[${host}]` : host;
}

function buildProxyUrl(proxy) {
  const username = text(proxy.username);
  const password = text(proxy.password);
  const auth = username || password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : '';
  return `${proxy.protocol}://${auth}${getProxyHostForConnection(proxy.host)}:${proxy.port}`;
}

function maskUsername(username) {
  const value = text(username);
  if (!value) return '';
  if (value.length <= 2) return `${value[0]}***`;
  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

function serializeProxy(proxy) {
  if (!proxy) return null;
  const { password: _password, username, domain_suffixes: rawSuffixes, domain_suffixes_json: rawJson, ...rest } = proxy;
  let domainSuffixes = rawSuffixes;
  if (!domainSuffixes && rawJson) {
    try { domainSuffixes = JSON.parse(rawJson); } catch { domainSuffixes = []; }
  }
  if (!Array.isArray(domainSuffixes)) domainSuffixes = normalizeDomainSuffixes(domainSuffixes || '', { required: false }).values;
  return {
    ...rest,
    domain_suffixes: domainSuffixes,
    username_mask: maskUsername(username),
    has_password: Boolean(_password),
    has_auth: Boolean(username || _password),
  };
}

function normalizeTargetHostname(value) {
  const input = text(value);
  if (!input) return '';
  try {
    const parsed = input.includes('://') ? new URL(input) : new URL(`https://${input}`);
    return parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

function matchDomainSuffix(hostname, suffix) {
  const host = normalizeTargetHostname(hostname);
  const normalizedSuffix = text(suffix).toLowerCase().replace(/^\*\./, '').replace(/^\./, '');
  return normalizedSuffix === '*'
    ? Boolean(host)
    : Boolean(host) && (host === normalizedSuffix || host.endsWith(`.${normalizedSuffix}`));
}

function getProxySuffixes(proxy) {
  if (Array.isArray(proxy.domain_suffixes)) return proxy.domain_suffixes;
  if (proxy.domain_suffixes_json) {
    try {
      const parsed = JSON.parse(proxy.domain_suffixes_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function selectProxyForHost(hostname, proxies = []) {
  const host = normalizeTargetHostname(hostname);
  if (!host) return null;
  const candidates = proxies.flatMap(proxy => {
    if (proxy.status !== 'enabled') return [];
    return getProxySuffixes(proxy)
      .filter(suffix => matchDomainSuffix(host, suffix))
      .map(suffix => ({ proxy, suffix: text(suffix).toLowerCase().replace(/^\*\./, '').replace(/^\./, '') }));
  });
  candidates.sort((a, b) => {
    const aSpecificity = a.suffix === '*' ? 0 : a.suffix.length;
    const bSpecificity = b.suffix === '*' ? 0 : b.suffix.length;
    if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
    const aPriority = Number.isFinite(Number(a.proxy.priority)) ? Number(a.proxy.priority) : DEFAULT_PRIORITY;
    const bPriority = Number.isFinite(Number(b.proxy.priority)) ? Number(b.proxy.priority) : DEFAULT_PRIORITY;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const updated = String(b.proxy.updated_at || '').localeCompare(String(a.proxy.updated_at || ''));
    if (updated !== 0) return updated;
    return Number(b.proxy.id || 0) - Number(a.proxy.id || 0);
  });
  return candidates[0] || null;
}

function resolveProxySelections(domains = {}, proxies = []) {
  const selections = [];
  const missing = [];
  const seenHosts = new Set();
  const defaultProxyCandidates = proxies.filter(proxy => proxy.status === 'enabled' && getProxySuffixes(proxy).includes('*'));
  defaultProxyCandidates.sort((a, b) => {
    const priorityDiff = Number(a.priority || DEFAULT_PRIORITY) - Number(b.priority || DEFAULT_PRIORITY);
    if (priorityDiff !== 0) return priorityDiff;
    const updated = String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    if (updated !== 0) return updated;
    return Number(b.id || 0) - Number(a.id || 0);
  });
  const defaultProxy = defaultProxyCandidates[0] || null;
  const hasDefaultProxy = Boolean(defaultProxy);

  Object.entries(domains).forEach(([field, value]) => {
    const hostname = normalizeTargetHostname(value);
    if (!hostname || seenHosts.has(hostname)) return;
    seenHosts.add(hostname);
    const matched = selectProxyForHost(hostname, proxies);
    if (!matched) {
      missing.push({ field, hostname });
      return;
    }
    selections.push({
      field,
      domain: text(value),
      hostname,
      matched_suffix: matched.suffix,
      proxy: matched.proxy,
    });
  });

  if (!hasDefaultProxy) missing.push({ field: 'default', hostname: '*' });
  return { selections, missing, hasDefaultProxy, defaultProxy };
}

function snapshotProxy(proxy) {
  return {
    id: proxy.id,
    name: proxy.name,
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username || '',
    password: proxy.password || '',
    domain_suffixes: getProxySuffixes(proxy),
    priority: proxy.priority,
  };
}

function buildProxySnapshot(selections, defaultProxy = null) {
  const items = selections.map(selection => ({
    field: selection.field,
    domain: selection.domain,
    hostname: selection.hostname,
    matched_suffix: selection.matched_suffix,
    proxy: snapshotProxy(selection.proxy),
  }));
  if (defaultProxy && !items.some(item => Number(item.proxy.id) === Number(defaultProxy.id))) {
    items.push({
      field: '__default__',
      domain: '*',
      hostname: '*',
      matched_suffix: '*',
      proxy: snapshotProxy(defaultProxy),
    });
  }
  return items;
}

function buildProxySummary(selections) {
  return selections.map(selection => ({
    field: selection.field,
    domain: selection.domain,
    hostname: selection.hostname,
    proxy_id: selection.proxy.id,
    proxy_name: selection.proxy.name,
    matched_suffix: selection.matched_suffix,
  }));
}

function createProxyResolver(snapshot = []) {
  const proxies = snapshot.map(item => ({
    ...item.proxy,
    status: 'enabled',
    domain_suffixes: item.proxy.domain_suffixes || [],
  }));
  return hostname => selectProxyForHost(hostname, proxies)?.proxy || null;
}

function stripHopByHopHeaders(headers = {}) {
  const blocked = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(String(key).toLowerCase())));
}

function proxyHeaders(proxy) {
  const headers = {};
  if (proxy.username || proxy.password) {
    const credential = Buffer.from(`${proxy.username || ''}:${proxy.password || ''}`).toString('base64');
    headers['Proxy-Authorization'] = `Basic ${credential}`;
  }
  return headers;
}

function getProxyRequestOptions(proxy, options = {}) {
  const headers = { ...(options.headers || {}), ...proxyHeaders(proxy) };
  const transport = proxy.protocol === 'https' ? https : http;
  return {
    transport,
    request: {
      hostname: proxy.host,
      port: proxy.port,
      method: options.method,
      path: options.path,
      headers,
    },
  };
}

function createProductReleaseProxyRouter(snapshot = []) {
  const resolveProxy = createProxyResolver(snapshot);
  const sockets = new Set();
  let server = null;
  let address = null;

  function rejectUnmatched(res) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No enabled release proxy matched the target hostname.');
  }

  function handleHttpRequest(req, res) {
    let target;
    try {
      target = /^https?:\/\//i.test(req.url)
        ? new URL(req.url)
        : new URL(`http://${req.headers.host}${req.url || '/'}`);
    } catch {
      res.writeHead(400);
      res.end('Invalid proxy target.');
      return;
    }
    const proxy = resolveProxy(target.hostname);
    if (!proxy) {
      rejectUnmatched(res);
      return;
    }
    if (target.protocol !== 'http:') {
      res.writeHead(400);
      res.end('HTTPS targets must use CONNECT.');
      return;
    }
    const headers = stripHopByHopHeaders(req.headers);
    headers.host = target.host;
    const request = getProxyRequestOptions(proxy, {
      method: req.method,
      path: target.href,
      headers,
    });
    const upstream = request.transport.request(request.request, upstreamResponse => {
      res.writeHead(upstreamResponse.statusCode || 502, stripHopByHopHeaders(upstreamResponse.headers));
      upstreamResponse.pipe(res);
    });
    upstream.once('error', error => {
      if (!res.headersSent) res.writeHead(502);
      res.end(`Proxy upstream error: ${error.message}`);
    });
    req.pipe(upstream);
  }

  function handleConnect(req, clientSocket, head) {
    const targetText = text(req.url);
    const separator = targetText.lastIndexOf(':');
    const hostname = separator > 0 ? targetText.slice(0, separator).replace(/^\[|\]$/g, '') : targetText;
    const port = separator > 0 ? Number(targetText.slice(separator + 1)) : 443;
    const proxy = resolveProxy(hostname);
    if (!proxy || !hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      return;
    }
    const request = getProxyRequestOptions(proxy, {
      method: 'CONNECT',
      path: `${hostname}:${port}`,
      headers: { host: `${hostname}:${port}` },
    });
    const upstreamRequest = request.transport.request(request.request);
    upstreamRequest.once('connect', (response, upstreamSocket, upstreamHead) => {
      if (response.statusCode !== 200) {
        clientSocket.end(`HTTP/1.1 ${response.statusCode || 502} Bad Gateway\r\n\r\n`);
        upstreamSocket.destroy();
        return;
      }
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstreamSocket.write(head);
      if (upstreamHead?.length) clientSocket.write(upstreamHead);
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    });
    upstreamRequest.once('error', () => clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
    upstreamRequest.end();
  }

  async function start() {
    if (server?.listening) return address;
    server = http.createServer(handleHttpRequest);
    server.on('connect', handleConnect);
    server.on('connection', socket => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        address = server.address();
        resolve();
      });
    });
    return address;
  }

  async function close() {
    if (!server) return;
    const current = server;
    server = null;
    sockets.forEach(socket => socket.destroy());
    await new Promise(resolve => {
      current.close(() => resolve());
    });
    address = null;
  }

  return {
    start,
    close,
    getAddress: () => address,
    buildEnvironment(baseEnv = process.env) {
      const port = address?.port;
      if (!port) throw new Error('提版代理转发器尚未启动');
      const localProxy = `http://127.0.0.1:${port}`;
      return {
        ...baseEnv,
        HTTP_PROXY: localProxy,
        HTTPS_PROXY: localProxy,
        ALL_PROXY: localProxy,
        http_proxy: localProxy,
        https_proxy: localProxy,
        all_proxy: localProxy,
        NO_PROXY: '',
        no_proxy: '',
      };
    },
  };
}

module.exports = {
  DEFAULT_PRIORITY,
  PROXY_PROTOCOLS,
  PROXY_STATUSES,
  buildProxySnapshot,
  buildProxySummary,
  buildProxyUrl,
  createProductReleaseProxyRouter,
  matchDomainSuffix,
  normalizeDomainSuffix,
  normalizeDomainSuffixes,
  normalizeProxyHost,
  normalizeProxyPayload,
  normalizeTargetHostname,
  resolveProxySelections,
  selectProxyForHost,
  serializeProxy,
};
