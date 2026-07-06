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

function inferCategory(metricName) {
  const name = String(metricName || "");
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const manifestPath =
    args["fact-manifest"] || path.join(trainingDir, "zhixiao_fact_metric_values_manifest.json");

  const manifest = readJson(manifestPath);
  const grouped = new Map();

  for (const metric of manifest.metric_dictionary_draft || []) {
    const key = metric.canonical_metric_code || metric.metric_code;
    if (!grouped.has(key)) {
      grouped.set(key, {
        canonical_metric_code: key,
        preferred_metric_name: metric.metric_name,
        category: inferCategory(metric.metric_name),
        units: new Set(),
        currencies: new Set(),
        source_metrics: [],
        source_reports: new Set(),
      });
    }

    const entry = grouped.get(key);
    if (metric.unit) {
      entry.units.add(metric.unit);
    }
    if (metric.currency_code) {
      entry.currencies.add(metric.currency_code);
    }
    entry.source_metrics.push({
      metric_code: metric.metric_code,
      metric_name: metric.metric_name,
      unit: metric.unit,
      currency_code: metric.currency_code,
      source_reports: metric.source_reports,
    });
    for (const sourceReport of metric.source_reports || []) {
      entry.source_reports.add(
        [sourceReport.report_name_cn, sourceReport.module, sourceReport.report_seq].join("::")
      );
    }
  }

  const mappingDraft = {
    meta: {
      generated_at: new Date().toISOString(),
      canonical_metric_count: grouped.size,
    },
    canonical_metrics: Array.from(grouped.values())
      .map((entry) => ({
        canonical_metric_code: entry.canonical_metric_code,
        preferred_metric_name: entry.preferred_metric_name,
        category: entry.category,
        units: Array.from(entry.units).sort(),
        currencies: Array.from(entry.currencies).sort(),
        source_metric_count: entry.source_metrics.length,
        source_report_count: entry.source_reports.size,
        source_metrics: entry.source_metrics,
      }))
      .sort((left, right) =>
        right.source_report_count - left.source_report_count ||
        left.canonical_metric_code.localeCompare(right.canonical_metric_code, "zh-CN")
      ),
  };

  const shortlist = {
    meta: {
      generated_at: new Date().toISOString(),
    },
    core_metrics: mappingDraft.canonical_metrics.filter(
      (item) => item.source_report_count >= 2 || item.category !== "other"
    ),
  };

  writeJson(path.join(trainingDir, "zhixiao_canonical_metric_mapping.json"), mappingDraft);
  writeJson(path.join(trainingDir, "zhixiao_core_metric_shortlist.json"), shortlist);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        canonical_metric_count: mappingDraft.canonical_metrics.length,
        core_metric_count: shortlist.core_metrics.length,
      },
      null,
      2
    )
  );
}

main();
