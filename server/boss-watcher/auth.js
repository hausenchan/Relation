const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_FILE = path.join(__dirname, 'session.json');
const ENCRYPT_KEY = 'boss-watcher-key-2026-relation!';

function getKey() {
  return crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(data) {
  const [ivHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function saveSession(cookieString) {
  const payload = JSON.stringify({
    cookie: cookieString,
    savedAt: new Date().toISOString()
  });
  fs.writeFileSync(SESSION_FILE, encrypt(payload), 'utf8');
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    return JSON.parse(decrypt(raw));
  } catch {
    return null;
  }
}

function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

async function isSessionValid(cookie) {
  try {
    const res = await fetch('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json', {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });
    const data = await res.json();
    return data.code === 0;
  } catch {
    return false;
  }
}

async function getStatus() {
  const session = loadSession();
  if (!session) return { status: 'no_session', message: '未配置 Boss 账号' };
  const valid = await isSessionValid(session.cookie);
  return {
    status: valid ? 'active' : 'expired',
    message: valid ? '登录有效' : 'Cookie 已失效，请重新配置',
    savedAt: session.savedAt
  };
}

function getCookie() {
  const session = loadSession();
  return session ? session.cookie : null;
}

module.exports = { saveSession, loadSession, clearSession, isSessionValid, getStatus, getCookie };
