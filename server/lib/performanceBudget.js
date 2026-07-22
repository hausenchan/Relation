const DEFAULT_API_RESPONSE_BUDGET_MS = 300;

function normalizePerformanceBudget(value, fallback = DEFAULT_API_RESPONSE_BUDGET_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.round(parsed), 60_000);
}

function getRequestRouteLabel(req = {}) {
  const routePath = req.route?.path;
  if (routePath) return `${req.baseUrl || ''}${routePath}`;
  return String(req.originalUrl || req.url || req.path || '').split('?')[0] || '/';
}

function createRequestPerformanceMiddleware(options = {}) {
  const budgetMs = normalizePerformanceBudget(options.budgetMs);
  const now = typeof options.now === 'function'
    ? options.now
    : () => Number(process.hrtime.bigint()) / 1e6;
  const logger = typeof options.logger === 'function' ? options.logger : console.warn;

  return (req, res, next) => {
    const startedAt = now();
    let measured = false;

    const measure = () => {
      if (measured) return;
      measured = true;
      const elapsedMs = Math.max(0, now() - startedAt);
      if (!res.headersSent) {
        res.setHeader('Server-Timing', `app;dur=${elapsedMs.toFixed(1)}`);
        res.setHeader('X-Response-Time', `${elapsedMs.toFixed(1)}ms`);
      }
      if (elapsedMs > budgetMs) {
        logger(`[http:slow] ${String(req.method || 'GET').toUpperCase()} ${getRequestRouteLabel(req)} ${elapsedMs.toFixed(1)}ms status=${res.statusCode || 200} budget=${budgetMs}ms`);
      }
    };

    const originalWriteHead = res.writeHead;
    const originalEnd = res.end;
    res.writeHead = function measuredWriteHead(...args) {
      measure();
      return originalWriteHead.apply(this, args);
    };
    res.end = function measuredEnd(...args) {
      measure();
      return originalEnd.apply(this, args);
    };
    next();
  };
}

module.exports = {
  DEFAULT_API_RESPONSE_BUDGET_MS,
  createRequestPerformanceMiddleware,
  getRequestRouteLabel,
  normalizePerformanceBudget,
};
