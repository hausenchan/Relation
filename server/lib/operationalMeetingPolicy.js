const CXO_ROLES = new Set(['ceo', 'coo', 'cto', 'cmo']);

function isOperationalMeetingCxo(user) {
  if (!user) return false;
  return CXO_ROLES.has(String(user.role || '').toLowerCase())
    || CXO_ROLES.has(String(user.executive_role || '').toLowerCase());
}

function isActiveParticipant(participant) {
  return Boolean(participant && String(participant.status || 'active') === 'active');
}

function isMeetingCxo(user, participant) {
  return isOperationalMeetingCxo(user)
    || (isActiveParticipant(participant) && participant.participant_type === 'cxo');
}

function canViewMeeting(user, participant) {
  return isOperationalMeetingCxo(user) || isActiveParticipant(participant);
}

function canViewPreparation(user, participant, section) {
  if (!user || !section || !canViewMeeting(user, participant)) return false;
  return isMeetingCxo(user, participant)
    || Number(section.owner_user_id) === Number(user.id);
}

function canEditPreparation(user, participant, section, permissionLevel = '') {
  if (!canViewPreparation(user, participant, section)) return false;
  if (Number(section.owner_user_id) === Number(user.id)) return true;
  return isMeetingCxo(user, participant) && permissionLevel === 'edit_all';
}

function canGenerateAgenda(user, participant) {
  if (!isMeetingCxo(user, participant)) return false;
  if (!participant || isOperationalMeetingCxo(user)) return true;
  return Number(participant.can_generate_agenda ?? 1) === 1;
}

function canEditDecision(user, participant) {
  if (isMeetingCxo(user, participant)) return true;
  return isActiveParticipant(participant) && Number(participant.can_edit_decision || 0) === 1;
}

function normalizeRecordKeyRecipients(recordKeys = [], allowedUserIds = []) {
  const allowed = new Set((allowedUserIds || []).map(Number).filter(Boolean));
  const normalized = [];
  const rejectedUserIds = [];

  (Array.isArray(recordKeys) ? recordKeys : []).forEach(item => {
    const userId = Number(item?.user_id);
    const encryptedDek = String(item?.encrypted_dek || '').trim();
    if (!userId || !encryptedDek) return;
    if (!allowed.has(userId)) {
      rejectedUserIds.push(userId);
      return;
    }
    normalized.push({
      user_id: userId,
      encrypted_dek: encryptedDek,
      key_version: Number(item?.key_version || 1),
    });
  });

  return {
    recordKeys: normalized,
    rejectedUserIds: [...new Set(rejectedUserIds)].sort((a, b) => a - b),
  };
}

module.exports = {
  CXO_ROLES,
  canEditDecision,
  canEditPreparation,
  canGenerateAgenda,
  canViewMeeting,
  canViewPreparation,
  isActiveParticipant,
  isMeetingCxo,
  isOperationalMeetingCxo,
  normalizeRecordKeyRecipients,
};
