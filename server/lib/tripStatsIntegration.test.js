const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const mysql = require('mysql2/promise');

const RUN_MYSQL_TESTS = process.env.RELATION_RUN_MYSQL_TESTS === '1';

function getMysqlConfig() {
  return {
    host: process.env.RELATION_TEST_MYSQL_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.RELATION_TEST_MYSQL_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.RELATION_TEST_MYSQL_USER || process.env.MYSQL_USER || 'root',
    password: process.env.RELATION_TEST_MYSQL_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
    connectTimeout: 5000,
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server start timeout\n${output}`)), 30000);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('服务器启动在')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}\n${output}`));
    });
  });
}

async function requestJson(baseUrl, route, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json(),
    serverTiming: response.headers.get('server-timing'),
    responseTime: response.headers.get('x-response-time'),
  };
}

test('trip statistics summary is MySQL-compatible and exposes response timing', {
  skip: RUN_MYSQL_TESTS ? false : 'set RELATION_RUN_MYSQL_TESTS=1 to run isolated MySQL integration tests',
  timeout: 60000,
}, async t => {
  const mysqlConfig = getMysqlConfig();
  const databaseName = `relation_trip_stats_${process.pid}_${Date.now()}`;
  const adminConnection = await mysql.createConnection(mysqlConfig);
  await adminConnection.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      DB_CLIENT: 'mysql',
      MYSQL_HOST: mysqlConfig.host,
      MYSQL_PORT: String(mysqlConfig.port),
      MYSQL_USER: mysqlConfig.user,
      MYSQL_PASSWORD: mysqlConfig.password,
      MYSQL_DATABASE: databaseName,
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      PORT: String(port),
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      const exitPromise = once(child, 'exit');
      child.kill('SIGTERM');
      const exited = await Promise.race([
        exitPromise.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 3000)),
      ]);
      if (!exited && child.exitCode === null) {
        const forcedExitPromise = once(child, 'exit');
        child.kill('SIGKILL');
        await forcedExitPromise;
      }
    }
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.end();
  });

  await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const login = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));

  const result = await requestJson(baseUrl, '/api/trips/stats/summary', {
    token: login.payload.token,
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.deepEqual(Object.keys(result.payload).sort(), ['alerts', 'byGroup', 'byType', 'byUser', 'monthly']);
  Object.values(result.payload).forEach(value => assert.ok(Array.isArray(value)));
  assert.match(result.serverTiming || '', /^app;dur=\d+(?:\.\d+)?$/);
  assert.match(result.responseTime || '', /^\d+(?:\.\d+)?ms$/);
});
