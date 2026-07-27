#!/usr/bin/env node

const DEFAULT_ENDPOINTS = [
  '/auth/me',
  '/stats',
  '/users?limit=100',
  '/users/simple?limit=100',
  '/teams',
  '/project-groups',
  '/document-folders',
  '/documents?limit=50',
  '/documents?favorite=1&limit=50',
  '/persons?limit=50',
  '/interactions?limit=50',
  '/reminders?limit=50',
  '/companies?limit=50',
  '/follow-up-tasks?limit=50',
  '/follow-up-tasks/count',
  '/tasks?limit=50',
  '/tasks/count',
  '/tasks/board?limit=100',
  '/goals?limit=50',
  '/weekly-reports?limit=50',
  '/weekly-reports/writers',
  '/opportunities?limit=50',
  '/leads?limit=50',
  '/leads/simple',
  '/strategies?limit=50',
  '/strategies/simple',
  '/dev-tasks?limit=50',
  '/company-subjects?limit=50',
  '/company-subjects/simple',
  '/product-assets?limit=50',
  '/product-asset-reductions/simple',
  '/media-management',
  '/budgets?limit=50',
  '/trips?limit=50',
  '/trips/stats/summary',
  '/gifts?limit=50',
  '/gift_plans?limit=50',
  '/gift_requests?limit=50',
  '/executive/overview',
  '/executive/talents?limit=50',
  '/executive/competitor-dynamics?limit=50',
  '/executive/key-customers?limit=50',
  '/operational-meetings?limit=50',
  '/operational-meeting-templates',
  '/operational-meetings/eligible-participants',
  '/agents/definitions',
  '/agents/runs?limit=30',
  '/agents/budget-opportunities/summary',
  '/notifications?limit=50',
  '/notifications/unread-count',
  '/operation-logs?limit=50',
  '/operation-logs/meta',
  '/network-capture/status',
];

function percentile(values, ratio = 0.95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function timedFetch(fetchImpl, url, options = {}) {
  const startedAt = performance.now();
  const response = await fetchImpl(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10_000),
  });
  const body = await response.arrayBuffer();
  const responseTimeHeader = String(response.headers.get('x-response-time') || '');
  const serverDuration = Number(responseTimeHeader.replace(/ms$/i, ''));
  return {
    duration_ms: performance.now() - startedAt,
    server_ms: Number.isFinite(serverDuration) ? serverDuration : null,
    status: response.status,
    bytes: body.byteLength,
  };
}

async function auditApiPerformance(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = String(options.baseUrl || 'http://127.0.0.1:3001/api').replace(/\/$/, '');
  const username = String(options.username || '');
  const password = String(options.password || '');
  const samples = Math.max(2, Math.min(Number(options.samples) || 5, 20));
  const budgetMs = Math.max(1, Number(options.budgetMs) || 300);
  if (!username || !password) throw new Error('请通过 RELATION_PERF_USERNAME / RELATION_PERF_PASSWORD 提供测试账号');

  const loginResponse = await fetchImpl(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10_000),
  });
  const loginPayload = await loginResponse.json();
  if (!loginResponse.ok || !loginPayload?.token) {
    throw new Error(loginPayload?.error || `登录失败：${loginResponse.status}`);
  }
  const headers = { Authorization: `Bearer ${loginPayload.token}` };
  const results = [];
  for (const endpoint of options.endpoints || DEFAULT_ENDPOINTS) {
    await timedFetch(fetchImpl, `${baseUrl}${endpoint}`, { headers });
    const measurements = [];
    const serverMeasurements = [];
    let status = 0;
    let bytes = 0;
    for (let index = 0; index < samples; index += 1) {
      const sample = await timedFetch(fetchImpl, `${baseUrl}${endpoint}`, { headers });
      measurements.push(sample.duration_ms);
      if (Number.isFinite(sample.server_ms)) serverMeasurements.push(sample.server_ms);
      status = sample.status;
      bytes = sample.bytes;
    }
    results.push({
      endpoint,
      status,
      bytes,
      p50_ms: percentile(measurements, 0.5),
      p95_ms: percentile(measurements, 0.95),
      server_p95_ms: serverMeasurements.length ? percentile(serverMeasurements, 0.95) : null,
      passed: status < 500 && percentile(measurements, 0.95) <= budgetMs,
    });
  }
  return { base_url: baseUrl, budget_ms: budgetMs, samples, results };
}

async function main() {
  const report = await auditApiPerformance({
    baseUrl: process.env.RELATION_PERF_BASE_URL,
    username: process.env.RELATION_PERF_USERNAME,
    password: process.env.RELATION_PERF_PASSWORD,
    samples: process.env.RELATION_PERF_SAMPLES,
    budgetMs: process.env.RELATION_API_RESPONSE_BUDGET_MS,
  });
  const sorted = [...report.results].sort((a, b) => b.p95_ms - a.p95_ms);
  console.table(sorted.map(result => ({
    endpoint: result.endpoint,
    status: result.status,
    bytes: result.bytes,
    p50_ms: result.p50_ms.toFixed(1),
    p95_ms: result.p95_ms.toFixed(1),
    server_p95_ms: Number.isFinite(result.server_p95_ms) ? result.server_p95_ms.toFixed(1) : '-',
    passed: result.passed,
  })));
  const failed = sorted.filter(result => !result.passed);
  console.log(`API 性能门禁：${sorted.length - failed.length}/${sorted.length} 通过，p95 预算 ${report.budget_ms}ms`);
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ENDPOINTS,
  auditApiPerformance,
  percentile,
  timedFetch,
};
