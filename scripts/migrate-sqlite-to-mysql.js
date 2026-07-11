#!/usr/bin/env node

const path = require('path');
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const ENCRYPTED_FIELDS = require('../server/lib/encryptedFields');

function parseArgs(argv) {
  const args = { reset: false, sqlite: path.join(__dirname, '..', 'data.db'), chunkSize: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--reset') args.reset = true;
    else if (token === '--sqlite') args.sqlite = argv[++i];
    else if (token === '--chunk-size') args.chunkSize = Math.max(1, Number(argv[++i]) || args.chunkSize);
    else if (token === '--help' || token === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`
Usage:
  DB_CLIENT=mysql MYSQL_HOST=... MYSQL_PORT=3306 MYSQL_DATABASE=relation MYSQL_USER=relation MYSQL_PASSWORD=... \\
    node scripts/migrate-sqlite-to-mysql.js --sqlite data.db --reset

Options:
  --sqlite <path>       SQLite data.db 路径，默认 ./data.db
  --reset               导入前删除目标库已有表
  --chunk-size <n>      每批插入行数，默认 200
`);
}

function escapeIdentifier(name) {
  return `\`${String(name || '').replace(/`/g, '``')}\``;
}

function mysqlConfigFromEnv() {
  const config = {
    host: process.env.MYSQL_HOST || process.env.RELATION_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || process.env.RELATION_MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.RELATION_MYSQL_USER || 'relation',
    password: process.env.MYSQL_PASSWORD || process.env.RELATION_MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.RELATION_MYSQL_DATABASE || 'relation',
    charset: process.env.MYSQL_CHARSET || 'utf8mb4',
    timezone: process.env.MYSQL_TIMEZONE || '+08:00',
    multipleStatements: false,
  };
  if (!config.password) {
    throw new Error('请通过 MYSQL_PASSWORD 或 RELATION_MYSQL_PASSWORD 设置 MySQL 密码');
  }
  return config;
}

function getTables(sqlite) {
  return sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(row => row.name);
}

function getIndexes(sqlite, table) {
  const indexes = sqlite.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all();
  return indexes
    .map(index => ({
      ...index,
      columns: sqlite.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all().map(col => col.name).filter(Boolean),
    }))
    .filter(index => index.columns.length > 0);
}

function getIndexedColumnSet(sqlite, tables) {
  const set = new Set();
  tables.forEach(table => {
    getIndexes(sqlite, table).forEach(index => {
      index.columns.forEach(column => set.add(`${table}.${column}`));
    });
  });
  return set;
}

function sqliteDefaultToMysql(defaultValue, mysqlType) {
  if (defaultValue === null || defaultValue === undefined) return '';
  const raw = String(defaultValue).trim();
  if (!raw || /^NULL$/i.test(raw)) return '';
  if (/datetime\('now'\s*,\s*'localtime'\)/i.test(raw) || /^CURRENT_TIMESTAMP$/i.test(raw)) {
    return /^(DATETIME|TIMESTAMP)\b/i.test(mysqlType) ? ' DEFAULT CURRENT_TIMESTAMP' : '';
  }
  if (/^(LONGTEXT|LONGBLOB)\b/i.test(mysqlType)) return '';
  if (/^\(.+\)$/.test(raw) && !/^\('.*'\)$/.test(raw)) {
    return ` DEFAULT ${raw.slice(1, -1)}`;
  }
  return ` DEFAULT ${raw}`;
}

function isLikelyLongTextColumn(columnName) {
  return /json|payload|content|summary|detail|description|notes?|remark|message|prompt|response|schema|html|markdown|attachment|business|skills|background|reason|analysis|observation|transcript|raw|config|error|text|body/i
    .test(String(columnName || ''));
}

function isEncryptedField(table, columnName) {
  const config = ENCRYPTED_FIELDS[table];
  if (!config || config.skip) return false;
  return (config.fields || []).includes(columnName);
}

function inferMysqlType(sqlite, table, column, indexedColumns) {
  const type = String(column.type || '').toUpperCase();
  const indexed = indexedColumns.has(`${table}.${column.name}`);
  const defaultValue = String(column.dflt_value || '');
  const lowerName = String(column.name || '').toLowerCase();
  if (column.pk && /INT/.test(type)) return 'BIGINT';
  if (/INT/.test(type)) return 'BIGINT';
  if (/REAL|DOUBLE|FLOAT/.test(type)) return 'DOUBLE';
  if (/NUMERIC|DECIMAL/.test(type)) return 'DECIMAL(18,4)';
  if (/BLOB/.test(type)) return 'LONGBLOB';
  if (/datetime\('now'\s*,\s*'localtime'\)/i.test(defaultValue) || /^CURRENT_TIMESTAMP$/i.test(defaultValue)) {
    return 'DATETIME';
  }
  if (/DATETIME|TIMESTAMP/.test(type)) return 'DATETIME';
  if (/DATE/.test(type) && !/updated|created/.test(lowerName)) return 'VARCHAR(32)';
  if (indexed) return 'VARCHAR(191)';
  if (isEncryptedField(table, column.name)) return 'LONGTEXT';
  if (isLikelyLongTextColumn(column.name)) return 'LONGTEXT';
  if (column.dflt_value !== null && column.dflt_value !== undefined) {
    let maxLen = 0;
    try {
      const row = sqlite.prepare(`SELECT MAX(LENGTH(${escapeSqliteIdentifier(column.name)})) AS max_len FROM ${escapeSqliteIdentifier(table)}`).get();
      maxLen = Number(row?.max_len || 0);
    } catch {}
    if (maxLen <= 255) return 'VARCHAR(255)';
  }
  return 'LONGTEXT';
}

function escapeSqliteIdentifier(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

function createTableSql(sqlite, table, indexedColumns) {
  const columns = sqlite.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
  const primaryColumns = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
  const singleIntegerPrimary = primaryColumns.length === 1 && /INT/i.test(primaryColumns[0].type || '');
  const definitions = columns.map(column => {
    const mysqlType = inferMysqlType(sqlite, table, column, indexedColumns);
    const pieces = [escapeIdentifier(column.name), mysqlType];
    if (singleIntegerPrimary && column.name === primaryColumns[0].name) {
      pieces.push('NOT NULL AUTO_INCREMENT');
    } else if (column.notnull || column.pk) {
      pieces.push('NOT NULL');
    }
    pieces.push(sqliteDefaultToMysql(column.dflt_value, mysqlType).trim());
    return pieces.filter(Boolean).join(' ');
  });
  if (primaryColumns.length > 0) {
    definitions.push(`PRIMARY KEY (${primaryColumns.map(column => escapeIdentifier(column.name)).join(', ')})`);
  }
  return `CREATE TABLE ${escapeIdentifier(table)} (\n  ${definitions.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

function indexColumnSql(tableColumns, columnName) {
  const type = tableColumns.get(columnName) || '';
  if (/TEXT|BLOB/i.test(type)) return `${escapeIdentifier(columnName)}(191)`;
  return escapeIdentifier(columnName);
}

function createIndexSql(table, index, tableColumns) {
  const columnsSql = index.columns.map(column => indexColumnSql(tableColumns, column)).join(', ');
  const prefix = index.unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX';
  const name = index.name.startsWith('sqlite_autoindex_')
    ? `uq_${table}_${index.columns.join('_')}`.slice(0, 60)
    : index.name;
  return `${prefix} ${escapeIdentifier(name)} ON ${escapeIdentifier(table)} (${columnsSql})`;
}

function normalizeMysqlDateTime(value) {
  if (value === null || value === undefined || value === '') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value !== 'string') return value;
  const text = value.trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/);
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}`;
  const spaceMatch = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if (spaceMatch) return `${spaceMatch[1]} ${spaceMatch[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
  return value;
}

function normalizeRowValue(value, mysqlType) {
  if (value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (/^(DATETIME|TIMESTAMP)\b/i.test(String(mysqlType || ''))) {
    return normalizeMysqlDateTime(value);
  }
  return value;
}

async function dropAllTables(connection) {
  const [rows] = await connection.query(`
    SELECT TABLE_NAME AS name
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const row of rows) {
    await connection.query(`DROP TABLE IF EXISTS ${escapeIdentifier(row.name)}`);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  return rows.length;
}

async function importTable(connection, sqlite, table, chunkSize) {
  const columnInfo = sqlite.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
  const columns = columnInfo.map(column => column.name);
  if (!columns.length) return { count: 0 };
  const indexedColumns = getIndexedColumnSet(sqlite, [table]);
  const columnTypes = new Map(columnInfo.map(column => [column.name, inferMysqlType(sqlite, table, column, indexedColumns)]));
  const count = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${escapeSqliteIdentifier(table)}`).get().count;
  const select = sqlite.prepare(`SELECT * FROM ${escapeSqliteIdentifier(table)} LIMIT ? OFFSET ?`);
  for (let offset = 0; offset < count; offset += chunkSize) {
    const rows = select.all(chunkSize, offset);
    if (!rows.length) continue;
    const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const values = [];
    rows.forEach(row => {
      columns.forEach(column => values.push(normalizeRowValue(row[column], columnTypes.get(column))));
    });
    await connection.query(
      `INSERT INTO ${escapeIdentifier(table)} (${columns.map(escapeIdentifier).join(', ')}) VALUES ${placeholders}`,
      values
    );
  }
  if (columns.includes('id')) {
    const [maxRows] = await connection.query(`SELECT MAX(${escapeIdentifier('id')}) AS max_id FROM ${escapeIdentifier(table)}`);
    const nextId = Number(maxRows[0]?.max_id || 0) + 1;
    if (nextId > 1) {
      await connection.query(`ALTER TABLE ${escapeIdentifier(table)} AUTO_INCREMENT = ${nextId}`);
    }
  }
  return { count };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const sqlitePath = path.resolve(args.sqlite);
  const sqlite = new Database(sqlitePath, { readonly: true });
  const tables = getTables(sqlite);
  const indexedColumns = getIndexedColumnSet(sqlite, tables);
  const connection = await mysql.createConnection(mysqlConfigFromEnv());
  try {
    const [existing] = await connection.query(`
      SELECT TABLE_NAME AS name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    if (existing.length && !args.reset) {
      throw new Error(`目标库已有 ${existing.length} 张表。如确认覆盖，请加 --reset`);
    }
    const dropped = args.reset ? await dropAllTables(connection) : 0;
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) {
      await connection.query(createTableSql(sqlite, table, indexedColumns));
    }
    const imported = [];
    for (const table of tables) {
      const result = await importTable(connection, sqlite, table, args.chunkSize);
      imported.push({ table, count: result.count });
      console.log(`[data] ${table}: ${result.count}`);
    }
    for (const table of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
      const tableColumnTypes = new Map(columns.map(column => [column.name, inferMysqlType(sqlite, table, column, indexedColumns)]));
      for (const index of getIndexes(sqlite, table)) {
        if (index.origin === 'pk') continue;
        await connection.query(createIndexSql(table, index, tableColumnTypes));
      }
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    const totalRows = imported.reduce((sum, item) => sum + item.count, 0);
    console.log(JSON.stringify({ success: true, sqlite: sqlitePath, tables: tables.length, dropped, totalRows }, null, 2));
  } finally {
    sqlite.close();
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
