import {
  createDefaultShareDraft,
  createEmptyShareDraft,
  draftToShares,
  sharesToDraft,
  updateDefaultShareUsers,
  updateExplicitShareUsers,
} from './contentShares';

describe('content shares', () => {
  test('creates a default draft with the configured people in display order', () => {
    expect(createDefaultShareDraft([
      { id: 18, display_name: '陈锦标' },
      { id: 11, display_name: '陈豪赞' },
      { id: 3, display_name: '林璐韵' },
      { id: 16, display_name: '贺敏' },
    ])).toEqual({
      ...createEmptyShareDraft(),
      user_ids: [18, 11, 3, 16],
    });
  });

  test('round trips project group, department, team, and user targets', () => {
    const shares = [
      { target_type: 'project_group', target_id: 8 },
      { target_type: 'department', target_key: 'rd' },
      { target_type: 'team', target_id: 9 },
      { target_type: 'user', target_id: 10 },
      { target_type: 'user', target_id: 10 },
    ];
    expect(draftToShares(sharesToDraft(shares))).toEqual([
      { target_type: 'project_group', target_id: 8 },
      { target_type: 'department', target_key: 'rd' },
      { target_type: 'team', target_id: 9 },
      { target_type: 'user', target_id: 10 },
    ]);
  });

  test('keeps default and explicit people independent when either selection changes', () => {
    const draft = {
      ...createEmptyShareDraft(),
      project_group_ids: [8],
      user_ids: [1, 2, 20],
    };
    const withoutSecondDefault = updateDefaultShareUsers(draft, [1, 2, 3, 4], [1, 3, 4]);
    expect(withoutSecondDefault).toEqual({
      ...draft,
      user_ids: [20, 1, 3, 4],
    });
    expect(updateExplicitShareUsers(withoutSecondDefault, [1, 2, 3, 4], [21])).toEqual({
      ...draft,
      user_ids: [1, 3, 4, 21],
    });
  });
});
