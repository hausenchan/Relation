# Distillation Workspace

当前目录用于承接从 `mid-max.midongtech.com` 导出的业务报表，并将这些文件逐步转成统一蒸馏库可消费的数据。

---

## 目录说明

- `midmax_report_zhixiao_*.xls`
  - 已导出的支小报表文件
- `midmax_report_zhixiao_manifest.csv`
  - 适合人工查看的清单
- `midmax_report_zhixiao_manifest.json`
  - 适合脚本消费的清单
- `scripts/parse_manifest_to_distill.js`
  - 将 manifest 转成蒸馏入库 payload
- `sql/import_reports_to_mysql_template.sql`
  - 报表元数据入库 MySQL 的模板 SQL
- `output/`
  - 脚本生成的 payload 输出目录

---

## 快速开始

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/parse_manifest_to_distill.js
```

执行后会生成：

- `DaAgent/Distillation/output/midmax_zhixiao_distill_payload.json`
- `DaAgent/Distillation/output/midmax_zhixiao_blocked_reports.json`

---

## 脚本作用

`parse_manifest_to_distill.js` 目前做的是“入库前准备”，不会直接解析 `.xls` 正文。

它会把 `status = exported` 的报表整理成以下几类 payload：

- `source_config`
- `sync_job`
- `raw_records`
- `source_items`
- `parse_tasks`
- `blocked_reports`

也就是说，这一版先解决：

1. 报表文件有统一命名
2. 报表来源有统一 manifest
3. 可以生成统一蒸馏库需要的元数据载荷

下一步再做真正的：

- xls 表格解析
- 行数据抽取
- source_chunks 生成
- metric / dimension 候选抽取

现在已经补上第一版 `xls -> xlsx -> 行数据 JSON` 解析链路。

---

## 可选参数

```bash
node DaAgent/Distillation/scripts/parse_manifest_to_distill.js \
  --manifest DaAgent/Distillation/midmax_report_zhixiao_manifest.json \
  --output DaAgent/Distillation/output \
  --batch-no midmax_zhixiao_20260705_manual_import \
  --source-code midmax_zhixiao_reports
```

---

## 当前约束

这一版已经支持：

- `.xls -> .xlsx` 转换
- sheet / 表头 / 数据行抽取
- MySQL 导入 SQL 生成

当前还没有直接做的部分是：

- 直接连 MySQL 执行写入
- 按指标口径把逐行数据标准化到 `ai_fact_metric_values`
- 自动生成更细粒度的 `metric / dimension` 字典候选

---

## 下一步建议

推荐下一步继续做：

1. 把各报表字段映射到 `ai_fact_metric_values`
   - 识别时间、主体、产品、媒体、渠道、指标值
   - 明确每张表的指标口径
2. 增加直接写 MySQL 的执行脚本
   - 在生成 SQL 的基础上再包一层执行器
3. 增加质量校验
   - 空表告警
   - 表头变更告警
   - 行数波动告警

---

## 第二步：解析 xls 正文

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/parse_xls_to_rows.js
```

执行后会生成：

- `DaAgent/Distillation/output/converted_xlsx/`
- `DaAgent/Distillation/output/parsed_reports/`
- `DaAgent/Distillation/output/midmax_zhixiao_rows_manifest.json`

脚本会做三件事：

1. 用 `soffice` 把 `.xls` 转成 `.xlsx`
2. 用 `openpyxl` 提取 sheet、表头、数据行
3. 为后续蒸馏入库生成逐报表 JSON

如果本机不是 Codex 运行时环境，可以手动指定：

```bash
node DaAgent/Distillation/scripts/parse_xls_to_rows.js \
  --soffice /path/to/soffice \
  --python /path/to/python3
```

---

## 第三步：生成 MySQL 导入 SQL

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/generate_mysql_import_sql.js
```

执行后会生成：

- `DaAgent/Distillation/output/midmax_zhixiao_import.sql`

这一版会生成：

1. `ai_data_sources` upsert SQL
2. `ai_source_sync_jobs` 插入 SQL
3. `ai_raw_records` / `ai_source_items` upsert SQL
4. `ai_source_chunks` 预览分片 SQL

说明：

- `ai_source_chunks` 当前先写每个报表 sheet 的表头 + 前 5 行预览，便于先落知识检索层
- 详细的逐行指标标准化，建议下一步再映射到 `ai_fact_metric_values`

---

## 第四步：生成解析后事实层

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/build_resolved_fact_pack.js
```

执行后会生成：

- `DaAgent/Distillation/output/training/zhixiao_resolved_fact_values.jsonl`
- `DaAgent/Distillation/output/training/zhixiao_resolved_fact_values.tsv`
- `DaAgent/Distillation/output/training/zhixiao_resolved_fact_values_manifest.json`
- `DaAgent/Distillation/output/training/zhixiao_resolved_fact_load.sql`
- `DaAgent/Distillation/output/training/zhixiao_skill_core_fact_values.jsonl`
- `DaAgent/Distillation/output/training/zhixiao_skill_core_fact_values.tsv`

这一层会做两件事：

1. 把 raw fact 的跨报表冲突按优先级消解
   - 总表优先
   - 主报表优先
   - 明细表作为回退
2. 生成一份更适合 Skill 直接消费的 `core fact` 子集

当前效果：

- 原始 fact：`1,622,178`
- resolved fact：`1,455,013`
- core fact：`1,355,773`

---

## 第五步：生成 Skill / Eval Seed

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/build_eval_seed_pack.js
```

执行后会生成：

- `DaAgent/Distillation/output/training/zhixiao_eval_cases.json`
- `DaAgent/Distillation/output/training/zhixiao_eval_manifest.json`
- `DaAgent/Distillation/output/training/zhixiao_eval_seed.sql`

这一版会自动创建首个 Skill 的种子定义：

- `skill_code = zhixiao_metric_analyst`

同时生成首批评测样本：

- 点查样本：`120`
- 趋势比较样本：`60`
- Top1 排名样本：`40`

合计：

- Eval cases：`220`

---

## 第六步：打包 MySQL 交付 Bundle

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/build_mysql_delivery_bundle.js
```

执行后会生成：

- `DaAgent/Distillation/output/training/mysql_bundle/zhixiao_mysql_bundle_core.sql`
- `DaAgent/Distillation/output/training/mysql_bundle/zhixiao_mysql_bundle_full.sql`
- `DaAgent/Distillation/output/training/mysql_bundle/zhixiao_mysql_bundle_manifest.json`
- `DaAgent/Distillation/output/training/mysql_bundle/zhixiao_mysql_bundle_instructions.md`

推荐先执行 core bundle：

```bash
mysql --local-infile=1 -u <user> -p < DaAgent/Distillation/output/training/mysql_bundle/zhixiao_mysql_bundle_core.sql
```

如果希望把 raw/source item 元数据也一并入库，再执行 full bundle。

---

## 第七步：跑离线 Eval

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/run_offline_eval.js
```

执行后会生成：

- `DaAgent/Distillation/output/training/zhixiao_eval_offline_run.json`
- `DaAgent/Distillation/output/training/zhixiao_eval_offline_report.md`

这一版 runner 不依赖 MySQL，会直接流式扫描：

- `zhixiao_skill_core_fact_values.jsonl`

并校验三类样本：

1. 指标点查
2. 趋势比较
3. Top1 排名

当前离线评测结果：

- 总用例：`220`
- 通过：`220`
- 通过率：`100%`

---

## 第八步：一键执行全链路

在仓库根目录执行：

```bash
node DaAgent/Distillation/scripts/run_full_distillation_pipeline.js
```

这条命令会顺序执行：

1. 重建 manifest
2. 生成 distill payload
3. 解析 xls 行数据
4. 生成 raw/source item SQL
5. 生成训练候选资产
6. 生成 raw fact
7. 生成 canonical metric mapping
8. 生成 canonical fact rollup
9. 生成指标/维度字典 seed
10. 生成 resolved/core fact
11. 生成 Skill / Eval seed
12. 生成 MySQL bundle
13. 执行离线 Eval

执行后会生成运行清单：

- `DaAgent/Distillation/output/training/zhixiao_full_pipeline_run.json`

如果本机已经有 MySQL 客户端，也可以把入库一起带上：

```bash
node DaAgent/Distillation/scripts/run_full_distillation_pipeline.js \
  --mysql-bundle core \
  --mysql-user <user> \
  --mysql-host <host> \
  --mysql-port 3306 \
  --mysql-password-env MYSQL_PWD
```

说明：

- `--mysql-bundle core`：执行 core bundle
- `--mysql-bundle full`：执行 full bundle
- 如果 `mysql` 不在 PATH，脚本会自动尝试探测 Homebrew 的 `mysql-client`

---

## 当前脚本清单

已补齐的主链路脚本：

- `scripts/rebuild_zhixiao_manifest.js`
- `scripts/parse_manifest_to_distill.js`
- `scripts/parse_xls_to_rows.js`
- `scripts/generate_mysql_import_sql.js`
- `scripts/build_training_assets.js`
- `scripts/build_fact_metric_values.js`
- `scripts/build_canonical_metric_mapping.js`
- `scripts/build_canonical_fact_rollup.js`
- `scripts/build_dictionary_seeds.js`
- `scripts/build_resolved_fact_pack.js`
- `scripts/build_eval_seed_pack.js`
- `scripts/build_mysql_delivery_bundle.js`
- `scripts/run_offline_eval.js`
- `scripts/run_full_distillation_pipeline.js`
