const DEFAULT_MYSQL_TIMEZONE = '+08:00';

function normalizeMysqlTimezone(value = DEFAULT_MYSQL_TIMEZONE) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_MYSQL_TIMEZONE;
  if (/^(?:z|utc)$/i.test(text)) return '+00:00';
  const match = text.match(/^([+-])(\d{1,2}):?(\d{2})$/);
  if (!match) return DEFAULT_MYSQL_TIMEZONE;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    return DEFAULT_MYSQL_TIMEZONE;
  }
  return `${match[1]}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getMysqlTimezoneOffsetMinutes(value = DEFAULT_MYSQL_TIMEZONE) {
  const normalized = normalizeMysqlTimezone(value);
  const match = normalized.match(/^([+-])(\d{2}):(\d{2})$/);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function formatDateForMysql(date, timezone = DEFAULT_MYSQL_TIMEZONE) {
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const shifted = new Date(timestamp + getMysqlTimezoneOffsetMinutes(timezone) * 60 * 1000);
  return shifted.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeMysqlDateTimeValue(value, timezone = DEFAULT_MYSQL_TIMEZONE) {
  if (value instanceof Date) return formatDateForMysql(value, timezone);
  if (typeof value !== 'string') return value;
  const text = value.trim();
  const awareIso = text.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i,
  );
  if (awareIso) return formatDateForMysql(text, timezone) || value;
  const naiveIso = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if (naiveIso) return `${naiveIso[1]} ${naiveIso[2]}`;
  return value;
}

function parseMysqlDateTime(value, timezone = DEFAULT_MYSQL_TIMEZONE) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value || '').trim();
  if (!text) return NaN;
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)) return Date.parse(text);
  const naive = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if (!naive) return Date.parse(text);
  return Date.parse(`${naive[1]}T${naive[2]}${normalizeMysqlTimezone(timezone)}`);
}

module.exports = {
  DEFAULT_MYSQL_TIMEZONE,
  formatDateForMysql,
  getMysqlTimezoneOffsetMinutes,
  normalizeMysqlDateTimeValue,
  normalizeMysqlTimezone,
  parseMysqlDateTime,
};
