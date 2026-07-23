const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatDateForMysql,
  getMysqlTimezoneOffsetMinutes,
  normalizeMysqlDateTimeValue,
  normalizeMysqlTimezone,
  parseMysqlDateTime,
} = require('./businessTime');

test('normalizes supported MySQL timezone offsets', () => {
  assert.equal(normalizeMysqlTimezone('+8:00'), '+08:00');
  assert.equal(normalizeMysqlTimezone('-0530'), '-05:30');
  assert.equal(normalizeMysqlTimezone('UTC'), '+00:00');
  assert.equal(normalizeMysqlTimezone('invalid'), '+08:00');
  assert.equal(getMysqlTimezoneOffsetMinutes('+08:00'), 480);
  assert.equal(getMysqlTimezoneOffsetMinutes('-05:30'), -330);
});

test('converts absolute ISO timestamps to the configured MySQL wall clock', () => {
  assert.equal(
    normalizeMysqlDateTimeValue('2026-07-23T02:29:15.123Z', '+08:00'),
    '2026-07-23 10:29:15',
  );
  assert.equal(
    normalizeMysqlDateTimeValue('2026-07-23T10:29:15+08:00', '+08:00'),
    '2026-07-23 10:29:15',
  );
  assert.equal(
    formatDateForMysql(new Date('2026-07-23T02:29:15Z'), '+08:00'),
    '2026-07-23 10:29:15',
  );
});

test('preserves naive business timestamps and non-time values', () => {
  assert.equal(
    normalizeMysqlDateTimeValue('2026-07-23T10:29:15', '+08:00'),
    '2026-07-23 10:29:15',
  );
  assert.equal(normalizeMysqlDateTimeValue('2026-07-23 10:29:15', '+08:00'), '2026-07-23 10:29:15');
  assert.equal(normalizeMysqlDateTimeValue('2026-07-23', '+08:00'), '2026-07-23');
});

test('parses naive MySQL values in the configured timezone', () => {
  assert.equal(
    parseMysqlDateTime('2026-07-23 10:29:15', '+08:00'),
    Date.parse('2026-07-23T02:29:15Z'),
  );
  assert.equal(
    parseMysqlDateTime('2026-07-23T02:29:15Z', '+08:00'),
    Date.parse('2026-07-23T02:29:15Z'),
  );
});
