const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encrypt, decrypt, PREFIX } = require('../lib/crypto');

const SESSION_FILE = path.join(__dirname, 'session.json');

// 旧版本使用的硬编码密钥（仅用于读取历史 session 并迁移到 master.key）
const LEGACY_KEY = crypto.scryptSync('boss-watcher-key-2026-relation!', 'salt', 32);

function legacyDecrypt(data) {
  const [ivHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', LEGACY_KEY, iv);
  let out = decipher.update(encrypted, 'hex', 'utf8');
  out += decipher.final('utf8');
  return out;
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
    const raw = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    let plain;
    if (raw.startsWith(PREFIX)) {
      plain = decrypt(raw);
    } else if (/^[0-9a-f]+:[0-9a-f]+$/i.test(raw)) {
      // 旧 AES-CBC 格式，解密后用 master.key 重写一份
      plain = legacyDecrypt(raw);
      try { fs.writeFileSync(SESSION_FILE, encrypt(plain), 'utf8'); } catch {}
    } else {
      return null;
    }
    return JSON.parse(plain);
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
