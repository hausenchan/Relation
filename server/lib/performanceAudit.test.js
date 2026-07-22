const test = require('node:test');
const assert = require('node:assert/strict');
const { auditApiPerformance, percentile } = require('../../scripts/performance-audit');

test('calculates stable percentiles', () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([], 0.95), 0);
});

test('marks slow and server-error endpoints as failed', async () => {
  const responses = new Map([
    ['/api/auth/login', { status: 200, body: JSON.stringify({ token: 'test-token' }) }],
    ['/api/fast', { status: 200, body: '[]' }],
    ['/api/error', { status: 500, body: '{}' }],
  ]);
  const fetchImpl = async url => {
    const path = new URL(url).pathname;
    const value = responses.get(path);
    return new Response(value.body, { status: value.status, headers: { 'Content-Type': 'application/json' } });
  };
  const report = await auditApiPerformance({
    fetchImpl,
    baseUrl: 'http://local.test/api',
    username: 'tester',
    password: 'local-only',
    endpoints: ['/fast', '/error'],
    samples: 2,
    budgetMs: 300,
  });
  assert.equal(report.results[0].passed, true);
  assert.equal(report.results[1].passed, false);
});
