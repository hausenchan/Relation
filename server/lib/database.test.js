const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('./database');

const { columnDefinitionToMysql, isLikelyLongTextColumn } = Database.mysqlCompat;

test('crypto key payload columns use MySQL LONGTEXT', () => {
  assert.equal(isLikelyLongTextColumn('public_key_jwk'), true);
  assert.equal(isLikelyLongTextColumn('encrypted_private_key_jwk'), true);
  assert.equal(isLikelyLongTextColumn('encrypted_dek'), true);

  assert.match(
    columnDefinitionToMysql('public_key_jwk TEXT NOT NULL', new Set(), 'crypto_user_keys'),
    /public_key_jwk LONGTEXT NOT NULL/i,
  );
  assert.match(
    columnDefinitionToMysql('encrypted_private_key_jwk TEXT NOT NULL', new Set(), 'crypto_user_keys'),
    /encrypted_private_key_jwk LONGTEXT NOT NULL/i,
  );
  assert.match(
    columnDefinitionToMysql('encrypted_dek TEXT NOT NULL', new Set(), 'crypto_record_keys'),
    /encrypted_dek LONGTEXT NOT NULL/i,
  );
});
