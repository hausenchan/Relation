# 字段级加密 —— 接入说明

保护的是 `server/data.db` 被单独拿走后的数据，不替代账号/权限/HTTPS。

## 文件清单

```
server/lib/crypto.js            # AES-256-GCM 封装 + HMAC + 密钥加载
server/lib/encryptedFields.js   # 按表配置要加密的字段
server/lib/cryptoDao.js         # encryptRow / decryptRow / decryptRows
scripts/gen-master-key.js       # 首次部署生成密钥
scripts/migrate-encrypt.js      # 历史数据回填脚本（可重入）
.secrets/master.key             # 生成后产物，chmod 600，不入 git
.secrets/hmac.key               # 同上
```

## 首次启用流程

```bash
# 1. 生成密钥（仅一次，生成后离线备份到 1Password / 硬件盘）
node scripts/gen-master-key.js

# 2. 停掉服务，备份现有 db
cp server/data.db server/data.db.bak.$(date +%Y%m%d)

# 3. 先 dry-run 看清会改哪些表、多少行
node scripts/migrate-encrypt.js --db server/data.db --all --dry-run

# 4. 建议按优先级分批真跑（可重入，已加密的会自动跳过）
node scripts/migrate-encrypt.js --db server/data.db --table executive_reports
node scripts/migrate-encrypt.js --db server/data.db --table weekly_reports
node scripts/migrate-encrypt.js --db server/data.db --table persons
node scripts/migrate-encrypt.js --db server/data.db --table interactions
node scripts/migrate-encrypt.js --db server/data.db --table companies
node scripts/migrate-encrypt.js --db server/data.db --table company_dynamics
node scripts/migrate-encrypt.js --db server/data.db --table leads
node scripts/migrate-encrypt.js --db server/data.db --table tasks
node scripts/migrate-encrypt.js --db server/data.db --table follow_up_tasks
node scripts/migrate-encrypt.js --db server/data.db --table goals
node scripts/migrate-encrypt.js --db server/data.db --table business_trips
node scripts/migrate-encrypt.js --db server/data.db --table gifts
node scripts/migrate-encrypt.js --db server/data.db --table gift_plans
node scripts/migrate-encrypt.js --db server/data.db --table reminders
```

## 代码接入

`server/index.js` 里所有返回给前端的 `SELECT` 结果，以及所有 `INSERT/UPDATE` 的业务数据，都走 cryptoDao 包一层：

```js
const { encryptRow, decryptRow, decryptRows } = require('./lib/cryptoDao');

// 读：单条
const row = db.prepare('SELECT * FROM persons WHERE id = ?').get(id);
res.json(decryptRow('persons', row));

// 读：列表
const rows = db.prepare('SELECT * FROM persons ORDER BY updated_at DESC').all();
res.json(decryptRows('persons', rows));

// 写：INSERT
const enc = encryptRow('persons', req.body);
db.prepare(`INSERT INTO persons (name, phone, ...) VALUES (?, ?, ...)`)
  .run(enc.name, enc.phone, ...);

// 写：UPDATE
const enc = encryptRow('persons', req.body);
db.prepare(`UPDATE persons SET name = ?, phone = ?, ... WHERE id = ?`)
  .run(enc.name, enc.phone, ..., id);
```

如果某个字段在 `encryptedFields.js` 的 `indexed` 里配置，并且表里存在 `${字段名}_idx` 列，`encryptRow()` 会自动写入 HMAC 索引值；`migrate-encrypt.js` 也会在历史迁移时回填这些索引列。当前默认未启用索引列，避免影响现有查询。

## 迁移脚本行为

- 自动识别表主键，不强依赖主键名必须叫 `id`
- 自动跳过不存在的表、被标记 `skip: true` 的表、以及当前库里不存在的字段
- 已经以 `enc:v1:` 开头的字段会跳过，脚本可重复执行
- 存在 `${字段名}_idx` 列时会一起回填 HMAC 索引
- 所有字段名和表名都会做 SQLite identifier 转义，避免字段名冲突

## 部署要点

- `.secrets/` 不入 git、不入镜像、不进 CI 日志
- 生产机 `chmod 600 .secrets/*.key`，属主 = node 进程用户
- 密钥**必须**离线备份。丢了 = 所有历史数据永久解不开
- 旧备份文件 `server/data.db.bak.*` 迁移完成后**立即删除或重新加密**，否则等于没加密

## 坑位提醒

1. 加密字段不能再 `WHERE field LIKE '%xxx%'` 或 `ORDER BY field`，确认你没写过这种 SQL
2. 人脉列表全量解密：你确认过数据量 < 5000 条，单次返回 OK；超过 1 万条再考虑分页
3. 搜索功能改成：后端 SELECT 出所有 → 解密 → 应用层 filter 返回
4. 日志打印时别 `console.log(req.body)` 明文拼进去
5. 密钥轮换：未来真要换密钥时，新密钥先加到代码作为 `KEYS_V2`，加解密带版本号判断。先不做，留着接口

## 回滚

某条记录解密失败（如密钥改过/密文损坏），`decryptRow` 会把该字段置 null 并打 error 日志，不会让整个接口崩。
