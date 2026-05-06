// 候选人重合度查询：雷达模块自管一份内存 cache，避免改 persons 写入路径
// 全表解密 persons.name 后用 HMAC 索引；cache TTL 5 分钟。
// persons 表通常 < 几千行，重建一次约 100ms 内可接受。

const db = require('./db');
const { decryptRow } = require('../lib/cryptoDao');
const { hmacIndex } = require('../lib/crypto');

const TTL_MS = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

function rebuild() {
  const rows = db.prepare(`
    SELECT id, name, person_category, current_company, current_position, weight
    FROM persons
  `).all();
  const map = new Map();
  for (const raw of rows) {
    const r = decryptRow('persons', raw);
    if (!r.name) continue;
    const key = hmacIndex(r.name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: r.id,
      name: r.name,
      person_category: r.person_category,
      current_company: r.current_company || '',
      current_position: r.current_position || '',
      weight: r.weight
    });
  }
  cache = map;
  cacheAt = Date.now();
}

function getCache() {
  if (!cache || Date.now() - cacheAt > TTL_MS) rebuild();
  return cache;
}

function findByName(name) {
  if (!name) return [];
  const key = hmacIndex(String(name).trim());
  if (!key) return [];
  return getCache().get(key) || [];
}

function invalidate() {
  cache = null;
  cacheAt = 0;
}

module.exports = { findByName, invalidate };
