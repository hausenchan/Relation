const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('./database');

const { columnDefinitionToMysql, isLikelyLongTextColumn, normalizeValue } = Database.mysqlCompat;

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

test('normalizes aware timestamps to the configured MySQL business timezone', () => {
  const previousTimezone = process.env.MYSQL_TIMEZONE;
  process.env.MYSQL_TIMEZONE = '+08:00';
  try {
    assert.equal(normalizeValue('2026-07-23T02:29:15Z'), '2026-07-23 10:29:15');
    assert.equal(normalizeValue(new Date('2026-07-23T02:29:15Z')), '2026-07-23 10:29:15');
    assert.equal(normalizeValue('2026-07-23 10:29:15'), '2026-07-23 10:29:15');
  } finally {
    if (previousTimezone === undefined) delete process.env.MYSQL_TIMEZONE;
    else process.env.MYSQL_TIMEZONE = previousTimezone;
  }
});
