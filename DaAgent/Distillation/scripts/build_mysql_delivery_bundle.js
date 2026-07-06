#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      continue;
    }
    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function formatBytes(size) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildSourceSql(filePaths) {
  return filePaths.map((filePath) => `SOURCE ${filePath};`).join("\n");
}

function buildInstructions(bundle, coreSqlPath, fullSqlPath) {
  const requiredSteps = bundle.required_steps
    .map(
      (step, index) =>
        `${index + 1}. ${step.name}\n   - 文件: ${step.file}\n   - 说明: ${step.description}\n   - 大小: ${step.size_human}`
    )
    .join("\n");

  const optionalSteps = bundle.optional_steps
    .map(
      (step, index) =>
        `${index + 1}. ${step.name}\n   - 文件: ${step.file}\n   - 说明: ${step.description}\n   - 大小: ${step.size_human}`
    )
    .join("\n");

  return `# Zhixiao MySQL Delivery Bundle

生成时间：${bundle.generated_at}

## Core Bundle

推荐先执行 core bundle：

\`\`\`bash
mysql --local-infile=1 -u <user> -p < ${coreSqlPath}
\`\`\`

## Full Bundle

如果还想把原始报表元数据、raw/source item 一起入库，再执行 full bundle：

\`\`\`bash
mysql --local-infile=1 -u <user> -p < ${fullSqlPath}
\`\`\`

## Required Steps

${requiredSteps}

## Optional Steps

${optionalSteps}

## Notes

- resolved fact 已经是解析后事实层，适合 skill / eval 直接消费。
- eval seed 会创建 \`zhixiao_metric_analyst\` 的 Skill 定义、v1 版本和首批评测样本。
- 所有 load SQL 依赖 \`LOCAL INFILE\`，执行前请确保 MySQL 客户端已开启 \`--local-infile=1\`。
`;
}

function statFile(filePath) {
  const stats = fs.statSync(filePath);
  return {
    file: filePath,
    size_bytes: stats.size,
    size_human: formatBytes(stats.size),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args["repo-root"] || process.cwd();
  const distillationDir =
    args["distillation-dir"] || path.join(repoRoot, "DaAgent", "Distillation");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const bundleDir = args["bundle-dir"] || path.join(trainingDir, "mysql_bundle");

  ensureDir(bundleDir);

  const requiredSteps = [
    {
      id: "schema",
      name: "初始化蒸馏库 Schema",
      description: "建库建表，包含 skill/eval 表结构。",
      file: path.join(repoRoot, "sql", "ai_distill_mysql.sql"),
    },
    {
      id: "dictionary_seed",
      name: "写入指标/维度字典",
      description: "导入 240 个指标和 46 个维度种子。",
      file: path.join(trainingDir, "zhixiao_dictionary_seed.sql"),
    },
    {
      id: "resolved_fact",
      name: "导入解析后事实层",
      description: "导入 resolved fact，作为 Skill 检索与问答主数据源。",
      file: path.join(trainingDir, "zhixiao_resolved_fact_load.sql"),
    },
    {
      id: "skill_eval_seed",
      name: "写入 Skill 与 Eval Seed",
      description: "创建 zhixiao_metric_analyst Skill、v1 版本和评测样本。",
      file: path.join(trainingDir, "zhixiao_eval_seed.sql"),
    },
  ].map((step) => ({ ...step, ...statFile(step.file) }));

  const optionalSteps = [
    {
      id: "raw_report_import",
      name: "导入报表 raw/source item 元数据",
      description: "把报表级元信息和预览 chunk 一起入库，便于溯源。",
      file: path.join(outputDir, "midmax_zhixiao_import.sql"),
    },
  ]
    .filter((step) => fs.existsSync(step.file))
    .map((step) => ({ ...step, ...statFile(step.file) }));

  const coreBundleSqlPath = path.join(bundleDir, "zhixiao_mysql_bundle_core.sql");
  const fullBundleSqlPath = path.join(bundleDir, "zhixiao_mysql_bundle_full.sql");
  const manifestPath = path.join(bundleDir, "zhixiao_mysql_bundle_manifest.json");
  const instructionsPath = path.join(bundleDir, "zhixiao_mysql_bundle_instructions.md");

  fs.writeFileSync(
    coreBundleSqlPath,
    `-- Zhixiao MySQL Core Bundle\n${buildSourceSql(requiredSteps.map((item) => item.file))}\n`,
    "utf8"
  );

  fs.writeFileSync(
    fullBundleSqlPath,
    `-- Zhixiao MySQL Full Bundle\n${buildSourceSql(
      [...requiredSteps, ...optionalSteps].map((item) => item.file)
    )}\n`,
    "utf8"
  );

  const manifest = {
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    distillation_dir: distillationDir,
    database_name: "relation_ai_distill",
    required_steps: requiredSteps,
    optional_steps: optionalSteps,
    bundle_files: [
      coreBundleSqlPath,
      fullBundleSqlPath,
      instructionsPath,
    ],
  };

  writeJson(manifestPath, manifest);
  fs.writeFileSync(
    instructionsPath,
    buildInstructions(manifest, coreBundleSqlPath, fullBundleSqlPath),
    "utf8"
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        bundle_dir: bundleDir,
        required_step_count: requiredSteps.length,
        optional_step_count: optionalSteps.length,
        core_bundle_sql: coreBundleSqlPath,
        full_bundle_sql: fullBundleSqlPath,
      },
      null,
      2
    )
  );
}

main();
