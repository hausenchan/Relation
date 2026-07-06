# Chrome 自动采集 Wolai 脚本设计方案

> 版本：v1.0  
> 日期：2026-07-03  
> 适用范围：Wolai 无稳定批量导出能力时的受控采集方案

---

## 1. 方案目标

当 Wolai 无法稳定提供批量导出、开放 API 或空间级结构化导出时，使用 Chrome 登录态进行受控采集，将 Wolai 页面内容转为统一蒸馏库可消费的原始数据和标准化数据。

核心目标：

1. 批量采集页面标题、正文、层级、表格、图片、附件
2. 保留原始 URL、目录路径、更新时间等来源信息
3. 支持试迁移、批量迁移、增量同步
4. 先入原始层，再标准化
5. 为后续知识蒸馏和 Skill 调优提供稳定输入

---

## 2. 适用边界

### 2.1 适合

- Wolai 页面能在 Chrome 正常打开
- 允许使用人工登录态
- 文档量较大，不适合人工单篇导出
- 需要保留较完整的页面结构

### 2.2 不适合

- 账号权限无法覆盖目标文档
- 页面需要高频验证码
- 明确禁止使用受控页面采集

---

## 3. 总体链路

```text
Chrome 登录 Wolai
-> 进入空间 / 目录
-> 读取目录树或待迁移清单
-> 逐篇打开页面
-> 抓取页面结构化内容
-> 下载附件 / 记录图片
-> 落 ai_raw_records
-> 标准化到 ai_source_items / ai_source_chunks
-> 进入后续蒸馏流程
```

---

## 4. 推荐实现方式

建议使用 `Node.js + Chrome + 受控浏览器自动化` 实现。

原因：

- 当前仓库就是 Node.js 体系
- 后续容易接 MySQL
- 便于和现有脚本目录统一管理

建议脚本位置：

- `scripts/wolai-collector/`

建议包含模块：

1. `config.js`
2. `login-session.js`
3. `workspace-scanner.js`
4. `page-collector.js`
5. `attachment-downloader.js`
6. `normalizer.js`
7. `mysql-writer.js`
8. `job-runner.js`

---

## 5. 模块设计

### 5.1 `config.js`

职责：

- 读取运行配置
- 指定 Wolai 空间范围
- 指定迁移批次
- 指定输出目录和数据库连接

建议配置项：

```js
{
  sourceCode: "wolai_main",
  workspaceName: "商业化策略空间",
  startUrls: ["https://www.wolai.com/..."],
  captureMode: "tree_scan",
  batchNo: "wolai_20260703_01",
  outputDir: "./tmp/wolai-export",
  useMysql: true,
  mysql: {
    host: "...",
    port: 3306,
    user: "...",
    password: "...",
    database: "relation_ai_distill"
  },
  downloadAttachments: true,
  maxPagesPerRun: 300,
  incrementalByUpdatedAt: true
}
```

### 5.2 `login-session.js`

职责：

- 复用人工登录态
- 检查 Wolai 是否已登录
- 校验当前账号是否有空间访问权限

建议原则：

- 不在代码里硬编码账号密码
- 只复用人工已登录的 Chrome 会话
- 登录失效时提示人工重新登录

### 5.3 `workspace-scanner.js`

职责：

- 读取空间目录树
- 识别文件夹与页面
- 生成待采集队列

输入：

- 起始空间 URL
- 文件夹白名单 / 黑名单

输出：

```json
[
  {
    "pageTitle": "预算诊断 SOP",
    "pageUrl": "https://...",
    "folderPath": "策略/SOP/预算",
    "workspaceName": "商业化策略空间"
  }
]
```

### 5.4 `page-collector.js`

职责：

- 打开单篇 Wolai 页面
- 抓取标题、正文、层级、表格、图片、附件
- 形成原始快照

建议采集结果结构：

```json
{
  "pageTitle": "预算诊断 SOP",
  "pageUrl": "https://...",
  "workspaceName": "商业化策略空间",
  "folderPath": "策略/SOP/预算",
  "authorName": "张三",
  "createdAt": "2026-04-03 10:00:00",
  "updatedAt": "2026-06-28 18:00:00",
  "tags": ["预算", "诊断"],
  "plainText": "...",
  "html": "<div>...</div>",
  "blocks": [
    {
      "type": "heading",
      "level": 1,
      "text": "目标"
    },
    {
      "type": "paragraph",
      "text": "..."
    },
    {
      "type": "table",
      "headers": ["指标", "定义"],
      "rows": [["CTR", "点击率"]]
    }
  ],
  "attachments": [],
  "images": []
}
```

### 5.5 `attachment-downloader.js`

职责：

- 下载附件
- 下载或归档图片
- 记录本地或对象存储引用

注意：

- 不要只保留 Wolai 外链
- 外链可能失效

建议输出：

```json
{
  "attachments": [
    {
      "name": "预算口径.xlsx",
      "sourceUrl": "https://...",
      "localPath": "/tmp/wolai/...",
      "status": "success"
    }
  ]
}
```

### 5.6 `normalizer.js`

职责：

- 将页面原始结果转成统一蒸馏库标准结构
- 产出：
  - `rawRecord`
  - `sourceItem`
  - `sourceChunks`

处理内容包括：

- 文档类型识别
- 摘要生成
- 标题路径整理
- 表格转 chunk
- 内容哈希生成

### 5.7 `mysql-writer.js`

职责：

- 写入 MySQL
- 支持幂等更新
- 支持失败重试

建议写入表：

- `ai_data_sources`
- `ai_source_sync_jobs`
- `ai_raw_records`
- `ai_source_items`
- `ai_source_chunks`

### 5.8 `job-runner.js`

职责：

- 组织整个批次执行
- 控制并发
- 记录成功失败数
- 输出迁移报告

---

## 6. 存储落点设计

### 6.1 原始层

每篇文档都先写一条 `ai_raw_records`。

建议：

- `raw_text`：保存正文纯文本
- `raw_payload_json`：保存 HTML、blocks、附件、图片、元数据

### 6.2 标准化层

每篇文档至少生成：

- 1 条 `ai_source_items`
- N 条 `ai_source_chunks`

### 6.3 附件与图片

建议单独存储在：

- 本地归档目录
- 或对象存储

然后在：

- `raw_payload_json`
- `meta_json`
- `extra_json`

中保留引用。

---

## 7. 增量同步策略

### 7.1 增量依据

优先使用：

- 页面 `updated_at`
- 页面内容哈希

### 7.2 判定逻辑

若满足以下任一条件，则视为需要重采：

1. 页面不存在历史记录
2. `updated_at` 晚于上次采集时间
3. 内容哈希变化
4. 上次采集失败

### 7.3 版本处理

建议：

- 原始层保留多版本
- 标准化层保留当前有效版本
- 后续蒸馏流程按当前版本消费

---

## 8. 失败重试策略

### 8.1 页面采集失败

处理方式：

- 当轮重试 1 到 2 次
- 仍失败则写失败清单

### 8.2 附件下载失败

处理方式：

- 正文先入库
- 附件单独标记失败
- 后续补采

### 8.3 登录态失效

处理方式：

- 停止后续采集
- 标记任务为 `partial`
- 提示人工重新登录后续跑

---

## 9. 运行日志与观测

建议每次运行记录：

- 批次编号
- 起始空间
- 页面总数
- 成功数
- 失败数
- 附件成功 / 失败数
- 总耗时
- 失败页面明细

这些信息建议写入：

- `ai_source_sync_jobs`
- 本地批次报告文件

---

## 10. 安全与治理要求

### 10.1 登录态使用原则

- 不存明文账号密码
- 不共享个人长期登录态
- 使用受控迁移账号

### 10.2 数据范围控制

- 只采被授权空间
- 支持目录白名单
- 支持页面白名单

### 10.3 敏感信息控制

- 可在采集后做脱敏
- 敏感文档允许只保留原始层，不进入蒸馏层

---

## 11. 推荐命令形态

后续落脚本时，建议提供类似命令：

```bash
node scripts/wolai-collector/job-runner.js --config ./scripts/wolai-collector/configs/test.json
```

可选参数建议：

- `--config`
- `--batch-no`
- `--workspace`
- `--folder`
- `--max-pages`
- `--incremental`
- `--download-attachments`
- `--dry-run`

---

## 12. dry-run 建议

正式批量采集前，建议支持 `dry-run`：

- 只扫描目录
- 只输出待采页面列表
- 不写数据库
- 不下载附件

这样能先确认范围，避免误采。

---

## 13. 推荐实施顺序

### 第 1 步

先手工采 5 到 10 篇，确认页面结构好抓。

### 第 2 步

实现目录扫描和单页采集。

### 第 3 步

接入 MySQL 原始层和标准化层。

### 第 4 步

实现附件下载和失败重试。

### 第 5 步

跑 100 到 300 篇试迁移。

### 第 6 步

验证蒸馏质量后再扩大到全量。

---

## 14. 与统一蒸馏库的对应关系

该采集方案直接服务以下表：

- `ai_data_sources`
- `ai_source_sync_jobs`
- `ai_raw_records`
- `ai_source_items`
- `ai_source_chunks`

并为后续以下流程提供输入：

- `ai_knowledge_assets`
- `ai_knowledge_links`
- `ai_skill_asset_bindings`

---

## 15. 建议后续补充

如果你后面决定真正实施，下一步建议再补两份：

1. 脚本目录结构与伪代码
2. MySQL 插入 / 更新 SQL 模板

---

## 16. 关联文档

- [Wolai文档迁移SOP.md](/Users/chenhaozan/Documents/AI/Relation/Wolai文档迁移SOP.md)
- [Wolai到统一蒸馏库字段映射表.md](/Users/chenhaozan/Documents/AI/Relation/Wolai到统一蒸馏库字段映射表.md)
- [统一蒸馏库设计方案.md](/Users/chenhaozan/Documents/AI/Relation/统一蒸馏库设计方案.md)
- [sql/ai_distill_mysql.sql](/Users/chenhaozan/Documents/AI/Relation/sql/ai_distill_mysql.sql)
