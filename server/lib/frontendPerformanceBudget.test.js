const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assertFrontendPerformanceBudget,
  collectFrontendBuildMetrics,
} = require('./frontendPerformanceBudget');

function createBuildFixture({ mainSize = 1000, chunkSize = 500, chunkCount = 10 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-frontend-budget-'));
  fs.mkdirSync(path.join(root, 'static/js'), { recursive: true });
  fs.writeFileSync(path.join(root, 'static/js/main.js'), 'A'.repeat(mainSize));
  const files = { 'main.js': '/static/js/main.js' };
  for (let index = 0; index < chunkCount; index += 1) {
    const key = `chunk-${index}.js`;
    const relativePath = `/static/js/${key}`;
    files[key] = relativePath;
    fs.writeFileSync(path.join(root, relativePath), `${index}${'B'.repeat(chunkSize)}`);
  }
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify({
    files,
    entrypoints: ['static/js/main.js'],
  }));
  return root;
}

test('collects gzip sizes for initial and lazy chunks', t => {
  const buildDir = createBuildFixture();
  t.after(() => fs.rmSync(buildDir, { recursive: true, force: true }));
  const metrics = collectFrontendBuildMetrics(buildDir);
  assert.equal(metrics.initial_js.length, 1);
  assert.equal(metrics.async_chunks.length, 10);
  assert.ok(metrics.initial_js_gzip_bytes > 0);
  assert.ok(metrics.max_async_chunk_gzip_bytes > 0);
});

test('rejects oversized or non-split frontend builds', () => {
  const result = assertFrontendPerformanceBudget({
    initial_js: [{ file: 'main.js', gzip_bytes: 500 }],
    initial_js_gzip_bytes: 500,
    async_chunks: [],
    max_async_chunk_gzip_bytes: 0,
  }, {
    initialJsGzipBudgetBytes: 400,
    asyncChunkGzipBudgetBytes: 400,
  });
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 2);
});
