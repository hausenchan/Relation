import {
  buildMediaListParams,
  isValidMediaCid,
  mediaRecordToFormValues,
  normalizeMediaFormPayload,
} from './mediaManagement';

describe('media management utilities', () => {
  test('validates one-to-eight digit CIDs without dropping leading zeroes', () => {
    expect(isValidMediaCid('0')).toBe(true);
    expect(isValidMediaCid('00001234')).toBe(true);
    expect(isValidMediaCid('123456789')).toBe(false);
    expect(isValidMediaCid('12A')).toBe(false);
  });

  test('normalizes form dates, nullable selectors, and budget arrays', () => {
    const payload = normalizeMediaFormPayload({
      cid: ' 00081 ',
      media_name: ' 趣头条 ',
      latest_release_date: { format: () => '2026-07-21' },
      launch_date: null,
      budget_types: ['h5', 'alipay_mini'],
      owner_id: undefined,
      porn_api_status: '',
    });

    expect(payload).toMatchObject({
      cid: '00081',
      media_name: '趣头条',
      latest_release_date: '2026-07-21',
      launch_date: null,
      budget_types: ['h5', 'alipay_mini'],
      owner_id: null,
      porn_api_status: null,
    });
  });

  test('converts records back to form dates and serializes multi-select filters', () => {
    const values = mediaRecordToFormValues({ latest_release_date: '2026-07-21', budget_types: ['h5'] });
    expect(values.latest_release_date.format('YYYY-MM-DD')).toBe('2026-07-21');
    expect(buildMediaListParams({ search: '趣头条', budget_types: ['h5', 'self_app'], owner_id: '' }))
      .toEqual({ search: '趣头条', budget_types: 'h5,self_app' });
  });
});
