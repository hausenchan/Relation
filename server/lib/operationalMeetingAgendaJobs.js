const crypto = require('crypto');

const DEFAULT_JOB_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_JOBS = 200;

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function createOperationalMeetingAgendaJobStore({
  now = () => Date.now(),
  createId = () => crypto.randomUUID(),
  ttlMs = DEFAULT_JOB_TTL_MS,
  maxJobs = DEFAULT_MAX_JOBS,
} = {}) {
  const jobs = new Map();
  const activeJobIds = new Map();
  const resolvedTtlMs = normalizePositiveInteger(ttlMs, DEFAULT_JOB_TTL_MS);
  const resolvedMaxJobs = normalizePositiveInteger(maxJobs, DEFAULT_MAX_JOBS);

  const getActiveKey = (meetingId, userId) => `${Number(meetingId)}:${Number(userId)}`;

  function remove(jobId) {
    const job = jobs.get(jobId);
    if (!job) return false;
    jobs.delete(jobId);
    const activeKey = getActiveKey(job.meetingId, job.userId);
    if (activeJobIds.get(activeKey) === jobId) activeJobIds.delete(activeKey);
    return true;
  }

  function cleanup() {
    const currentTime = now();
    [...jobs.values()].forEach(job => {
      if (job.expiresAt <= currentTime) remove(job.id);
    });
  }

  function findActive(meetingId, userId) {
    cleanup();
    const activeKey = getActiveKey(meetingId, userId);
    const job = jobs.get(activeJobIds.get(activeKey));
    return job && ['pending', 'running'].includes(job.status) ? job : null;
  }

  function reserveCapacity() {
    cleanup();
    if (jobs.size < resolvedMaxJobs) return;
    [...jobs.values()]
      .filter(job => ['completed', 'failed'].includes(job.status))
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .some(job => {
        remove(job.id);
        return jobs.size < resolvedMaxJobs;
      });
    if (jobs.size >= resolvedMaxJobs) {
      const error = new Error('AI生成任务较多，请稍后重试');
      error.code = 'AGENDA_GENERATION_BUSY';
      throw error;
    }
  }

  function create({ meetingId, userId, sourceHash = '' }) {
    const existing = findActive(meetingId, userId);
    if (existing) return { job: existing, reused: true };
    reserveCapacity();
    const timestamp = now();
    const job = {
      id: createId(),
      meetingId: Number(meetingId),
      userId: Number(userId),
      sourceHash: String(sourceHash || ''),
      status: 'pending',
      result: null,
      error: null,
      code: null,
      httpStatus: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
      expiresAt: timestamp + resolvedTtlMs,
    };
    jobs.set(job.id, job);
    activeJobIds.set(getActiveKey(job.meetingId, job.userId), job.id);
    return { job, reused: false };
  }

  function get(jobId) {
    cleanup();
    return jobs.get(String(jobId || '')) || null;
  }

  function update(jobId, patch) {
    const job = get(jobId);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: now() });
    return job;
  }

  function markRunning(jobId) {
    const job = get(jobId);
    if (!job || job.status !== 'pending') return job;
    const timestamp = now();
    return update(jobId, { status: 'running', startedAt: timestamp });
  }

  function finish(jobId, patch) {
    const job = get(jobId);
    if (!job || !['pending', 'running'].includes(job.status)) return job;
    const timestamp = now();
    const updated = update(jobId, {
      ...patch,
      completedAt: timestamp,
      expiresAt: timestamp + resolvedTtlMs,
    });
    const activeKey = getActiveKey(job.meetingId, job.userId);
    if (activeJobIds.get(activeKey) === job.id) activeJobIds.delete(activeKey);
    return updated;
  }

  function complete(jobId, result) {
    return finish(jobId, {
      status: 'completed',
      result,
      error: null,
      code: null,
      httpStatus: 200,
    });
  }

  function fail(jobId, { error, code, httpStatus }) {
    return finish(jobId, {
      status: 'failed',
      result: null,
      error: String(error || '生成会议提纲失败'),
      code: String(code || 'AI_GENERATION_FAILED'),
      httpStatus: normalizePositiveInteger(httpStatus, 500),
    });
  }

  return {
    cleanup,
    complete,
    create,
    fail,
    findActive,
    get,
    markRunning,
    remove,
    size: () => {
      cleanup();
      return jobs.size;
    },
  };
}

module.exports = {
  DEFAULT_JOB_TTL_MS,
  DEFAULT_MAX_JOBS,
  createOperationalMeetingAgendaJobStore,
};
