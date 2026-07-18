const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDefaultDocumentShares,
  getDefaultDocumentCxoUsers,
} = require('./documentDefaultShares');

const users = [
  { id: 10, role: 'ceo', account_status: 'active' },
  { id: 11, role: 'member', executive_role: 'coo', account_status: 'active' },
  { id: 12, role: 'cto', account_status: 'active' },
  { id: 13, role: 'cmo', account_status: 'active' },
  { id: 14, role: 'ceo', account_status: 'disabled' },
  { id: 18, role: 'ceo', account_status: 'active' },
];

test('default document sharing selects one active user per CXO role', () => {
  assert.deepEqual(getDefaultDocumentCxoUsers(users).map(user => user.id), [10, 11, 12, 13]);
  assert.deepEqual(buildDefaultDocumentShares(users), [
    { target_type: 'user', target_id: 10 },
    { target_type: 'user', target_id: 11 },
    { target_type: 'user', target_id: 12 },
    { target_type: 'user', target_id: 13 },
  ]);
});
