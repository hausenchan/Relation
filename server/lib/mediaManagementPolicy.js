const MEDIA_DELETE_EXECUTIVE_ROLES = new Set(['ceo', 'coo', 'cto', 'cmo']);

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function isTrafficBusinessTeam(team = {}) {
  const department = normalizeRole(team.department);
  const name = String(team.name || '').trim();
  return department === 'commercial' && name.includes('流量商务');
}

function canDeleteMedia(user, ledTeams = []) {
  if (!user) return false;
  if (
    MEDIA_DELETE_EXECUTIVE_ROLES.has(normalizeRole(user.role))
    || MEDIA_DELETE_EXECUTIVE_ROLES.has(normalizeRole(user.executive_role))
  ) {
    return true;
  }
  if (normalizeRole(user.role) !== 'leader') return false;
  return (Array.isArray(ledTeams) ? ledTeams : []).some(isTrafficBusinessTeam);
}

module.exports = {
  MEDIA_DELETE_EXECUTIVE_ROLES,
  canDeleteMedia,
  isTrafficBusinessTeam,
};
