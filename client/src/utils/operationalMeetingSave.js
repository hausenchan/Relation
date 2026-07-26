export async function waitForOperationalMeetingSave(pendingRef) {
  while (pendingRef?.current) {
    const pending = pendingRef.current;
    try {
      await pending;
    } catch {
      // The owning save flow renders the error and keeps the draft dirty.
    }
    if (pendingRef.current === pending) pendingRef.current = null;
  }
}

export function startOperationalMeetingSave(pendingRef, operation) {
  if (!pendingRef || typeof operation !== 'function') {
    return Promise.reject(new Error('保存任务参数不完整'));
  }
  let trackedPromise;
  trackedPromise = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (pendingRef.current === trackedPromise) pendingRef.current = null;
    });
  pendingRef.current = trackedPromise;
  return trackedPromise;
}

export function getOperationalMeetingSaveError(error, fallback) {
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
    return '保存超时，系统将自动重试，请检查网络连接';
  }
  return error?.response?.data?.error || error?.message || fallback;
}
