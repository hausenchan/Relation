import {
  buildMediaListParams,
  canShowMediaDelete,
  getMediaRowActionKeys,
  isValidMediaCid,
  mediaRecordToFormValues,
  normalizeMediaFormPayload,
} from './mediaManagement';

describe('media management utilities', () => {
  test('validates one-to-twenty digit CIDs without dropping leading zeroes', () => {
    expect(isValidMediaCid('0')).toBe(true);
    expect(isValidMediaCid('00001234')).toBe(true);
    expect(isValidMediaCid('00000000000000000001')).toBe(true);
    expect(isValidMediaCid('123456789012345678901')).toBe(false);
    expect(isValidMediaCid('12A')).toBe(false);
  });

  test('shows the delete entry only when the server grants media delete permission', () => {
    expect(canShowMediaDelete({ can_delete: 1 })).toBe(true);
    expect(canShowMediaDelete({ can_delete: '1' })).toBe(true);
    expect(canShowMediaDelete({ can_delete: 0 })).toBe(false);
    expect(canShowMediaDelete({ can_delete: true })).toBe(true);
    expect(canShowMediaDelete({})).toBe(false);
  });

  test('builds contextual row actions from server permissions', () => {
    expect(getMediaRowActionKeys({ can_edit: 1, can_delete: 1 }))
      .toEqual(['detail', 'edit', 'delete']);
    expect(getMediaRowActionKeys({ can_edit: 0, can_delete: 0 }))
      .toEqual(['detail']);
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
