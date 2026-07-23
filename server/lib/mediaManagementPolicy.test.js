const test = require('node:test');
const assert = require('node:assert/strict');

const { canDeleteMedia, isTrafficBusinessTeam } = require('./mediaManagementPolicy');

test('allows CXO identities to delete media regardless of their base role', () => {
  assert.equal(canDeleteMedia({ role: 'ceo' }), true);
  assert.equal(canDeleteMedia({ role: 'admin', executive_role: 'coo' }), true);
  assert.equal(canDeleteMedia({ role: 'member', executive_role: 'cto' }), true);
  assert.equal(canDeleteMedia({ role: 'leader', executive_role: 'cmo' }), true);
});

test('allows only the actual traffic-business team leader among leader accounts', () => {
  const trafficBusinessTeam = { name: '流量商务小组', department: 'commercial' };
  assert.equal(isTrafficBusinessTeam(trafficBusinessTeam), true);
  assert.equal(canDeleteMedia({ role: 'leader' }, [trafficBusinessTeam]), true);

  assert.equal(canDeleteMedia(
    { role: 'leader' },
    [{ name: '预算商务小组', department: 'commercial' }],
  ), false);
  assert.equal(canDeleteMedia(
    { role: 'leader' },
    [{ name: '流量商务小组', department: 'operation' }],
  ), false);
  assert.equal(canDeleteMedia(
    { role: 'member' },
    [trafficBusinessTeam],
  ), false);
});

test('denies system admins and ordinary users without a CXO identity', () => {
  assert.equal(canDeleteMedia({ role: 'admin' }), false);
  assert.equal(canDeleteMedia({ role: 'sales_director' }), false);
  assert.equal(canDeleteMedia({ role: 'member' }), false);
  assert.equal(canDeleteMedia({ role: 'readonly', executive_role: 'ceo' }), false);
  assert.equal(canDeleteMedia({ role: 'guest', executive_role: 'coo' }), false);
  assert.equal(canDeleteMedia(null), false);
});
