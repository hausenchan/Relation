#!/usr/bin/env node
// 生成 .secrets/master.key 和 .secrets/hmac.key
// 只在首次部署时运行一次。生成后严格备份，丢失等于数据永久无法解密。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const secretsDir = path.join(__dirname, '..', '.secrets');
if (!fs.existsSync(secretsDir)) {
  fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
}

const files = [
  { name: 'master.key', label: '数据加密主密钥（AES-256）' },
  { name: 'hmac.key',   label: 'HMAC 索引密钥' },
];

for (const f of files) {
  const fp = path.join(secretsDir, f.name);
  if (fs.existsSync(fp)) {
    console.log(`[skip] ${f.name} already exists — 如需重新生成请先备份并手动删除`);
    continue;
  }
  const hex = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(fp, hex, { mode: 0o600 });
  fs.chmodSync(fp, 0o600);
  console.log(`[ok] generated ${f.name}  (${f.label})`);
}

console.log('\n完成。立即：');
console.log('  1. 把 .secrets/ 加到 .gitignore（本项目已排除）');
console.log('  2. 离线备份 .secrets/*.key 到安全位置（如 1Password / 硬件加密 U 盘）');
console.log('  3. 生产部署时手动 scp 上传，不要走 git/镜像');
