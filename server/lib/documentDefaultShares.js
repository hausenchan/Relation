const DOCUMENT_DEFAULT_CXO_ROLES = ['ceo', 'coo', 'cto', 'cmo'];

function getDocumentCxoRole(user) {
  const roles = [user?.role, user?.executive_role]
    .map(value => String(value || '').toLowerCase())
    .filter(Boolean);
  return DOCUMENT_DEFAULT_CXO_ROLES.find(role => roles.includes(role)) || '';
}

function getDefaultDocumentCxoUsers(users = []) {
  const selectedByRole = new Map();
  (Array.isArray(users) ? users : []).forEach((user) => {
    if (String(user?.account_status || 'active') !== 'active') return;
    const role = getDocumentCxoRole(user);
    const userId = Number(user?.id);
    if (!role || !userId) return;
    const selected = selectedByRole.get(role);
    if (!selected || userId < Number(selected.id)) selectedByRole.set(role, user);
  });
  return DOCUMENT_DEFAULT_CXO_ROLES.map(role => selectedByRole.get(role)).filter(Boolean);
}

function buildDefaultDocumentShares(users = []) {
  return getDefaultDocumentCxoUsers(users).map(user => ({
    target_type: 'user',
    target_id: Number(user.id),
  }));
}

module.exports = {
  DOCUMENT_DEFAULT_CXO_ROLES,
  buildDefaultDocumentShares,
  getDefaultDocumentCxoUsers,
};
