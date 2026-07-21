export const DOCUMENT_DEFAULT_CXO_SLOTS = [
  { name: '陈锦标', role: 'ceo' },
  { name: '陈豪赞', role: 'coo' },
  { name: '林璐韵', role: 'cmo' },
  { name: '贺敏', role: 'cto' },
];
export const DOCUMENT_DEFAULT_CXO_ROLES = DOCUMENT_DEFAULT_CXO_SLOTS.map(item => item.role);

export function getDocumentCxoRole(user) {
  const roles = [user?.role, user?.executive_role]
    .map(value => String(value || '').toLowerCase())
    .filter(Boolean);
  return DOCUMENT_DEFAULT_CXO_ROLES.find(role => roles.includes(role)) || '';
}

export function getDefaultDocumentCxoUsers(users = []) {
  const activeUsers = (Array.isArray(users) ? users : [])
    .filter(user => String(user?.account_status || 'active') === 'active' && Number(user?.id));
  const selectedIds = new Set();

  return DOCUMENT_DEFAULT_CXO_SLOTS.map(({ name, role }) => {
    const namedUser = activeUsers.find(user => (
      !selectedIds.has(Number(user.id))
      && [user?.display_name, user?.username]
        .map(value => String(value || '').trim())
        .includes(name)
    ));
    const roleUser = namedUser || activeUsers
      .filter(user => !selectedIds.has(Number(user.id)) && getDocumentCxoRole(user) === role)
      .sort((left, right) => Number(left.id) - Number(right.id))[0];
    if (roleUser) selectedIds.add(Number(roleUser.id));
    return roleUser;
  }).filter(Boolean);
}

function uniqueUserIds(userIds = []) {
  return [...new Set((userIds || []).map(Number).filter(Boolean))];
}

export function updateDefaultDocumentShareUsers(draft, defaultUserIds, selectedUserIds) {
  const defaultSet = new Set(uniqueUserIds(defaultUserIds));
  const explicitUserIds = uniqueUserIds(draft?.user_ids).filter(id => !defaultSet.has(id));
  return {
    ...draft,
    user_ids: uniqueUserIds([...explicitUserIds, ...selectedUserIds]),
  };
}

export function updateExplicitDocumentShareUsers(draft, defaultUserIds, selectedUserIds) {
  const defaultSet = new Set(uniqueUserIds(defaultUserIds));
  const selectedDefaultIds = uniqueUserIds(draft?.user_ids).filter(id => defaultSet.has(id));
  return {
    ...draft,
    user_ids: uniqueUserIds([...selectedDefaultIds, ...selectedUserIds]),
  };
}
