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

function canEditPreparation(user, participant, section) {
  if (!canViewPreparation(user, participant, section)) return false;
  if (Number(section.owner_user_id) === Number(user.id)) return true;
  return isMeetingCxo(user, participant);
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
};
