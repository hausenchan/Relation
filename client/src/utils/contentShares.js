export const ORGANIZATION_DEPARTMENT_OPTIONS = [
  { value: 'commercial', label: '商务' },
  { value: 'operation', label: '产运' },
  { value: 'rd', label: '研发' },
  { value: 'general', label: '综合' },
  { value: 'ad_delivery', label: '投放' },
  { value: 'marketing', label: '市场' },
  { value: 'hr', label: '人事' },
  { value: 'finance', label: '财务' },
  { value: 'admin', label: '行政' },
];

export function createEmptyShareDraft() {
  return {
    project_group_ids: [],
    departments: [],
    team_ids: [],
    user_ids: [],
  };
}

function uniqueIds(values = []) {
  return [...new Set((values || []).map(Number).filter(Boolean))];
}

function uniqueKeys(values = []) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

export function sharesToDraft(shares = []) {
  const draft = createEmptyShareDraft();
  (Array.isArray(shares) ? shares : []).forEach((share) => {
    if (share?.target_type === 'project_group' && share.target_id) {
      draft.project_group_ids.push(Number(share.target_id));
    }
    if (share?.target_type === 'department' && share.target_key) {
      draft.departments.push(String(share.target_key));
    }
    if (share?.target_type === 'team' && share.target_id) {
      draft.team_ids.push(Number(share.target_id));
    }
    if (share?.target_type === 'user' && share.target_id) {
      draft.user_ids.push(Number(share.target_id));
    }
  });
  return {
    project_group_ids: uniqueIds(draft.project_group_ids),
    departments: uniqueKeys(draft.departments),
    team_ids: uniqueIds(draft.team_ids),
    user_ids: uniqueIds(draft.user_ids),
  };
}

export function draftToShares(draft = {}) {
  return [
    ...uniqueIds(draft.project_group_ids).map(id => ({ target_type: 'project_group', target_id: id })),
    ...uniqueKeys(draft.departments).map(key => ({ target_type: 'department', target_key: key })),
    ...uniqueIds(draft.team_ids).map(id => ({ target_type: 'team', target_id: id })),
    ...uniqueIds(draft.user_ids).map(id => ({ target_type: 'user', target_id: id })),
  ];
}

export function updateDefaultShareUsers(draft, defaultUserIds, selectedUserIds) {
  const defaultSet = new Set(uniqueIds(defaultUserIds));
  const explicitUserIds = uniqueIds(draft?.user_ids).filter(id => !defaultSet.has(id));
  return {
    ...createEmptyShareDraft(),
    ...(draft || {}),
    user_ids: uniqueIds([...explicitUserIds, ...selectedUserIds]),
  };
}

export function updateExplicitShareUsers(draft, defaultUserIds, selectedUserIds) {
  const defaultSet = new Set(uniqueIds(defaultUserIds));
  const selectedDefaultIds = uniqueIds(draft?.user_ids).filter(id => defaultSet.has(id));
  return {
    ...createEmptyShareDraft(),
    ...(draft || {}),
    user_ids: uniqueIds([...selectedDefaultIds, ...selectedUserIds]),
  };
}
