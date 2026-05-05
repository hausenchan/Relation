#!/usr/bin/env node
// 一次性回填脚本：把指定表中已有的明文字段加密。
// 用法：
//   node scripts/migrate-encrypt.js --db server/data.db --table executive_reports
//   node scripts/migrate-encrypt.js --db server/data.db --all
//   node scripts/migrate-encrypt.js --db server/data.db --table persons --dry-run
//
// 安全要求：
//   1. 跑之前先 cp server/data.db server/data.db.bak.YYYYMMDD
//   2. 跑之前停服
//   3. dry-run 先看输出再正式跑
//   4. 已加密的字段（带 enc:v1: 前缀）会被跳过，所以脚本可重入

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const FIELDS = require('../server/lib/encryptedFields');
const { encrypt, hmacIndex, isEncrypted } = require('../server/lib/crypto');

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--all') args.all = true;
    else if (a === '--table') args.table = argv[++i];
    else if (a === '--db') args.db = argv[++i];
  }
  return args;
}

function migrateTable(db, table, cfg, dryRun) {
  const tableName = quoteIdent(table);
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (tableInfo.length === 0) {
    console.log(`[skip] table ${table} not exist in db`);
    return;
  }
  const pk = tableInfo.find(c => c.pk > 0);
  if (!pk) {
    console.log(`[skip] ${table}: no primary key`);
    return;
  }
  const colNames = new Set(tableInfo.map(c => c.name));
  const fields = cfg.fields.filter(f => colNames.has(f));
  const indexed = (cfg.indexed || []).filter(f => colNames.has(f) && colNames.has(`${f}_idx`));
  const updateCols = [...fields, ...indexed.map(f => `${f}_idx`)];
  if (updateCols.length === 0) {
    console.log(`[skip] ${table}: no configured field exists in this table`);
    return;
  }

  const selectCols = [...new Set([pk.name, ...fields, ...indexed, ...indexed.map(f => `${f}_idx`)])].map(quoteIdent).join(', ');
  const rows = db.prepare(`SELECT ${selectCols} FROM ${tableName}`).all();
  let updated = 0;
  let skipped = 0;

  const updateStmt = db.prepare(
    `UPDATE ${tableName} SET ${updateCols.map(f => `${quoteIdent(f)} = ?`).join(', ')} WHERE ${quoteIdent(pk.name)} = ?`
  );

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const newValues = [];
      let needUpdate = false;
      for (const f of fields) {
        const v = r[f];
        if (v === null || v === undefined || v === '') {
          newValues.push(v);
          continue;
        }
        if (isEncrypted(v)) {
          newValues.push(v);
          continue;
        }
        newValues.push(encrypt(v));
        needUpdate = true;
      }
      for (const f of indexed) {
        const nextIdx = hmacIndex(r[f]);
        newValues.push(nextIdx);
        if (r[`${f}_idx`] !== nextIdx) needUpdate = true;
      }
      if (needUpdate) {
        if (!dryRun) updateStmt.run(...newValues, r[pk.name]);
        updated++;
      } else {
        skipped++;
      }
    }
  });
  tx(rows);

  console.log(`[${dryRun ? 'DRY' : 'OK '}] ${table}: ${rows.length} rows, encrypted/indexed ${updated}, already-encrypted/empty ${skipped}, fields=[${fields.join(',')}], indexed=[${indexed.join(',')}]`);
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db || path.join(__dirname, '..', 'server', 'data.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`db not found: ${dbPath}`);
    process.exit(1);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const tables = args.all
    ? Object.keys(FIELDS).filter(t => !FIELDS[t].skip)
    : (args.table ? [args.table] : []);

  if (tables.length === 0) {
    console.error('请指定 --table <name> 或 --all');
    process.exit(1);
  }

  console.log(`db: ${dbPath}`);
  console.log(`mode: ${args.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`tables: ${tables.join(', ')}`);
  console.log('---');

  for (const t of tables) {
    const cfg = FIELDS[t];
    if (!cfg || cfg.skip) {
      console.log(`[skip] ${t}: no config or marked skip`);
      continue;
    }
    migrateTable(db, t, cfg, args.dryRun);
  }

  db.close();
  console.log('---');
  console.log('done.');
}

main();
