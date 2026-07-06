# selectedDB 接入统一蒸馏库技术方案

> 版本：v1.0  
> 日期：2026-07-06  
> 适用范围：`mid-max.midongtech.com` / `selectedDB` / `DaAgent/Distillation` / 本地与服务器 MySQL

---

## 1. 文档目的

本方案用于细化 `selectedDB` 如何接入当前已经跑通的 `Distillation` 链路，并最终沉淀到 `统一蒸馏库（MySQL）` 中。

目标不是让蒸馏脚本直接长期连生产库跑，而是建设一条稳定的“只读抽取 -> 原始快照 -> 标准化 -> 蒸馏 -> Skill / Eval”链路。

---

## 2. 当前结论

推荐采用下面这条正式方案：

```text
selectedDB(只读) -> 抽取层 -> 原始快照层 -> 标准化层 -> Distillation -> 统一蒸馏库(MySQL) -> Skill / Eval / HMI
```

不推荐的方案：

1. Skill 运行时直接实时查询 `selectedDB`
2. 每次蒸馏都直接在线扫描生产库大表
3. 只靠浏览器手工导表作为长期正式方案

当前最优实践是：

1. `selectedDB` 只负责提供业务事实原始数据
2. `统一蒸馏库` 负责提供 AI 可用的稳定数据层
3. `Distillation` 负责将原始数据加工成标准化事实、字典、Skill Seed 和 Eval Seed

---

## 3. 与当前已跑通链路的关系

当前已经跑通的是：

```text
手工导出的 26 张 XLS 报表 -> Distillation -> 本地 MySQL relation_ai_distill
```

后续接入 `selectedDB` 后，目标变成：

```text
selectedDB 只读抽取 -> 标准快照文件/原始入库 -> Distillation -> 统一蒸馏库
```

也就是说：

- 现在的 `26 张报表` 是第一版可用输入源
- `selectedDB` 接入后，不会推翻当前链路
- 它只是把“手工导表”升级为“自动抽取”

---

## 4. 接入目标

一期只聚焦蒸馏和 Skill 调优真正需要的数据，不做整库搬迁。

### 4.1 一期必须接入

1. 经营事实数据
   - 收入
   - 请求
   - 填充
   - 展示
   - 点击
   - CTR
   - eCPM
   - 完成订单数
2. 维度主数据
   - 主体
   - 产品
   - 媒体
   - 渠道
   - 业务线
3. 策略/实验补充数据
   - 策略版本
   - 实验标识
   - 关键配置变更
4. 数据口径元数据
   - 指标名称
   - 单位
   - 统计粒度
   - 时间范围

### 4.2 一期可暂缓

1. 全部历史长尾报表
2. 极少用到的明细字段
3. 与 AI 分析无关的后台管理字段
4. 高频实时同步

---

## 5. 推荐接入方式优先级

优先级建议如下：

### 5.1 最推荐：MySQL 只读账号

适用情况：

- `selectedDB` 就是 MySQL 或兼容 MySQL
- 可以给只读账号
- 可以限制到白名单表和白名单 IP

优点：

- 稳定
- 可做增量
- 可自动化
- 字段最全
- 比浏览器采集更便宜

### 5.2 次推荐：后端报表 API

适用情况：

- 库访问难申请
- 但已有报表接口可复用

优点：

- 接入快
- 风险相对小

缺点：

- 接口口径可能变化
- 可能受分页、限流、权限影响

### 5.3 兜底：浏览器自动导出

适用情况：

- 短期拿不到库账号和 API
- 但页面可登录、可导出

优点：

- 落地快
- 适合前期验证

缺点：

- 稳定性一般
- 维护成本高
- 页面改版容易失效

结论：

`正式方案优先只读库；前期过渡可保留浏览器导出。`

---

## 6. 总体架构

### 6.1 逻辑架构

```text
selectedDB
  -> extract_selecteddb_snapshots
  -> snapshot files(jsonl/csv)
  -> ai_data_sources / ai_source_sync_jobs
  -> ai_raw_records
  -> normalize_selecteddb_records
  -> ai_fact_metric_values / ai_strategy_change_logs
  -> build_dictionary_seeds / build_resolved_fact_pack
  -> ai_skill_defs / ai_skill_versions / ai_eval_cases
```

### 6.2 角色分工

| 层 | 作用 | 是否长期保留 |
|---|---|---|
| `selectedDB` | 业务事实源库 | 是 |
| 抽取层 | 从源库只读拉取数据 | 是 |
| 快照层 | 保留当次抽取结果 | 是 |
| 标准化层 | 清洗、映射、统一字段口径 | 是 |
| 蒸馏层 | 生成指标字典、事实层、Skill Seed、Eval Seed | 是 |
| 运行层 | Skill / Eval / HMI 调用 | 是 |

---

## 7. 接入分阶段路线

### 7.1 Phase 0：当前状态

已经完成：

- 手工导出 26 张支小报表
- 本地蒸馏链路跑通
- 本机 MySQL 入库验证通过

这一步的价值是：

- 先把蒸馏逻辑调准
- 先把 Skill / Eval 数据结构跑顺

### 7.2 Phase 1：半自动抽取

目标：

- 从 `selectedDB` 固定抽取首批核心表
- 落为本地快照文件
- 继续复用当前 Distillation 主链路

产物：

- `input/selecteddb_snapshots/*.jsonl`
- `output/selecteddb_manifest.json`

### 7.3 Phase 2：全自动增量同步

目标：

- 按日或按小时自动抽取
- 自动写入统一蒸馏库
- 自动重建必要蒸馏资产

产物：

- 稳定的同步任务
- 增量回放能力
- 异常监控和对账

---

## 8. 推荐同步链路

### 8.1 抽取链路

```text
selectedDB
  -> 白名单 SQL / 只读接口
  -> 按时间窗抽取
  -> 落本地 jsonl/csv 快照
  -> 记录同步批次
```

### 8.2 标准化链路

```text
snapshot
  -> ai_raw_records
  -> 字段映射
  -> metric / dimension 统一
  -> ai_fact_metric_values
  -> ai_strategy_change_logs
```

### 8.3 蒸馏链路

```text
ai_fact_metric_values
  -> canonical metric mapping
  -> canonical fact rollup
  -> resolved fact
  -> skill core fact
  -> eval seed
```

### 8.4 运行链路

```text
Skill / Eval / HMI
  -> 统一蒸馏库
  -> 已发布事实层 / 字典 / 资产
```

---

## 9. 推荐表级承接方式

### 9.1 来源配置

使用：

- `ai_data_sources`
- `ai_source_sync_jobs`
- `ai_external_field_mappings`

建议至少配置 1 条来源：

- `source_code`: `selecteddb_midmax`
- `source_name`: `mid-max.selectedDB`
- `source_type`: `selecteddb`
- `source_origin`: `external`
- `access_method`: `db`
- `sync_frequency`: `hourly` 或 `daily`

### 9.2 原始快照

使用：

- `ai_raw_records`

建议：

- 每次抽取的每一行原始记录都保留
- `raw_payload_json` 存源字段全集
- `source_record_key` 做幂等唯一键

推荐唯一键口径：

```text
source_record_key =
  source_table + ':' + stat_date + ':' + granularity + ':' + business_line + ':' + subject_key + ':' + product_key + ':' + media_key + ':' + metric_code
```

### 9.3 标准化事实层

使用：

- `ai_fact_metric_values`

用于承接：

- 日级 / 小时级经营事实
- 各类指标长表
- 业务线、主体、产品、媒体、渠道等统一维度

### 9.4 策略变更与实验日志

使用：

- `ai_strategy_change_logs`

用于承接：

- 策略版本切换
- 实验上线/下线
- 关键配置调整
- 人工运营调整记录

### 9.5 可选的来源项承接

如果后续还需要保留“报表级描述、说明文字、查询条件、导出说明”等弱结构化信息，可选写入：

- `ai_source_items`
- `ai_source_chunks`

这部分不是一期主链路必需项。

---

## 10. 推荐抽取粒度

### 10.1 日级

适合：

- 收入汇总
- 请求/填充/展示/点击
- 业务线对比
- 主体 / 产品 / 媒体 / 渠道经营表现

### 10.2 小时级

适合：

- 收入异常诊断
- 突发波动定位
- 快速回看策略影响

### 10.3 明细级

一期只保留最必要的明细，不建议把所有事件明细都拉进来。

建议只保留：

- 策略变更明细
- 实验结果明细
- 少量高价值明细报表

---

## 11. 字段标准化原则

### 11.1 统一字段命名

不同源表中的同义字段，统一映射到标准字段，例如：

- `dt` / `day` / `stat_date` -> `window_start` / `window_end`
- `biz_line` / `line_name` -> `business_line`
- `app_name` / `product_name` -> `product_name`
- `channel` / `entry_name` -> `channel_name`
- `revenue` / `income` -> `metric_value + metric_code=revenue`

### 11.2 指标长表化

推荐统一转成：

```text
一条时间窗 + 一组维度 + 一个指标 = 一行事实
```

不要一期保留太多横表结构，否则后续做蒸馏、去重、字典化、评测都会更重。

### 11.3 字段缺失处理

如果源表没有某些维度，不强行补空列，而是：

- 公共维度落标准字段
- 非公共维度落 `extra_dimensions_json`

---

## 12. 增量同步设计

### 12.1 主增量字段

优先顺序建议：

1. `updated_at`
2. `stat_date + updated_at`
3. `id` 自增游标
4. 无法增量时按 `stat_date` 滚动重刷最近 N 天

### 12.2 增量窗口建议

日级表：

- 每天跑 `T-1`
- 同时回刷最近 `7 天`

小时级表：

- 每小时跑当前日
- 同时回刷最近 `24 小时`

策略/实验表：

- 每小时按 `updated_at` 增量

### 12.3 幂等策略

所有写入必须支持重复执行不产生脏重复。

建议做法：

1. 原始层用 `source_id + source_record_key` 唯一
2. 标准化事实层用已有唯一索引约束
3. 同步任务记录本次 `window_start / window_end / status / row_count`

---

## 13. 数据质量校验

每次同步后至少做以下校验：

### 13.1 行数校验

- 抽取行数
- 原始入库行数
- 标准化成功行数
- 去重后事实行数

### 13.2 指标对账

至少抽样对账：

- 收入总和
- 请求总和
- 展示总和
- 点击总和
- 完成订单数

要求：

- 与 `selectedDB` 或报表页面口径差异在可接受范围内

### 13.3 空值校验

重点看：

- 日期是否为空
- 指标编码是否为空
- 指标值是否为空
- 业务线是否为空

### 13.4 维度字典校验

重点看：

- 同一主体是否出现多种命名
- 同一产品是否出现别名漂移
- 媒体和渠道是否混用

---

## 14. 安全与权限要求

### 14.1 账号权限

必须使用只读账号，禁止使用有写权限的生产账号。

### 14.2 表白名单

只开放蒸馏所需的表，不要给整库 `SELECT *`。

### 14.3 SQL 白名单

优先使用预定义 SQL 模板，不允许随意拼接查询条件。

### 14.4 密码管理

开发环境：

- `.env`
- 系统环境变量
- 密钥文件

生产环境：

- 密钥管理服务
- 部署平台环境变量

### 14.5 采集隔离

抽取任务应与 Skill 运行任务分开，避免运行时读源库。

---

## 15. 与 Distillation 代码目录的衔接建议

建议后续增加以下目录和脚本：

### 15.1 建议目录

```text
DaAgent/Distillation/
  config/
    selecteddb_sources.json
  input/
    selecteddb_snapshots/
  scripts/
    extract_selecteddb_snapshots.js
    normalize_selecteddb_snapshots.js
    build_selecteddb_manifest.js
    ingest_selecteddb_to_mysql.js
    verify_selecteddb_snapshot.js
```

### 15.2 建议脚本职责

`extract_selecteddb_snapshots.js`

- 连 `selectedDB`
- 执行白名单 SQL
- 按时间窗输出 `jsonl/csv`
- 写同步清单

`normalize_selecteddb_snapshots.js`

- 统一字段
- 产出标准化事实
- 写入 `ai_raw_records` / `ai_fact_metric_values`

`build_selecteddb_manifest.js`

- 把不同报表/不同表的数据编成统一 manifest
- 供后续蒸馏主链路消费

`verify_selecteddb_snapshot.js`

- 做行数、指标、空值和维度校验

---

## 16. MVP 推荐实施顺序

### Step 1

申请 `selectedDB` 只读账号，确定白名单表和白名单字段。

### Step 2

确认首批接入对象，只选：

1. 收入类
2. 媒体类
3. 投放/任务类
4. 策略/实验类

### Step 3

先落本地快照文件，不要一开始就直写正式事实表。

### Step 4

完成字段映射和标准化，跑一轮对账。

### Step 5

接入现有 Distillation 主链路，生成：

- metric dictionary
- dimension dictionary
- resolved fact
- skill seed
- eval seed

### Step 6

将产物导入统一蒸馏库，供 Skill / Eval / HMI 调用。

---

## 17. 上线节奏建议

### 第 1 周

1. 拿只读账号
2. 明确首批表
3. 输出字段映射
4. 完成首版抽取脚本
5. 完成本地快照对账

### 第 2 周

1. 接入标准化和蒸馏链路
2. 跑通本地 MySQL 入库
3. 用 Eval 回归验证准确性
4. 再决定是否切到服务器 MySQL 和定时任务

---

## 18. 风险与兜底

### 18.1 拿不到库账号

兜底方案：

- 继续用浏览器自动导出
- 保持与当前 26 张报表兼容

### 18.2 源表口径频繁变化

兜底方案：

- 抽取层版本化
- 字段映射版本化
- 对账规则固化

### 18.3 数据量过大

兜底方案：

- 先只做核心业务线
- 先只做日级和关键小时级
- 先只做高价值指标

### 18.4 结果不稳定

兜底方案：

- 先保留快照
- 先对账
- 先跑 Eval
- 再放给 Skill 正式使用

---

## 19. 最终建议

对你们当前阶段，最合适的路径是：

1. 继续把本地蒸馏和 Skill 调准
2. 让 `selectedDB` 先作为“只读事实输入源”
3. 不让 Skill 直接依赖 `selectedDB`
4. 先做首批核心表接入，再逐步扩

一句话总结：

`selectedDB 的正确接法，不是“让 AI 直接查生产库”，而是“把 selectedDB 稳定抽取成统一蒸馏输入层”。`
