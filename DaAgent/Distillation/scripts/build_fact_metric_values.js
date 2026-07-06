#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PERCENT_HINTS = ["率", "占比", "%", "％", "ROI", "roi", "CTR", "ctr"];
const MONEY_HINTS = [
  "收入",
  "成本",
  "毛利",
  "金额",
  "消耗",
  "CPC",
  "cpc",
  "CPM",
  "cpm",
  "单价",
  "arpu",
  "Arpu",
  "回传成本",
  "利润",
  "出价",
];
const GENERIC_SPLIT_SUFFIXES = new Set(["占比", "波动"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) {
      continue;
    }
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
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

function isEmpty(value) {
  return value == null || normalizeText(value) === "" || normalizeText(value) === "-";
}

function safeCode(value, maxLength = 64) {
  const normalized = normalizeText(value)
    .replace(/[%％]/g, "_percent_")
    .replace(/[()（）]/g, "_")
    .replace(/[|/]+/g, "_")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return normalized.slice(0, maxLength) || "unknown";
}

function sanitizeForTsv(value) {
  return String(value == null ? "" : value)
    .replace(/\t/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
}

function inferUnit(metricName, rawValue) {
  const name = normalizeText(metricName);
  const raw = normalizeText(rawValue);
  if (PERCENT_HINTS.some((hint) => name.includes(hint)) || raw.includes("%") || raw.includes("％")) {
    return "percent";
  }
  if (MONEY_HINTS.some((hint) => name.includes(hint))) {
    return "cny";
  }
  return "count";
}

function inferCurrency(unit) {
  return unit === "cny" ? "CNY" : null;
}

function parseNumeric(rawValue) {
  const text = normalizeText(rawValue)
    .replace(/,/g, "")
    .replace(/¥/g, "")
    .replace(/￥/g, "")
    .replace(/%/g, "")
    .replace(/％/g, "")
    .replace(/\s+/g, "");

  if (!text || text === "-" || text === "--") {
    return null;
  }

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return null;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseWindow(dateValue) {
  const text = normalizeText(dateValue);
  if (!text) {
    return null;
  }

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [_, year, month, day] = match;
    return {
      granularity: "day",
      window_start: `${year}-${month}-${day} 00:00:00`,
      window_end: `${year}-${month}-${day} 23:59:59`,
    };
  }

  match = text.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const [_, yearText, monthText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const lastDay = String(lastDayOfMonth(year, month)).padStart(2, "0");
    return {
      granularity: "month",
      window_start: `${yearText}-${monthText}-01 00:00:00`,
      window_end: `${yearText}-${monthText}-${lastDay} 23:59:59`,
    };
  }

  match = text.match(/^(\d{4})$/);
  if (match) {
    const yearText = match[1];
    return {
      granularity: "year",
      window_start: `${yearText}-01-01 00:00:00`,
      window_end: `${yearText}-12-31 23:59:59`,
    };
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    return {
      granularity: "datetime",
      window_start: text,
      window_end: text,
    };
  }

  return null;
}

function splitMetricName(metricField, partName, previousPart) {
  const normalizedPart = normalizeText(partName);
  if (!normalizedPart) {
    return normalizeText(metricField);
  }

  if (GENERIC_SPLIT_SUFFIXES.has(normalizedPart) && previousPart) {
    return `${previousPart}${normalizedPart}`;
  }

  return normalizedPart;
}

function expandMetric(metricField, rawValue) {
  const metricName = normalizeText(metricField);
  const valueText = normalizeText(rawValue);

  if (!metricName || !valueText) {
    return [];
  }

  if (metricName.includes("|") && valueText.includes("|")) {
    const headerParts = metricName.split("|").map((part) => normalizeText(part));
    const valueParts = valueText.split("|").map((part) => normalizeText(part));

    if (headerParts.length === valueParts.length) {
      const metrics = [];
      let previousPart = null;
      for (let index = 0; index < headerParts.length; index += 1) {
        const partName = splitMetricName(metricField, headerParts[index], previousPart);
        metrics.push({
          metric_name: partName,
          raw_value: valueParts[index],
          quality_flag: "split",
          original_metric_field: metricField,
        });
        previousPart = headerParts[index] || previousPart;
      }
      return metrics;
    }
  }

  return [
    {
      metric_name: metricName,
      raw_value: valueText,
      quality_flag: "normal",
      original_metric_field: metricField,
    },
  ];
}

function findValueByPatterns(record, patterns) {
  const entries = Object.entries(record);
  for (const [key, value] of entries) {
    if (isEmpty(value)) {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(key))) {
      return normalizeText(value);
    }
  }
  return null;
}

function buildDimensionContext(record) {
  const subjectName = findValueByPatterns(record, [/^主体$/, /^主体名称$/, /主体/]);
  const subjectKey = findValueByPatterns(record, [/主体ID/i]) || subjectName;

  const productKey =
    findValueByPatterns(record, [/小程序APPID/i, /小程序ID/i, /应用ID/i, /^APPID$/i]) || null;
  const productName = findValueByPatterns(record, [/小程序名称/, /应用名称/]);

  const mediaKey = findValueByPatterns(record, [/^媒体ID$/i, /^媒体id$/i]);
  const mediaName = findValueByPatterns(record, [/媒体名称/, /^媒体$/]);

  const channelName = findValueByPatterns(record, [/渠道号/, /^渠道$/]);
  const channelKey = channelName;

  const experimentKey =
    findValueByPatterns(record, [/广告位ID/i, /任务ID/i, /实验ID/i, /策略ID/i]) || null;

  return {
    subject_key: subjectKey,
    subject_name: subjectName,
    product_key: productKey,
    product_name: productName,
    media_key: mediaKey,
    media_name: mediaName,
    channel_key: channelKey,
    channel_name: channelName,
    experiment_key: experimentKey,
  };
}

function buildExtraDimensions(record, dimensionFields, reservedKeys, meta, rowIndex, metricInfo) {
  const dimensions = {};
  for (const field of dimensionFields) {
    if (reservedKeys.has(field)) {
      continue;
    }
    const value = record[field];
    if (isEmpty(value)) {
      continue;
    }
    dimensions[field] = normalizeText(value);
  }

  return {
    report_module: meta.module,
    report_seq: meta.report_seq,
    report_name_cn: meta.report_name_cn,
    item_key: meta.item_key,
    source_record_key: meta.source_record_key,
    row_index: rowIndex,
    canonical_metric_code: safeCode(metricInfo.metric_name),
    original_metric_field: metricInfo.original_metric_field,
    dimension_snapshot: dimensions,
  };
}

function buildMetricCode(reportMeta, metricName) {
  return safeCode(`m_${reportMeta.module}_${reportMeta.report_seq}_${metricName}`, 64);
}

function buildFactRow(reportMeta, sheetName, row, rowIndex, dateField, dimensionFields, metricInfo) {
  const window = parseWindow(row.record[dateField]);
  if (!window) {
    return null;
  }

  const metricValue = parseNumeric(metricInfo.raw_value);
  if (metricValue == null) {
    return null;
  }

  const dimensionContext = buildDimensionContext(row.record);
  const reservedKeys = new Set([
    dateField,
    "主体",
    "主体名称",
    "主体ID",
    "小程序ID",
    "小程序APPID",
    "应用ID",
    "APPID",
    "小程序名称",
    "应用名称",
    "媒体ID",
    "媒体id",
    "媒体名称",
    "媒体",
    "渠道号",
    "渠道",
    "广告位ID",
    "任务ID",
    "实验ID",
    "策略ID",
  ]);
  const extraDimensions = buildExtraDimensions(
    row.record,
    dimensionFields,
    reservedKeys,
    reportMeta,
    rowIndex,
    metricInfo
  );

  const unit = inferUnit(metricInfo.metric_name, metricInfo.raw_value);
  return {
    source_record_key: reportMeta.source_record_key,
    granularity: window.granularity,
    window_start: window.window_start,
    window_end: window.window_end,
    business_side: "shared",
    budget_side: "c_end",
    business_line: "zhixiao",
    subject_key: dimensionContext.subject_key,
    subject_name: dimensionContext.subject_name,
    product_key: dimensionContext.product_key,
    product_name: dimensionContext.product_name,
    media_key: dimensionContext.media_key,
    media_name: dimensionContext.media_name,
    channel_key: dimensionContext.channel_key,
    channel_name: dimensionContext.channel_name,
    experiment_key: dimensionContext.experiment_key,
    metric_code: buildMetricCode(reportMeta, metricInfo.metric_name),
    metric_name: metricInfo.metric_name,
    metric_value: metricValue,
    unit,
    currency_code: inferCurrency(unit),
    sample_count: null,
    extra_dimensions_json: extraDimensions,
    quality_flag: metricInfo.quality_flag,
    sheet_name: sheetName,
  };
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
  WHERE source_code = 'midmax_zhixiao_reports'
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
  quality_flag,
  created_at,
  updated_at
)
SELECT
  @source_id,
  rr.id,
  s.granularity,
  s.window_start,
  s.window_end,
  NULLIF(s.business_side, ''),
  NULLIF(s.budget_side, ''),
  NULLIF(s.business_line, ''),
  NULLIF(s.subject_key, ''),
  NULLIF(s.subject_name, ''),
  NULLIF(s.product_key, ''),
  NULLIF(s.product_name, ''),
  NULLIF(s.media_key, ''),
  NULLIF(s.media_name, ''),
  NULLIF(s.channel_key, ''),
  NULLIF(s.channel_name, ''),
  NULLIF(s.experiment_key, ''),
  s.metric_code,
  NULLIF(s.metric_name, ''),
  s.metric_value,
  NULLIF(s.unit, ''),
  NULLIF(s.currency_code, ''),
  NULLIF(s.sample_count, 0),
  CAST(NULLIF(s.extra_dimensions_json, '') AS JSON),
  NULLIF(s.quality_flag, ''),
  NOW(3),
  NOW(3)
FROM ai_fact_metric_stage s
LEFT JOIN ai_raw_records rr
  ON rr.source_id = @source_id
 AND rr.source_record_key = s.source_record_key
ON DUPLICATE KEY UPDATE
  raw_record_id = VALUES(raw_record_id),
  business_side = VALUES(business_side),
  budget_side = VALUES(budget_side),
  business_line = VALUES(business_line),
  subject_name = VALUES(subject_name),
  product_name = VALUES(product_name),
  media_name = VALUES(media_name),
  channel_name = VALUES(channel_name),
  metric_name = VALUES(metric_name),
  metric_value = VALUES(metric_value),
  unit = VALUES(unit),
  currency_code = VALUES(currency_code),
  sample_count = VALUES(sample_count),
  extra_dimensions_json = VALUES(extra_dimensions_json),
  quality_flag = VALUES(quality_flag),
  updated_at = NOW(3);
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const parsedDir = args["parsed-dir"] || path.join(outputDir, "parsed_reports");
  const schemaPath =
    args["schema-path"] || path.join(trainingDir, "zhixiao_schema_profiles.json");

  ensureDir(trainingDir);

  const schemaPayload = readJson(schemaPath);
  const schemaMap = new Map();
  for (const profile of schemaPayload.schema_profiles || []) {
    const key = `${profile.report.item_key}::${profile.sheet_name}`;
    schemaMap.set(key, profile);
  }

  const parsedFiles = fs
    .readdirSync(parsedDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const jsonlPath = path.join(trainingDir, "zhixiao_fact_metric_values.jsonl");
  const tsvPath = path.join(trainingDir, "zhixiao_fact_metric_values.tsv");
  const samplePath = path.join(trainingDir, "zhixiao_fact_metric_values_sample.json");
  const manifestPath = path.join(trainingDir, "zhixiao_fact_metric_values_manifest.json");
  const loadSqlPath = path.join(trainingDir, "zhixiao_fact_metric_load.sql");

  const jsonlStream = fs.createWriteStream(jsonlPath, { encoding: "utf8" });
  const tsvStream = fs.createWriteStream(tsvPath, { encoding: "utf8" });
  tsvStream.write(`${tsvHeader()}\n`);

  const sampleFacts = [];
  const reportStats = [];
  const metricDictionary = new Map();
  let factCount = 0;

  for (const fileName of parsedFiles) {
    const parsed = readJson(path.join(parsedDir, fileName));
    const reportMeta = parsed.meta && parsed.meta.report ? parsed.meta.report : {};
    let reportFactCount = 0;

    for (const sheet of parsed.sheets || []) {
      const schemaKey = `${reportMeta.item_key}::${sheet.sheet_name}`;
      const sheetProfile = schemaMap.get(schemaKey);
      if (!sheetProfile) {
        continue;
      }

      const dateField = sheetProfile.fact_mapping_candidate.date_field;
      const metricFields = sheetProfile.fact_mapping_candidate.metric_fields || [];
      const dimensionFields = sheetProfile.fact_mapping_candidate.dimension_fields || [];
      if (!dateField || metricFields.length === 0) {
        continue;
      }

      for (const row of sheet.rows || []) {
        for (const metricField of metricFields) {
          const metricValue = row.record[metricField];
          if (isEmpty(metricValue)) {
            continue;
          }

          const metricCandidates = expandMetric(metricField, metricValue);
          for (const metricInfo of metricCandidates) {
            const factRow = buildFactRow(
              reportMeta,
              sheet.sheet_name,
              row,
              row.row_index,
              dateField,
              dimensionFields,
              metricInfo
            );

            if (!factRow) {
              continue;
            }

            jsonlStream.write(`${JSON.stringify(factRow)}\n`);
            tsvStream.write(`${factRowToTsv(factRow)}\n`);
            factCount += 1;
            reportFactCount += 1;

            if (sampleFacts.length < 200) {
              sampleFacts.push(factRow);
            }

            if (!metricDictionary.has(factRow.metric_code)) {
              metricDictionary.set(factRow.metric_code, {
                metric_code: factRow.metric_code,
                metric_name: factRow.metric_name,
                canonical_metric_code: safeCode(factRow.metric_name),
                unit: factRow.unit,
                currency_code: factRow.currency_code,
                source_reports: [],
                _source_report_keys: new Set(),
              });
            }

            const metricEntry = metricDictionary.get(factRow.metric_code);
            const reportKey = [
              reportMeta.report_name_cn,
              reportMeta.module,
              reportMeta.report_seq,
              sheet.sheet_name,
            ].join("::");
            if (!metricEntry._source_report_keys.has(reportKey)) {
              metricEntry._source_report_keys.add(reportKey);
              metricEntry.source_reports.push({
                report_name_cn: reportMeta.report_name_cn,
                module: reportMeta.module,
                report_seq: reportMeta.report_seq,
                sheet_name: sheet.sheet_name,
              });
            }
          }
        }
      }
    }

    reportStats.push({
      report_name_cn: reportMeta.report_name_cn,
      module: reportMeta.module,
      report_seq: reportMeta.report_seq,
      source_record_key: reportMeta.source_record_key,
      fact_count: reportFactCount,
    });
  }

  await Promise.all([
    new Promise((resolve) => jsonlStream.end(resolve)),
    new Promise((resolve) => tsvStream.end(resolve)),
  ]);

  const manifestPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      parsed_report_count: parsedFiles.length,
      fact_count: factCount,
    },
    report_stats: reportStats,
    metric_dictionary_draft: Array.from(metricDictionary.values())
      .map((entry) => ({
        metric_code: entry.metric_code,
        metric_name: entry.metric_name,
        canonical_metric_code: entry.canonical_metric_code,
        unit: entry.unit,
        currency_code: entry.currency_code,
        source_reports: entry.source_reports,
      }))
      .sort((left, right) => left.metric_code.localeCompare(right.metric_code, "zh-CN")),
  };

  writeJson(samplePath, { samples: sampleFacts });
  writeJson(manifestPath, manifestPayload);
  fs.writeFileSync(loadSqlPath, buildLoadSql(tsvPath), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        training_dir: trainingDir,
        fact_count: factCount,
        report_count: reportStats.length,
        metric_dictionary_count: metricDictionary.size,
        jsonl_path: jsonlPath,
        tsv_path: tsvPath,
        manifest_path: manifestPath,
        load_sql_path: loadSqlPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error && error.stack ? error.stack : error)}\n`);
  process.exit(1);
});
