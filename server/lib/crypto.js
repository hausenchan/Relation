const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 0x01;
const PREFIX = 'enc:v1:';

function loadKeyFromFile(p) {
  const raw = fs.readFileSync(p);
  const hex = raw.toString('utf8').trim();
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  if (raw.length === 32) return raw;
  throw new Error(`key file ${p} must be 32 raw bytes or 64 hex chars`);
}

function loadKeys() {
  const keyPath = process.env.RELATION_MASTER_KEY_PATH
    || path.join(__dirname, '..', '..', '.secrets', 'master.key');
  const hmacPath = process.env.RELATION_HMAC_KEY_PATH
    || path.join(__dirname, '..', '..', '.secrets', 'hmac.key');

  if (!fs.existsSync(keyPath)) {
    throw new Error(`master key not found at ${keyPath}. run: node scripts/gen-master-key.js`);
  }
  if (!fs.existsSync(hmacPath)) {
    throw new Error(`hmac key not found at ${hmacPath}. run: node scripts/gen-master-key.js`);
  }
  return {
    master: loadKeyFromFile(keyPath),
    hmac: loadKeyFromFile(hmacPath),
  };
}

const KEYS = loadKeys();

function encrypt(plain) {
  if (plain === null || plain === undefined) return plain;
  const s = typeof plain === 'string' ? plain : String(plain);
  if (s === '') return '';
  if (s.startsWith(PREFIX)) return s;

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEYS.master, iv);
  const ct = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([Buffer.from([VERSION]), iv, ct, tag]);
  return PREFIX + packed.toString('base64');
}

function decrypt(cipherText) {
  if (cipherText === null || cipherText === undefined) return cipherText;
  if (typeof cipherText !== 'string' || !cipherText.startsWith(PREFIX)) return cipherText;

  const packed = Buffer.from(cipherText.slice(PREFIX.length), 'base64');
  if (packed.length < 1 + IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  if (packed[0] !== VERSION) throw new Error(`unsupported version ${packed[0]}`);

  const iv = packed.subarray(1, 1 + IV_LEN);
  const tag = packed.subarray(packed.length - TAG_LEN);
  const ct = packed.subarray(1 + IV_LEN, packed.length - TAG_LEN);

  const decipher = crypto.createDecipheriv(ALGO, KEYS.master, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

function hmacIndex(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const norm = String(plain).trim().toLowerCase();
  return crypto.createHmac('sha256', KEYS.hmac).update(norm).digest('hex');
}

module.exports = { encrypt, decrypt, hmacIndex, isEncrypted, PREFIX };
