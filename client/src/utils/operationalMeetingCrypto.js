export function parseRsaPublicJwk(value) {
  let parsed = value;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('安全公钥数据不完整，请解锁安全密钥后自动修复');
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || parsed.kty !== 'RSA'
    || typeof parsed.n !== 'string'
    || parsed.n.length < 300
    || typeof parsed.e !== 'string'
    || !parsed.e
  ) {
    throw new Error('安全公钥数据不完整，请解锁安全密钥后自动修复');
  }
  return parsed;
}

export function parseEncryptedPrivateKeyEnvelope(value) {
  let parsed = value;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('加密私钥数据不完整，无法使用原安全密码解锁');
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || typeof parsed.salt !== 'string'
    || parsed.salt.length < 16
    || typeof parsed.iv !== 'string'
    || parsed.iv.length < 12
    || typeof parsed.data !== 'string'
    || parsed.data.length < 32
  ) {
    throw new Error('加密私钥数据不完整，无法使用原安全密码解锁');
  }
  return parsed;
}

export function publicJwkFromPrivateJwk(privateJwk) {
  if (
    !privateJwk
    || privateJwk.kty !== 'RSA'
    || typeof privateJwk.n !== 'string'
    || privateJwk.n.length < 300
    || typeof privateJwk.e !== 'string'
    || !privateJwk.e
  ) {
    throw new Error('私钥内容不完整，无法恢复安全公钥');
  }
  return {
    kty: 'RSA',
    n: privateJwk.n,
    e: privateJwk.e,
    alg: privateJwk.alg || 'RSA-OAEP-256',
    ext: true,
    key_ops: ['encrypt'],
  };
}

export function inspectStoredKeyInfo(keyInfo) {
  if (!keyInfo) return { publicKeyValid: false, privateEnvelopeValid: false };
  let publicKeyValid = false;
  let privateEnvelopeValid = false;
  try {
    parseRsaPublicJwk(keyInfo.public_key_jwk);
    publicKeyValid = true;
  } catch {}
  try {
    parseEncryptedPrivateKeyEnvelope(keyInfo.encrypted_private_key_jwk);
    privateEnvelopeValid = true;
  } catch {}
  return { publicKeyValid, privateEnvelopeValid };
}
