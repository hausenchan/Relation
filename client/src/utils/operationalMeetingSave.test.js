import {
  getOperationalMeetingSaveError,
  startOperationalMeetingSave,
  waitForOperationalMeetingSave,
} from './operationalMeetingSave';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('clears a completed tracked save before another caller continues', async () => {
  const pendingRef = { current: null };
  const request = deferred();
  const tracked = startOperationalMeetingSave(pendingRef, () => request.promise);
  const waiter = waitForOperationalMeetingSave(pendingRef);

  request.resolve({ success: true });

  await expect(tracked).resolves.toEqual({ success: true });
  await expect(waiter).resolves.toBeUndefined();
  expect(pendingRef.current).toBeNull();
});

test('waits for a replacement save instead of recursing on a completed promise', async () => {
  const pendingRef = { current: null };
  const first = deferred();
  const second = deferred();
  startOperationalMeetingSave(pendingRef, async () => {
    await first.promise;
    startOperationalMeetingSave(pendingRef, () => second.promise);
    return true;
  });
  const waiter = waitForOperationalMeetingSave(pendingRef);

  first.resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  second.resolve(true);

  await expect(waiter).resolves.toBeUndefined();
  expect(pendingRef.current).toBeNull();
});

test('turns request timeouts into a retryable save message', () => {
  expect(getOperationalMeetingSaveError(
    { code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' },
    '保存失败',
  )).toBe('保存超时，系统将自动重试，请检查网络连接');
});
