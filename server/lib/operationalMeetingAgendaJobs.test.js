const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOperationalMeetingAgendaJobStore,
} = require('./operationalMeetingAgendaJobs');

test('deduplicates active jobs and allows a new job after completion', () => {
  let id = 0;
  const store = createOperationalMeetingAgendaJobStore({ createId: () => `job-${++id}` });
  const first = store.create({ meetingId: 7, userId: 9, sourceHash: 'source-a' });
  const duplicate = store.create({ meetingId: 7, userId: 9, sourceHash: 'source-a' });

  assert.equal(first.reused, false);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.job.id, first.job.id);
  assert.equal(store.markRunning(first.job.id).status, 'running');
  assert.equal(store.complete(first.job.id, { agenda: { blocks: [] } }).status, 'completed');

  const next = store.create({ meetingId: 7, userId: 9, sourceHash: 'source-a' });
  assert.equal(next.reused, false);
  assert.notEqual(next.job.id, first.job.id);
});

test('keeps jobs isolated by meeting and user and records structured failures', () => {
  let id = 0;
  const store = createOperationalMeetingAgendaJobStore({ createId: () => `job-${++id}` });
  const first = store.create({ meetingId: 7, userId: 9 }).job;
  const otherMeeting = store.create({ meetingId: 8, userId: 9 }).job;
  const otherUser = store.create({ meetingId: 7, userId: 10 }).job;

  assert.notEqual(first.id, otherMeeting.id);
  assert.notEqual(first.id, otherUser.id);
  const failed = store.fail(first.id, {
    error: '模型不可用',
    code: 'AI_MODEL_UNAVAILABLE',
    httpStatus: 503,
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, '模型不可用');
  assert.equal(failed.code, 'AI_MODEL_UNAVAILABLE');
  assert.equal(failed.httpStatus, 503);
});

test('expires terminal jobs and rejects creation when all capacity is active', () => {
  let currentTime = 1000;
  let id = 0;
  const store = createOperationalMeetingAgendaJobStore({
    now: () => currentTime,
    createId: () => `job-${++id}`,
    ttlMs: 100,
    maxJobs: 2,
  });
  const first = store.create({ meetingId: 1, userId: 1 }).job;
  store.create({ meetingId: 2, userId: 1 });
  assert.throws(
    () => store.create({ meetingId: 3, userId: 1 }),
    error => error.code === 'AGENDA_GENERATION_BUSY',
  );

  store.complete(first.id, { saved: true });
  const replacement = store.create({ meetingId: 3, userId: 1 });
  assert.equal(replacement.reused, false);
  assert.equal(store.size(), 2);

  currentTime += 101;
  store.cleanup();
  assert.equal(store.size(), 0);
});
