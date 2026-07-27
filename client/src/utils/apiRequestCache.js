export function createApiRequestCache({ ttlMs = 60000, now = () => Date.now() } = {}) {
  const entries = new Map();

  const get = (key, loader) => {
    const cacheKey = String(key || '');
    const cached = entries.get(cacheKey);
    const currentTime = now();
    if (cached?.promise) return cached.promise;
    if (cached && cached.expiresAt > currentTime) return Promise.resolve(cached.value);

    const promise = Promise.resolve().then(loader);
    entries.set(cacheKey, { promise, expiresAt: currentTime + ttlMs });
    return promise.then((value) => {
      if (entries.get(cacheKey)?.promise === promise) {
        entries.set(cacheKey, { value, expiresAt: now() + ttlMs });
      }
      return value;
    }).catch((error) => {
      if (entries.get(cacheKey)?.promise === promise) entries.delete(cacheKey);
      throw error;
    });
  };

  const invalidate = (prefix = '') => {
    const normalizedPrefix = String(prefix || '');
    if (!normalizedPrefix) {
      entries.clear();
      return;
    }
    for (const key of entries.keys()) {
      if (key.startsWith(normalizedPrefix)) entries.delete(key);
    }
  };

  return {
    clear: () => entries.clear(),
    get,
    invalidate,
  };
}

export function buildApiRequestCacheKey(path, params = {}) {
  const pairs = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)]);
  const query = new URLSearchParams(pairs).toString();
  return query ? `${path}?${query}` : path;
}
