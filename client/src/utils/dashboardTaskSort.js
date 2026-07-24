import { parseBusinessDateTime } from './businessTime';

export const DASHBOARD_TASK_STATUS_SORT_RANK = {
  in_progress: 0,
  pending: 1,
  done: 2,
  suspended: 3,
};

const getTimestamp = (value) => {
  const parsed = parseBusinessDateTime(value);
  return parsed.isValid() ? parsed.valueOf() : 0;
};

const getEffectivePlanDay = (task) => {
  const planDate = parseBusinessDateTime(task?.plan_date);
  const effectiveDate = planDate.isValid()
    ? planDate
    : parseBusinessDateTime(task?.created_at);
  return effectiveDate.isValid() ? effectiveDate.startOf('day').valueOf() : 0;
};

const getTaskStatusRank = (task) => (
  DASHBOARD_TASK_STATUS_SORT_RANK[task?.display_status || task?.status]
  ?? Number.MAX_SAFE_INTEGER
);

const compareTaskIdsDescending = (a, b) => String(b?.id ?? '').localeCompare(
  String(a?.id ?? ''),
  'zh-CN',
  { numeric: true, sensitivity: 'base' },
);

export const compareDashboardTasksByDefault = (a, b) => {
  const dateDiff = getEffectivePlanDay(b) - getEffectivePlanDay(a);
  if (dateDiff !== 0) return dateDiff;

  const statusDiff = getTaskStatusRank(a) - getTaskStatusRank(b);
  if (statusDiff !== 0) return statusDiff;

  const createdAtDiff = getTimestamp(b?.created_at) - getTimestamp(a?.created_at);
  if (createdAtDiff !== 0) return createdAtDiff;

  return compareTaskIdsDescending(a, b);
};

export const sortDashboardTasksByDefault = (tasks) => (
  [...(Array.isArray(tasks) ? tasks : [])].sort(compareDashboardTasksByDefault)
);
