# Wolai 文档中心导入器

脚本位置：

```bash
scripts/wolai-importer/import-wolai-docs.js
```

第一版用于把 Wolai 本地导出文件导入 Relation 文档中心。它不依赖 Wolai 登录态，适合先跑试迁移。

如果 Wolai 没有可用的本地导出文件，先用 Chrome 采集 demo 生成 JSON：

```bash
scripts/wolai-collector/README.md
```

## 支持输入

- `.md` / `.markdown`
- `.html` / `.htm`
- `.json`
- `.jsonl`
- 一个文件或一个目录。目录会递归扫描上述文件类型。

JSON 支持以下结构：

```json
[
  {
    "title": "预算诊断 SOP",
    "pageUrl": "https://www.wolai.com/...",
    "workspaceName": "商业化策略空间",
    "folderPath": "策略/SOP/预算",
    "updatedAt": "2026-06-28 18:00:00",
    "tags": ["预算", "诊断"],
    "markdown": "# 目标\n正文...",
    "attachments": []
  }
]
```

也支持：

```json
{ "documents": [ ... ] }
```

或：

```json
{ "pages": [ ... ] }
```

## 试跑

先 dry-run，不写数据库、不复制附件：

```bash
npm run wolai:import -- \
  --input ./tmp/wolai-export \
  --batch wolai_20260706_01 \
  --workspace 商业化策略空间 \
  --dry-run
```

只试前 20 篇：

```bash
npm run wolai:import -- \
  --input ./tmp/wolai-export \
  --batch wolai_20260706_test \
  --limit 20 \
  --dry-run
```

## 正式导入

```bash
npm run wolai:import -- \
  --input ./tmp/wolai-export \
  --batch wolai_20260706_01 \
  --workspace 商业化策略空间 \
  --root-folder Wolai迁移区 \
  --domain general \
  --department ALL \
  --doc-type TMP \
  --created-by admin
```

如果要直接落到文档中心已有目录，而不是保留 Wolai 原始目录，可以使用 `--target-folder-path`：

```bash
npm run wolai:import -- \
  --input ./tmp/wolai-export/003-支付宝产品 \
  --batch wolai_alipay_product_demo_20260707 \
  --workspace 产品运营周重点 \
  --target-folder-path "3_产运/03_项目资料" \
  --domain general \
  --department OPS \
  --doc-type SPEC \
  --created-by admin
```

如需在目标目录下继续保留 Wolai 原始子目录，可追加：

```bash
--preserve-source-folders
```

导入后会：

- 自动创建 `Wolai迁移区` 及其子目录
- 写入 `documents`
- 本地附件复制到 `server/uploads`
- 写入 `document_attachments`
- 写入 `document_import_jobs`
- 写入 `document_import_items`
- 给 `documents` 补充 Wolai 来源字段
- 输出 Markdown 和 JSON 报告到 `tmp/wolai-import-reports`

## 共享范围

默认不共享，只有创建人和管理员可见。可以指定共享范围：

```bash
npm run wolai:import -- \
  --input ./tmp/wolai-export \
  --batch wolai_20260706_ops \
  --share department:OPS \
  --share project_group:1
```

支持：

- `department:OPS`
- `project_group:1`
- `team:2`
- `user:3`

## 幂等规则

脚本使用以下规则识别同一篇 Wolai 文档：

```text
wolai:{workspace}:{pageId}
wolai:{workspace}:{hash(pageUrl)}
wolai:{workspace}:file:{hash(relativeFilePath)}
```

同一来源文档内容哈希不变时会跳过；内容变化时更新同一篇文档。需要强制更新可加：

```bash
--force
```

## 质量标记

报告中可能出现：

- `EMPTY_TEXT`：正文为空
- `NO_TITLE`：标题缺失
- `HAS_TABLE`：包含表格
- `REMOTE_ATTACHMENT_ONLY`：只有远程附件或图片链接，未归档到本地
- `ATTACHMENT_MISSING`：本地附件路径不存在
- `ATTACHMENT_NOT_FILE`：附件路径不是文件

## 常用参数

```bash
node scripts/wolai-importer/import-wolai-docs.js --help
```

## 支付宝产品 Demo

截图里的 `003-支付宝产品` 建议先按 7 篇跑 demo：

- 支付宝 2025 机会
- 支付宝变现分析
- 支付宝官方相关钉钉群
- 小程序插件输出广告
- 支付宝小程序
- 支付宝跑量利润&风险最优策略
- 支付宝决策 2025

如果这 7 篇已经导出成 Markdown / HTML 文件，放到同一个目录后执行：

```bash
npm run wolai:import -- \
  --input ./tmp/wolai-export/003-支付宝产品 \
  --batch wolai_alipay_product_demo_20260707 \
  --workspace 产品运营周重点 \
  --target-folder-path "3_产运/03_项目资料" \
  --domain general \
  --department OPS \
  --doc-type SPEC \
  --dry-run
```

确认报告没有明显缺正文、缺附件后，去掉 `--dry-run` 正式写入。

如果还没有导出文件，可参考：

```bash
scripts/wolai-importer/examples/alipay-product-demo.template.json
```
