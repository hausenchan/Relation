const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DEFAULT_INITIAL_JS_GZIP_BUDGET_BYTES = 400 * 1024;
const DEFAULT_ASYNC_CHUNK_GZIP_BUDGET_BYTES = 500 * 1024;

function normalizeByteBudget(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function gzipFileSize(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath), { level: zlib.constants.Z_BEST_COMPRESSION }).length;
}

function collectFrontendBuildMetrics(buildDir) {
  const root = path.resolve(buildDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-manifest.json'), 'utf8'));
  const entrypoints = Array.isArray(manifest.entrypoints) ? manifest.entrypoints : [];
  const initialJsFiles = entrypoints.filter(file => file.endsWith('.js'));
  const allJsFiles = [...new Set(Object.values(manifest.files || {}).filter(file => file.endsWith('.js')))];
  const initialJsSet = new Set(initialJsFiles);
  const toMetric = relativePath => ({
    file: relativePath,
    gzip_bytes: gzipFileSize(path.join(root, relativePath.replace(/^\//, ''))),
  });
  const initial = initialJsFiles.map(toMetric);
  const asyncChunks = allJsFiles.filter(file => !initialJsSet.has(file.replace(/^\//, ''))).map(toMetric);
  return {
    build_dir: root,
    initial_js: initial,
    initial_js_gzip_bytes: initial.reduce((sum, item) => sum + item.gzip_bytes, 0),
    async_chunks: asyncChunks,
    max_async_chunk_gzip_bytes: Math.max(0, ...asyncChunks.map(item => item.gzip_bytes)),
  };
}

function assertFrontendPerformanceBudget(metrics, options = {}) {
  const initialBudget = normalizeByteBudget(
    options.initialJsGzipBudgetBytes,
    DEFAULT_INITIAL_JS_GZIP_BUDGET_BYTES,
  );
  const asyncBudget = normalizeByteBudget(
    options.asyncChunkGzipBudgetBytes,
    DEFAULT_ASYNC_CHUNK_GZIP_BUDGET_BYTES,
  );
  const failures = [];
  if (metrics.initial_js.length !== 1) {
    failures.push(`首屏应只加载 1 个 JavaScript 入口，当前为 ${metrics.initial_js.length} 个`);
  }
  if (metrics.initial_js_gzip_bytes > initialBudget) {
    failures.push(`首屏 JavaScript gzip ${metrics.initial_js_gzip_bytes}B 超过 ${initialBudget}B`);
  }
  if (metrics.async_chunks.length < 10) {
    failures.push(`异步页面 chunk 仅 ${metrics.async_chunks.length} 个，路由可能未按需拆分`);
  }
  if (metrics.max_async_chunk_gzip_bytes > asyncBudget) {
    failures.push(`最大异步 chunk gzip ${metrics.max_async_chunk_gzip_bytes}B 超过 ${asyncBudget}B`);
  }
  return {
    passed: failures.length === 0,
    failures,
    budgets: {
      initial_js_gzip_bytes: initialBudget,
      async_chunk_gzip_bytes: asyncBudget,
    },
  };
}

module.exports = {
  DEFAULT_ASYNC_CHUNK_GZIP_BUDGET_BYTES,
  DEFAULT_INITIAL_JS_GZIP_BUDGET_BYTES,
  assertFrontendPerformanceBudget,
  collectFrontendBuildMetrics,
  normalizeByteBudget,
};
