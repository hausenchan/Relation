import { inspectStoredKeyInfo, parseEncryptedPrivateKeyEnvelope } from './operationalMeetingCrypto';

describe('operational meeting crypto key inspection', () => {
  test('accepts structurally valid legacy encrypted private key envelopes without an arbitrary large payload threshold', () => {
    const envelope = {
      salt: 'c2FsdC1mb3ItdGVzdA==',
      iv: 'aXYtZm9yLXRlc3Q=',
      data: 'ZW5jcnlwdGVkLXByaXZhdGUta2V5LXBheWxvYWQtZm9yLXRlc3Rz',
    };

    expect(parseEncryptedPrivateKeyEnvelope(JSON.stringify(envelope))).toEqual(envelope);
    expect(inspectStoredKeyInfo({
      public_key_jwk: '{}',
      encrypted_private_key_jwk: JSON.stringify(envelope),
    }).privateEnvelopeValid).toBe(true);
  });

  test('rejects incomplete envelopes', () => {
    expect(() => parseEncryptedPrivateKeyEnvelope(JSON.stringify({ salt: 'short', iv: '', data: '' })))
      .toThrow('加密私钥数据不完整');
  });
});
