#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const METRIC_KEYWORDS = [
  "收入",
  "成本",
  "毛利",
  "金额",
  "消耗",
  "订单数",
  "订单",
  "uv",
  "UV",
  "pv",
  "PV",
  "roi",
  "ROI",
  "ctr",
  "CTR",
  "cpc",
  "CPC",
  "cpm",
  "CPM",
  "次数",
  "点击",
  "曝光",
  "填充率",
  "请求",
  "完成率",
  "占比",
  "单价",
  "arpu",
  "Arpu",
  "毛利率",
  "税后",
  "税前",
  "出价",
  "系数",
  "利润",
  "人均",
];

const DIMENSION_KEYWORDS = [
  "id",
  "ID",
  "名称",
  "主体",
  "渠道",
  "广告位",
  "小程序",
  "任务",
  "组别",
  "备注",
  "类型",
  "入口",
  "APPID",
];

const TIME_KEYWORDS = ["日期", "时间", "创建时间", "统计日期"];

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

function toCode(value) {
  return normalizeText(value)
    .replace(/[%％]/g, " percent ")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isEmpty(value) {
  return value == null || normalizeText(value) === "";
}

function isDateLike(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  return /^\d{4}-\d{2}(-\d{2})?( \d{2}:\d{2}:\d{2})?$/.test(text);
}

function isNumericLike(value) {
  const text = normalizeText(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/％/g, "")
    .replace(/^¥/, "")
    .replace(/^￥/, "")
    .replace(/^-$/, "");
  if (!text) {
    return false;
  }
  return /^-?\d+(\.\d+)?$/.test(text);
}

function inferValueType(samples) {
  if (samples.length === 0) {
    return "unknown";
  }

  const dateLike = samples.filter(isDateLike).length;
  const numericLike = samples.filter(isNumericLike).length;

  if (dateLike === samples.length) {
    return "date";
  }
  if (numericLike === samples.length) {
    return "number";
  }
  if (dateLike > 0 && dateLike >= samples.length * 0.6) {
    return "date";
  }
  if (numericLike > 0 && numericLike >= samples.length * 0.6) {
    return "number";
  }
  return "text";
}

function inferFieldRole(header, valueType) {
  if (TIME_KEYWORDS.some((keyword) => header.includes(keyword))) {
    return "time";
  }
  if (METRIC_KEYWORDS.some((keyword) => header.includes(keyword))) {
    return "metric";
  }
  if (DIMENSION_KEYWORDS.some((keyword) => header.includes(keyword))) {
    return "dimension";
  }
  if (valueType === "date") {
    return "time";
  }
  if (valueType === "number") {
    return "metric";
  }
  return "dimension";
}

function inferGrain(samples) {
  const normalized = samples.filter(Boolean);
  if (normalized.length === 0) {
    return "unknown";
  }
  if (normalized.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) {
    return "day";
  }
  if (normalized.every((value) => /^\d{4}-\d{2}$/.test(value))) {
    return "month";
  }
  if (normalized.every((value) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))) {
    return "datetime";
  }
  return "mixed";
}

function profileField(header, rows) {
  const values = rows
    .map((row) => row.record[header])
    .filter((value) => !isEmpty(value))
    .map((value) => normalizeText(value));

  const sampleValues = [];
  const unique = new Set();
  for (const value of values) {
    if (!unique.has(value)) {
      unique.add(value);
      sampleValues.push(value);
    }
    if (sampleValues.length >= 10) {
      break;
    }
  }

  const valueType = inferValueType(sampleValues);
  const role = inferFieldRole(header, valueType);

  return {
    header,
    value_type: valueType,
    role,
    non_empty_count: values.length,
    unique_sample_count: unique.size,
    sample_values: sampleValues,
    grain: role === "time" ? inferGrain(sampleValues) : undefined,
    suggested_code: toCode(header),
  };
}

function buildSheetProfile(reportMeta, sheet) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const fieldProfiles = (sheet.headers || []).map((header) => profileField(header, rows));
  const timeFields = fieldProfiles.filter((field) => field.role === "time");
  const dimensionFields = fieldProfiles.filter((field) => field.role === "dimension");
  const metricFields = fieldProfiles.filter((field) => field.role === "metric");

  return {
    report: reportMeta,
    sheet_name: sheet.sheet_name,
    title: sheet.title,
    row_count: rows.length,
    header_row_index: sheet.header_row_index,
    fields: fieldProfiles,
    fact_mapping_candidate: {
      date_field: timeFields[0] ? timeFields[0].header : null,
      grain: timeFields[0] && timeFields[0].grain ? timeFields[0].grain : "unknown",
      dimension_fields: dimensionFields.map((field) => field.header),
      metric_fields: metricFields.map((field) => field.header),
    },
  };
}

function appendTrainingCorpus(lines, reportMeta, sheetProfile, sheet) {
  const fieldSummaries = sheetProfile.fields.map((field) => ({
    header: field.header,
    role: field.role,
    value_type: field.value_type,
    sample_values: field.sample_values.slice(0, 3),
  }));

  const sampleRows = (sheet.rows || []).slice(0, 5).map((row) => row.record);

  lines.push(
    JSON.stringify({
      kind: "report_schema",
      report: reportMeta,
      sheet_name: sheet.sheet_name,
      title: sheet.title,
      row_count: sheetProfile.row_count,
      fact_mapping_candidate: sheetProfile.fact_mapping_candidate,
      fields: fieldSummaries,
      sample_rows: sampleRows,
    })
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const parsedDir = args["parsed-dir"] || path.join(outputDir, "parsed_reports");
  const rowsManifestPath =
    args["rows-manifest"] || path.join(outputDir, "midmax_zhixiao_rows_manifest.json");

  ensureDir(trainingDir);

  const rowsManifest = readJson(rowsManifestPath);
  const parsedFiles = fs
    .readdirSync(parsedDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const schemaProfiles = [];
  const metricCandidates = new Map();
  const dimensionCandidates = new Map();
  const corpusLines = [];

  for (const fileName of parsedFiles) {
    const parsed = readJson(path.join(parsedDir, fileName));
    const reportMeta = parsed.meta && parsed.meta.report ? parsed.meta.report : {};

    for (const sheet of parsed.sheets || []) {
      const sheetProfile = buildSheetProfile(reportMeta, sheet);
      schemaProfiles.push(sheetProfile);
      appendTrainingCorpus(corpusLines, reportMeta, sheetProfile, sheet);

      for (const field of sheetProfile.fields) {
        const bucket = field.role === "metric" ? metricCandidates : field.role === "dimension" ? dimensionCandidates : null;
        if (!bucket) {
          continue;
        }

        const key = `${field.role}:${field.header}`;
        if (!bucket.has(key)) {
          bucket.set(key, {
            header: field.header,
            suggested_code: field.suggested_code,
            role: field.role,
            value_type: field.value_type,
            source_reports: [],
            sample_values: field.sample_values.slice(0, 5),
          });
        }

        const entry = bucket.get(key);
        entry.source_reports.push({
          report_name_cn: reportMeta.report_name_cn || reportMeta.title || fileName,
          module: reportMeta.module || "",
          sheet_name: sheet.sheet_name,
        });
      }
    }
  }

  const schemaPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      parsed_report_count: parsedFiles.length,
      rows_manifest_path: rowsManifestPath,
      exported_report_count: rowsManifest.reports ? rowsManifest.reports.length : 0,
    },
    schema_profiles: schemaProfiles,
  };

  const metricPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      candidate_count: metricCandidates.size,
    },
    metric_candidates: Array.from(metricCandidates.values()).sort((left, right) =>
      left.header.localeCompare(right.header, "zh-CN")
    ),
  };

  const dimensionPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      candidate_count: dimensionCandidates.size,
    },
    dimension_candidates: Array.from(dimensionCandidates.values()).sort((left, right) =>
      left.header.localeCompare(right.header, "zh-CN")
    ),
  };

  writeJson(path.join(trainingDir, "zhixiao_schema_profiles.json"), schemaPayload);
  writeJson(path.join(trainingDir, "zhixiao_metric_candidates.json"), metricPayload);
  writeJson(path.join(trainingDir, "zhixiao_dimension_candidates.json"), dimensionPayload);
  fs.writeFileSync(
    path.join(trainingDir, "zhixiao_training_corpus.jsonl"),
    `${corpusLines.join("\n")}\n`,
    "utf8"
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        training_dir: trainingDir,
        parsed_report_count: parsedFiles.length,
        schema_profile_count: schemaProfiles.length,
        metric_candidate_count: metricCandidates.size,
        dimension_candidate_count: dimensionCandidates.size,
      },
      null,
      2
    )
  );
}

main();
