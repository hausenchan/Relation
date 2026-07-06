#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const Database = require("better-sqlite3");

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

function numbersEqual(left, right, epsilon = 1e-9) {
  return Math.abs(Number(left) - Number(right)) <= epsilon;
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

function normalizeInteger(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric);
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

function buildCanonicalMetricInfo(rawRow, metricLookup) {
  const mapped = metricLookup.get(rawRow.metric_code);
  if (mapped) {
    return mapped;
  }

  const fallbackCode =
    normalizeNullable(rawRow.extra_dimensions_json?.canonical_metric_code) ||
    safeCode(rawRow.metric_name || rawRow.metric_code);

  return {
    canonical_metric_code: fallbackCode,
    preferred_metric_name: normalizeNullable(rawRow.metric_name) || fallbackCode,
    category: null,
    unit: normalizeNullable(rawRow.unit),
    currency_code: normalizeNullable(rawRow.currency_code),
  };
}

function buildDimensionSignature(extraDimensionsJson) {
  const snapshot = extraDimensionsJson?.dimension_snapshot || {};
  const normalized = {};
  for (const [key, value] of Object.entries(snapshot)) {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeNullable(value);
    if (!normalizedKey || normalizedValue == null) {
      continue;
    }
    normalized[normalizedKey] = normalizedValue;
  }
  return buildStableJson(normalized);
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

function resolveMetricValue(row) {
  const averageValue = row.row_count > 0 ? row.metric_value_sum / row.row_count : row.metric_value_first;
  const sameValue = numbersEqual(row.metric_value_min, row.metric_value_max);

  if (row.row_count === 1) {
    return {
      metric_value: normalizeNumber(row.metric_value_first),
      quality_flag: "normal",
      resolution_strategy: "single_row",
    };
  }

  if (sameValue) {
    return {
      metric_value: normalizeNumber(row.metric_value_first),
      quality_flag: "deduped",
      resolution_strategy: "same_value_dedup",
    };
  }

  const sameReportMultiSlice = row.source_report_count === 1 && row.dimension_signature_count > 1;
  if (sameReportMultiSlice) {
    if (row.unit === "percent") {
      return {
        metric_value: normalizeNumber(averageValue),
        quality_flag: "aggregated",
        resolution_strategy: "avg_multi_slice_percent",
      };
    }
    return {
      metric_value: normalizeNumber(row.metric_value_sum),
      quality_flag: "aggregated",
      resolution_strategy: "sum_multi_slice_value",
    };
  }

  if (row.unit === "percent") {
    return {
      metric_value: normalizeNumber(averageValue),
      quality_flag: "conflict",
      resolution_strategy: "avg_conflict_percent",
    };
  }

  return {
    metric_value: normalizeNumber(row.metric_value_max),
    quality_flag: "conflict",
    resolution_strategy: "max_conflict_value",
  };
}

function resolveSampleCount(row, metricResolution) {
  if (!row.sample_count_nonnull_count) {
    return null;
  }

  if (row.sample_count_nonnull_count === 1) {
    return normalizeInteger(row.sample_count_first);
  }

  if (row.sample_count_min != null && row.sample_count_max != null && numbersEqual(row.sample_count_min, row.sample_count_max)) {
    return normalizeInteger(row.sample_count_max);
  }

  if (metricResolution.quality_flag === "aggregated") {
    return normalizeInteger(row.sample_count_sum);
  }

  return normalizeInteger(row.sample_count_max);
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
  'midmax_zhixiao_canonical_facts',
  'Mid-Max 支小规范化事实',
  'selecteddb',
  'internal',
  'file',
  'https://mid-max.midongtech.com',
  'selectedDB',
  'manual',
  'active',
  88.00,
  72.00
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
  WHERE source_code = 'midmax_zhixiao_canonical_facts'
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const factsPath =
    args.input || path.join(trainingDir, "zhixiao_fact_metric_values.jsonl");
  const mappingPath =
    args.mapping || path.join(trainingDir, "zhixiao_canonical_metric_mapping.json");
  const dbPath = args["db-path"] || path.join(trainingDir, "zhixiao_canonical_rollup.sqlite");

  ensureDir(trainingDir);

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const metricLookup = buildMetricLookup(readJson(mappingPath));
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -200000");

  db.exec(`
    CREATE TABLE canonical_fact_rollup (
      group_hash TEXT PRIMARY KEY,
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
      metric_code TEXT NOT NULL,
      metric_name TEXT,
      metric_category TEXT,
      unit TEXT,
      currency_code TEXT,
      row_count INTEGER NOT NULL DEFAULT 0,
      sample_count_nonnull_count INTEGER NOT NULL DEFAULT 0,
      sample_count_sum REAL NOT NULL DEFAULT 0,
      sample_count_first REAL DEFAULT NULL,
      sample_count_min REAL DEFAULT NULL,
      sample_count_max REAL DEFAULT NULL,
      metric_value_first REAL NOT NULL,
      metric_value_min REAL NOT NULL,
      metric_value_max REAL NOT NULL,
      metric_value_sum REAL NOT NULL
    );

    CREATE TABLE canonical_fact_source_metrics (
      group_hash TEXT NOT NULL,
      source_metric_code TEXT NOT NULL,
      PRIMARY KEY (group_hash, source_metric_code)
    );

    CREATE TABLE canonical_fact_source_reports (
      group_hash TEXT NOT NULL,
      source_report_key TEXT NOT NULL,
      report_name_cn TEXT,
      PRIMARY KEY (group_hash, source_report_key)
    );

    CREATE TABLE canonical_fact_dimension_signatures (
      group_hash TEXT NOT NULL,
      dimension_signature TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      PRIMARY KEY (group_hash, dimension_signature)
    );

    CREATE TABLE canonical_fact_source_records (
      group_hash TEXT NOT NULL,
      source_record_key TEXT NOT NULL,
      PRIMARY KEY (group_hash, source_record_key)
    );
  `);

  const insertRollup = db.prepare(`
    INSERT INTO canonical_fact_rollup (
      group_hash,
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
      metric_category,
      unit,
      currency_code,
      row_count,
      sample_count_nonnull_count,
      sample_count_sum,
      sample_count_first,
      sample_count_min,
      sample_count_max,
      metric_value_first,
      metric_value_min,
      metric_value_max,
      metric_value_sum
    ) VALUES (
      @group_hash,
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
      @metric_code,
      @metric_name,
      @metric_category,
      @unit,
      @currency_code,
      1,
      @sample_count_nonnull_count,
      @sample_count_sum,
      @sample_count_first,
      @sample_count_min,
      @sample_count_max,
      @metric_value,
      @metric_value,
      @metric_value,
      @metric_value
    )
    ON CONFLICT(group_hash) DO UPDATE SET
      metric_name = COALESCE(metric_name, excluded.metric_name),
      metric_category = COALESCE(metric_category, excluded.metric_category),
      unit = COALESCE(unit, excluded.unit),
      currency_code = COALESCE(currency_code, excluded.currency_code),
      row_count = row_count + 1,
      sample_count_nonnull_count = sample_count_nonnull_count + excluded.sample_count_nonnull_count,
      sample_count_sum = sample_count_sum + excluded.sample_count_sum,
      sample_count_first = COALESCE(sample_count_first, excluded.sample_count_first),
      sample_count_min = CASE
        WHEN excluded.sample_count_min IS NULL THEN sample_count_min
        WHEN sample_count_min IS NULL THEN excluded.sample_count_min
        ELSE MIN(sample_count_min, excluded.sample_count_min)
      END,
      sample_count_max = CASE
        WHEN excluded.sample_count_max IS NULL THEN sample_count_max
        WHEN sample_count_max IS NULL THEN excluded.sample_count_max
        ELSE MAX(sample_count_max, excluded.sample_count_max)
      END,
      metric_value_min = MIN(metric_value_min, excluded.metric_value_min),
      metric_value_max = MAX(metric_value_max, excluded.metric_value_max),
      metric_value_sum = metric_value_sum + excluded.metric_value_sum
  `);

  const insertSourceMetric = db.prepare(`
    INSERT OR IGNORE INTO canonical_fact_source_metrics (
      group_hash,
      source_metric_code
    ) VALUES (?, ?)
  `);

  const insertSourceReport = db.prepare(`
    INSERT OR IGNORE INTO canonical_fact_source_reports (
      group_hash,
      source_report_key,
      report_name_cn
    ) VALUES (?, ?, ?)
  `);

  const insertDimensionSignature = db.prepare(`
    INSERT OR IGNORE INTO canonical_fact_dimension_signatures (
      group_hash,
      dimension_signature,
      snapshot_json
    ) VALUES (?, ?, ?)
  `);

  const insertSourceRecord = db.prepare(`
    INSERT OR IGNORE INTO canonical_fact_source_records (
      group_hash,
      source_record_key
    ) VALUES (?, ?)
  `);

  const batchInsert = db.transaction((rows) => {
    for (const row of rows) {
      insertRollup.run(row.rollup);
      insertSourceMetric.run(row.groupHash, row.sourceMetricCode);
      insertSourceReport.run(row.groupHash, row.sourceReportKey, row.reportNameCn);
      insertDimensionSignature.run(row.groupHash, row.dimensionSignature, row.dimensionSnapshotJson);
      insertSourceRecord.run(row.groupHash, row.sourceRecordKey);
    }
  });

  const rl = readline.createInterface({
    input: fs.createReadStream(factsPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let processedCount = 0;
  let skippedCount = 0;
  const batches = [];
  const batchSize = Number(args["batch-size"] || 2000);

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    let rawRow;
    try {
      rawRow = JSON.parse(line);
    } catch (error) {
      skippedCount += 1;
      continue;
    }

    if (!Number.isFinite(Number(rawRow.metric_value))) {
      skippedCount += 1;
      continue;
    }

    const metricInfo = buildCanonicalMetricInfo(rawRow, metricLookup);
    const groupHash = buildGroupHash(rawRow, metricInfo.canonical_metric_code);
    const reportNameCn = normalizeNullable(rawRow.extra_dimensions_json?.report_name_cn) || null;
    const reportSeq = normalizeNullable(rawRow.extra_dimensions_json?.report_seq) || "";
    const reportModule = normalizeNullable(rawRow.extra_dimensions_json?.report_module) || "";
    const sourceReportKey = [reportModule, reportSeq, reportNameCn || ""].join("::");
    const dimensionSignature = buildDimensionSignature(rawRow.extra_dimensions_json);

    const sampleCount = rawRow.sample_count == null ? null : Number(rawRow.sample_count);
    const sampleCountValid = Number.isFinite(sampleCount) ? sampleCount : null;
    const metricValue = Number(rawRow.metric_value);

    batches.push({
      groupHash,
      sourceMetricCode: normalizeNullable(rawRow.metric_code) || metricInfo.canonical_metric_code,
      sourceReportKey,
      reportNameCn,
      dimensionSignature,
      dimensionSnapshotJson: dimensionSignature,
      sourceRecordKey: normalizeNullable(rawRow.source_record_key) || "",
      rollup: {
        group_hash: groupHash,
        granularity: normalizeNullable(rawRow.granularity) || "day",
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
        metric_code: metricInfo.canonical_metric_code,
        metric_name: metricInfo.preferred_metric_name,
        metric_category: metricInfo.category,
        unit: metricInfo.unit || normalizeNullable(rawRow.unit),
        currency_code: metricInfo.currency_code || normalizeNullable(rawRow.currency_code),
        sample_count_nonnull_count: sampleCountValid == null ? 0 : 1,
        sample_count_sum: sampleCountValid == null ? 0 : sampleCountValid,
        sample_count_first: sampleCountValid,
        sample_count_min: sampleCountValid,
        sample_count_max: sampleCountValid,
        metric_value: metricValue,
      },
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
    CREATE INDEX idx_canonical_fact_rollup_lookup
      ON canonical_fact_rollup (metric_code, window_start, business_line);
    CREATE INDEX idx_canonical_fact_rollup_subject_product
      ON canonical_fact_rollup (subject_name, product_name, window_start);
  `);

  const tsvPath = path.join(trainingDir, "zhixiao_canonical_fact_values.tsv");
  const jsonlPath = path.join(trainingDir, "zhixiao_canonical_fact_values.jsonl");
  const manifestPath = path.join(trainingDir, "zhixiao_canonical_fact_values_manifest.json");
  const samplePath = path.join(trainingDir, "zhixiao_canonical_fact_values_sample.json");
  const loadSqlPath = path.join(trainingDir, "zhixiao_canonical_fact_load.sql");

  const sourceMetricSummarySql = `
    SELECT
      group_hash,
      COUNT(*) AS source_metric_count,
      group_concat(source_metric_code, '||') AS source_metric_codes
    FROM canonical_fact_source_metrics
    GROUP BY group_hash
  `;

  const sourceReportSummarySql = `
    SELECT
      group_hash,
      COUNT(*) AS source_report_count,
      group_concat(report_name_cn, '||') AS source_report_names
    FROM canonical_fact_source_reports
    GROUP BY group_hash
  `;

  const dimensionSignatureSummarySql = `
    SELECT
      group_hash,
      COUNT(*) AS dimension_signature_count
    FROM canonical_fact_dimension_signatures
    GROUP BY group_hash
  `;

  const sourceRecordSummarySql = `
    SELECT
      group_hash,
      COUNT(*) AS source_record_count
    FROM canonical_fact_source_records
    GROUP BY group_hash
  `;

  const exportRows = db.prepare(`
    SELECT
      r.*,
      COALESCE(sm.source_metric_count, 0) AS source_metric_count,
      COALESCE(sm.source_metric_codes, '') AS source_metric_codes,
      COALESCE(sr.source_report_count, 0) AS source_report_count,
      COALESCE(sr.source_report_names, '') AS source_report_names,
      COALESCE(ds.dimension_signature_count, 0) AS dimension_signature_count,
      COALESCE(sk.source_record_count, 0) AS source_record_count
    FROM canonical_fact_rollup r
    LEFT JOIN (${sourceMetricSummarySql}) sm USING (group_hash)
    LEFT JOIN (${sourceReportSummarySql}) sr USING (group_hash)
    LEFT JOIN (${dimensionSignatureSummarySql}) ds USING (group_hash)
    LEFT JOIN (${sourceRecordSummarySql}) sk USING (group_hash)
    ORDER BY
      r.window_start,
      r.metric_code,
      r.subject_name,
      r.product_name,
      r.media_name,
      r.channel_name,
      r.experiment_key
  `);

  const qualityStats = {};
  const canonicalMetricStats = new Map();
  const sampleRows = [];
  const tsvStream = fs.createWriteStream(tsvPath, { encoding: "utf8" });
  const jsonlStream = fs.createWriteStream(jsonlPath, { encoding: "utf8" });
  tsvStream.write(`${tsvHeader()}\n`);

  let canonicalFactCount = 0;
  for (const row of exportRows.iterate()) {
    const metricResolution = resolveMetricValue(row);
    const sampleCount = resolveSampleCount(row, metricResolution);
    const sourceMetricCodes = normalizeText(row.source_metric_codes)
      ? row.source_metric_codes.split("||").filter(Boolean).sort((left, right) => left.localeCompare(right, "zh-CN"))
      : [];
    const sourceReportNames = normalizeText(row.source_report_names)
      ? Array.from(new Set(row.source_report_names.split("||").filter(Boolean))).sort((left, right) =>
          left.localeCompare(right, "zh-CN")
        )
      : [];

    const factRow = {
      source_record_key: `canonical:${row.group_hash}`,
      granularity: row.granularity,
      window_start: row.window_start,
      window_end: row.window_end,
      business_side: row.business_side,
      budget_side: row.budget_side,
      business_line: row.business_line,
      subject_key: row.subject_key,
      subject_name: row.subject_name,
      product_key: row.product_key,
      product_name: row.product_name,
      media_key: row.media_key,
      media_name: row.media_name,
      channel_key: row.channel_key,
      channel_name: row.channel_name,
      experiment_key: row.experiment_key,
      metric_code: row.metric_code,
      metric_name: row.metric_name,
      metric_value: metricResolution.metric_value,
      unit: row.unit,
      currency_code: row.currency_code,
      sample_count: sampleCount,
      extra_dimensions_json: {
        canonical_rollup: true,
        metric_category: row.metric_category,
        row_count: row.row_count,
        source_metric_count: row.source_metric_count,
        source_report_count: row.source_report_count,
        source_record_count: row.source_record_count,
        dimension_signature_count: row.dimension_signature_count,
        value_min: normalizeNumber(row.metric_value_min),
        value_max: normalizeNumber(row.metric_value_max),
        value_sum: normalizeNumber(row.metric_value_sum),
        source_metric_codes: sourceMetricCodes,
        source_report_names: sourceReportNames,
        resolution_strategy: metricResolution.resolution_strategy,
      },
      quality_flag: metricResolution.quality_flag,
    };

    tsvStream.write(`${factRowToTsv(factRow)}\n`);
    jsonlStream.write(`${JSON.stringify(factRow)}\n`);

    canonicalFactCount += 1;
    qualityStats[factRow.quality_flag] = (qualityStats[factRow.quality_flag] || 0) + 1;

    if (!canonicalMetricStats.has(factRow.metric_code)) {
      canonicalMetricStats.set(factRow.metric_code, {
        metric_code: factRow.metric_code,
        metric_name: factRow.metric_name,
        fact_count: 0,
      });
    }
    canonicalMetricStats.get(factRow.metric_code).fact_count += 1;

    if (sampleRows.length < 200) {
      sampleRows.push(factRow);
    }
  }

  tsvStream.end();
  jsonlStream.end();

  await Promise.all([
    new Promise((resolve) => tsvStream.on("finish", resolve)),
    new Promise((resolve) => jsonlStream.on("finish", resolve)),
  ]);

  writeJson(samplePath, {
    meta: {
      generated_at: new Date().toISOString(),
      sample_count: sampleRows.length,
    },
    rows: sampleRows,
  });

  fs.writeFileSync(loadSqlPath, buildLoadSql(tsvPath), "utf8");

  const topConflictRows = db
    .prepare(`
      SELECT
        r.metric_code,
        r.metric_name,
        r.row_count,
        r.metric_value_min,
        r.metric_value_max,
        COALESCE(sr.source_report_count, 0) AS source_report_count,
        COALESCE(ds.dimension_signature_count, 0) AS dimension_signature_count
      FROM canonical_fact_rollup r
      LEFT JOIN (${sourceReportSummarySql}) sr USING (group_hash)
      LEFT JOIN (${dimensionSignatureSummarySql}) ds USING (group_hash)
      WHERE r.row_count > 1
        AND ABS(r.metric_value_min - r.metric_value_max) > 0.000001
      ORDER BY r.row_count DESC, r.metric_code
      LIMIT 50
    `)
    .all()
    .map((item) => ({
      metric_code: item.metric_code,
      metric_name: item.metric_name,
      row_count: item.row_count,
      value_min: normalizeNumber(item.metric_value_min),
      value_max: normalizeNumber(item.metric_value_max),
      source_report_count: item.source_report_count,
      dimension_signature_count: item.dimension_signature_count,
    }));

  const manifest = {
    meta: {
      generated_at: new Date().toISOString(),
      input_path: factsPath,
      mapping_path: mappingPath,
      sqlite_path: dbPath,
      processed_fact_count: processedCount,
      skipped_fact_count: skippedCount,
      canonical_fact_count: canonicalFactCount,
    },
    quality_stats: qualityStats,
    top_metrics: Array.from(canonicalMetricStats.values())
      .sort((left, right) => right.fact_count - left.fact_count || left.metric_code.localeCompare(right.metric_code, "zh-CN"))
      .slice(0, 50),
    conflict_samples: topConflictRows,
  };

  writeJson(manifestPath, manifest);
  db.close();

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        processed_fact_count: processedCount,
        skipped_fact_count: skippedCount,
        canonical_fact_count: canonicalFactCount,
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
