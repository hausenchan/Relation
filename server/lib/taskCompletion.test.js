const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLatestCompletionTransitions,
  buildTaskCompletionRepairs,
  parseAuditStatus,
  resolveTaskLifecycleTimestamps,
} = require('./taskCompletion');

test('preserves completion time when editing an already completed task', () => {
  const result = resolveTaskLifecycleTimestamps({
    currentStatus: 'done',
    requestedStatus: 'done',
    startedAt: '2026-06-18 09:00:00',
    doneAt: '2026-06-19 18:30:00',
    now: '2026-07-24T12:00:00.000Z',
  });

  assert.deepEqual(result, {
    status: 'done',
    startedAt: '2026-06-18 09:00:00',
    doneAt: '2026-06-19 18:30:00',
  });

  const omittedStatus = resolveTaskLifecycleTimestamps({
    currentStatus: 'done',
    requestedStatus: null,
    startedAt: result.startedAt,
    doneAt: result.doneAt,
    now: '2026-07-24T13:00:00.000Z',
  });
  assert.deepEqual(omittedStatus, result);
});

test('records completion only on a real status transition and clears it when reopened', () => {
  const completed = resolveTaskLifecycleTimestamps({
    currentStatus: 'in_progress',
    requestedStatus: 'done',
    startedAt: '2026-07-24 09:00:00',
    doneAt: null,
    now: '2026-07-24T12:00:00.000Z',
  });
  assert.equal(completed.doneAt, '2026-07-24T12:00:00.000Z');

  const reopened = resolveTaskLifecycleTimestamps({
    currentStatus: 'done',
    requestedStatus: 'in_progress',
    startedAt: completed.startedAt,
    doneAt: completed.doneAt,
    now: '2026-07-25T09:00:00.000Z',
  });
  assert.equal(reopened.doneAt, null);
  assert.equal(reopened.startedAt, '2026-07-24 09:00:00');
});

test('builds only evidence-backed repairs from the latest completion transition', () => {
  const logRows = [
    {
      id: 1,
      business_id: '7',
      target_table: 'tasks',
      status_before: 'status: in_progress',
      status_after: 'status: done',
      created_at: '2026-06-19 18:30:00',
    },
    {
      id: 2,
      business_id: '7',
      target_table: 'tasks',
      status_before: null,
      status_after: null,
      details_json: JSON.stringify({ body: { title: '改名', status: 'done' } }),
      created_at: '2026-07-24 10:00:00',
    },
    {
      id: 3,
      business_id: '8',
      target_table: 'tasks',
      status_before: 'status: pending',
      status_after: 'status: done',
      created_at: '2026-07-24 11:00:00',
    },
    {
      id: 4,
      business_id: '9',
      target_table: 'follow_up_tasks',
      status_before: 'status: done',
      status_after: 'status: done',
      created_at: '2026-07-24 12:00:00',
    },
    {
      id: 5,
      business_id: '11',
      target_table: 'tasks',
      status_before: 'status: in_progress',
      status_after: 'status: done',
      created_at: '2026-06-21 16:00:00',
    },
  ];
  assert.equal(parseAuditStatus('status: done；priority: high'), 'done');
  assert.equal(buildLatestCompletionTransitions(logRows).size, 3);

  const repairs = buildTaskCompletionRepairs({
    logRows,
    completedRowsByTable: {
      tasks: [
        { id: 7, done_at: '2026-07-24 10:00:00' },
        { id: 8, done_at: '2026-07-24 11:00:00' },
        { id: 10, done_at: '2026-07-24 12:00:00' },
        { id: 11, done_at: '2026-07-24 14:00:00' },
      ],
      follow_up_tasks: [{ id: 9, done_at: '2026-07-24 12:00:00' }],
    },
  });

  assert.deepEqual(repairs, [{
    table: 'tasks',
    id: 7,
    currentDoneAt: '2026-07-24 10:00:00',
    completedAt: '2026-06-19 18:30:00',
    evidenceLogId: 1,
    rewriteLogId: 2,
  }]);
});
