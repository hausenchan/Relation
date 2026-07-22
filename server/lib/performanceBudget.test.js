const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRequestPerformanceMiddleware,
  getRequestRouteLabel,
  normalizePerformanceBudget,
} = require('./performanceBudget');

function createResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(statusCode) {
      this.statusCode = statusCode;
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
}

test('normalizes response budgets and route labels', () => {
  assert.equal(normalizePerformanceBudget('250'), 250);
  assert.equal(normalizePerformanceBudget('bad'), 300);
  assert.equal(normalizePerformanceBudget(120000), 60000);
  assert.equal(getRequestRouteLabel({ baseUrl: '/api', route: { path: '/documents/:id' } }), '/api/documents/:id');
  assert.equal(getRequestRouteLabel({ originalUrl: '/api/documents?limit=20' }), '/api/documents');
});

test('adds timing headers without logging requests inside the budget', () => {
  const times = [100, 125];
  const logs = [];
  const middleware = createRequestPerformanceMiddleware({
    budgetMs: 300,
    now: () => times.shift(),
    logger: value => logs.push(value),
  });
  const res = createResponse();
  middleware({ method: 'GET', originalUrl: '/api/documents' }, res, () => {});
  res.end();
  assert.equal(res.headers['X-Response-Time'], '25.0ms');
  assert.equal(res.headers['Server-Timing'], 'app;dur=25.0');
  assert.deepEqual(logs, []);
});

test('logs requests that exceed the configured response budget once', () => {
  const times = [10, 410];
  const logs = [];
  const middleware = createRequestPerformanceMiddleware({
    budgetMs: 300,
    now: () => times.shift(),
    logger: value => logs.push(value),
  });
  const res = createResponse();
  middleware({ method: 'POST', originalUrl: '/api/documents/2/content' }, res, () => {});
  res.writeHead(200);
  res.end();
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[http:slow\] POST \/api\/documents\/2\/content 400\.0ms/);
  assert.match(logs[0], /budget=300ms/);
});
