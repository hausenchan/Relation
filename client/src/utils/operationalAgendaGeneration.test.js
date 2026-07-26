import { pollOperationalAgendaGeneration } from './operationalAgendaGeneration';

test('polls pending and running jobs until completion', async () => {
  let currentTime = 0;
  const wait = jest.fn(async delay => { currentTime += delay; });
  const getJob = jest.fn()
    .mockResolvedValueOnce({ status: 'running', poll_after_ms: 800 })
    .mockResolvedValueOnce({ status: 'completed', result: { saved: true } });

  const result = await pollOperationalAgendaGeneration({
    jobId: 'job-1',
    getJob,
    pollAfterMs: 500,
    timeoutMs: 5000,
    now: () => currentTime,
    wait,
  });

  expect(result).toEqual({ status: 'completed', result: { saved: true } });
  expect(getJob).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenNthCalledWith(1, 500, undefined);
  expect(wait).toHaveBeenNthCalledWith(2, 800, undefined);
});

test('returns a structured failed job for the page to display', async () => {
  const result = await pollOperationalAgendaGeneration({
    jobId: 'job-2',
    getJob: async () => ({
      status: 'failed',
      error: '模型暂不可用',
      code: 'AI_MODEL_UNAVAILABLE',
      http_status: 503,
    }),
    wait: async () => {},
  });

  expect(result.status).toBe('failed');
  expect(result.code).toBe('AI_MODEL_UNAVAILABLE');
});

test('stops polling at the client deadline', async () => {
  let currentTime = 0;
  await expect(pollOperationalAgendaGeneration({
    jobId: 'job-3',
    getJob: async () => ({ status: 'running', poll_after_ms: 500 }),
    timeoutMs: 1000,
    now: () => currentTime,
    wait: async delay => { currentTime += delay; },
  })).rejects.toMatchObject({ code: 'AGENDA_GENERATION_POLL_TIMEOUT' });
});

test('does not issue a request after cancellation', async () => {
  const getJob = jest.fn();
  await expect(pollOperationalAgendaGeneration({
    jobId: 'job-4',
    getJob,
    signal: { aborted: true },
  })).rejects.toMatchObject({ code: 'AGENDA_GENERATION_CANCELLED' });
  expect(getJob).not.toHaveBeenCalled();
});
