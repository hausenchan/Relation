import { formatBusinessDateTime, parseBusinessDateTime } from './businessTime';

describe('business time formatting', () => {
  test('keeps timezone-free MySQL values as business local wall clock', () => {
    expect(formatBusinessDateTime('2026-07-23 02:29:15')).toBe('2026-07-23 02:29');
    expect(formatBusinessDateTime('2026-07-23T02:29:15', 'HH:mm:ss')).toBe('02:29:15');
  });

  test('converts absolute timestamps to Asia/Shanghai', () => {
    expect(formatBusinessDateTime('2026-07-23T02:29:15Z')).toBe('2026-07-23 10:29');
    expect(formatBusinessDateTime('2026-07-23T10:29:15+08:00')).toBe('2026-07-23 10:29');
  });

  test('returns an invalid value or caller fallback for missing input', () => {
    expect(parseBusinessDateTime('').isValid()).toBe(false);
    expect(formatBusinessDateTime('', 'YYYY-MM-DD', '暂无')).toBe('暂无');
  });
});
