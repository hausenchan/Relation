import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const BUSINESS_TIMEZONE = 'Asia/Shanghai';

function hasExplicitTimezone(value) {
  return typeof value === 'string' && /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
}

export function parseBusinessDateTime(value) {
  if (value === undefined || value === null || value === '') return dayjs(Number.NaN);
  const parsed = dayjs(value);
  if (!parsed.isValid()) return parsed;
  if (value instanceof Date || typeof value === 'number' || hasExplicitTimezone(value)) {
    return parsed.tz(BUSINESS_TIMEZONE);
  }
  return parsed;
}

export function formatBusinessDateTime(value, pattern = 'YYYY-MM-DD HH:mm', fallback = '-') {
  const parsed = parseBusinessDateTime(value);
  return parsed.isValid() ? parsed.format(pattern) : fallback;
}
