const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  compareTrees,
  syncTrees,
} = require('./sync-yyz-dashboard-analysis');

function write(root, relative, content) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('syncTrees copies changed files, removes extras, and produces an exact mirror', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yyz-skill-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');

  write(source, 'SKILL.md', 'authoritative\n');
  write(source, 'scripts/report.js', 'new\n');
  write(target, 'SKILL.md', 'stale\n');
  write(target, 'obsolete.txt', 'remove me\n');

  const drift = compareTrees(source, target);
  assert.deepEqual(drift.missing, ['scripts/report.js']);
  assert.deepEqual(drift.changed, ['SKILL.md']);
  assert.deepEqual(drift.extra, ['obsolete.txt']);
  assert.notEqual(drift.sourceChecksum, drift.targetChecksum);

  const result = syncTrees(source, target);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.extra, []);
  assert.deepEqual(result.copied, ['scripts/report.js', 'SKILL.md']);
  assert.deepEqual(result.removed, ['obsolete.txt']);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'authoritative\n');
  assert.equal(result.sourceChecksum, result.targetChecksum);
});
