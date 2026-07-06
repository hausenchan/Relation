#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const POINT_CASE_LIMIT = 120;
const COMPARE_CASE_LIMIT = 60;
const RANKING_CASE_LIMIT = 40;
const TARGET_METRIC_LIMIT = 30;
const CONFIDENCE_THRESHOLD = 0.9;

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeNullable(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeNumber(value, decimals = 6) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(decimals));
}

function sqlValue(value) {
  if (value == null) {
    return "NULL";
  }
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function pickPriority(metricCategory, metricName) {
  if (metricCategory === "commercial" || /收入|成本|毛利|利润/.test(metricName)) {
    return "P1";
  }
  if (metricCategory === "traffic") {
    return "P1";
  }
  if (metricCategory === "quality") {
    return "P2";
  }
  return "P3";
}

function formatDate(row) {
  if (row.granularity === "month") {
    return row.window_start.slice(0, 7);
  }
  return row.window_start.slice(0, 10);
}

function buildMetricTargetSet(shortlistPayload) {
  return new Set(
    (shortlistPayload.core_metrics || [])
      .filter((metric) => ["traffic", "commercial", "quality"].includes(metric.category))
      .sort((left, right) => {
        return (
          (right.source_report_count || 0) - (left.source_report_count || 0) ||
          left.canonical_metric_code.localeCompare(right.canonical_metric_code, "zh-CN")
        );
      })
      .slice(0, TARGET_METRIC_LIMIT)
      .map((metric) => metric.canonical_metric_code)
  );
}

function getConfidence(row) {
  return Number(row.extra_dimensions_json?.resolution_confidence || 0);
}

function getEntityScope(row) {
  if (row.product_name) {
    return {
      type: "product",
      type_cn: "产品",
      key: normalizeNullable(row.product_key) || row.product_name,
      name: row.product_name,
    };
  }
  if (row.media_name) {
    return {
      type: "media",
      type_cn: "媒体",
      key: normalizeNullable(row.media_key) || row.media_name,
      name: row.media_name,
    };
  }
  if (row.subject_name) {
    return {
      type: "subject",
      type_cn: "主体",
      key: normalizeNullable(row.subject_key) || row.subject_name,
      name: row.subject_name,
    };
  }
  return null;
}

function getDimensionLabel(row) {
  const segments = [];
  if (row.subject_name) {
    segments.push(`主体「${row.subject_name}」`);
  }
  if (row.product_name) {
    segments.push(`产品「${row.product_name}」`);
  }
  if (row.media_name) {
    segments.push(`媒体「${row.media_name}」`);
  }
  if (row.channel_name) {
    segments.push(`渠道「${row.channel_name}」`);
  }
  if (row.experiment_key) {
    segments.push(`任务/策略「${row.experiment_key}」`);
  }
  return segments;
}

function makeCaseCode(prefix, index, payload) {
  const digest = crypto
    .createHash("sha1")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 10);
  return `${prefix}_${String(index).padStart(3, "0")}_${digest}`;
}

function buildPointQuestion(row) {
  const dateText = formatDate(row);
  const labels = getDimensionLabel(row);
  const scopeText = labels.length > 0 ? `${labels.join("、")}的` : "支小业务的";
  return `${dateText}，${scopeText}${row.metric_name}是多少？`;
}

function buildCompareQuestion(metricName, entityScope, startRow, endRow) {
  const startDate = formatDate(startRow);
  const endDate = formatDate(endRow);
  return `${startDate}到${endDate}，${entityScope.type_cn}「${entityScope.name}」的${metricName}是增长还是下降？起始值、结束值和变化值分别是多少？`;
}

function buildRankingQuestion(metricName, dateText, dimensionTypeCn) {
  return `${dateText}，支小业务按${dimensionTypeCn}维度看，${metricName}最高的是哪个${dimensionTypeCn}？数值是多少？`;
}

function buildPointCase(row, index) {
  const dimensionLabels = getDimensionLabel(row);
  const casePayload = {
    question: buildPointQuestion(row),
    business_line: row.business_line,
    granularity: row.granularity,
    metric_code: row.metric_code,
    metric_name: row.metric_name,
    time_window: {
      start: row.window_start,
      end: row.window_end,
    },
    filters: {
      subject_name: row.subject_name,
      product_name: row.product_name,
      media_name: row.media_name,
      channel_name: row.channel_name,
      experiment_key: row.experiment_key,
    },
  };

  return {
    case_code: makeCaseCode("zhx_point", index, casePayload),
    title: `${row.metric_name}点查 - ${formatDate(row)}`,
    case_type: "golden",
    priority_level: pickPriority(row.metric_category, row.metric_name),
    input_payload_json: casePayload,
    expected_output_json: {
      answer_type: "metric_point_lookup",
      answer_text: `${buildPointQuestion(row).replace("是多少？", "")}为${row.metric_value}`,
      metric_code: row.metric_code,
      metric_name: row.metric_name,
      metric_value: row.metric_value,
      unit: row.unit,
      currency_code: row.currency_code,
      granularity: row.granularity,
      time_window: {
        start: row.window_start,
        end: row.window_end,
      },
      matched_dimensions: {
        subject_name: row.subject_name,
        product_name: row.product_name,
        media_name: row.media_name,
        channel_name: row.channel_name,
        experiment_key: row.experiment_key,
      },
      source_record_key: row.source_record_key,
    },
    score_rule_json: {
      evaluator: "numeric_exact",
      tolerance_abs: row.unit === "percent" ? 0.01 : 0.0001,
      required_metric_code: row.metric_code,
      required_time_window: {
        start: row.window_start,
        end: row.window_end,
      },
      required_dimensions: {
        subject_name: row.subject_name,
        product_name: row.product_name,
        media_name: row.media_name,
        channel_name: row.channel_name,
        experiment_key: row.experiment_key,
      },
    },
    tags_json: [
      "zhixiao",
      "skill_eval",
      "point_lookup",
      row.metric_category || "other",
      row.granularity,
      dimensionLabels.length > 0 ? "scoped" : "broad",
    ],
    status: "active",
  };
}

function buildCompareCase(metricName, metricCode, entityScope, startRow, endRow, index) {
  const deltaValue = normalizeNumber(Number(endRow.metric_value) - Number(startRow.metric_value));
  const trend = deltaValue > 0 ? "up" : deltaValue < 0 ? "down" : "flat";
  const casePayload = {
    question: buildCompareQuestion(metricName, entityScope, startRow, endRow),
    business_line: startRow.business_line,
    granularity: startRow.granularity,
    metric_code: metricCode,
    metric_name: metricName,
    entity_scope: entityScope,
    compare_window: {
      start: {
        start: startRow.window_start,
        end: startRow.window_end,
      },
      end: {
        start: endRow.window_start,
        end: endRow.window_end,
      },
    },
  };

  return {
    case_code: makeCaseCode("zhx_cmp", index, casePayload),
    title: `${metricName}趋势比较 - ${entityScope.name}`,
    case_type: "golden",
    priority_level: pickPriority(startRow.metric_category, metricName),
    input_payload_json: casePayload,
    expected_output_json: {
      answer_type: "metric_compare",
      metric_code: metricCode,
      metric_name: metricName,
      entity_scope: entityScope,
      start_value: startRow.metric_value,
      end_value: endRow.metric_value,
      delta_value: deltaValue,
      trend,
      unit: startRow.unit,
      currency_code: startRow.currency_code,
      source_record_keys: [startRow.source_record_key, endRow.source_record_key],
    },
    score_rule_json: {
      evaluator: "numeric_compare",
      tolerance_abs: startRow.unit === "percent" ? 0.01 : 0.0001,
      required_metric_code: metricCode,
      trend_required: true,
    },
    tags_json: [
      "zhixiao",
      "skill_eval",
      "trend_compare",
      startRow.metric_category || "other",
      entityScope.type,
    ],
    status: "active",
  };
}

function buildRankingCase(entry, index) {
  const question = buildRankingQuestion(entry.metric_name, entry.date_text, entry.dimension_type_cn);
  const casePayload = {
    question,
    business_line: entry.row.business_line,
    granularity: entry.row.granularity,
    metric_code: entry.metric_code,
    metric_name: entry.metric_name,
    ranking_scope: {
      date: entry.date_text,
      dimension_type: entry.dimension_type,
      dimension_type_cn: entry.dimension_type_cn,
    },
  };

  return {
    case_code: makeCaseCode("zhx_rank", index, casePayload),
    title: `${entry.metric_name}Top1 - ${entry.date_text} ${entry.dimension_type_cn}`,
    case_type: "golden",
    priority_level: pickPriority(entry.row.metric_category, entry.metric_name),
    input_payload_json: casePayload,
    expected_output_json: {
      answer_type: "ranking_top1",
      metric_code: entry.metric_code,
      metric_name: entry.metric_name,
      date: entry.date_text,
      winner_dimension_type: entry.dimension_type,
      winner_dimension_type_cn: entry.dimension_type_cn,
      winner_name: entry.top_name,
      winner_key: entry.top_key,
      metric_value: entry.top_value,
      unit: entry.row.unit,
      currency_code: entry.row.currency_code,
      source_record_key: entry.row.source_record_key,
      candidate_count: entry.candidate_count,
    },
    score_rule_json: {
      evaluator: "ranking_top1",
      tolerance_abs: entry.row.unit === "percent" ? 0.01 : 0.0001,
      required_metric_code: entry.metric_code,
      required_winner_name: entry.top_name,
      required_date: entry.date_text,
    },
    tags_json: [
      "zhixiao",
      "skill_eval",
      "ranking_top1",
      entry.row.metric_category || "other",
      entry.dimension_type,
    ],
    status: "active",
  };
}

function parseResolvedRow(line) {
  const row = JSON.parse(line);
  return {
    ...row,
    metric_value: Number(row.metric_value),
    metric_category: normalizeNullable(row.extra_dimensions_json?.metric_category),
    resolution_confidence: getConfidence(row),
  };
}

function createSkillSeedSql(skillCode, skillName, cases) {
  const evalSpec = {
    dataset_code: "zhixiao_eval_v1",
    point_case_count: cases.filter((item) => item.expected_output_json.answer_type === "metric_point_lookup").length,
    compare_case_count: cases.filter((item) => item.expected_output_json.answer_type === "metric_compare").length,
    ranking_case_count: cases.filter((item) => item.expected_output_json.answer_type === "ranking_top1").length,
    confidence_threshold: CONFIDENCE_THRESHOLD,
  };

  const promptTemplate = [
    "你是支小业务数据分析 Skill。",
    "输入是中文业务问题，需要先识别指标、时间窗和维度过滤条件。",
    "只能基于 ai_fact_metric_values 中高置信解析后事实作答。",
    "输出需包含指标口径、过滤条件、时间范围、数值结果和必要解释。",
  ].join("\n");

  const inputSchema = {
    type: "object",
    properties: {
      question: { type: "string" },
      business_line: { type: "string" },
    },
    required: ["question"],
  };

  const outputSchema = {
    type: "object",
    properties: {
      answer_text: { type: "string" },
      metric_code: { type: "string" },
      metric_value: { type: "number" },
      evidence: { type: "array" },
    },
    required: ["answer_text", "metric_code", "metric_value"],
  };

  const workflow = {
    steps: [
      "intent_parse",
      "metric_and_dimension_resolution",
      "fact_lookup",
      "answer_synthesis",
    ],
  };

  const hookPolicy = {
    before_run: ["validate_scope", "require_business_line"],
    after_run: ["attach_evidence", "record_metric_usage"],
  };

  const toolWhitelist = ["mysql", "fact_lookup"];

  const insertCasesSql = cases
    .map(
      (item) => `(
  ${sqlValue(item.case_code)},
  @skill_id,
  ${sqlValue(item.title)},
  ${sqlValue(item.case_type)},
  ${sqlValue(item.priority_level)},
  CAST(${sqlValue(JSON.stringify(item.input_payload_json))} AS JSON),
  CAST(${sqlValue(JSON.stringify(item.expected_output_json))} AS JSON),
  CAST(${sqlValue(JSON.stringify(item.score_rule_json))} AS JSON),
  CAST(${sqlValue(JSON.stringify(item.tags_json))} AS JSON),
  ${sqlValue(item.status)}
)`
    )
    .join(",\n");

  return `USE relation_ai_distill;

INSERT INTO ai_skill_defs (
  skill_code,
  skill_name,
  scenario,
  job_to_be_done,
  status
) VALUES (
  ${sqlValue(skillCode)},
  ${sqlValue(skillName)},
  ${sqlValue("支小业务数据问答")},
  ${sqlValue("根据解析后事实指标回答业务指标查询、趋势比较和Top榜单问题")},
  'testing'
)
ON DUPLICATE KEY UPDATE
  skill_name = VALUES(skill_name),
  scenario = VALUES(scenario),
  job_to_be_done = VALUES(job_to_be_done),
  status = VALUES(status),
  updated_at = CURRENT_TIMESTAMP(3);

SET @skill_id = (
  SELECT id
  FROM ai_skill_defs
  WHERE skill_code = ${sqlValue(skillCode)}
  LIMIT 1
);

INSERT INTO ai_skill_versions (
  skill_id,
  version_no,
  model_name,
  prompt_template,
  input_schema_json,
  output_schema_json,
  workflow_json,
  tool_whitelist_json,
  hook_policy_json,
  eval_spec_json,
  change_note,
  status
)
SELECT
  @skill_id,
  1,
  ${sqlValue("gpt-5")},
  ${sqlValue(promptTemplate)},
  CAST(${sqlValue(JSON.stringify(inputSchema))} AS JSON),
  CAST(${sqlValue(JSON.stringify(outputSchema))} AS JSON),
  CAST(${sqlValue(JSON.stringify(workflow))} AS JSON),
  CAST(${sqlValue(JSON.stringify(toolWhitelist))} AS JSON),
  CAST(${sqlValue(JSON.stringify(hookPolicy))} AS JSON),
  CAST(${sqlValue(JSON.stringify(evalSpec))} AS JSON),
  ${sqlValue("由支小蒸馏数据自动生成首版评测规范")},
  'testing'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM ai_skill_versions
  WHERE skill_id = @skill_id
    AND version_no = 1
);

INSERT INTO ai_eval_cases (
  case_code,
  skill_id,
  title,
  case_type,
  priority_level,
  input_payload_json,
  expected_output_json,
  score_rule_json,
  tags_json,
  status
) VALUES
${insertCasesSql}
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  case_type = VALUES(case_type),
  priority_level = VALUES(priority_level),
  input_payload_json = VALUES(input_payload_json),
  expected_output_json = VALUES(expected_output_json),
  score_rule_json = VALUES(score_rule_json),
  tags_json = VALUES(tags_json),
  status = VALUES(status),
  updated_at = CURRENT_TIMESTAMP(3);`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const inputPath =
    args.input || path.join(trainingDir, "zhixiao_skill_core_fact_values.jsonl");
  const shortlistPath =
    args.shortlist || path.join(trainingDir, "zhixiao_core_metric_shortlist.json");
  const skillCode = args["skill-code"] || "zhixiao_metric_analyst";
  const skillName = args["skill-name"] || "支小业务数据分析 Skill";

  const shortlistPayload = readJson(shortlistPath);
  const targetMetricSet = buildMetricTargetSet(shortlistPayload);

  const pointPositiveRows = [];
  const pointZeroRows = [];
  const pointUniq = new Set();
  const pointMetricCount = new Map();
  const compareMap = new Map();
  const rankingMap = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    const row = parseResolvedRow(line);
    if (!targetMetricSet.has(row.metric_code)) {
      continue;
    }
    if (!Number.isFinite(row.metric_value) || row.resolution_confidence < CONFIDENCE_THRESHOLD) {
      continue;
    }

    const entityScope = getEntityScope(row);
    const dateText = formatDate(row);
    const metricCountKey = row.metric_code;

    if (pointPositiveRows.length + pointZeroRows.length < POINT_CASE_LIMIT * 6) {
      const pointKey = [
        row.metric_code,
        row.granularity,
        entityScope ? entityScope.type : "global",
        row.subject_name || "",
        row.product_name || "",
        row.media_name || "",
        row.experiment_key || "",
        dateText,
      ].join("::");
      const pointMetricUsed = pointMetricCount.get(metricCountKey) || 0;
      if (!pointUniq.has(pointKey) && pointMetricUsed < 12) {
        pointUniq.add(pointKey);
        pointMetricCount.set(metricCountKey, pointMetricUsed + 1);
        if (Number(row.metric_value) === 0) {
          pointZeroRows.push(row);
        } else {
          pointPositiveRows.push(row);
        }
      }
    }

    if (entityScope && row.granularity === "day") {
      const compareKey = [row.metric_code, entityScope.type, entityScope.key].join("::");
      if (!compareMap.has(compareKey)) {
        compareMap.set(compareKey, {
          entity_scope: entityScope,
          metric_code: row.metric_code,
          metric_name: row.metric_name,
          first: row,
          last: row,
        });
      } else {
        const entry = compareMap.get(compareKey);
        if (row.window_start < entry.first.window_start) {
          entry.first = row;
        }
        if (row.window_start > entry.last.window_start) {
          entry.last = row;
        }
      }
    }

    if (!row.experiment_key && entityScope && ["product", "media", "subject"].includes(entityScope.type)) {
      const rankingKey = [dateText, row.metric_code, entityScope.type].join("::");
      if (!rankingMap.has(rankingKey)) {
        rankingMap.set(rankingKey, {
          metric_code: row.metric_code,
          metric_name: row.metric_name,
          date_text: dateText,
          dimension_type: entityScope.type,
          dimension_type_cn: entityScope.type_cn,
          top_name: entityScope.name,
          top_key: entityScope.key,
          top_value: row.metric_value,
          row,
          candidate_count: 1,
        });
      } else {
        const entry = rankingMap.get(rankingKey);
        entry.candidate_count += 1;
        if (row.metric_value > entry.top_value) {
          entry.top_name = entityScope.name;
          entry.top_key = entityScope.key;
          entry.top_value = row.metric_value;
          entry.row = row;
        }
      }
    }
  }

  pointPositiveRows.sort((left, right) => {
    return (
      right.resolution_confidence - left.resolution_confidence ||
      Math.abs(right.metric_value) - Math.abs(left.metric_value) ||
      left.metric_code.localeCompare(right.metric_code, "zh-CN")
    );
  });
  pointZeroRows.sort((left, right) => {
    return (
      right.resolution_confidence - left.resolution_confidence ||
      left.metric_code.localeCompare(right.metric_code, "zh-CN") ||
      left.window_start.localeCompare(right.window_start, "zh-CN")
    );
  });

  const selectedPointRows = [];
  selectedPointRows.push(...pointPositiveRows.slice(0, POINT_CASE_LIMIT));
  if (selectedPointRows.length < POINT_CASE_LIMIT) {
    const remaining = POINT_CASE_LIMIT - selectedPointRows.length;
    selectedPointRows.push(...pointZeroRows.slice(0, remaining));
  }

  const pointCases = selectedPointRows
    .slice(0, POINT_CASE_LIMIT)
    .map((row, index) => buildPointCase(row, index + 1));

  const compareCases = Array.from(compareMap.values())
    .filter((entry) => entry.first.window_start !== entry.last.window_start)
    .sort((left, right) => {
      return (
        right.last.window_start.localeCompare(left.last.window_start, "zh-CN") ||
        left.metric_code.localeCompare(right.metric_code, "zh-CN")
      );
    })
    .slice(0, COMPARE_CASE_LIMIT)
    .map((entry, index) =>
      buildCompareCase(
        entry.metric_name,
        entry.metric_code,
        entry.entity_scope,
        entry.first,
        entry.last,
        index + 1
      )
    );

  const rankingCases = Array.from(rankingMap.values())
    .filter((entry) => entry.candidate_count >= 3)
    .sort((left, right) => {
      return (
        right.top_value - left.top_value ||
        right.candidate_count - left.candidate_count ||
        left.metric_code.localeCompare(right.metric_code, "zh-CN")
      );
    })
    .slice(0, RANKING_CASE_LIMIT)
    .map((entry, index) => buildRankingCase(entry, index + 1));

  const cases = [...pointCases, ...compareCases, ...rankingCases];

  const casesJsonPath = path.join(trainingDir, "zhixiao_eval_cases.json");
  const seedSqlPath = path.join(trainingDir, "zhixiao_eval_seed.sql");
  const manifestPath = path.join(trainingDir, "zhixiao_eval_manifest.json");

  writeJson(casesJsonPath, {
    meta: {
      generated_at: new Date().toISOString(),
      skill_code: skillCode,
      total_case_count: cases.length,
      point_case_count: pointCases.length,
      compare_case_count: compareCases.length,
      ranking_case_count: rankingCases.length,
      confidence_threshold: CONFIDENCE_THRESHOLD,
    },
    cases,
  });

  fs.writeFileSync(seedSqlPath, createSkillSeedSql(skillCode, skillName, cases), "utf8");

  writeJson(manifestPath, {
    meta: {
      generated_at: new Date().toISOString(),
      input_path: inputPath,
      shortlist_path: shortlistPath,
      skill_code: skillCode,
      skill_name: skillName,
      total_case_count: cases.length,
      point_case_count: pointCases.length,
      compare_case_count: compareCases.length,
      ranking_case_count: rankingCases.length,
      confidence_threshold: CONFIDENCE_THRESHOLD,
    },
    target_metrics: Array.from(targetMetricSet).sort((left, right) => left.localeCompare(right, "zh-CN")),
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        total_case_count: cases.length,
        point_case_count: pointCases.length,
        compare_case_count: compareCases.length,
        ranking_case_count: rankingCases.length,
        seed_sql_path: seedSqlPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
