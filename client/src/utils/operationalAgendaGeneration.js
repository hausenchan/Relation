export const OPERATIONAL_AGENDA_POLL_INTERVAL_MS = 1500;
export const OPERATIONAL_AGENDA_POLL_TIMEOUT_MS = 5 * 60 * 1000;

function createPollingError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function waitForPollingDelay(delayMs, signal) {
  if (signal?.aborted) {
    return Promise.reject(createPollingError('会议提纲生成轮询已取消', 'AGENDA_GENERATION_CANCELLED'));
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener?.('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(createPollingError('会议提纲生成轮询已取消', 'AGENDA_GENERATION_CANCELLED'));
    };
    signal?.addEventListener?.('abort', handleAbort, { once: true });
  });
}

function normalizePollDelay(value) {
  const delay = Number(value);
  if (!Number.isFinite(delay) || delay <= 0) return OPERATIONAL_AGENDA_POLL_INTERVAL_MS;
  return Math.max(500, Math.min(5000, Math.round(delay)));
}

export async function pollOperationalAgendaGeneration({
  jobId,
  getJob,
  pollAfterMs = OPERATIONAL_AGENDA_POLL_INTERVAL_MS,
  timeoutMs = OPERATIONAL_AGENDA_POLL_TIMEOUT_MS,
  signal,
  now = () => Date.now(),
  wait = waitForPollingDelay,
}) {
  if (!jobId || typeof getJob !== 'function') {
    throw createPollingError('会议提纲生成任务信息不完整', 'AGENDA_GENERATION_JOB_INVALID');
  }
  const startedAt = now();
  let nextDelay = normalizePollDelay(pollAfterMs);
  while (true) {
    if (signal?.aborted) {
      throw createPollingError('会议提纲生成轮询已取消', 'AGENDA_GENERATION_CANCELLED');
    }
    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) {
      throw createPollingError(
        'AI 提纲仍在后台生成，请稍后刷新查看或重试',
        'AGENDA_GENERATION_POLL_TIMEOUT',
      );
    }
    await wait(Math.min(nextDelay, timeoutMs - elapsed), signal);
    const job = await getJob(jobId, { signal });
    if (['completed', 'failed'].includes(job?.status)) return job;
    if (!['pending', 'running'].includes(job?.status)) {
      throw createPollingError('会议提纲生成任务状态异常', 'AGENDA_GENERATION_JOB_INVALID');
    }
    nextDelay = normalizePollDelay(job.poll_after_ms);
  }
}
