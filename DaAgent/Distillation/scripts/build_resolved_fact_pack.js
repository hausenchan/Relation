#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const Database = require("better-sqlite3");

const REPORT_PRIORITY = {
  "income::01": 1000,
  "income::02": 1000,
  "income::03": 998,
  "income::04": 996,
  "runtime::06": 985,
  "launch::17": 980,
  "app::16": 975,
  "media::25": 972,
  "runtime::08": 968,
  "media::29": 964,
  "adv::22": 960,
  "media::28": 956,
  "app::20": 952,
  "app::17": 948,
  "adv::24": 944,
  "media::26": 940,
  "app::18": 936,
  "app::21": 932,
  "adv::23": 928,
  "launch::18": 924,
  "app::19": 920,
  "runtime::07": 910,
  "runtime::09": 908,
  "media::27": 906,
  "launch::19": 904,
  "launch::20": 902,
};

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeNullable(value) {
  const text = normalizeText(value);
  return text || null;
}

function sanitizeForTsv(value) {
  return String(value == null ? "" : value)
    .replace(/\t/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
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

function numbersEqual(left, right, epsilon = 1e-9) {
  return Math.abs(Number(left) - Number(right)) <= epsilon;
}

function stableObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableObject(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right, "zh-CN"))
    .reduce((accumulator, key) => {
      accumulator[key] = stableObject(value[key]);
      return accumulator;
    }, {});
}

function buildStableJson(value) {
  return JSON.stringify(stableObject(value || {}));
}

function hashKey(parts) {
  return crypto.createHash("sha1").update(parts.join("\u001f")).digest("hex");
}

function buildMetricLookup(mappingPayload) {
  const metricLookup = new Map();
  for (const metric of mappingPayload.canonical_metrics || []) {
    const preferredUnit = Array.isArray(metric.units) && metric.units.length > 0 ? metric.units[0] : null;
    const preferredCurrency =
      Array.isArray(metric.currencies) && metric.currencies.length > 0 ? metric.currencies[0] : null;
    for (const sourceMetric of metric.source_metrics || []) {
      metricLookup.set(sourceMetric.metric_code, {
        canonical_metric_code: metric.canonical_metric_code,
        preferred_metric_name: metric.preferred_metric_name || sourceMetric.metric_name,
        category: metric.category || null,
        unit: sourceMetric.unit || preferredUnit || null,
        currency_code: sourceMetric.currency_code || preferredCurrency || null,
      });
    }
  }
  return metricLookup;
}

function buildCoreMetricSet(shortlistPayload) {
  return new Set((shortlistPayload.core_metrics || []).map((item) => item.canonical_metric_code));
}

function buildCanonicalMetricInfo(rawRow, metricLookup) {
  const mapped = metricLookup.get(rawRow.metric_code);
  if (mapped) {
    return mapped;
  }
  const fallbackCode =
    normalizeNullable(rawRow.extra_dimensions_json?.canonical_metric_code) ||
    normalizeNullable(rawRow.metric_name) ||
    normalizeNullable(rawRow.metric_code) ||
    "unknown_metric";
  return {
    canonical_metric_code: fallbackCode,
    preferred_metric_name: normalizeNullable(rawRow.metric_name) || fallbackCode,
    category: null,
    unit: normalizeNullable(rawRow.unit),
    currency_code: normalizeNullable(rawRow.currency_code),
  };
}

function buildGroupHash(rawRow, canonicalMetricCode) {
  return hashKey([
    normalizeNullable(rawRow.granularity) || "",
    normalizeNullable(rawRow.window_start) || "",
    normalizeNullable(rawRow.window_end) || "",
    normalizeNullable(rawRow.business_side) || "",
    normalizeNullable(rawRow.budget_side) || "",
    normalizeNullable(rawRow.business_line) || "",
    normalizeNullable(rawRow.subject_key) || "",
    normalizeNullable(rawRow.product_key) || "",
    normalizeNullable(rawRow.media_key) || "",
    normalizeNullable(rawRow.channel_key) || "",
    normalizeNullable(rawRow.experiment_key) || "",
    canonicalMetricCode,
  ]);
}

function getDimensionSnapshot(rawRow) {
  return rawRow.extra_dimensions_json?.dimension_snapshot || {};
}

function getDimensionSize(rawRow) {
  return Object.keys(getDimensionSnapshot(rawRow)).filter((key) => normalizeText(key)).length;
}

function isGenericSplitDuplicate(rawRow) {
  const originalMetricField = normalizeText(rawRow.extra_dimensions_json?.original_metric_field);
  if (rawRow.quality_flag !== "split" || !originalMetricField.includes("|")) {
    return false;
  }
  const parts = originalMetricField.split("|").map((part) => normalizeText(part)).filter(Boolean);
  if (parts.length < 2) {
    return false;
  }
  const metricName = normalizeText(rawRow.metric_name);
  return metricName === parts[parts.length - 1];
}

function getReportKey(rawRow) {
  const moduleName = normalizeNullable(rawRow.extra_dimensions_json?.report_module) || "unknown";
  const reportSeq = normalizeNullable(rawRow.extra_dimensions_json?.report_seq) || "00";
  return `${moduleName}::${reportSeq}`;
}

function getReportPriority(rawRow) {
  const reportKey = getReportKey(rawRow);
  const moduleName = normalizeNullable(rawRow.extra_dimensions_json?.report_module) || "unknown";
  let priority = REPORT_PRIORITY[reportKey] || 800;

  if (rawRow.experiment_key) {
    if (moduleName === "adv") {
      priority += 30;
    } else if (moduleName === "app") {
      priority += 8;
    }
  }

  if (rawRow.media_key && rawRow.product_key) {
    if (reportKey === "media::28") {
      priority += 28;
    } else if (reportKey === "media::29") {
      priority += 20;
    } else if (reportKey === "app::21") {
      priority += 10;
    }
  } else if (rawRow.media_key && !rawRow.product_key) {
    if (reportKey === "media::25") {
      priority += 26;
    } else if (reportKey === "media::26") {
      priority += 14;
    }
  } else if (rawRow.product_key && !rawRow.media_key && !rawRow.experiment_key) {
    if (reportKey === "app::16") {
      priority += 24;
    } else if (reportKey === "app::17") {
      priority += 12;
    } else if (moduleName === "income") {
      priority += 8;
    }
  }

  if (!rawRow.product_key && !rawRow.media_key && !rawRow.experiment_key) {
    if (moduleName === "income") {
      priority += 12;
    } else if (reportKey === "runtime::06") {
      priority += 8;
    }
  }

  return priority;
}

function sqlValue(value) {
  if (value == null) {
    return "NULL";
  }
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function tsvHeader() {
  return [
    "source_record_key",
    "granularity",
    "window_start",
    "window_end",
    "business_side",
    "budget_side",
    "business_line",
    "subject_key",
    "subject_name",
    "product_key",
    "product_name",
    "media_key",
    "media_name",
    "channel_key",
    "channel_name",
    "experiment_key",
    "metric_code",
    "metric_name",
    "metric_value",
    "unit",
    "currency_code",
    "sample_count",
    "extra_dimensions_json",
    "quality_flag",
  ].join("\t");
}

function factRowToTsv(row) {
  return [
    row.source_record_key,
    row.granularity,
    row.window_start,
    row.window_end,
    row.business_side,
    row.budget_side,
    row.business_line,
    row.subject_key,
    row.subject_name,
    row.product_key,
    row.product_name,
    row.media_key,
    row.media_name,
    row.channel_key,
    row.channel_name,
    row.experiment_key,
    row.metric_code,
    row.metric_name,
    row.metric_value,
    row.unit,
    row.currency_code,
    row.sample_count,
    JSON.stringify(row.extra_dimensions_json),
    row.quality_flag,
  ]
    .map(sanitizeForTsv)
    .join("\t");
}

function buildLoadSql(tsvPath) {
  const escapedPath = tsvPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `USE relation_ai_distill;

INSERT INTO ai_data_sources (
  source_code,
  source_name,
  source_type,
  source_origin,
  access_method,
  endpoint,
  db_name,
  sync_frequency,
  status,
  reliability_score,
  freshness_score
) VALUES (
  'midmax_zhixiao_resolved_facts',
  'Mid-Max 支小解析后事实',
  'selecteddb',
  'internal',
  'file',
  'https://mid-max.midongtech.com',
  'selectedDB',
  'manual',
  'active',
  92.00,
  78.00
)
ON DUPLICATE KEY UPDATE
  source_name = VALUES(source_name),
  source_type = VALUES(source_type),
  source_origin = VALUES(source_origin),
  access_method = VALUES(access_method),
  endpoint = VALUES(endpoint),
  db_name = VALUES(db_name),
  sync_frequency = VALUES(sync_frequency),
  status = VALUES(status),
  reliability_score = VALUES(reliability_score),
  freshness_score = VALUES(freshness_score);

DROP TEMPORARY TABLE IF EXISTS ai_fact_metric_stage;
CREATE TEMPORARY TABLE ai_fact_metric_stage (
  source_record_key VARCHAR(255),
  granularity VARCHAR(16),
  window_start DATETIME,
  window_end DATETIME,
  business_side VARCHAR(32),
  budget_side VARCHAR(32),
  business_line VARCHAR(64),
  subject_key VARCHAR(128),
  subject_name VARCHAR(128),
  product_key VARCHAR(128),
  product_name VARCHAR(128),
  media_key VARCHAR(128),
  media_name VARCHAR(128),
  channel_key VARCHAR(128),
  channel_name VARCHAR(128),
  experiment_key VARCHAR(128),
  metric_code VARCHAR(64),
  metric_name VARCHAR(128),
  metric_value DECIMAL(20,6),
  unit VARCHAR(32),
  currency_code VARCHAR(16),
  sample_count BIGINT,
  extra_dimensions_json LONGTEXT,
  quality_flag VARCHAR(32)
);

LOAD DATA LOCAL INFILE '${escapedPath}'
INTO TABLE ai_fact_metric_stage
FIELDS TERMINATED BY '\\t'
LINES TERMINATED BY '\\n'
IGNORE 1 LINES
(
  source_record_key,
  granularity,
  window_start,
  window_end,
  business_side,
  budget_side,
  business_line,
  subject_key,
  subject_name,
  product_key,
  product_name,
  media_key,
  media_name,
  channel_key,
  channel_name,
  experiment_key,
  metric_code,
  metric_name,
  metric_value,
  unit,
  currency_code,
  sample_count,
  extra_dimensions_json,
  quality_flag
);

SET @source_id = (
  SELECT id
  FROM ai_data_sources
  WHERE source_code = 'midmax_zhixiao_resolved_facts'
  LIMIT 1
);

INSERT INTO ai_fact_metric_values (
  source_id,
  raw_record_id,
  granularity,
  window_start,
  window_end,
  business_side,
  budget_side,
  business_line,
  subject_key,
  subject_name,
  product_key,
  product_name,
  media_key,
  media_name,
  channel_key,
  channel_name,
  experiment_key,
  metric_code,
  metric_name,
  metric_value,
  unit,
  currency_code,
  sample_count,
  extra_dimensions_json,
  quality_flag
)
SELECT
  @source_id,
  NULL,
  granularity,
  window_start,
  window_end,
  NULLIF(business_side, ''),
  NULLIF(budget_side, ''),
  NULLIF(business_line, ''),
  NULLIF(subject_key, ''),
  NULLIF(subject_name, ''),
  NULLIF(product_key, ''),
  NULLIF(product_name, ''),
  NULLIF(media_key, ''),
  NULLIF(media_name, ''),
  NULLIF(channel_key, ''),
  NULLIF(channel_name, ''),
  NULLIF(experiment_key, ''),
  metric_code,
  NULLIF(metric_name, ''),
  metric_value,
  NULLIF(unit, ''),
  NULLIF(currency_code, ''),
  sample_count,
  NULLIF(extra_dimensions_json, ''),
  NULLIF(quality_flag, '')
FROM ai_fact_metric_stage
ON DUPLICATE KEY UPDATE
  metric_name = VALUES(metric_name),
  metric_value = VALUES(metric_value),
  unit = VALUES(unit),
  currency_code = VALUES(currency_code),
  sample_count = VALUES(sample_count),
  extra_dimensions_json = VALUES(extra_dimensions_json),
  quality_flag = VALUES(quality_flag),
  updated_at = CURRENT_TIMESTAMP(3);`;
}

function chooseBestRow(rows) {
  return rows
    .slice()
    .sort((left, right) => {
      if (left.is_generic_split_duplicate !== right.is_generic_split_duplicate) {
        return left.is_generic_split_duplicate - right.is_generic_split_duplicate;
      }
      if (left.is_split !== right.is_split) {
        return left.is_split - right.is_split;
      }
      if (left.dimension_size !== right.dimension_size) {
        return left.dimension_size - right.dimension_size;
      }
      if (left.row_index !== right.row_index) {
        return left.row_index - right.row_index;
      }
      return String(left.source_record_key).localeCompare(String(right.source_record_key), "zh-CN");
    })[0];
}

function valuesAllSame(rows) {
  if (rows.length <= 1) {
    return true;
  }
  const firstValue = Number(rows[0].metric_value);
  return rows.every((row) => numbersEqual(firstValue, row.metric_value));
}

function buildValueRange(rows) {
  const values = rows.map((row) => Number(row.metric_value)).filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return { min: null, max: null, sum: null };
  }
  return {
    min: normalizeNumber(Math.min(...values)),
    max: normalizeNumber(Math.max(...values)),
    sum: normalizeNumber(values.reduce((sum, value) => sum + value, 0)),
  };
}

function resolveWithinReport(rows) {
  const totalNonGenericRows = rows.filter((row) => row.dimension_size === 0 && !row.is_generic_split_duplicate);
  const totalRows = rows.filter((row) => row.dimension_size === 0);
  const nonGenericRows = rows.filter((row) => !row.is_generic_split_duplicate);
  const effectiveRows = nonGenericRows.length > 0 ? nonGenericRows : rows;
  const valueRange = buildValueRange(effectiveRows);
  const base = rows[0];
  const uniqueDimensionSignatures = new Set(
    rows.map((row) => buildStableJson(row.dimension_snapshot || {}))
  ).size;

  if (totalNonGenericRows.length > 0) {
    const selected = chooseBestRow(totalNonGenericRows);
    return {
      report_key: base.report_key,
      report_name_cn: base.report_name_cn,
      report_priority: base.report_priority,
      source_record_key: selected.source_record_key,
      metric_value: normalizeNumber(selected.metric_value),
      unit: selected.unit,
      currency_code: selected.currency_code,
      sample_count: selected.sample_count,
      selected_row: selected,
      row_count: rows.length,
      effective_row_count: effectiveRows.length,
      dimension_signature_count: uniqueDimensionSignatures,
      has_total: true,
      has_non_generic_total: true,
      strategy: totalNonGenericRows.length === 1 ? "report_total" : "report_total_deduped",
      confidence: totalNonGenericRows.length === 1 ? 0.94 : 0.96,
      value_range: valueRange,
      source_metric_codes: Array.from(new Set(rows.map((row) => row.raw_metric_code))).sort((left, right) =>
        left.localeCompare(right, "zh-CN")
      ),
    };
  }

  if (totalRows.length > 0) {
    const selected = chooseBestRow(totalRows);
    return {
      report_key: base.report_key,
      report_name_cn: base.report_name_cn,
      report_priority: base.report_priority,
      source_record_key: selected.source_record_key,
      metric_value: normalizeNumber(selected.metric_value),
      unit: selected.unit,
      currency_code: selected.currency_code,
      sample_count: selected.sample_count,
      selected_row: selected,
      row_count: rows.length,
      effective_row_count: effectiveRows.length,
      dimension_signature_count: uniqueDimensionSignatures,
      has_total: true,
      has_non_generic_total: false,
      strategy: "report_total_split_fallback",
      confidence: 0.78,
      value_range: valueRange,
      source_metric_codes: Array.from(new Set(rows.map((row) => row.raw_metric_code))).sort((left, right) =>
        left.localeCompare(right, "zh-CN")
      ),
    };
  }

  if (valuesAllSame(effectiveRows)) {
    const selected = chooseBestRow(effectiveRows);
    return {
      report_key: base.report_key,
      report_name_cn: base.report_name_cn,
      report_priority: base.report_priority,
      source_record_key: selected.source_record_key,
      metric_value: normalizeNumber(selected.metric_value),
      unit: selected.unit,
      currency_code: selected.currency_code,
      sample_count: selected.sample_count,
      selected_row: selected,
      row_count: rows.length,
      effective_row_count: effectiveRows.length,
      dimension_signature_count: uniqueDimensionSignatures,
      has_total: false,
      has_non_generic_total: false,
      strategy: effectiveRows.length === 1 ? "report_single_detail" : "report_detail_deduped",
      confidence: effectiveRows.length === 1 ? 0.9 : 0.93,
      value_range: valueRange,
      source_metric_codes: Array.from(new Set(rows.map((row) => row.raw_metric_code))).sort((left, right) =>
        left.localeCompare(right, "zh-CN")
      ),
    };
  }

  const values = effectiveRows.map((row) => Number(row.metric_value)).filter((value) => Number.isFinite(value));
  const percentMetric = base.unit === "percent";
  const metricValue = percentMetric
    ? values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
    : values.reduce((sum, value) => sum + value, 0);
  const selected = chooseBestRow(effectiveRows);

  return {
    report_key: base.report_key,
    report_name_cn: base.report_name_cn,
    report_priority: base.report_priority,
    source_record_key: selected.source_record_key,
    metric_value: normalizeNumber(metricValue),
    unit: selected.unit,
    currency_code: selected.currency_code,
    sample_count: selected.sample_count,
    selected_row: selected,
    row_count: rows.length,
    effective_row_count: effectiveRows.length,
    dimension_signature_count: uniqueDimensionSignatures,
    has_total: false,
    has_non_generic_total: false,
    strategy: percentMetric ? "report_detail_avg_percent" : "report_detail_sum",
    confidence: percentMetric ? 0.76 : 0.8,
    value_range: valueRange,
    source_metric_codes: Array.from(new Set(rows.map((row) => row.raw_metric_code))).sort((left, right) =>
      left.localeCompare(right, "zh-CN")
    ),
  };
}

function compareReportCandidates(left, right) {
  if (left.has_non_generic_total !== right.has_non_generic_total) {
    return left.has_non_generic_total ? -1 : 1;
  }
  if (left.has_total !== right.has_total) {
    return left.has_total ? -1 : 1;
  }
  if (left.report_priority !== right.report_priority) {
    return right.report_priority - left.report_priority;
  }
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  if (left.effective_row_count !== right.effective_row_count) {
    return left.effective_row_count - right.effective_row_count;
  }
  return left.report_key.localeCompare(right.report_key, "zh-CN");
}

function resolveAcrossReports(groupRows) {
  const reports = new Map();
  for (const row of groupRows) {
    if (!reports.has(row.report_key)) {
      reports.set(row.report_key, []);
    }
    reports.get(row.report_key).push(row);
  }

  const reportCandidates = Array.from(reports.values()).map((rows) => resolveWithinReport(rows));
  reportCandidates.sort(compareReportCandidates);
  const selected = reportCandidates[0];

  let strategy = selected.strategy;
  let confidence = selected.confidence;
  if (reportCandidates.length > 1) {
    if (selected.has_non_generic_total) {
      strategy = "cross_report_preferred_total";
      confidence = Math.min(0.97, selected.confidence + 0.01);
    } else if (selected.has_total) {
      strategy = "cross_report_split_total_fallback";
      confidence = Math.min(0.83, selected.confidence);
    } else {
      strategy = "cross_report_preferred_report";
      confidence = Math.min(0.84, selected.confidence);
    }
  }

  return {
    selected,
    reportCandidates,
    strategy,
    confidence,
  };
}

function buildResolvedFactRow(groupRows, resolved) {
  const selected = resolved.selected;
  const selectedRow = selected.selected_row;
  const sourceReportNames = Array.from(new Set(groupRows.map((row) => row.report_name_cn))).sort((left, right) =>
    left.localeCompare(right, "zh-CN")
  );
  const sourceMetricCodes = Array.from(new Set(groupRows.map((row) => row.raw_metric_code))).sort((left, right) =>
    left.localeCompare(right, "zh-CN")
  );
  const selectedValueRange = selected.value_range || { min: null, max: null, sum: null };

  const extraDimensions = {
    resolved_fact: true,
    metric_category: selectedRow.metric_category,
    resolution_strategy: resolved.strategy,
    resolution_confidence: normalizeNumber(resolved.confidence, 4),
    candidate_row_count: groupRows.length,
    candidate_report_count: resolved.reportCandidates.length,
    selected_report_key: selected.report_key,
    selected_report_name: selected.report_name_cn,
    selected_report_priority: selected.report_priority,
    selected_report_row_count: selected.row_count,
    selected_report_effective_row_count: selected.effective_row_count,
    selected_report_dimension_signature_count: selected.dimension_signature_count,
    selected_report_has_total: selected.has_total,
    selected_report_has_non_generic_total: selected.has_non_generic_total,
    value_min: selectedValueRange.min,
    value_max: selectedValueRange.max,
    value_sum: selectedValueRange.sum,
    source_metric_codes: selected.source_metric_codes,
    source_metric_codes_all: sourceMetricCodes,
    source_report_names: sourceReportNames,
    discarded_reports: resolved.reportCandidates.slice(1, 6).map((item) => ({
      report_key: item.report_key,
      report_name_cn: item.report_name_cn,
      report_priority: item.report_priority,
      strategy: item.strategy,
      metric_value: item.metric_value,
      confidence: normalizeNumber(item.confidence, 4),
    })),
  };

  let qualityFlag = "normal";
  if (resolved.reportCandidates.length > 1) {
    qualityFlag = selected.has_total ? "preferred_report" : "report_fallback";
  } else if (selected.strategy.includes("deduped")) {
    qualityFlag = "deduped";
  } else if (selected.strategy.includes("sum") || selected.strategy.includes("avg")) {
    qualityFlag = "aggregated";
  }

  return {
    source_record_key: `resolved:${groupRows[0].group_hash}`,
    granularity: selectedRow.granularity,
    window_start: selectedRow.window_start,
    window_end: selectedRow.window_end,
    business_side: selectedRow.business_side,
    budget_side: selectedRow.budget_side,
    business_line: selectedRow.business_line,
    subject_key: selectedRow.subject_key,
    subject_name: selectedRow.subject_name,
    product_key: selectedRow.product_key,
    product_name: selectedRow.product_name,
    media_key: selectedRow.media_key,
    media_name: selectedRow.media_name,
    channel_key: selectedRow.channel_key,
    channel_name: selectedRow.channel_name,
    experiment_key: selectedRow.experiment_key,
    metric_code: selectedRow.canonical_metric_code,
    metric_name: selectedRow.metric_name,
    metric_value: normalizeNumber(selected.metric_value),
    unit: selected.unit,
    currency_code: selected.currency_code,
    sample_count: selected.sample_count,
    extra_dimensions_json: extraDimensions,
    quality_flag: qualityFlag,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const factsPath =
    args.input || path.join(trainingDir, "zhixiao_fact_metric_values.jsonl");
  const mappingPath =
    args.mapping || path.join(trainingDir, "zhixiao_canonical_metric_mapping.json");
  const shortlistPath =
    args.shortlist || path.join(trainingDir, "zhixiao_core_metric_shortlist.json");
  const dbPath = args["db-path"] || path.join(trainingDir, "zhixiao_resolved_fact_pack.sqlite");
  const batchSize = Number(args["batch-size"] || 2000);

  ensureDir(trainingDir);
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const metricLookup = buildMetricLookup(readJson(mappingPath));
  const coreMetricSet = buildCoreMetricSet(readJson(shortlistPath));
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -200000");

  db.exec(`
    CREATE TABLE fact_candidates (
      group_hash TEXT NOT NULL,
      source_record_key TEXT NOT NULL,
      granularity TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      business_side TEXT,
      budget_side TEXT,
      business_line TEXT,
      subject_key TEXT,
      subject_name TEXT,
      product_key TEXT,
      product_name TEXT,
      media_key TEXT,
      media_name TEXT,
      channel_key TEXT,
      channel_name TEXT,
      experiment_key TEXT,
      canonical_metric_code TEXT NOT NULL,
      metric_name TEXT,
      metric_category TEXT,
      metric_value REAL NOT NULL,
      unit TEXT,
      currency_code TEXT,
      sample_count REAL,
      report_key TEXT NOT NULL,
      report_name_cn TEXT,
      report_module TEXT,
      report_seq TEXT,
      report_priority INTEGER NOT NULL,
      row_index INTEGER,
      is_split INTEGER NOT NULL,
      is_generic_split_duplicate INTEGER NOT NULL,
      dimension_size INTEGER NOT NULL,
      dimension_snapshot_json TEXT NOT NULL,
      original_metric_field TEXT,
      raw_metric_code TEXT NOT NULL,
      raw_quality_flag TEXT
    );
  `);

  const insertCandidate = db.prepare(`
    INSERT INTO fact_candidates (
      group_hash,
      source_record_key,
      granularity,
      window_start,
      window_end,
      business_side,
      budget_side,
      business_line,
      subject_key,
      subject_name,
      product_key,
      product_name,
      media_key,
      media_name,
      channel_key,
      channel_name,
      experiment_key,
      canonical_metric_code,
      metric_name,
      metric_category,
      metric_value,
      unit,
      currency_code,
      sample_count,
      report_key,
      report_name_cn,
      report_module,
      report_seq,
      report_priority,
      row_index,
      is_split,
      is_generic_split_duplicate,
      dimension_size,
      dimension_snapshot_json,
      original_metric_field,
      raw_metric_code,
      raw_quality_flag
    ) VALUES (
      @group_hash,
      @source_record_key,
      @granularity,
      @window_start,
      @window_end,
      @business_side,
      @budget_side,
      @business_line,
      @subject_key,
      @subject_name,
      @product_key,
      @product_name,
      @media_key,
      @media_name,
      @channel_key,
      @channel_name,
      @experiment_key,
      @canonical_metric_code,
      @metric_name,
      @metric_category,
      @metric_value,
      @unit,
      @currency_code,
      @sample_count,
      @report_key,
      @report_name_cn,
      @report_module,
      @report_seq,
      @report_priority,
      @row_index,
      @is_split,
      @is_generic_split_duplicate,
      @dimension_size,
      @dimension_snapshot_json,
      @original_metric_field,
      @raw_metric_code,
      @raw_quality_flag
    )
  `);

  const batchInsert = db.transaction((rows) => {
    for (const row of rows) {
      insertCandidate.run(row);
    }
  });

  const rl = readline.createInterface({
    input: fs.createReadStream(factsPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let processedCount = 0;
  const batches = [];

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    const rawRow = JSON.parse(line);
    if (!Number.isFinite(Number(rawRow.metric_value))) {
      continue;
    }
    const metricInfo = buildCanonicalMetricInfo(rawRow, metricLookup);
    const groupHash = buildGroupHash(rawRow, metricInfo.canonical_metric_code);
    const dimensionSnapshot = getDimensionSnapshot(rawRow);
    const reportKey = getReportKey(rawRow);
    const reportModule = normalizeNullable(rawRow.extra_dimensions_json?.report_module);
    const reportSeq = normalizeNullable(rawRow.extra_dimensions_json?.report_seq);

    batches.push({
      group_hash: groupHash,
      source_record_key: normalizeNullable(rawRow.source_record_key),
      granularity: normalizeNullable(rawRow.granularity),
      window_start: normalizeNullable(rawRow.window_start),
      window_end: normalizeNullable(rawRow.window_end),
      business_side: normalizeNullable(rawRow.business_side),
      budget_side: normalizeNullable(rawRow.budget_side),
      business_line: normalizeNullable(rawRow.business_line),
      subject_key: normalizeNullable(rawRow.subject_key),
      subject_name: normalizeNullable(rawRow.subject_name),
      product_key: normalizeNullable(rawRow.product_key),
      product_name: normalizeNullable(rawRow.product_name),
      media_key: normalizeNullable(rawRow.media_key),
      media_name: normalizeNullable(rawRow.media_name),
      channel_key: normalizeNullable(rawRow.channel_key),
      channel_name: normalizeNullable(rawRow.channel_name),
      experiment_key: normalizeNullable(rawRow.experiment_key),
      canonical_metric_code: metricInfo.canonical_metric_code,
      metric_name: metricInfo.preferred_metric_name,
      metric_category: metricInfo.category,
      metric_value: Number(rawRow.metric_value),
      unit: metricInfo.unit || normalizeNullable(rawRow.unit),
      currency_code: metricInfo.currency_code || normalizeNullable(rawRow.currency_code),
      sample_count: rawRow.sample_count == null ? null : Number(rawRow.sample_count),
      report_key: reportKey,
      report_name_cn: normalizeNullable(rawRow.extra_dimensions_json?.report_name_cn),
      report_module: reportModule,
      report_seq: reportSeq,
      report_priority: getReportPriority(rawRow),
      row_index: Number(rawRow.extra_dimensions_json?.row_index || 0),
      is_split: rawRow.quality_flag === "split" ? 1 : 0,
      is_generic_split_duplicate: isGenericSplitDuplicate(rawRow) ? 1 : 0,
      dimension_size: getDimensionSize(rawRow),
      dimension_snapshot_json: buildStableJson(dimensionSnapshot),
      original_metric_field: normalizeNullable(rawRow.extra_dimensions_json?.original_metric_field),
      raw_metric_code: normalizeNullable(rawRow.metric_code),
      raw_quality_flag: normalizeNullable(rawRow.quality_flag),
    });

    processedCount += 1;
    if (batches.length >= batchSize) {
      batchInsert(batches.splice(0, batches.length));
    }
  }

  if (batches.length > 0) {
    batchInsert(batches);
  }

  db.exec(`
    CREATE INDEX idx_fact_candidates_group_hash ON fact_candidates (group_hash);
    CREATE INDEX idx_fact_candidates_metric_group ON fact_candidates (canonical_metric_code, group_hash);
  `);

  const outputResolvedTsv = path.join(trainingDir, "zhixiao_resolved_fact_values.tsv");
  const outputResolvedJsonl = path.join(trainingDir, "zhixiao_resolved_fact_values.jsonl");
  const outputResolvedManifest = path.join(trainingDir, "zhixiao_resolved_fact_values_manifest.json");
  const outputResolvedSample = path.join(trainingDir, "zhixiao_resolved_fact_values_sample.json");
  const outputResolvedLoadSql = path.join(trainingDir, "zhixiao_resolved_fact_load.sql");
  const outputCoreTsv = path.join(trainingDir, "zhixiao_skill_core_fact_values.tsv");
  const outputCoreJsonl = path.join(trainingDir, "zhixiao_skill_core_fact_values.jsonl");
  const outputCoreManifest = path.join(trainingDir, "zhixiao_skill_core_fact_values_manifest.json");

  const resolvedTsvStream = fs.createWriteStream(outputResolvedTsv, { encoding: "utf8" });
  const resolvedJsonlStream = fs.createWriteStream(outputResolvedJsonl, { encoding: "utf8" });
  const coreTsvStream = fs.createWriteStream(outputCoreTsv, { encoding: "utf8" });
  const coreJsonlStream = fs.createWriteStream(outputCoreJsonl, { encoding: "utf8" });
  resolvedTsvStream.write(`${tsvHeader()}\n`);
  coreTsvStream.write(`${tsvHeader()}\n`);

  const qualityStats = {};
  const resolutionStats = {};
  const selectedReportStats = {};
  const sampleRows = [];
  const conflictResolvedSamples = [];
  let resolvedCount = 0;
  let coreCount = 0;
  let skippedLowConfidenceCoreCount = 0;

  const candidateIterator = db
    .prepare(`
      SELECT *
      FROM fact_candidates
      ORDER BY group_hash, report_priority DESC, report_key, row_index
    `)
    .iterate();

  let currentHash = null;
  let groupRows = [];

  function flushGroup() {
    if (groupRows.length === 0) {
      return;
    }

    const normalizedRows = groupRows.map((row) => ({
      ...row,
      metric_value: Number(row.metric_value),
      sample_count: row.sample_count == null ? null : Number(row.sample_count),
      report_priority: Number(row.report_priority),
      row_index: Number(row.row_index || 0),
      is_split: Number(row.is_split || 0),
      is_generic_split_duplicate: Number(row.is_generic_split_duplicate || 0),
      dimension_size: Number(row.dimension_size || 0),
      dimension_snapshot: JSON.parse(row.dimension_snapshot_json || "{}"),
    }));

    const resolved = resolveAcrossReports(normalizedRows);
    const factRow = buildResolvedFactRow(normalizedRows, resolved);
    resolvedTsvStream.write(`${factRowToTsv(factRow)}\n`);
    resolvedJsonlStream.write(`${JSON.stringify(factRow)}\n`);
    resolvedCount += 1;

    qualityStats[factRow.quality_flag] = (qualityStats[factRow.quality_flag] || 0) + 1;
    const resolutionKey = factRow.extra_dimensions_json.resolution_strategy;
    resolutionStats[resolutionKey] = (resolutionStats[resolutionKey] || 0) + 1;
    const selectedReportKey = factRow.extra_dimensions_json.selected_report_key;
    selectedReportStats[selectedReportKey] = (selectedReportStats[selectedReportKey] || 0) + 1;

    if (sampleRows.length < 200) {
      sampleRows.push(factRow);
    }

    if (
      normalizedRows.length > 1 &&
      conflictResolvedSamples.length < 80 &&
      factRow.extra_dimensions_json.candidate_report_count > 1
    ) {
      conflictResolvedSamples.push({
        metric_code: factRow.metric_code,
        metric_name: factRow.metric_name,
        window_start: factRow.window_start,
        subject_name: factRow.subject_name,
        product_name: factRow.product_name,
        media_name: factRow.media_name,
        selected_report_key: factRow.extra_dimensions_json.selected_report_key,
        selected_report_name: factRow.extra_dimensions_json.selected_report_name,
        resolution_strategy: factRow.extra_dimensions_json.resolution_strategy,
        resolution_confidence: factRow.extra_dimensions_json.resolution_confidence,
        candidate_report_count: factRow.extra_dimensions_json.candidate_report_count,
        selected_value: factRow.metric_value,
        discarded_reports: factRow.extra_dimensions_json.discarded_reports,
      });
    }

    const confidence = Number(factRow.extra_dimensions_json.resolution_confidence || 0);
    if (coreMetricSet.has(factRow.metric_code)) {
      if (confidence >= 0.8) {
        coreTsvStream.write(`${factRowToTsv(factRow)}\n`);
        coreJsonlStream.write(`${JSON.stringify(factRow)}\n`);
        coreCount += 1;
      } else {
        skippedLowConfidenceCoreCount += 1;
      }
    }
  }

  for (const row of candidateIterator) {
    if (currentHash == null) {
      currentHash = row.group_hash;
      groupRows.push(row);
      continue;
    }
    if (row.group_hash !== currentHash) {
      flushGroup();
      currentHash = row.group_hash;
      groupRows = [row];
      continue;
    }
    groupRows.push(row);
  }
  flushGroup();

  resolvedTsvStream.end();
  resolvedJsonlStream.end();
  coreTsvStream.end();
  coreJsonlStream.end();

  await Promise.all([
    new Promise((resolve) => resolvedTsvStream.on("finish", resolve)),
    new Promise((resolve) => resolvedJsonlStream.on("finish", resolve)),
    new Promise((resolve) => coreTsvStream.on("finish", resolve)),
    new Promise((resolve) => coreJsonlStream.on("finish", resolve)),
  ]);

  fs.writeFileSync(outputResolvedLoadSql, buildLoadSql(outputResolvedTsv), "utf8");

  writeJson(outputResolvedSample, {
    meta: {
      generated_at: new Date().toISOString(),
      sample_count: sampleRows.length,
    },
    rows: sampleRows,
  });

  writeJson(outputResolvedManifest, {
    meta: {
      generated_at: new Date().toISOString(),
      input_path: factsPath,
      mapping_path: mappingPath,
      shortlist_path: shortlistPath,
      sqlite_path: dbPath,
      processed_fact_count: processedCount,
      resolved_fact_count: resolvedCount,
    },
    quality_stats: qualityStats,
    resolution_stats: resolutionStats,
    selected_report_stats: Object.entries(selectedReportStats)
      .map(([report_key, count]) => ({ report_key, count }))
      .sort((left, right) => right.count - left.count || left.report_key.localeCompare(right.report_key, "zh-CN"))
      .slice(0, 50),
    conflict_resolved_samples: conflictResolvedSamples,
  });

  writeJson(outputCoreManifest, {
    meta: {
      generated_at: new Date().toISOString(),
      core_metric_count: coreMetricSet.size,
      resolved_fact_count: resolvedCount,
      core_fact_count: coreCount,
      skipped_low_confidence_core_count: skippedLowConfidenceCoreCount,
      confidence_threshold: 0.8,
    },
  });

  db.close();

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        processed_fact_count: processedCount,
        resolved_fact_count: resolvedCount,
        core_fact_count: coreCount,
        skipped_low_confidence_core_count: skippedLowConfidenceCoreCount,
        quality_stats: qualityStats,
        sqlite_path: dbPath,
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
