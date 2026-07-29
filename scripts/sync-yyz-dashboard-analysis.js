#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(
  REPO_ROOT,
  'YYZ',
  'intelligence',
  'data-intelligence',
  'skills',
  'yyz-dashboard-analysis'
);
const TARGET_DIR = path.join(REPO_ROOT, '.codex', 'skills', 'yyz-dashboard-analysis');
const IGNORED_NAMES = new Set(['.DS_Store']);

function listFiles(root, required = false) {
  if (!fs.existsSync(root)) {
    if (required) throw new Error(`Skill directory does not exist: ${root}`);
    return [];
  }

  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not supported in skill packages: ${absolute}`);
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  };

  visit(root);
  return files.sort();
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function snapshot(root, required = false) {
  return new Map(listFiles(root, required).map(relative => [
    relative,
    fileHash(path.join(root, ...relative.split('/'))),
  ]));
}

function treeChecksum(tree) {
  const hash = crypto.createHash('sha256');
  for (const [relative, digest] of [...tree.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(relative);
    hash.update('\0');
    hash.update(digest);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function compareTrees(sourceDir, targetDir) {
  const source = snapshot(sourceDir, true);
  const target = snapshot(targetDir);
  const missing = [];
  const changed = [];
  const extra = [];

  for (const [relative, digest] of source) {
    if (!target.has(relative)) missing.push(relative);
    else if (target.get(relative) !== digest) changed.push(relative);
  }
  for (const relative of target.keys()) {
    if (!source.has(relative)) extra.push(relative);
  }

  return {
    missing,
    changed,
    extra,
    sourceChecksum: treeChecksum(source),
    targetChecksum: treeChecksum(target),
  };
}

function removeEmptyDirectories(root, current = root) {
  if (!fs.existsSync(current)) return;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(root, path.join(current, entry.name));
  }
  if (current !== root && fs.readdirSync(current).length === 0) fs.rmdirSync(current);
}

function syncTrees(sourceDir, targetDir) {
  const drift = compareTrees(sourceDir, targetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const relative of [...drift.missing, ...drift.changed]) {
    const sourcePath = path.join(sourceDir, ...relative.split('/'));
    const targetPath = path.join(targetDir, ...relative.split('/'));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
  for (const relative of drift.extra) {
    fs.unlinkSync(path.join(targetDir, ...relative.split('/')));
  }
  removeEmptyDirectories(targetDir);

  const result = compareTrees(sourceDir, targetDir);
  if (result.missing.length || result.changed.length || result.extra.length) {
    throw new Error(`Skill mirror still differs after sync: ${JSON.stringify(result)}`);
  }
  return { ...result, copied: [...drift.missing, ...drift.changed], removed: drift.extra };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const result = checkOnly
    ? compareTrees(SOURCE_DIR, TARGET_DIR)
    : syncTrees(SOURCE_DIR, TARGET_DIR);
  const hasDrift = result.missing.length || result.changed.length || result.extra.length;

  console.log(JSON.stringify({
    mode: checkOnly ? 'check' : 'sync',
    source: path.relative(REPO_ROOT, SOURCE_DIR),
    target: path.relative(REPO_ROOT, TARGET_DIR),
    ...result,
  }, null, 2));

  if (checkOnly && hasDrift) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  compareTrees,
  listFiles,
  snapshot,
  syncTrees,
  treeChecksum,
};
