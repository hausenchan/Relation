const { encrypt, decrypt, hmacIndex } = require('./crypto');
const FIELDS = require('./encryptedFields');

const loggedDecryptFailures = new Set();

function getConfig(table) {
  const cfg = FIELDS[table];
  if (!cfg || cfg.skip) return null;
  return cfg;
}

function logDecryptFailure(table, field, error) {
  const key = `${table}.${field}:${error.message}`;
  if (loggedDecryptFailures.has(key)) return;
  loggedDecryptFailures.add(key);
  console.error(
    `[crypto] decrypt failed table=${table} field=${field}: ${error.message}; ` +
    '后续同类错误已省略，请确认 .secrets/master.key 与数据加密时使用的密钥一致'
  );
}

// 把 row 写入 DB 之前调用：对配置中的字段就地加密
function encryptRow(table, row) {
  const cfg = getConfig(table);
  if (!cfg || !row) return row;
  const out = { ...row };
  for (const f of cfg.fields) {
    if (f in out) out[f] = encrypt(out[f]);
  }
  for (const f of cfg.indexed || []) {
    if (f in row) out[`${f}_idx`] = hmacIndex(row[f]);
  }
  return out;
}

// 把 DB 读出的 row 返回给业务/前端之前调用：对配置中的字段就地解密
function decryptRow(table, row) {
  const cfg = getConfig(table);
  if (!cfg || !row) return row;
  const out = { ...row };
  for (const f of cfg.fields) {
    if (f in out) {
      try {
        out[f] = decrypt(out[f]);
      } catch (e) {
        logDecryptFailure(table, f, e);
        out[f] = null;
      }
    }
  }
  return out;
}

function decryptRows(table, rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => decryptRow(table, r));
}

module.exports = { encryptRow, decryptRow, decryptRows };
