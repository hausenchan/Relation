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
  assert.deepEqual(getDefaultDocumentCxoUsers(users).map(user => user.id), [10, 11, 13, 12]);
  assert.deepEqual(buildDefaultDocumentShares(users), [
    { target_type: 'user', target_id: 10 },
    { target_type: 'user', target_id: 11 },
    { target_type: 'user', target_id: 13 },
    { target_type: 'user', target_id: 12 },
  ]);
});

test('default document sharing prefers the configured people and order over role inference', () => {
  const namedUsers = [
    { id: 21, display_name: '贺敏', role: 'member', account_status: 'active' },
    { id: 22, display_name: '陈豪赞', role: 'member', account_status: 'active' },
    { id: 23, display_name: '陈锦标', role: 'member', account_status: 'active' },
    { id: 24, display_name: '林璐韵', role: 'member', account_status: 'active' },
    { id: 25, display_name: '陈锦标', role: 'ceo', account_status: 'disabled' },
  ];
  assert.deepEqual(
    getDefaultDocumentCxoUsers(namedUsers).map(user => user.display_name),
    ['陈锦标', '陈豪赞', '林璐韵', '贺敏'],
  );
});
