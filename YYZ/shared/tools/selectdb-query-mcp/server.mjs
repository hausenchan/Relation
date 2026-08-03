#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const DEFAULT_MAX_ROWS = 50000;
const CONFIG_KEYS = [
  'MIDMAX_SELECTDB_HOST',
  'MIDMAX_SELECTDB_PORT',
  'MIDMAX_SELECTDB_DATABASE',
  'MIDMAX_SELECTDB_USER',
  'MIDMAX_SELECTDB_PASSWORD',
];

let buffer = Buffer.alloc(0);
let pool = null;

function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

function validateReadOnlySql(sql) {
  const text = stripSqlComments(sql).trim();
  if (!/^(select|with)\b/i.test(text)) {
    throw new Error('SelectDB MCP only allows SELECT or WITH queries');
  }
  if (/;/.test(text.replace(/;\s*$/, ''))) {
    throw new Error('SelectDB MCP forbids multiple SQL statements');
  }
  if (/\b(insert|update|delete|replace|drop|alter|truncate|create|grant|revoke|call|load|outfile|infile)\b/i.test(text)) {
    throw new Error('SelectDB MCP is read-only; DDL, DML, calls and file export/import are forbidden');
  }
  return text.replace(/;\s*$/, '');
}

function parseJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function loadConfig() {
  const configPath = process.env.SELECTDB_QUERY_MCP_CONFIG_PATH || process.env.ZHIXIAO_SELECTDB_MCP_CONFIG_PATH || '';
  const fileConfig = parseJsonFile(configPath);
  const config = {
    host: process.env.MIDMAX_SELECTDB_HOST || fileConfig.host,
    port: Number(process.env.MIDMAX_SELECTDB_PORT || fileConfig.port || 9030),
    database: process.env.MIDMAX_SELECTDB_DATABASE || fileConfig.database,
    user: process.env.MIDMAX_SELECTDB_USER || fileConfig.user,
    password: process.env.MIDMAX_SELECTDB_PASSWORD || fileConfig.password,
    queryTimeoutMs: Math.max(1000, Number(process.env.MIDMAX_SELECTDB_QUERY_TIMEOUT_MS || fileConfig.queryTimeoutMs || DEFAULT_QUERY_TIMEOUT_MS)),
    maxRows: Math.max(1, Number(process.env.MIDMAX_SELECTDB_MAX_ROWS || fileConfig.maxRows || DEFAULT_MAX_ROWS)),
    sslMode: process.env.MIDMAX_SELECTDB_SSL_MODE || fileConfig.sslMode || '',
  };
  const missing = [];
  if (!config.host) missing.push('host');
  if (!config.database) missing.push('database');
  if (!config.user) missing.push('user');
  if (!config.password) missing.push('password');
  if (missing.length) {
    throw new Error(`SelectDB MCP config missing: ${missing.join(', ')}`);
  }
  return config;
}

function getPool() {
  if (pool) return pool;
  const config = loadConfig();
  const ssl = String(config.sslMode || '').toLowerCase() === 'disabled' || !config.sslMode
    ? undefined
    : {};
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 8,
    connectTimeout: config.queryTimeoutMs,
    timezone: '+08:00',
    multipleStatements: false,
    namedPlaceholders: false,
    ssl,
  });
  return pool;
}

function buildResponse(id, result, error) {
  if (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error.message || 'SelectDB MCP error',
      },
    };
  }
  return { jsonrpc: '2.0', id, result };
}

function send(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function toolResult(data) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

async function handleToolCall(params = {}) {
  const name = params.name;
  const args = params.arguments || {};
  if (name !== 'selectdb_query') {
    throw new Error(`Unknown tool: ${name}`);
  }
  const config = loadConfig();
  const sql = validateReadOnlySql(args.sql);
  const values = Array.isArray(args.params) ? args.params : [];
  const requestedMaxRows = Math.max(1, Number(args.max_rows || args.limit || config.maxRows));
  const maxRows = Math.min(requestedMaxRows, config.maxRows);
  const limitedSql = /\blimit\s+\d+\s*$/i.test(sql) ? sql : `${sql} LIMIT ${maxRows}`;
  const startedAt = Date.now();
  const [rows, fields] = await getPool().query({
    sql: limitedSql,
    values,
    timeout: config.queryTimeoutMs,
    rowsAsArray: false,
  });
  return toolResult({
    source: 'selectdb_query',
    row_count: Array.isArray(rows) ? rows.length : 0,
    columns: (fields || []).map(field => field.name),
    rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [],
    elapsed_ms: Date.now() - startedAt,
  });
}

async function handleMessage(message) {
  const id = message.id ?? null;
  try {
    if (message.method === 'initialize') {
      return buildResponse(id, {
        protocolVersion: message.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'selectdb-query-mcp',
          version: '0.1.0',
        },
      });
    }
    if (message.method === 'tools/list') {
      return buildResponse(id, {
        tools: [{
          name: 'selectdb_query',
          description: 'Run an audited read-only SELECT/WITH query against the configured SelectDB database.',
          inputSchema: {
            type: 'object',
            properties: {
              sql: { type: 'string', description: 'Read-only SELECT/WITH SQL. Multiple statements and DDL/DML are blocked.' },
              params: { type: 'array', items: {}, description: 'Positional SQL parameters for ? placeholders.' },
              max_rows: { type: 'number', description: 'Maximum rows to return, capped by MIDMAX_SELECTDB_MAX_ROWS.' },
            },
            required: ['sql'],
          },
        }],
      });
    }
    if (message.method === 'tools/call') {
      return buildResponse(id, await handleToolCall(message.params || {}));
    }
    if (message.method === 'notifications/initialized') return null;
    return buildResponse(id, null, new Error(`Unsupported method: ${message.method}`));
  } catch (error) {
    return buildResponse(id, null, error);
  }
}

function parseMessages() {
  while (buffer.length) {
    const separator = buffer.indexOf('\r\n\r\n');
    if (separator < 0) return;
    const header = buffer.slice(0, separator).toString('utf8');
    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      buffer = Buffer.alloc(0);
      return;
    }
    const length = Number(lengthMatch[1]);
    const bodyStart = separator + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const raw = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);
    Promise.resolve()
      .then(() => handleMessage(JSON.parse(raw)))
      .then(response => {
        if (response) send(response);
      })
      .catch(error => send(buildResponse(null, null, error)));
  }
}

if (process.argv.includes('--check-config')) {
  const config = loadConfig();
  process.stdout.write(JSON.stringify({
    ok: true,
    host_configured: Boolean(config.host),
    database_configured: Boolean(config.database),
    user_configured: Boolean(config.user),
    password_configured: Boolean(config.password),
    max_rows: config.maxRows,
  }, null, 2));
  process.exit(0);
}

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});

process.on('SIGTERM', async () => {
  if (pool) await pool.end();
  process.exit(0);
});
