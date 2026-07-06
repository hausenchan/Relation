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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toSafeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDate(dateStr) {
  return String(dateStr || "").trim();
}

function getReportDateRange(report, manifest) {
  const manifestRange = manifest.date_range || {};
  return {
    start: normalizeDate(report.date_start || manifestRange.start),
    end: normalizeDate(report.date_end || manifestRange.end),
  };
}

function extToMime(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".xls") {
    return "application/vnd.ms-excel";
  }
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".csv") {
    return "text/csv";
  }
  return "application/octet-stream";
}

function buildSourceCode(manifest) {
  return `${toSafeCode(manifest.source_system)}_${toSafeCode(manifest.business_line)}_reports`;
}

function buildBatchNo(manifest) {
  const generatedAt = String(manifest.generated_at || "").replace(/[^0-9]/g, "");
  return `${toSafeCode(manifest.source_system)}_${toSafeCode(
    manifest.business_line
  )}_${generatedAt || "manual"}_import`;
}

function buildRecordKeys(report, manifest) {
  const dateRange = getReportDateRange(report, manifest);
  const dateStart = dateRange.start;
  const dateEnd = dateRange.end;
  const sourceSystem = toSafeCode(manifest.source_system);
  const biz = toSafeCode(manifest.business_line);
  const moduleCode = toSafeCode(report.module);
  const seq = String(report.report_seq).padStart(2, "0");
  const recordBase = `${sourceSystem}:${biz}:${moduleCode}:${seq}:${dateStart}:${dateEnd}`;

  return {
    itemKey: `${recordBase}:item`,
    sourceRecordKey: `${recordBase}:file`,
    assetHintCode: `${sourceSystem}_${biz}_${moduleCode}_${seq}`,
  };
}

function buildPayload(manifest, options) {
  const batchNo = options.batchNo || buildBatchNo(manifest);
  const sourceCode = options.sourceCode || buildSourceCode(manifest);
  const exportedReports = manifest.reports.filter((report) => report.status === "exported");
  const pendingReports = manifest.reports.filter((report) => report.status !== "exported");
  const generatedAt = new Date().toISOString();

  const sourceConfig = {
    source_code: sourceCode,
    source_name: `${manifest.source_system} ${manifest.business_line} 业务报表`,
    source_type: "external_doc",
    source_origin: "external",
    access_method: "file",
    endpoint: options.distillationDir,
    sync_frequency: "manual",
    status: "active",
    config_json: {
      generated_at: manifest.generated_at,
      business_line: manifest.business_line,
      date_range: manifest.date_range || null,
      source_manifest: options.manifestPath,
      export_summary: manifest.export_summary,
    },
  };

  const syncJob = {
    batch_no: batchNo,
    source_code: sourceCode,
    job_type: "manual_file_import",
    trigger_mode: "manual",
    status: "pending_import",
    raw_count: exportedReports.length,
    normalized_count: 0,
    run_log_json: {
      generated_at: generatedAt,
      manifest_path: options.manifestPath,
      output_dir: options.outputDir,
      date_range: manifest.date_range || null,
      total_reports_detected: manifest.export_summary.total_reports_detected,
      exported_count: manifest.export_summary.exported_count,
      not_exported_count: manifest.export_summary.not_exported_count,
    },
  };

  const rawRecords = [];
  const sourceItems = [];
  const parseTasks = [];

  for (const report of exportedReports) {
    const keys = buildRecordKeys(report, manifest);
    const fileName = report.file_name;
    const filePath = report.file_path;
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const dateRange = getReportDateRange(report, manifest);
    const dateStart = dateRange.start;
    const dateEnd = dateRange.end;
    const reportTitle = `${manifest.business_line}-${report.report_name_cn}`;

    rawRecords.push({
      source_record_key: keys.sourceRecordKey,
      raw_type: "file_rowset",
      content_type: extToMime(fileName),
      title: reportTitle,
      happened_at: `${dateEnd} 23:59:59`,
      raw_payload_json: {
        source_system: manifest.source_system,
        business_line: manifest.business_line,
        module: report.module,
        report_seq: report.report_seq,
        report_name_cn: report.report_name_cn,
        date_start: dateStart,
        date_end: dateEnd,
        file_name: fileName,
        file_path: filePath,
        file_size_bytes: stat ? stat.size : null,
        source_url: report.source_url,
        notes: report.notes || "",
        import_stage: "raw_only",
      },
    });

    sourceItems.push({
      item_key: keys.itemKey,
      item_type: "report",
      source_module: `${toSafeCode(manifest.source_system)}_${toSafeCode(report.module)}`,
      title: reportTitle,
      summary: `${manifest.business_line} ${report.module} 模块报表，时间范围 ${dateStart} 至 ${dateEnd}`,
      source_url: report.source_url,
      happened_at: `${dateEnd} 23:59:59`,
      published_at: `${dateStart} 00:00:00`,
      status: "active",
      tags_json: [
        manifest.source_system,
        manifest.business_line,
        report.module,
        report.report_name_cn,
      ],
      extra_json: {
        report_seq: report.report_seq,
        report_name_cn: report.report_name_cn,
        module: report.module,
        file_name: fileName,
        file_path: filePath,
        date_range: dateRange,
      },
    });

    parseTasks.push({
      task_code: `${keys.assetHintCode}_parse`,
      parser_type: "excel_table_extract",
      input_file: filePath,
      target_item_key: keys.itemKey,
      expected_output: [
        "sheet_metadata",
        "table_rows_json",
        "source_chunks",
        "metric_candidates",
      ],
    });
  }

  const blockedReports = pendingReports.map((report) => ({
    module: report.module,
    report_seq: report.report_seq,
    report_name_cn: report.report_name_cn,
    status: report.status,
    source_url: report.source_url,
    notes: report.notes || "",
  }));

  return {
    meta: {
      generated_at: generatedAt,
      source_manifest: options.manifestPath,
      source_system: manifest.source_system,
      business_line: manifest.business_line,
      date_range: manifest.date_range || null,
      batch_no: batchNo,
    },
    source_config: sourceConfig,
    sync_job: syncJob,
    raw_records: rawRecords,
    source_items: sourceItems,
    source_chunks: [],
    parse_tasks: parseTasks,
    blocked_reports: blockedReports,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir =
    args["distillation-dir"] ||
    path.resolve(__dirname, "..");
  const manifestPath =
    args.manifest ||
    path.join(distillationDir, "midmax_report_zhixiao_manifest.json");
  const outputDir =
    args.output ||
    path.join(distillationDir, "output");

  ensureDir(outputDir);

  const manifest = readJson(manifestPath);
  const payload = buildPayload(manifest, {
    manifestPath,
    outputDir,
    distillationDir,
    batchNo: args["batch-no"],
    sourceCode: args["source-code"],
  });

  const payloadPath = path.join(outputDir, "midmax_zhixiao_distill_payload.json");
  const blockedPath = path.join(outputDir, "midmax_zhixiao_blocked_reports.json");

  fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    blockedPath,
    `${JSON.stringify(payload.blocked_reports, null, 2)}\n`,
    "utf8"
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        payload_path: payloadPath,
        blocked_reports_path: blockedPath,
        exported_count: payload.raw_records.length,
        blocked_count: payload.blocked_reports.length,
      },
      null,
      2
    )
  );
}

main();
