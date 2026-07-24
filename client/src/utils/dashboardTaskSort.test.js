import { sortDashboardTasksByDefault } from './dashboardTaskSort';

describe('dashboard task default sorting', () => {
  test('sorts by effective plan date descending before task status', () => {
    const tasks = [
      { id: 1, plan_date: '2026-07-23', status: 'in_progress', created_at: '2026-07-20 09:00:00' },
      { id: 2, plan_date: '2026-07-25', status: 'suspended', created_at: '2026-07-20 09:00:00' },
      { id: 3, plan_date: '2026-07-24', status: 'pending', created_at: '2026-07-20 09:00:00' },
    ];

    expect(sortDashboardTasksByDefault(tasks).map(task => task.id)).toEqual([2, 3, 1]);
  });

  test('uses the requested status order for tasks on the same effective date', () => {
    const tasks = [
      { id: 1, plan_date: '2026-07-25', status: 'suspended' },
      { id: 2, plan_date: '2026-07-25', status: 'done' },
      { id: 3, plan_date: '2026-07-25', status: 'pending' },
      { id: 4, plan_date: '2026-07-25', status: 'in_progress' },
    ];

    expect(sortDashboardTasksByDefault(tasks).map(task => task.status)).toEqual([
      'in_progress',
      'pending',
      'done',
      'suspended',
    ]);
  });

  test('uses creation date when plan date is missing', () => {
    const tasks = [
      { id: 1, plan_date: '2026-07-24', status: 'pending', created_at: '2026-07-20 09:00:00' },
      { id: 2, plan_date: null, status: 'done', created_at: '2026-07-25 08:00:00' },
      { id: 3, plan_date: '', status: 'in_progress', created_at: '2026-07-23 18:00:00' },
    ];

    expect(sortDashboardTasksByDefault(tasks).map(task => task.id)).toEqual([2, 1, 3]);
  });

  test('uses status and then creation time when effective dates match without mutating input', () => {
    const tasks = [
      { id: 1, plan_date: '2026-07-25', status: 'pending', created_at: '2026-07-25 08:00:00' },
      { id: 2, plan_date: null, status: 'in_progress', created_at: '2026-07-25 07:00:00' },
      { id: 3, plan_date: null, status: 'pending', created_at: '2026-07-25 10:00:00' },
    ];

    const sorted = sortDashboardTasksByDefault(tasks);

    expect(sorted.map(task => task.id)).toEqual([2, 3, 1]);
    expect(tasks.map(task => task.id)).toEqual([1, 2, 3]);
  });
});
