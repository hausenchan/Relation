export const DOCUMENT_DEFAULT_CXO_ROLES = ['ceo', 'coo', 'cto', 'cmo'];

export function getDocumentCxoRole(user) {
  const roles = [user?.role, user?.executive_role]
    .map(value => String(value || '').toLowerCase())
    .filter(Boolean);
  return DOCUMENT_DEFAULT_CXO_ROLES.find(role => roles.includes(role)) || '';
}

export function getDefaultDocumentCxoUsers(users = []) {
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
