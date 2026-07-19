const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canEditDecision,
  canEditPreparation,
  canGenerateAgenda,
  canViewMeeting,
  canViewPreparation,
} = require('./operationalMeetingPolicy');

const cxo = { id: 1, role: 'member', executive_role: 'ceo' };
const designated = { id: 2, role: 'member', executive_role: null };
const other = { id: 3, role: 'member', executive_role: null };
const admin = { id: 4, role: 'admin', executive_role: null };
const designatedParticipant = {
  user_id: 2,
  participant_type: 'designated',
  preparation_section_id: 20,
  can_edit_decision: 1,
  status: 'active',
};

test('CXO can view every preparation while a designated participant only sees their own', () => {
  const ownSection = { id: 20, owner_user_id: 2 };
  const otherSection = { id: 21, owner_user_id: 3 };

  assert.equal(canViewPreparation(cxo, null, otherSection), true);
  assert.equal(canViewPreparation(designated, designatedParticipant, ownSection), true);
  assert.equal(canViewPreparation(designated, designatedParticipant, otherSection), false);
});

test('post-gate users can view meeting content without receiving preparation access', () => {
  assert.equal(canViewMeeting(admin, null), true);
  assert.equal(canViewPreparation(admin, null, { id: 22, owner_user_id: 4 }), false);
  assert.equal(canViewPreparation(designated, { ...designatedParticipant, status: 'removed' }, { id: 20, owner_user_id: 2 }), false);
});

test('designated participants can share meeting content but cannot generate the agenda', () => {
  assert.equal(canViewMeeting(designated, designatedParticipant), true);
  assert.equal(canEditDecision(designated, designatedParticipant), true);
  assert.equal(canGenerateAgenda(designated, designatedParticipant), false);
  assert.equal(canGenerateAgenda(cxo, null), true);
});

test('CXO can edit any preparation while non-CXO users remain owner-only', () => {
  const section = { id: 21, owner_user_id: 3 };
  assert.equal(canEditPreparation(cxo, null, section), true);
  assert.equal(canEditPreparation(other, null, section), false);
  assert.equal(canEditPreparation(designated, designatedParticipant, { id: 20, owner_user_id: 2 }), true);
  assert.equal(canEditPreparation(designated, designatedParticipant, section), false);
});
