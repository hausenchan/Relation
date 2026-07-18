import {
  getDefaultDocumentCxoUsers,
  updateDefaultDocumentShareUsers,
  updateExplicitDocumentShareUsers,
} from './documentDefaultShares';

describe('document default shares', () => {
  const users = [
    { id: 1, display_name: 'CEO', role: 'ceo', account_status: 'active' },
    { id: 2, display_name: 'COO', role: 'member', executive_role: 'coo', account_status: 'active' },
    { id: 3, display_name: 'CTO', role: 'cto', account_status: 'active' },
    { id: 4, display_name: 'CMO', role: 'cmo', account_status: 'active' },
    { id: 5, display_name: 'Inactive CEO', role: 'ceo', account_status: 'disabled' },
    { id: 9, display_name: 'Duplicate CEO', role: 'ceo', account_status: 'active' },
  ];

  test('selects one active user for each CXO role in a stable order', () => {
    expect(getDefaultDocumentCxoUsers(users).map(user => user.id)).toEqual([1, 2, 3, 4]);
  });

  test('removing a default CXO keeps explicit users and organization shares intact', () => {
    const draft = {
      project_group_ids: [8],
      departments: ['OPS'],
      team_ids: [9],
      user_ids: [1, 2, 3, 4, 20],
    };
    expect(updateDefaultDocumentShareUsers(draft, [1, 2, 3, 4], [1, 3, 4])).toEqual({
      ...draft,
      user_ids: [20, 1, 3, 4],
    });
  });

  test('changing explicit users preserves the selected default CXOs', () => {
    const draft = { project_group_ids: [], departments: [], team_ids: [], user_ids: [1, 3, 20] };
    expect(updateExplicitDocumentShareUsers(draft, [1, 2, 3, 4], [21])).toEqual({
      ...draft,
      user_ids: [1, 3, 21],
    });
  });
});
