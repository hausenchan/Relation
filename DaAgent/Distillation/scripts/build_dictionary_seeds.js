#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
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

function sqlValue(value) {
  if (value == null) {
    return "NULL";
  }
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function inferMetricCategory(metric) {
  if (metric.category) {
    return metric.category;
  }
  const name = normalizeText(metric.preferred_metric_name);
  if (/(收入|成本|毛利|利润|消耗|cpc|cpm|单价|arpu|roi)/i.test(name)) {
    return "commercial";
  }
  if (/(uv|pv|点击|曝光|请求|订单|访问|完成)/i.test(name)) {
    return "traffic";
  }
  if (/(填充率|完成率|有效率|ctr|占比|波动|率)/i.test(name)) {
    return "quality";
  }
  return "other";
}

function inferDimensionGroup(header) {
  const name = normalizeText(header);
  if (/主体/.test(name)) {
    return "subject";
  }
  if (/(小程序|应用|产品|app)/i.test(name)) {
    return "product";
  }
  if (/媒体/.test(name)) {
    return "media";
  }
  if (/渠道/.test(name)) {
    return "channel";
  }
  if (/(广告位|任务|实验|策略)/.test(name)) {
    return "experiment";
  }
  if (/(业务|预算)/.test(name)) {
    return "business";
  }
  return "report_extra";
}

function buildMetricSeeds(mappingPayload) {
  return (mappingPayload.canonical_metrics || []).map((metric) => ({
    metric_code: metric.canonical_metric_code,
    metric_name: metric.preferred_metric_name || metric.canonical_metric_code,
    metric_category: inferMetricCategory(metric),
    metric_definition: `由 Mid-Max 支小报表蒸馏得到，覆盖 ${metric.source_report_count || 0} 张报表、${metric.source_metric_count || 0} 个源指标。`,
    formula_text: `canonical merge of ${metric.source_metric_count || 0} source metrics`,
    unit: Array.isArray(metric.units) && metric.units.length > 0 ? metric.units[0] : null,
    grain: "day",
    status: "active",
  }));
}

function buildDimensionSeeds(dimensionPayload) {
  const baseDimensions = [
    ["business_side", "业务侧", "business"],
    ["budget_side", "预算侧", "business"],
    ["business_line", "业务线", "business"],
    ["subject_key", "主体标识", "subject"],
    ["subject_name", "主体名称", "subject"],
    ["product_key", "产品标识", "product"],
    ["product_name", "产品名称", "product"],
    ["media_key", "媒体标识", "media"],
    ["media_name", "媒体名称", "media"],
    ["channel_key", "渠道标识", "channel"],
    ["channel_name", "渠道名称", "channel"],
    ["experiment_key", "实验/策略标识", "experiment"],
  ].map(([dimension_code, dimension_name, dimension_group]) => ({
    dimension_code,
    dimension_name,
    dimension_group,
    definition: `规范化事实层标准维度：${dimension_name}`,
    status: "active",
  }));

  const extraDimensions = (dimensionPayload.dimension_candidates || []).map((item) => ({
    dimension_code: `ext_${safeCode(item.suggested_code || item.header, 56)}`,
    dimension_name: item.header,
    dimension_group: inferDimensionGroup(item.header),
    definition: `来自 Mid-Max 支小报表的扩展维度：${item.header}`,
    status: "active",
  }));

  const deduped = new Map();
  for (const dimension of [...baseDimensions, ...extraDimensions]) {
    if (!deduped.has(dimension.dimension_code)) {
      deduped.set(dimension.dimension_code, dimension);
    }
  }
  return Array.from(deduped.values());
}

function buildSql(metricSeeds, dimensionSeeds) {
  const metricValues = metricSeeds
    .map(
      (item) =>
        `(${sqlValue(item.metric_code)}, ${sqlValue(item.metric_name)}, ${sqlValue(item.metric_category)}, ${sqlValue(
          item.metric_definition
        )}, ${sqlValue(item.formula_text)}, ${sqlValue(item.unit)}, ${sqlValue(item.grain)}, ${sqlValue(item.status)})`
    )
    .join(",\n");

  const dimensionValues = dimensionSeeds
    .map(
      (item) =>
        `(${sqlValue(item.dimension_code)}, ${sqlValue(item.dimension_name)}, ${sqlValue(item.dimension_group)}, ${sqlValue(
          item.definition
        )}, ${sqlValue(item.status)})`
    )
    .join(",\n");

  return `USE relation_ai_distill;

INSERT INTO ai_metric_dictionary (
  metric_code,
  metric_name,
  metric_category,
  metric_definition,
  formula_text,
  unit,
  grain,
  status
) VALUES
${metricValues}
ON DUPLICATE KEY UPDATE
  metric_name = VALUES(metric_name),
  metric_category = VALUES(metric_category),
  metric_definition = VALUES(metric_definition),
  formula_text = VALUES(formula_text),
  unit = VALUES(unit),
  grain = VALUES(grain),
  status = VALUES(status),
  updated_at = CURRENT_TIMESTAMP(3);

INSERT INTO ai_dimension_dictionary (
  dimension_code,
  dimension_name,
  dimension_group,
  definition,
  status
) VALUES
${dimensionValues}
ON DUPLICATE KEY UPDATE
  dimension_name = VALUES(dimension_name),
  dimension_group = VALUES(dimension_group),
  definition = VALUES(definition),
  status = VALUES(status),
  updated_at = CURRENT_TIMESTAMP(3);`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const mappingPath =
    args.mapping || path.join(trainingDir, "zhixiao_canonical_metric_mapping.json");
  const dimensionPath =
    args.dimensions || path.join(trainingDir, "zhixiao_dimension_candidates.json");

  const metricSeeds = buildMetricSeeds(readJson(mappingPath));
  const dimensionSeeds = buildDimensionSeeds(readJson(dimensionPath));

  writeJson(path.join(trainingDir, "zhixiao_metric_dictionary_seed.json"), {
    meta: {
      generated_at: new Date().toISOString(),
      metric_count: metricSeeds.length,
    },
    metrics: metricSeeds,
  });

  writeJson(path.join(trainingDir, "zhixiao_dimension_dictionary_seed.json"), {
    meta: {
      generated_at: new Date().toISOString(),
      dimension_count: dimensionSeeds.length,
    },
    dimensions: dimensionSeeds,
  });

  fs.writeFileSync(
    path.join(trainingDir, "zhixiao_dictionary_seed.sql"),
    buildSql(metricSeeds, dimensionSeeds),
    "utf8"
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        metric_count: metricSeeds.length,
        dimension_count: dimensionSeeds.length,
      },
      null,
      2
    )
  );
}

main();
