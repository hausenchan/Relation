#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function parseListArg(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    input: options.input,
    maxBuffer: 1024 * 1024 * 200,
  });

  if (result.status !== 0) {
    const stdout = normalizeText(result.stdout);
    const stderr = normalizeText(result.stderr);
    throw new Error(
      [
        `Command failed: ${command} ${commandArgs.join(" ")}`,
        stdout ? `stdout: ${stdout}` : "",
        stderr ? `stderr: ${stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return result;
}

function expandMysqlBundleSql(filePath, visited = new Set()) {
  const normalizedPath = path.resolve(filePath);
  if (visited.has(normalizedPath)) {
    throw new Error(`Circular SOURCE detected: ${normalizedPath}`);
  }

  visited.add(normalizedPath);
  const sql = fs.readFileSync(normalizedPath, "utf8");
  const lines = sql.split(/\r?\n/);
  const expanded = [];

  for (const line of lines) {
    const match = line.match(/^\s*SOURCE\s+(.+?)\s*;?\s*$/i);
    if (!match) {
      expanded.push(line);
      continue;
    }

    const sourcePath = match[1].trim();
    const resolvedPath = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(path.dirname(normalizedPath), sourcePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`SOURCE file not found: ${resolvedPath}`);
    }

    expanded.push(`-- BEGIN SOURCE ${resolvedPath}`);
    expanded.push(expandMysqlBundleSql(resolvedPath, visited));
    expanded.push(`-- END SOURCE ${resolvedPath}`);
  }

  visited.delete(normalizedPath);
  return expanded.join("\n");
}

function detectMysqlBinary(explicitPath) {
  const candidates = [];
  if (explicitPath) {
    candidates.push(explicitPath);
  }

  const pathMysql = spawnSync("which", ["mysql"], { encoding: "utf8" });
  if (pathMysql.status === 0) {
    const found = normalizeText(pathMysql.stdout);
    if (found) {
      candidates.push(found);
    }
  }

  const brewPrefix = spawnSync("brew", ["--prefix", "mysql-client"], { encoding: "utf8" });
  if (brewPrefix.status === 0) {
    const prefix = normalizeText(brewPrefix.stdout);
    if (prefix) {
      candidates.push(path.join(prefix, "bin", "mysql"));
    }
  }

  candidates.push("/opt/homebrew/opt/mysql-client/bin/mysql");
  candidates.push("/usr/local/opt/mysql-client/bin/mysql");

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildNodeStep(stepId, description, scriptPath, extraArgs = []) {
  return {
    id: stepId,
    description,
    run(context) {
      return runCommand(process.execPath, [scriptPath, ...extraArgs], {
        cwd: context.repoRoot,
      });
    },
  };
}

function buildMysqlStep(bundleMode) {
  return {
    id: `mysql_bundle_${bundleMode}`,
    description: `执行 MySQL ${bundleMode} bundle`,
    run(context) {
      const mysqlBin = detectMysqlBinary(context.args["mysql-bin"]);
      if (!mysqlBin) {
        throw new Error("Cannot find mysql client. Install mysql-client or provide --mysql-bin.");
      }

      const bundleName =
        bundleMode === "full" ? "zhixiao_mysql_bundle_full.sql" : "zhixiao_mysql_bundle_core.sql";
      const bundlePath = path.join(
        context.trainingDir,
        "mysql_bundle",
        bundleName
      );
      if (!fs.existsSync(bundlePath)) {
        throw new Error(`MySQL bundle not found: ${bundlePath}`);
      }

      const mysqlArgs = ["--local-infile=1"];
      if (context.args["mysql-host"]) {
        mysqlArgs.push("-h", context.args["mysql-host"]);
      }
      if (context.args["mysql-port"]) {
        mysqlArgs.push("-P", String(context.args["mysql-port"]));
      }
      if (context.args["mysql-user"]) {
        mysqlArgs.push("-u", context.args["mysql-user"]);
      }
      if (context.args["mysql-socket"]) {
        mysqlArgs.push("-S", context.args["mysql-socket"]);
      }
      if (context.args["mysql-database"]) {
        mysqlArgs.push(context.args["mysql-database"]);
      }

      const env = {};
      const passwordEnvName = context.args["mysql-password-env"];
      if (passwordEnvName) {
        const passwordValue = process.env[passwordEnvName];
        if (!passwordValue) {
          throw new Error(`Environment variable ${passwordEnvName} is empty.`);
        }
        env.MYSQL_PWD = passwordValue;
      } else if (process.env.MYSQL_PWD) {
        env.MYSQL_PWD = process.env.MYSQL_PWD;
      }

      runCommand(mysqlBin, mysqlArgs, {
        cwd: context.repoRoot,
        env,
        input: "SET GLOBAL local_infile = 1;\n",
      });

      const bundleSql = expandMysqlBundleSql(bundlePath);
      return runCommand(mysqlBin, mysqlArgs, {
        cwd: context.repoRoot,
        env,
        input: bundleSql,
      });
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "../../..");
  const distillationDir = path.resolve(__dirname, "..");
  const outputDir = path.join(distillationDir, "output");
  const trainingDir = path.join(outputDir, "training");
  const manifestPath =
    args["run-manifest"] || path.join(trainingDir, "zhixiao_full_pipeline_run.json");

  const steps = [
    buildNodeStep(
      "rebuild_manifest",
      "重建支小报表 manifest",
      path.join(__dirname, "rebuild_zhixiao_manifest.js")
    ),
    buildNodeStep(
      "build_distill_payload",
      "生成蒸馏元数据 payload",
      path.join(__dirname, "parse_manifest_to_distill.js")
    ),
    buildNodeStep(
      "parse_xls_rows",
      "解析 xls 为逐报表行数据",
      path.join(__dirname, "parse_xls_to_rows.js")
    ),
    buildNodeStep(
      "build_raw_import_sql",
      "生成 raw/source item MySQL SQL",
      path.join(__dirname, "generate_mysql_import_sql.js")
    ),
    buildNodeStep(
      "build_training_assets",
      "构建 schema / metric / dimension 候选",
      path.join(__dirname, "build_training_assets.js")
    ),
    buildNodeStep(
      "build_fact_values",
      "生成 raw fact metric values",
      path.join(__dirname, "build_fact_metric_values.js")
    ),
    buildNodeStep(
      "build_metric_mapping",
      "生成 canonical metric mapping",
      path.join(__dirname, "build_canonical_metric_mapping.js")
    ),
    buildNodeStep(
      "build_canonical_rollup",
      "生成 canonical fact rollup",
      path.join(__dirname, "build_canonical_fact_rollup.js")
    ),
    buildNodeStep(
      "build_dictionary_seeds",
      "生成指标/维度字典种子",
      path.join(__dirname, "build_dictionary_seeds.js")
    ),
    buildNodeStep(
      "build_resolved_pack",
      "生成解析后事实层和 core fact",
      path.join(__dirname, "build_resolved_fact_pack.js")
    ),
    buildNodeStep(
      "build_eval_seed",
      "生成 Skill / Eval seed",
      path.join(__dirname, "build_eval_seed_pack.js")
    ),
    buildNodeStep(
      "build_mysql_bundle",
      "生成 MySQL 交付 bundle",
      path.join(__dirname, "build_mysql_delivery_bundle.js")
    ),
    buildNodeStep(
      "run_offline_eval",
      "执行离线 Eval",
      path.join(__dirname, "run_offline_eval.js")
    ),
  ];

  if (args["mysql-bundle"] === "core" || args["mysql-bundle"] === "full") {
    steps.push(buildMysqlStep(args["mysql-bundle"]));
  }

  const onlySteps = new Set(parseListArg(args["only-step"]));
  const selectedSteps =
    onlySteps.size > 0 ? steps.filter((step) => onlySteps.has(step.id)) : steps;

  const context = {
    args,
    repoRoot,
    distillationDir,
    outputDir,
    trainingDir,
  };

  const summary = {
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    distillation_dir: distillationDir,
    mysql_bundle_mode: args["mysql-bundle"] || null,
    only_step: onlySteps.size > 0 ? Array.from(onlySteps) : null,
    steps: [],
  };

  for (const step of selectedSteps) {
    const startedAt = new Date();
    process.stdout.write(`\n[START] ${step.id} - ${step.description}\n`);
    try {
      const result = step.run(context);
      const finishedAt = new Date();
      const stdout = normalizeText(result.stdout);
      const stderr = normalizeText(result.stderr);
      process.stdout.write(`[DONE] ${step.id}\n`);
      summary.steps.push({
        id: step.id,
        description: step.description,
        status: "success",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        stdout_preview: stdout.slice(0, 2000),
        stderr_preview: stderr.slice(0, 2000),
      });
    } catch (error) {
      const finishedAt = new Date();
      process.stdout.write(`[FAIL] ${step.id}\n`);
      summary.steps.push({
        id: step.id,
        description: step.description,
        status: "failed",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        error_message: error.message,
      });
      summary.final_status = "failed";
      writeJson(manifestPath, summary);
      throw error;
    }
  }

  summary.final_status = "success";
  writeJson(manifestPath, summary);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        final_status: summary.final_status,
        step_count: summary.steps.length,
        run_manifest: manifestPath,
      },
      null,
      2
    )}\n`
  );
}

main();
