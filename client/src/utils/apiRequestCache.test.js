import { buildApiRequestCacheKey, createApiRequestCache } from './apiRequestCache';

test('deduplicates in-flight requests and reuses fresh values', async () => {
  let currentTime = 1000;
  let calls = 0;
  const cache = createApiRequestCache({ ttlMs: 5000, now: () => currentTime });
  const loader = async () => {
    calls += 1;
    return { calls };
  };

  const [first, second] = await Promise.all([
    cache.get('users', loader),
    cache.get('users', loader),
  ]);
  expect(first).toEqual({ calls: 1 });
  expect(second).toEqual({ calls: 1 });
  expect(await cache.get('users', loader)).toEqual({ calls: 1 });

  currentTime += 5001;
  expect(await cache.get('users', loader)).toEqual({ calls: 2 });
});

test('invalidates matching cache prefixes', async () => {
  let calls = 0;
  const cache = createApiRequestCache();
  const loader = async () => ++calls;

  await cache.get('users:simple', loader);
  await cache.get('teams:list', loader);
  cache.invalidate('users:');

  expect(await cache.get('users:simple', loader)).toBe(3);
  expect(await cache.get('teams:list', loader)).toBe(2);
});

test('does not repopulate an invalidated in-flight entry', async () => {
  let resolveFirst;
  let calls = 0;
  const cache = createApiRequestCache();
  const firstRequest = cache.get('users:simple', () => {
    calls += 1;
    return new Promise(resolve => {
      resolveFirst = resolve;
    });
  });

  await Promise.resolve();
  cache.invalidate('users:');
  resolveFirst('stale');
  await expect(firstRequest).resolves.toBe('stale');
  await expect(cache.get('users:simple', async () => {
    calls += 1;
    return 'fresh';
  })).resolves.toBe('fresh');
  expect(calls).toBe(2);
});

test('builds stable keys while omitting empty parameters', () => {
  expect(buildApiRequestCacheKey('/users/simple', {
    include_readonly: 1,
    department: 'commercial',
    empty: undefined,
  })).toBe('/users/simple?department=commercial&include_readonly=1');
});
