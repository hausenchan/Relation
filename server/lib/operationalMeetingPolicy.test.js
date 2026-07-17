const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canEditDecision,
  canEditPreparation,
  canGenerateAgenda,
  canViewMeeting,
  canViewPreparation,
  normalizeRecordKeyRecipients,
} = require('./operationalMeetingPolicy');

const cxo = { id: 1, role: 'member', executive_role: 'ceo' };
const designated = { id: 2, role: 'member', executive_role: null };
const other = { id: 3, role: 'member', executive_role: null };
const admin = { id: 4, role: 'admin', executive_role: null };
const designatedParticipant = {
  user_id: 2,
  participant_type: 'designated',
  can_edit_decision: 1,
  status: 'active',
};

test('CXO can view every preparation while a designated participant only sees their own', () => {
  const ownSection = { owner_user_id: 2 };
  const otherSection = { owner_user_id: 3 };

  assert.equal(canViewPreparation(cxo, null, otherSection), true);
  assert.equal(canViewPreparation(designated, designatedParticipant, ownSection), true);
  assert.equal(canViewPreparation(designated, designatedParticipant, otherSection), false);
});

test('admin identity alone does not bypass weekly participation', () => {
  assert.equal(canViewMeeting(admin, null), false);
  assert.equal(canViewPreparation(admin, null, { owner_user_id: 4 }), false);
});

test('designated participants can share meeting content but cannot generate the agenda', () => {
  assert.equal(canViewMeeting(designated, designatedParticipant), true);
  assert.equal(canEditDecision(designated, designatedParticipant), true);
  assert.equal(canGenerateAgenda(designated, designatedParticipant), false);
  assert.equal(canGenerateAgenda(cxo, null), true);
});

test('viewing all preparation does not grant CXO edit access without edit_all', () => {
  const section = { owner_user_id: 3 };
  assert.equal(canEditPreparation(cxo, null, section, 'manage'), false);
  assert.equal(canEditPreparation(cxo, null, section, 'edit_all'), true);
  assert.equal(canEditPreparation(other, null, section, 'edit_all'), false);
});

test('record key recipients outside the allowed set are rejected', () => {
  const result = normalizeRecordKeyRecipients([
    { user_id: 1, encrypted_dek: 'cxo-key', key_version: 1 },
    { user_id: 2, encrypted_dek: 'owner-key', key_version: 2 },
    { user_id: 3, encrypted_dek: 'unexpected-key', key_version: 1 },
  ], [1, 2]);

  assert.deepEqual(result.recordKeys.map(item => item.user_id), [1, 2]);
  assert.deepEqual(result.rejectedUserIds, [3]);
});
