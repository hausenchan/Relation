const BetterSqliteDatabase = require('better-sqlite3');
const ENCRYPTED_FIELDS = require('./encryptedFields');
const {
  DEFAULT_MYSQL_TIMEZONE,
  normalizeMysqlDateTimeValue,
  normalizeMysqlTimezone,
} = require('./businessTime');

const MYSQL_DIALECTS = new Set(['mysql', 'mysql2']);

function getDialect() {
  return String(process.env.DB_CLIENT || process.env.DB_DIALECT || process.env.RELATION_DB_CLIENT || '').trim().toLowerCase();
}

function isMysqlDialect() {
  return MYSQL_DIALECTS.has(getDialect());
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Date);
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date || typeof value === 'string') {
    return normalizeMysqlDateTimeValue(
      value,
      process.env.MYSQL_TIMEZONE || process.env.RELATION_MYSQL_TIMEZONE || DEFAULT_MYSQL_TIMEZONE,
    );
  }
  if (typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function escapeIdentifier(identifier) {
  return `\`${String(identifier || '').replace(/`/g, '``')}\``;
}

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function compactSqlForLog(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      current += ch;
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote && sql[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '-' && next === '-') {
      current += ch;
      current += next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      current += ch;
      current += next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';') {
      const text = current.trim();
      if (text) statements.push(text);
      current = '';
      continue;
    }
    current += ch;
  }
  const text = current.trim();
  if (text) statements.push(text);
  return statements;
}

function convertNamedParameters(sql, args) {
  if (args.length !== 1 || !isPlainObject(args[0])) {
    return { sql, params: args.map(normalizeValue) };
  }
  const params = [];
  const converted = sql.replace(/([@:$])([A-Za-z_][A-Za-z0-9_]*)/g, (match, prefix, name, offset, full) => {
    const prev = full[offset - 1];
    if (prefix === ':' && prev === ':') return match;
    params.push(normalizeValue(args[0][name]));
    return '?';
  });
  return { sql: converted, params };
}

function replaceExcludedValues(sql) {
  return sql.replace(/\bexcluded\.([A-Za-z_][A-Za-z0-9_]*)/gi, 'VALUES($1)');
}

function getFirstInsertColumn(sql) {
  const match = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+[`"]?([A-Za-z0-9_]+)[`"]?\s*\(([^)]+)\)/i);
  if (!match) return 'id';
  const first = match[2].split(',')[0].trim().replace(/[`"]/g, '');
  return first || 'id';
}

function translateUpsert(sql) {
  let output = sql;
  output = output.replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT IGNORE');
  output = output.replace(/\bINSERT\s+OR\s+REPLACE\b/gi, 'REPLACE');
  output = output.replace(/\bON\s+CONFLICT\s*\([^)]+\)\s+DO\s+NOTHING\b/gi, () => {
    const col = getFirstInsertColumn(output);
    return `ON DUPLICATE KEY UPDATE ${escapeIdentifier(col)} = ${escapeIdentifier(col)}`;
  });
  output = output.replace(/\bON\s+CONFLICT\s*\([^)]+\)\s+DO\s+UPDATE\s+SET\b/gi, 'ON DUPLICATE KEY UPDATE');
  return replaceExcludedValues(output);
}

function translateDateFunctions(sql, params) {
  let output = sql;
  let nextParams = [...params];
  output = output.replace(/datetime\(\s*'now'\s*,\s*'localtime'\s*\)/gi, 'NOW()');
  output = output.replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()');
  output = output.replace(/date\(\s*'now'\s*\)/gi, 'CURDATE()');
  output = output.replace(/date\(\s*'now'\s*,\s*'\+(\d+)\s+days?'\s*\)/gi, 'DATE_ADD(CURDATE(), INTERVAL $1 DAY)');
  output = output.replace(/date\(\s*'now'\s*,\s*'-(\d+)\s+days?'\s*\)/gi, 'DATE_SUB(CURDATE(), INTERVAL $1 DAY)');
  output = output.replace(/date\(\s*'now'\s*,\s*'-(\d+)\s+months?'\s*\)/gi, 'DATE_SUB(CURDATE(), INTERVAL $1 MONTH)');
  output = output.replace(/date\(\s*'now'\s*,\s*'-'\s*\|\|\s*\?\s*\|\|\s*'\s+days'\s*,\s*'localtime'\s*\)/gi, 'DATE_SUB(CURDATE(), INTERVAL ? DAY)');
  output = output.replace(/strftime\(\s*'%Y-%m'\s*,\s*'now'\s*\)/gi, "DATE_FORMAT(NOW(), '%Y-%m')");
  output = output.replace(/strftime\(\s*'%Y'\s*,\s*'now'\s*\)/gi, "DATE_FORMAT(NOW(), '%Y')");
  output = output.replace(/strftime\(\s*'%Y-%m'\s*,\s*([^)]+?)\s*\)/gi, "DATE_FORMAT($1, '%Y-%m')");
  output = output.replace(/strftime\(\s*'%Y'\s*,\s*([^)]+?)\s*\)/gi, "DATE_FORMAT($1, '%Y')");
  output = output.replace(/datetime\(\s*COALESCE\(([^)]+)\)\s*\)/gi, 'COALESCE($1)');
  output = output.replace(/datetime\(\s*([A-Za-z0-9_`.]+)\s*\)/gi, '$1');
  if (/datetime\(\s*'now'\s*,\s*\?\s*\)/i.test(output) && nextParams.length) {
    const modifier = String(nextParams[0] || '').trim();
    const monthMatch = modifier.match(/^-(\d+)\s+months?$/i);
    const dayMatch = modifier.match(/^-(\d+)\s+days?$/i);
    if (monthMatch) {
      output = output.replace(/datetime\(\s*'now'\s*,\s*\?\s*\)/i, 'DATE_SUB(NOW(), INTERVAL ? MONTH)');
      nextParams[0] = Number(monthMatch[1]);
    } else if (dayMatch) {
      output = output.replace(/datetime\(\s*'now'\s*,\s*\?\s*\)/i, 'DATE_SUB(NOW(), INTERVAL ? DAY)');
      nextParams[0] = Number(dayMatch[1]);
    }
  }
  return { sql: output, params: nextParams };
}

function getColumnNameFromDefinition(definition) {
  const match = String(definition || '').trim().match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s+/);
  return match ? match[1] : '';
}

function isLikelyLongTextColumn(columnName) {
  return /json|jwk|encrypted_dek|payload|content|summary|detail|description|notes?|remark|message|prompt|response|schema|html|markdown|attachment|business|skills|background|reason|analysis|observation|transcript|raw|config|error|text|body/i
    .test(String(columnName || ''));
}

function isEncryptedField(tableName, columnName) {
  const config = ENCRYPTED_FIELDS[tableName];
  if (!config || config.skip) return false;
  return (config.fields || []).includes(columnName);
}

function translateConcats(sql) {
  let output = sql;
  output = output.replace(/\(','\s*\|\|\s*IFNULL\(([^,]+),\s*''\)\s*\|\|\s*','\)/gi, "CONCAT(',', IFNULL($1, ''), ',')");
  output = output.replace(/GROUP_CONCAT\(CAST\(dt\.id AS TEXT\)\s*\|\|\s*':'\s*\|\|\s*dt\.title,\s*'\|\|'\)/gi, "GROUP_CONCAT(CONCAT(CAST(dt.id AS CHAR), ':', dt.title) SEPARATOR '||')");
  output = output.replace(/CAST\(([^)]+)\s+AS\s+TEXT\)/gi, 'CAST($1 AS CHAR)');
  return output;
}

function translateGeneralSql(sql, params = []) {
  let output = sql;
  output = translateUpsert(output);
  output = translateConcats(output);
  let dateResult = translateDateFunctions(output, params);
  output = dateResult.sql;
  output = output.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`');
  output = output.replace(/\bsubstr\s*\(/gi, 'SUBSTRING(');
  output = output.replace(/\bRANDOM\(\)/gi, 'RAND()');
  output = output.replace(/\bIFNULL\(/gi, 'IFNULL(');
  return { sql: output, params: dateResult.params };
}

function columnDefinitionToMysql(definition, indexedColumns = new Set(), tableName = '') {
  let output = definition.trim();
  const columnName = getColumnNameFromDefinition(output);
  const indexedText = indexedColumns.has(columnName);
  const longText = (isEncryptedField(tableName, columnName) || isLikelyLongTextColumn(columnName)) && !indexedText;
  output = output.replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY');
  output = output.replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT');
  output = output.replace(/\bINTEGER\b/gi, 'INT');
  output = output.replace(/\bREAL\b/gi, 'DOUBLE');
  output = output.replace(/\bDATETIME\s+DEFAULT\s+\(datetime\('now',\s*'localtime'\)\)/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  output = output.replace(/\bTEXT\s+DEFAULT\s+\(datetime\('now',\s*'localtime'\)\)/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  output = output.replace(/\bTEXT\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  output = output.replace(/\bTEXT\b/gi, longText ? 'LONGTEXT' : (indexedText ? 'VARCHAR(191)' : 'VARCHAR(255)'));
  output = output.replace(/\bBLOB\b/gi, 'LONGBLOB');
  if (/\bLONGTEXT\b/i.test(output)) {
    output = output.replace(/\s+DEFAULT\s+('(?:[^']|\\')*'|\S+)/gi, '');
  }
  output = output.replace(/DEFAULT\s+\(([^()]+)\)/gi, 'DEFAULT $1');
  output = output.replace(/datetime\('now',\s*'localtime'\)/gi, 'CURRENT_TIMESTAMP');
  return output;
}

function translateCreateTable(sql) {
  let output = sql.trim();
  let tableName = '';
  output = output.replace(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)[`"]?/i, (m, table) => {
    tableName = table;
    return `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(table)}`;
  });
  if (!/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(output)) {
    output = output.replace(/^CREATE\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?/i, (m, table) => {
      tableName = table;
      return `CREATE TABLE ${escapeIdentifier(table)}`;
    });
  }
  output = output.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`');

  const openIndex = output.indexOf('(');
  const closeIndex = output.lastIndexOf(')');
  if (openIndex < 0 || closeIndex < openIndex) return output;
  const before = output.slice(0, openIndex + 1);
  const body = output.slice(openIndex + 1, closeIndex);
  const after = output.slice(closeIndex);
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === quote && body[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  const indexedColumns = new Set();
  parts.forEach(part => {
    const uniqueMatch = part.match(/^UNIQUE\s*\(([^)]+)\)/i);
    if (!uniqueMatch) return;
    uniqueMatch[1].split(',').forEach(column => {
      indexedColumns.add(column.trim().replace(/[`"]/g, '').split(/\s+/)[0]);
    });
  });
  const converted = parts.map(part => {
    if (/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b/i.test(part)) return part;
    return columnDefinitionToMysql(part, indexedColumns, tableName);
  });
  return `${before}\n  ${converted.join(',\n  ')}\n${after} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

function parseCreateIndex(sql) {
  const match = sql.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?\s+ON\s+`?([A-Za-z0-9_]+)`?\s*\(([\s\S]+)\)$/i);
  if (!match) return null;
  return {
    unique: Boolean(match[1]),
    name: match[2],
    table: match[3],
    columnsSql: match[4].replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`'),
  };
}

function translateDdl(sql) {
  const trimmed = sql.trim();
  if (/^PRAGMA\s+foreign_keys\s*=/i.test(trimmed)) return { noop: true };
  if (/^CREATE\s+TABLE\b/i.test(trimmed)) return { sql: translateCreateTable(trimmed), params: [] };
  if (/^ALTER\s+TABLE\b/i.test(trimmed)) {
    let output = trimmed.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`');
    const tableMatch = output.match(/^ALTER\s+TABLE\s+`?([A-Za-z0-9_]+)`?/i);
    const tableName = tableMatch ? tableMatch[1] : '';
    output = output.replace(/\bADD\s+COLUMN\s+(.+)$/i, (m, def) => `ADD COLUMN ${columnDefinitionToMysql(def, new Set(), tableName)}`);
    return { sql: output, params: [] };
  }
  const index = parseCreateIndex(trimmed.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`'));
  if (index) return { index };
  return translateGeneralSql(trimmed, []);
}

function tableInfoQuery(table) {
  return {
    sql: `
      SELECT
        ORDINAL_POSITION - 1 AS cid,
        COLUMN_NAME AS name,
        COLUMN_TYPE AS type,
        IF(IS_NULLABLE = 'NO', 1, 0) AS notnull,
        COLUMN_DEFAULT AS dflt_value,
        IF(COLUMN_KEY = 'PRI', 1, 0) AS pk
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
    params: [table],
  };
}

class MysqlStatement {
  constructor(db, sql) {
    this.db = db;
    this.rawSql = sql;
    this.pragmaTable = this.getPragmaTable(sql);
    this.pragmaTableFunction = this.getPragmaTableFunction(sql);
    this.sqliteMasterTableExists = /^SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\?/i.test(sql.trim());
  }

  getPragmaTable(sql) {
    const match = sql.trim().match(/^PRAGMA\s+table_info\s*\(\s*['"`]?([A-Za-z0-9_]+)['"`]?\s*\)$/i);
    return match ? match[1] : null;
  }

  getPragmaTableFunction(sql) {
    const match = sql.trim().match(/^SELECT\s+\*\s+FROM\s+pragma_table_info\(\s*'([A-Za-z0-9_]+)'\s*\)(?:\s+WHERE\s+name\s*=\s*'([^']+)')?/i);
    return match ? { table: match[1], column: match[2] || null } : null;
  }

  prepare(args) {
    if (this.pragmaTable) return tableInfoQuery(this.pragmaTable);
    if (this.pragmaTableFunction) {
      const query = tableInfoQuery(this.pragmaTableFunction.table);
      if (this.pragmaTableFunction.column) {
        query.sql += ' AND COLUMN_NAME = ?';
        query.params.push(this.pragmaTableFunction.column);
      }
      return query;
    }
    if (this.sqliteMasterTableExists) {
      return {
        sql: 'SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
        params: args.map(normalizeValue),
      };
    }
    const named = convertNamedParameters(this.rawSql, args);
    return translateGeneralSql(named.sql, named.params);
  }

  all(...args) {
    const query = this.prepare(args);
    return this.db.query(query.sql, query.params);
  }

  get(...args) {
    return this.all(...args)[0];
  }

  run(...args) {
    const query = this.prepare(args);
    const result = this.db.query(query.sql, query.params);
    return {
      lastInsertRowid: result?.insertId || 0,
      changes: result?.affectedRows || 0,
    };
  }
}

class MysqlCompatDatabase {
  constructor() {
    const Mysql2SyncConnection = require('./mysql2SyncConnection');
    this.connection = new Mysql2SyncConnection({
      host: process.env.MYSQL_HOST || process.env.RELATION_MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || process.env.RELATION_MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.RELATION_MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || process.env.RELATION_MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || process.env.RELATION_MYSQL_DATABASE || 'relation',
      charset: process.env.MYSQL_CHARSET || 'utf8mb4',
      timezone: normalizeMysqlTimezone(
        process.env.MYSQL_TIMEZONE || process.env.RELATION_MYSQL_TIMEZONE || DEFAULT_MYSQL_TIMEZONE,
      ),
      multipleStatements: false,
    });
    this.profileQueries = isTruthyEnv(process.env.RELATION_DB_PROFILE);
    this.slowQueryMs = Number(process.env.RELATION_DB_SLOW_QUERY_MS || 0);
    this.profiledConnection = {
      query: (sql, params = []) => this.execute(sql, params),
    };
  }

  prepare(sql) {
    return new MysqlStatement(this.profiledConnection, sql);
  }

  query(sql, params = []) {
    const query = translateGeneralSql(sql, params);
    return this.execute(query.sql, query.params.map(normalizeValue));
  }

  execute(sql, params = []) {
    const startedAt = process.hrtime.bigint();
    try {
      return this.connection.query(sql, params);
    } finally {
      this.logQuery(sql, params, Number(process.hrtime.bigint() - startedAt) / 1e6);
    }
  }

  logQuery(sql, params, elapsedMs) {
    const threshold = Number.isFinite(this.slowQueryMs) ? this.slowQueryMs : 0;
    if (!this.profileQueries && (!threshold || elapsedMs < threshold)) return;
    const label = threshold && elapsedMs >= threshold ? 'slow' : 'query';
    console.warn(`[mysql:${label}] ${elapsedMs.toFixed(1)}ms params=${params.length} sql=${compactSqlForLog(sql)}`);
  }

  exec(sql) {
    for (const statement of splitSqlStatements(sql)) {
      const translated = translateDdl(statement);
      if (translated.noop) continue;
      if (translated.index) {
        this.createIndexIfMissing(translated.index);
        continue;
      }
      this.execute(translated.sql, (translated.params || []).map(normalizeValue));
    }
  }

  createIndexIfMissing(index) {
    const exists = this.execute(`
      SELECT 1 AS ok
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1
    `, [index.table, index.name])[0];
    if (exists) return;
    const columnsSql = this.normalizeIndexColumnsSql(index.table, index.columnsSql);
    const sql = `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${escapeIdentifier(index.name)} ON ${escapeIdentifier(index.table)} (${columnsSql})`;
    this.execute(sql);
  }

  normalizeIndexColumnsSql(table, columnsSql) {
    const columns = this.execute(`
      SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [table]);
    const typeByColumn = new Map(columns.map(column => [String(column.name).toLowerCase(), String(column.data_type || '').toLowerCase()]));
    return String(columnsSql || '').split(',').map(part => {
      const text = part.trim();
      const match = text.match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?(\s+(?:ASC|DESC))?$/i);
      if (!match) return text;
      const type = typeByColumn.get(match[1].toLowerCase()) || '';
      if (!/text|blob/.test(type)) return `${escapeIdentifier(match[1])}${match[2] || ''}`;
      return `${escapeIdentifier(match[1])}(191)${match[2] || ''}`;
    }).join(', ');
  }

  transaction(fn) {
    return (...args) => {
      this.execute('START TRANSACTION');
      try {
        const result = fn(...args);
        this.execute('COMMIT');
        return result;
      } catch (error) {
        this.execute('ROLLBACK');
        throw error;
      }
    };
  }

  close() {
    if (typeof this.connection.dispose === 'function') this.connection.dispose();
  }
}

function Database(filename, options) {
  if (isMysqlDialect()) return new MysqlCompatDatabase(filename, options);
  return new BetterSqliteDatabase(filename, options);
}

Database.isMysql = isMysqlDialect;
Database.mysqlCompat = {
  columnDefinitionToMysql,
  isLikelyLongTextColumn,
  normalizeValue,
};

module.exports = Database;
