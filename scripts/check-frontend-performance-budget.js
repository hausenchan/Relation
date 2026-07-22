#!/usr/bin/env node

const path = require('node:path');
const {
  assertFrontendPerformanceBudget,
  collectFrontendBuildMetrics,
} = require('../server/lib/frontendPerformanceBudget');

const buildDir = process.env.BUILD_PATH
  ? path.resolve(process.env.BUILD_PATH)
  : path.resolve(__dirname, '../client/build');
const metrics = collectFrontendBuildMetrics(buildDir);
const result = assertFrontendPerformanceBudget(metrics, {
  initialJsGzipBudgetBytes: Number(process.env.RELATION_INITIAL_JS_GZIP_BUDGET_KB || 400) * 1024,
  asyncChunkGzipBudgetBytes: Number(process.env.RELATION_ASYNC_CHUNK_GZIP_BUDGET_KB || 500) * 1024,
});

const toKb = bytes => `${(bytes / 1024).toFixed(1)}KB`;
console.log(`首屏 JavaScript gzip: ${toKb(metrics.initial_js_gzip_bytes)} / ${toKb(result.budgets.initial_js_gzip_bytes)}`);
console.log(`异步 chunk: ${metrics.async_chunks.length} 个，最大 ${toKb(metrics.max_async_chunk_gzip_bytes)} / ${toKb(result.budgets.async_chunk_gzip_bytes)}`);
if (!result.passed) {
  result.failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
}
