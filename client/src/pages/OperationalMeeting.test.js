import {
  inspectStoredKeyInfo,
  parseRsaPublicJwk,
  publicJwkFromPrivateJwk,
} from '../utils/operationalMeetingCrypto';

const modulus = 'a'.repeat(342);
const publicJwk = {
  kty: 'RSA',
  n: modulus,
  e: 'AQAB',
  alg: 'RSA-OAEP-256',
  ext: true,
  key_ops: ['encrypt'],
};

describe('operational meeting key recovery', () => {
  test('reports a recoverable error for a public JWK truncated at 255 characters', () => {
    const truncated = JSON.stringify(publicJwk).slice(0, 255);
    expect(() => parseRsaPublicJwk(truncated)).toThrow('安全公钥数据不完整');
  });

  test('rebuilds a matching public JWK from the private JWK fields', () => {
    const recovered = publicJwkFromPrivateJwk({ ...publicJwk, d: 'private-value' });
    expect(recovered).toEqual(publicJwk);
  });

  test('distinguishes a broken public key from a recoverable private envelope', () => {
    const health = inspectStoredKeyInfo({
      public_key_jwk: JSON.stringify(publicJwk).slice(0, 255),
      encrypted_private_key_jwk: JSON.stringify({
        salt: 'salt',
        iv: 'iv',
        data: 'x'.repeat(600),
      }),
    });
    expect(health).toEqual({ publicKeyValid: false, privateEnvelopeValid: true });
  });
});
