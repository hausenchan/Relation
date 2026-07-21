const DOCUMENT_DEFAULT_CXO_SLOTS = [
  { name: '陈锦标', role: 'ceo' },
  { name: '陈豪赞', role: 'coo' },
  { name: '林璐韵', role: 'cmo' },
  { name: '贺敏', role: 'cto' },
];
const DOCUMENT_DEFAULT_CXO_ROLES = DOCUMENT_DEFAULT_CXO_SLOTS.map(item => item.role);

function getDocumentCxoRole(user) {
  const roles = [user?.role, user?.executive_role]
    .map(value => String(value || '').toLowerCase())
    .filter(Boolean);
  return DOCUMENT_DEFAULT_CXO_ROLES.find(role => roles.includes(role)) || '';
}

function getDefaultDocumentCxoUsers(users = []) {
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

function buildDefaultDocumentShares(users = []) {
  return getDefaultDocumentCxoUsers(users).map(user => ({
    target_type: 'user',
    target_id: Number(user.id),
  }));
}

module.exports = {
  DOCUMENT_DEFAULT_CXO_SLOTS,
  DOCUMENT_DEFAULT_CXO_ROLES,
  buildDefaultDocumentShares,
  getDefaultDocumentCxoUsers,
};
