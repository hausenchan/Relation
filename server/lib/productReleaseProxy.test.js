'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const {
  buildProxySnapshot,
  buildProxySummary,
  buildProxyUrl,
  createProductReleaseProxyRouter,
  normalizeDomainSuffixes,
  normalizeProxyPayload,
  resolveProxySelections,
  selectProxyForHost,
} = require('./productReleaseProxy');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

function request(options, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('normalizes suffixes and selects the most specific proxy', () => {
  assert.deepEqual(normalizeDomainSuffixes(['*.example.com', '.example.com', '*']).values, ['example.com', '*']);
  const proxies = [
    { id: 1, name: 'default', status: 'enabled', priority: 1, domain_suffixes: ['*'], updated_at: '2026-01-01' },
    { id: 2, name: 'example', status: 'enabled', priority: 100, domain_suffixes: ['example.com'], updated_at: '2026-01-01' },
    { id: 3, name: 'api', status: 'enabled', priority: 100, domain_suffixes: ['api.example.com'], updated_at: '2026-01-01' },
  ];
  assert.equal(selectProxyForHost('api.example.com', proxies).proxy.name, 'api');
  assert.equal(selectProxyForHost('www.example.com', proxies).proxy.name, 'example');
  assert.equal(selectProxyForHost('example.com.evil.test', proxies).proxy.name, 'default');
  assert.equal(selectProxyForHost('unrelated.test', proxies).proxy.name, 'default');
});

test('enforces proxy field boundaries and rejects malformed values', () => {
  assert.deepEqual(normalizeDomainSuffixes(['example.com', 'example.com', '*.EXAMPLE.com', '.api.example.com']).values, [
    'example.com',
    'api.example.com',
  ]);
  assert.equal(normalizeDomainSuffixes(['example.com/path'], { required: false }).errors.length, 1);

  const invalid = normalizeProxyPayload({
    name: '',
    protocol: 'socks5',
    host: 'http://proxy.example.com/path',
    port: 65536,
    domain_suffixes: ['https://example.com:443/path'],
    priority: -1,
    status: 'active',
  });
  assert.ok(invalid.errors.some(error => /名称/.test(error)));
  assert.ok(invalid.errors.some(error => /协议/.test(error)));
  assert.ok(invalid.errors.some(error => /主机/.test(error)));
  assert.ok(invalid.errors.some(error => /端口/.test(error)));
  assert.ok(invalid.errors.some(error => /域名后缀/.test(error)));
  assert.ok(invalid.errors.some(error => /优先级/.test(error)));
  assert.ok(invalid.errors.some(error => /状态/.test(error)));

  for (const port of [1, 65535]) {
    const parsed = normalizeProxyPayload({
      name: `edge-${port}`,
      protocol: 'https',
      host: '[::1]',
      port,
      domain_suffixes: ['*'],
    });
    assert.equal(parsed.errors, undefined);
    assert.equal(parsed.values.port, port);
    assert.equal(buildProxyUrl(parsed.values), `https://[::1]:${port}`);
  }
});

test('uses priority, update time, and id as deterministic tie breakers', () => {
  const sameSuffix = (id, name, priority, updated_at, status = 'enabled') => ({
    id,
    name,
    priority,
    updated_at,
    status,
    domain_suffixes: ['example.com'],
  });
  assert.equal(selectProxyForHost('api.example.com', [
    sameSuffix(1, 'older', 10, '2026-01-01'),
    sameSuffix(2, 'newer', 10, '2026-01-02'),
  ]).proxy.name, 'newer');
  assert.equal(selectProxyForHost('api.example.com', [
    sameSuffix(1, 'small-id', 10, '2026-01-02'),
    sameSuffix(2, 'large-id', 10, '2026-01-02'),
  ]).proxy.name, 'large-id');
  assert.equal(selectProxyForHost('api.example.com', [
    sameSuffix(1, 'disabled', 0, '2026-01-03', 'disabled'),
    sameSuffix(2, 'enabled', 100, '2026-01-01'),
  ]).proxy.name, 'enabled');
  assert.equal(selectProxyForHost('api.example.com.evil.test', [
    sameSuffix(1, 'specific', 0, '2026-01-03'),
  ]), null);
});

test('requires an enabled default proxy for every release resolution', () => {
  const result = resolveProxySelections({ api_domain: 'https://api.example.com' }, [{
    id: 1,
    name: 'specific',
    status: 'enabled',
    priority: 1,
    domain_suffixes: ['example.com'],
  }]);
  assert.deepEqual(result.missing, [{ field: 'default', hostname: '*' }]);

  const disabledDefault = resolveProxySelections({ api_domain: 'https://api.example.com' }, [{
    id: 1,
    name: 'disabled-default',
    status: 'disabled',
    priority: 1,
    domain_suffixes: ['*'],
  }]);
  assert.equal(disabledDefault.hasDefaultProxy, false);
  assert.ok(disabledDefault.missing.some(item => item.field === 'api_domain'));
  assert.ok(disabledDefault.missing.some(item => item.field === 'default'));
});

test('validates proxy payload and builds encoded endpoint without leaking credentials', () => {
  const parsed = normalizeProxyPayload({
    name: '出口',
    protocol: 'http',
    host: '127.0.0.1',
    port: 8080,
    username: 'user@example.com',
    password: 'p@ss word',
    domain_suffixes: ['api.example.com', '*'],
  });
  assert.equal(parsed.errors, undefined);
  const url = buildProxyUrl(parsed.values);
  assert.match(url, /^http:\/\/user%40example\.com:p%40ss%20word@127\.0\.0\.1:8080$/);
  assert.deepEqual(resolveProxySelections({ api_domain: 'https://api.example.com' }, [
    { ...parsed.values, id: 1, status: 'enabled', updated_at: '2026-01-01' },
  ]).missing, []);
});

test('routes HTTP requests by target hostname and blocks unmatched targets', async () => {
  const target = http.createServer((req, res) => {
    res.end(`target:${req.url}`);
  });
  const targetPort = await listen(target);
  const upstream = http.createServer((req, res) => {
    assert.equal(req.headers['proxy-authorization'], `Basic ${Buffer.from('proxy-user:proxy-password').toString('base64')}`);
    const targetUrl = new URL(req.url);
    const forwarded = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers: req.headers,
    }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    req.pipe(forwarded);
  });
  const upstreamPort = await listen(upstream);
  const router = createProductReleaseProxyRouter(buildProxySnapshot([
    {
      field: 'api_domain',
      domain: 'https://api.example.com',
      hostname: 'api.example.com',
      matched_suffix: 'api.example.com',
      proxy: {
        id: 1,
        name: 'test',
        protocol: 'http',
        host: '127.0.0.1',
        port: upstreamPort,
        username: 'proxy-user',
        password: 'proxy-password',
        domain_suffixes: ['api.example.com'],
      },
    },
  ]));
  const address = await router.start();
  try {
    const routed = await request({ hostname: '127.0.0.1', port: address.port, path: 'http://api.example.com/ok', headers: { host: 'api.example.com' } });
    assert.equal(routed.status, 200);
    assert.equal(routed.body, 'target:/ok');
    const blocked = await request({ hostname: '127.0.0.1', port: address.port, path: 'http://other.example.com/nope', headers: { host: 'other.example.com' } });
    assert.equal(blocked.status, 502);
  } finally {
    await router.close();
    await close(upstream);
    await close(target);
  }
});

test('routes different target domains to different upstream proxies', async () => {
  const upstreams = [
    http.createServer((req, res) => res.end(`upstream-one:${req.url}`)),
    http.createServer((req, res) => res.end(`upstream-two:${req.url}`)),
  ];
  const ports = await Promise.all(upstreams.map(listen));
  const router = createProductReleaseProxyRouter([
    {
      field: 'api_domain',
      domain: 'https://api.example.com',
      hostname: 'api.example.com',
      matched_suffix: 'api.example.com',
      proxy: { id: 1, name: 'one', protocol: 'http', host: '127.0.0.1', port: ports[0], domain_suffixes: ['api.example.com'] },
    },
    {
      field: 'cdn_domain',
      domain: 'https://cdn.example.com',
      hostname: 'cdn.example.com',
      matched_suffix: 'cdn.example.com',
      proxy: { id: 2, name: 'two', protocol: 'http', host: '127.0.0.1', port: ports[1], domain_suffixes: ['cdn.example.com'] },
    },
  ]);
  const address = await router.start();
  try {
    const [api, cdn] = await Promise.all([
      request({ hostname: '127.0.0.1', port: address.port, path: 'http://api.example.com/api', headers: { host: 'api.example.com' } }),
      request({ hostname: '127.0.0.1', port: address.port, path: 'http://cdn.example.com/cdn', headers: { host: 'cdn.example.com' } }),
    ]);
    assert.equal(api.body, 'upstream-one:http://api.example.com/api');
    assert.equal(cdn.body, 'upstream-two:http://cdn.example.com/cdn');
  } finally {
    await router.close();
    await Promise.all(upstreams.map(close));
  }
});

test('builds isolated proxy environment and closes its listening port', async () => {
  const previous = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    NO_PROXY: process.env.NO_PROXY,
  };
  process.env.HTTP_PROXY = 'http://server-proxy.invalid:8080';
  process.env.NO_PROXY = 'localhost';
  const router = createProductReleaseProxyRouter([{
    field: 'api_domain',
    domain: 'https://api.example.com',
    hostname: 'api.example.com',
    matched_suffix: 'api.example.com',
    proxy: { id: 1, name: 'environment-test', protocol: 'http', host: '127.0.0.1', port: 8080, domain_suffixes: ['api.example.com'] },
  }]);
  const address = await router.start();
  const env = router.buildEnvironment({ HTTP_PROXY: 'old', NO_PROXY: 'old-no-proxy' });
  assert.match(env.HTTP_PROXY, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(env.HTTPS_PROXY, env.HTTP_PROXY);
  assert.equal(env.ALL_PROXY, env.HTTP_PROXY);
  assert.equal(env.NO_PROXY, '');
  assert.equal(process.env.HTTP_PROXY, 'http://server-proxy.invalid:8080');
  assert.equal(process.env.NO_PROXY, 'localhost');
  await router.close();
  await assert.rejects(
    request({ hostname: '127.0.0.1', port: address.port, path: 'http://api.example.com/after-close', headers: { host: 'api.example.com' } }),
    /ECONNREFUSED/,
  );
  if (previous.HTTP_PROXY === undefined) delete process.env.HTTP_PROXY;
  else process.env.HTTP_PROXY = previous.HTTP_PROXY;
  if (previous.NO_PROXY === undefined) delete process.env.NO_PROXY;
  else process.env.NO_PROXY = previous.NO_PROXY;
});

test('routes HTTPS CONNECT tunnels through the selected upstream proxy', async () => {
  const target = http.createServer((req, res) => {
    res.end('connect-target');
  });
  const targetPort = await listen(target);
  const upstream = http.createServer();
  upstream.on('connect', (req, clientSocket, head) => {
    const targetSocket = net.connect(targetPort, '127.0.0.1', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) targetSocket.write(head);
      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);
    });
    targetSocket.once('error', () => clientSocket.destroy());
  });
  const upstreamPort = await listen(upstream);
  const router = createProductReleaseProxyRouter([{
    field: 'api_domain',
    domain: 'https://api.example.com',
    hostname: 'api.example.com',
    matched_suffix: 'api.example.com',
    proxy: { id: 1, name: 'connect-test', protocol: 'http', host: '127.0.0.1', port: upstreamPort, domain_suffixes: ['api.example.com'] },
  }]);
  const address = await router.start();
  try {
    const result = await new Promise((resolve, reject) => {
      const connectRequest = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        method: 'CONNECT',
        path: `api.example.com:${targetPort}`,
      });
      connectRequest.once('connect', (response, socket) => {
        const chunks = [];
        socket.on('data', chunk => chunks.push(chunk));
        socket.once('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
        socket.write(`GET / HTTP/1.1\r\nHost: api.example.com\r\nConnection: close\r\n\r\n`);
      });
      connectRequest.once('error', reject);
      connectRequest.end();
    });
    assert.equal(result.status, 200);
    assert.match(result.body, /connect-target/);
  } finally {
    await router.close();
    await close(upstream);
    await close(target);
  }
});

test('resolves proxy snapshot and summary without including password', () => {
  const proxy = { id: 8, name: 'default', protocol: 'http', host: 'proxy.example.com', port: 8080, username: 'u', password: 'secret', status: 'enabled', priority: 1, domain_suffixes: ['*'] };
  const result = resolveProxySelections({ api_domain: 'https://api.example.com', cdn_domain: 'https://cdn.example.com' }, [proxy]);
  const snapshot = buildProxySnapshot(result.selections, result.defaultProxy);
  const summary = buildProxySummary(result.selections);
  assert.equal(snapshot[0].proxy.password, 'secret');
  assert.equal(summary[0].proxy_name, 'default');
  assert.equal(JSON.stringify(summary).includes('secret'), false);
});
