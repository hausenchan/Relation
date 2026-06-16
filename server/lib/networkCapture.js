const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');

const DEFAULT_PORT = 8888;
const DEFAULT_MAX_RECORDS = 800;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

function normalizeIp(value) {
  return String(value || '')
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1');
}

function splitAllowedIps(value) {
  return String(value || '')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean);
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function isTextContent(headers = {}) {
  const type = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  return /(^text\/)|json|xml|javascript|x-www-form-urlencoded|graphql|html|css/.test(type);
}

function headersToHar(headers = {}) {
  return Object.entries(headers).flatMap(([name, value]) => {
    if (Array.isArray(value)) return value.map(item => ({ name, value: String(item) }));
    return [{ name, value: String(value ?? '') }];
  });
}

function stripHopByHopHeaders(headers = {}) {
  const blocked = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !blocked.has(String(key).toLowerCase()))
  );
}

function createBodyCollector(enabled, maxBytes) {
  let total = 0;
  let captured = 0;
  const chunks = [];

  return {
    push(chunk) {
      total += chunk.length;
      if (!enabled || captured >= maxBytes) return;
      const next = chunk.slice(0, Math.max(0, maxBytes - captured));
      if (next.length) {
        chunks.push(next);
        captured += next.length;
      }
    },
    result(headers) {
      if (!enabled) return { body: '', size: total, truncated: false };
      if (chunks.length === 0) return { body: '', size: total, truncated: total > 0 };
      const buffer = Buffer.concat(chunks);
      const encoding = String(headers?.['content-encoding'] || headers?.['Content-Encoding'] || '').toLowerCase();
      const truncated = total > captured;

      if (encoding && encoding !== 'identity') {
        return {
          body: `[${encoding} encoded body, ${total} bytes]`,
          size: total,
          truncated,
        };
      }

      if (!isTextContent(headers)) {
        return {
          body: `[binary body, ${total} bytes]`,
          size: total,
          truncated,
        };
      }

      return {
        body: buffer.toString('utf8'),
        size: total,
        truncated,
      };
    },
  };
}

class NetworkCaptureManager {
  constructor() {
    this.server = null;
    this.startedAt = null;
    this.records = [];
    this.nextId = 1;
    this.config = {
      host: '0.0.0.0',
      port: Number(process.env.NETWORK_CAPTURE_PORT) || DEFAULT_PORT,
      captureBodies: true,
      maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
      maxRecords: DEFAULT_MAX_RECORDS,
      allowedClientIps: '',
    };
  }

  isRunning() {
    return Boolean(this.server?.listening);
  }

  getLocalAddresses() {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter(item => item && item.family === 'IPv4' && !item.internal)
      .map(item => item.address);
  }

  getStats() {
    return {
      total: this.records.length,
      http: this.records.filter(item => item.kind === 'http').length,
      httpsTunnels: this.records.filter(item => item.kind === 'connect').length,
      errors: this.records.filter(item => item.error_message).length,
    };
  }

  getStatus() {
    return {
      running: this.isRunning(),
      started_at: this.startedAt,
      config: { ...this.config },
      local_addresses: this.getLocalAddresses(),
      record_count: this.records.length,
      stats: this.getStats(),
      https_mode: 'connect_metadata',
      mitm_enabled: false,
    };
  }

  async start(options = {}) {
    if (this.isRunning()) return this.getStatus();

    const nextConfig = {
      ...this.config,
      port: clampNumber(options.port, 1024, 65535, this.config.port),
      captureBodies: options.captureBodies !== undefined ? Boolean(options.captureBodies) : this.config.captureBodies,
      maxBodyBytes: clampNumber(options.maxBodyBytes, 1024, 1024 * 1024, this.config.maxBodyBytes),
      maxRecords: clampNumber(options.maxRecords, 50, 5000, this.config.maxRecords),
      allowedClientIps: String(options.allowedClientIps || '').trim(),
    };

    this.config = nextConfig;

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleHttpRequest(req, res));
      server.on('connect', (req, socket, head) => this.handleConnect(req, socket, head));
      server.on('clientError', (err, socket) => {
        if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      });
      server.once('error', (err) => {
        this.server = null;
        this.startedAt = null;
        reject(err);
      });
      server.listen(nextConfig.port, nextConfig.host, () => {
        this.server = server;
        this.startedAt = new Date().toISOString();
        resolve(this.getStatus());
      });
    });
  }

  async stop() {
    if (!this.server) return this.getStatus();
    const server = this.server;
    this.server = null;
    this.startedAt = null;
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve(this.getStatus());
      });
    });
  }

  clear() {
    this.records = [];
    return this.getStatus();
  }

  listRecords(limit = 200) {
    const count = clampNumber(limit, 1, this.config.maxRecords, 200);
    return this.records.slice(0, count).map(item => this.toSummary(item));
  }

  getRecord(id) {
    return this.records.find(item => String(item.id) === String(id)) || null;
  }

  addRecord(record) {
    const next = {
      id: this.nextId,
      created_at: new Date().toISOString(),
      duration_ms: null,
      status: 'pending',
      error_message: null,
      ...record,
    };
    this.nextId += 1;
    this.records.unshift(next);
    if (this.records.length > this.config.maxRecords) {
      this.records.splice(this.config.maxRecords);
    }
    return next;
  }

  updateRecord(record, patch) {
    Object.assign(record, patch);
    return record;
  }

  toSummary(record) {
    return {
      id: record.id,
      kind: record.kind,
      protocol: record.protocol,
      method: record.method,
      url: record.url,
      host: record.host,
      path: record.path,
      status_code: record.status_code,
      status: record.status,
      duration_ms: record.duration_ms,
      request_size: record.request_size,
      response_size: record.response_size,
      content_type: record.response_headers?.['content-type'] || record.response_headers?.['Content-Type'] || '',
      client_ip: record.client_ip,
      created_at: record.created_at,
      error_message: record.error_message,
      note: record.note,
    };
  }

  clientAllowed(socket) {
    const allowedIps = splitAllowedIps(this.config.allowedClientIps);
    if (allowedIps.length === 0) return true;
    return allowedIps.includes(normalizeIp(socket.remoteAddress));
  }

  resolveRequestUrl(req) {
    try {
      if (/^https?:\/\//i.test(req.url)) return new URL(req.url);
      const host = req.headers.host;
      if (!host) return null;
      return new URL(`http://${host}${req.url || '/'}`);
    } catch {
      return null;
    }
  }

  handleHttpRequest(req, res) {
    const started = Date.now();
    const clientIp = normalizeIp(req.socket.remoteAddress);

    if (!this.clientAllowed(req.socket)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Client IP is not allowed by network capture proxy.');
      this.addRecord({
        kind: 'http',
        protocol: 'HTTP',
        method: req.method,
        url: req.url,
        host: req.headers.host || '',
        path: req.url || '',
        client_ip: clientIp,
        request_headers: req.headers,
        status: 'blocked',
        status_code: 403,
        error_message: 'client ip not allowed',
        duration_ms: Date.now() - started,
      });
      return;
    }

    const targetUrl = this.resolveRequestUrl(req);
    if (!targetUrl || !['http:', 'https:'].includes(targetUrl.protocol)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid proxy request URL.');
      return;
    }

    const record = this.addRecord({
      kind: 'http',
      protocol: targetUrl.protocol === 'https:' ? 'HTTPS' : 'HTTP',
      method: req.method,
      url: targetUrl.href,
      host: targetUrl.host,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      client_ip: clientIp,
      request_headers: req.headers,
      status: 'pending',
    });

    const requestBody = createBodyCollector(this.config.captureBodies, this.config.maxBodyBytes);
    const responseBody = createBodyCollector(this.config.captureBodies, this.config.maxBodyBytes);
    const upstreamHeaders = stripHopByHopHeaders(req.headers);
    upstreamHeaders.host = targetUrl.host;

    const transport = targetUrl.protocol === 'https:' ? https : http;
    const upstream = transport.request({
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: upstreamHeaders,
    }, (upstreamRes) => {
      const responseHeaders = stripHopByHopHeaders(upstreamRes.headers);
      this.updateRecord(record, {
        status_code: upstreamRes.statusCode,
        response_headers: upstreamRes.headers,
        status: 'receiving',
      });

      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.on('data', (chunk) => {
        responseBody.push(chunk);
        res.write(chunk);
      });
      upstreamRes.on('end', () => {
        const body = responseBody.result(upstreamRes.headers);
        this.updateRecord(record, {
          status: 'done',
          duration_ms: Date.now() - started,
          response_size: body.size,
          response_body_text: body.body,
          response_body_truncated: body.truncated,
        });
        res.end();
      });
    });

    upstream.on('error', (err) => {
      this.updateRecord(record, {
        status: 'error',
        duration_ms: Date.now() - started,
        error_message: err.message,
      });
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(`Proxy upstream error: ${err.message}`);
    });

    req.on('data', (chunk) => {
      requestBody.push(chunk);
      upstream.write(chunk);
    });
    req.on('end', () => {
      const body = requestBody.result(req.headers);
      this.updateRecord(record, {
        request_size: body.size,
        request_body_text: body.body,
        request_body_truncated: body.truncated,
      });
      upstream.end();
    });
    req.on('error', (err) => {
      this.updateRecord(record, {
        status: 'error',
        duration_ms: Date.now() - started,
        error_message: err.message,
      });
      upstream.destroy(err);
    });
  }

  handleConnect(req, clientSocket, head) {
    const started = Date.now();
    const clientIp = normalizeIp(clientSocket.remoteAddress);
    const [host, rawPort] = String(req.url || '').split(':');
    const port = clampNumber(rawPort, 1, 65535, 443);

    if (!host) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    if (!this.clientAllowed(clientSocket)) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      this.addRecord({
        kind: 'connect',
        protocol: 'HTTPS',
        method: 'CONNECT',
        url: `https://${req.url}/`,
        host: req.url,
        path: '(TLS tunnel)',
        client_ip: clientIp,
        request_headers: req.headers,
        status: 'blocked',
        status_code: 403,
        error_message: 'client ip not allowed',
        duration_ms: Date.now() - started,
      });
      return;
    }

    const record = this.addRecord({
      kind: 'connect',
      protocol: 'HTTPS',
      method: 'CONNECT',
      url: `https://${req.url}/`,
      host: req.url,
      path: '(TLS tunnel)',
      client_ip: clientIp,
      request_headers: req.headers,
      status: 'pending',
      note: 'HTTPS tunnel metadata only. Full URL, headers, and bodies require MITM CA support.',
    });

    let upstreamBytes = 0;
    let downstreamBytes = 0;
    const serverSocket = net.connect(port, host, () => {
      this.updateRecord(record, { status: 'tunneling', status_code: 200 });
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    clientSocket.on('data', (chunk) => {
      upstreamBytes += chunk.length;
    });
    serverSocket.on('data', (chunk) => {
      downstreamBytes += chunk.length;
    });

    const finalize = (status, err) => {
      if (record.status === 'closed' || record.status === 'error') return;
      this.updateRecord(record, {
        status,
        duration_ms: Date.now() - started,
        request_size: upstreamBytes,
        response_size: downstreamBytes,
        error_message: err?.message || record.error_message || null,
      });
    };

    serverSocket.on('error', (err) => {
      finalize('error', err);
      if (clientSocket.writable) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    clientSocket.on('error', (err) => {
      finalize('error', err);
      serverSocket.destroy(err);
    });
    serverSocket.on('close', () => finalize('closed'));
    clientSocket.on('close', () => finalize('closed'));
  }

  toHar() {
    const entries = this.records
      .filter(record => record.kind === 'http')
      .slice()
      .reverse()
      .map(record => ({
        startedDateTime: record.created_at,
        time: record.duration_ms || 0,
        request: {
          method: record.method,
          url: record.url,
          httpVersion: 'HTTP/1.1',
          headers: headersToHar(record.request_headers),
          queryString: [],
          cookies: [],
          headersSize: -1,
          bodySize: record.request_size || 0,
          postData: record.request_body_text ? {
            mimeType: record.request_headers?.['content-type'] || '',
            text: record.request_body_text,
          } : undefined,
        },
        response: {
          status: record.status_code || 0,
          statusText: '',
          httpVersion: 'HTTP/1.1',
          headers: headersToHar(record.response_headers),
          cookies: [],
          content: {
            size: record.response_size || 0,
            mimeType: record.response_headers?.['content-type'] || '',
            text: record.response_body_text || '',
          },
          redirectURL: record.response_headers?.location || '',
          headersSize: -1,
          bodySize: record.response_size || 0,
        },
        cache: {},
        timings: {
          send: 0,
          wait: record.duration_ms || 0,
          receive: 0,
        },
      }));

    return {
      log: {
        version: '1.2',
        creator: {
          name: 'Relation Network Capture',
          version: '0.1.0',
        },
        entries,
      },
    };
  }
}

module.exports = NetworkCaptureManager;
