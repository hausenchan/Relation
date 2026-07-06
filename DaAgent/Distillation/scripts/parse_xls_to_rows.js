#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sleepMs(durationMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

function readJson(filePath) {
  const attempts = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      lastError = error;
      if (!["EIO", "EBUSY"].includes(error && error.code) || attempt === attempts) {
        throw error;
      }
      sleepMs(attempt * 200);
    }
  }

  throw lastError;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      return candidate;
    }

    const result = spawnSync("which", [candidate], {
      encoding: "utf8",
    });
    if (result.status === 0) {
      const resolved = String(result.stdout || "").trim();
      if (resolved) {
        return resolved;
      }
    }
  }
  return null;
}

function toFileUrl(dirPath) {
  return pathToFileURL(dirPath).href;
}

function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    maxBuffer: 1024 * 1024 * 50,
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
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

function parseDateRange(payload, rawRecord, sourceItem) {
  const payloadRange = payload.meta && payload.meta.date_range ? payload.meta.date_range : {};
  const rawRange =
    rawRecord && rawRecord.raw_payload_json
      ? {
          start: rawRecord.raw_payload_json.date_start,
          end: rawRecord.raw_payload_json.date_end,
        }
      : {};
  const extraRange =
    sourceItem && sourceItem.extra_json && sourceItem.extra_json.date_range
      ? sourceItem.extra_json.date_range
      : {};

  return {
    start: String(rawRange.start || extraRange.start || payloadRange.start || "").trim(),
    end: String(rawRange.end || extraRange.end || payloadRange.end || "").trim(),
  };
}

function buildChunkPreview(parsedWorkbook, reportInfo) {
  const previews = [];
  for (const sheet of parsedWorkbook.sheets || []) {
    const rows = sheet.rows || [];
    const sampleRows = rows.slice(0, 5).map((row) => row.record);
    previews.push({
      sheet_name: sheet.sheet_name,
      row_count: rows.length,
      header_row_index: sheet.header_row_index,
      headers: sheet.headers,
      sample_rows: sampleRows,
      text_preview: [
        `${reportInfo.report_name_cn} / ${sheet.sheet_name}`,
        sheet.headers.join(" | "),
        ...sampleRows.map((row) =>
          sheet.headers
            .map((header) => `${header}=${row[header] == null ? "" : row[header]}`)
            .join(" ; ")
        ),
      ].join("\n"),
    });
  }
  return previews;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const payloadPath =
    args.payload || path.join(outputDir, "midmax_zhixiao_distill_payload.json");
  const parsedDir = args["parsed-dir"] || path.join(outputDir, "parsed_reports");
  const convertDir = args["convert-dir"] || path.join(outputDir, "converted_xlsx");
  const sofficeProfileDir =
    args["soffice-profile-dir"] || path.join(outputDir, ".soffice-profile");
  const pythonHelperPath =
    args["python-script"] || path.join(__dirname, "extract_xlsx_rows.py");

  ensureDir(outputDir);
  ensureDir(parsedDir);
  ensureDir(convertDir);
  ensureDir(sofficeProfileDir);

  const homeDir = os.homedir();
  const sofficeBin = resolveExistingPath([
    args.soffice,
    process.env.DISTILL_SOFFICE_BIN,
    path.join(
      homeDir,
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "bin",
      "soffice"
    ),
    "soffice",
  ]);
  const pythonBin = resolveExistingPath([
    args.python,
    process.env.DISTILL_PYTHON_BIN,
    path.join(
      homeDir,
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "bin",
      "python3"
    ),
    "python3",
  ]);

  if (!sofficeBin) {
    throw new Error(
      "Cannot find soffice. Provide --soffice or set DISTILL_SOFFICE_BIN before running."
    );
  }
  if (!pythonBin) {
    throw new Error(
      "Cannot find python3 with openpyxl. Provide --python or set DISTILL_PYTHON_BIN before running."
    );
  }

  const payload = readJson(payloadPath);
  const rawRecordByFilePath = new Map();
  for (const rawRecord of payload.raw_records || []) {
    const filePath = rawRecord.raw_payload_json && rawRecord.raw_payload_json.file_path;
    if (filePath) {
      rawRecordByFilePath.set(filePath, rawRecord);
    }
  }

  const parsedReports = [];

  for (const sourceItem of payload.source_items || []) {
    const extra = sourceItem.extra_json || {};
    const inputFile = extra.file_path;
    if (!inputFile || !fs.existsSync(inputFile)) {
      parsedReports.push({
        item_key: sourceItem.item_key,
        status: "missing_file",
        input_file: inputFile || "",
      });
      continue;
    }

    const rawRecord = rawRecordByFilePath.get(inputFile);
    const reportInfo = {
      module: extra.module || "",
      report_seq: extra.report_seq || "",
      report_name_cn: extra.report_name_cn || sourceItem.title || "",
      item_key: sourceItem.item_key,
      source_record_key: rawRecord ? rawRecord.source_record_key : "",
      source_url: sourceItem.source_url || "",
      date_range: parseDateRange(payload, rawRecord, sourceItem),
    };

    const xlsxFileName = `${path.basename(inputFile, path.extname(inputFile))}.xlsx`;
    const convertedFile = path.join(convertDir, xlsxFileName);
    const parsedFile = path.join(
      parsedDir,
      `${path.basename(inputFile, path.extname(inputFile))}.json`
    );

    if (!fs.existsSync(convertedFile) || args.force) {
      runCommand(
        sofficeBin,
        [
          `-env:UserInstallation=${toFileUrl(sofficeProfileDir)}`,
          "--headless",
          "--convert-to",
          "xlsx",
          "--outdir",
          convertDir,
          inputFile,
        ],
        {
          env: {
            HOME: outputDir,
            XDG_CACHE_HOME: path.join(outputDir, ".cache"),
          },
        }
      );
    }

    runCommand(pythonBin, [
      pythonHelperPath,
      "--input",
      convertedFile,
      "--output",
      parsedFile,
    ]);

    const parsedWorkbook = readJson(parsedFile);
    const previewChunks = buildChunkPreview(parsedWorkbook, reportInfo);

    const wrappedPayload = {
      meta: {
        parsed_at: new Date().toISOString(),
        parser_chain: {
          converter: "soffice",
          extractor: "openpyxl",
        },
        report: reportInfo,
        input_file: inputFile,
        converted_file: convertedFile,
      },
      workbook: parsedWorkbook.workbook,
      sheets: parsedWorkbook.sheets,
      chunk_previews: previewChunks,
    };

    writeJson(parsedFile, wrappedPayload);

    parsedReports.push({
      item_key: reportInfo.item_key,
      module: reportInfo.module,
      report_seq: reportInfo.report_seq,
      report_name_cn: reportInfo.report_name_cn,
      input_file: inputFile,
      converted_file: convertedFile,
      parsed_file: parsedFile,
      sheet_count: wrappedPayload.workbook.sheet_count,
      total_rows: wrappedPayload.sheets.reduce((sum, sheet) => sum + (sheet.row_count || 0), 0),
      total_data_rows: wrappedPayload.sheets.reduce(
        (sum, sheet) => sum + ((sheet.rows && sheet.rows.length) || 0),
        0
      ),
      date_range: reportInfo.date_range,
      status: "parsed",
    });
  }

  const summary = {
    meta: {
      generated_at: new Date().toISOString(),
      payload_path: payloadPath,
      parsed_dir: parsedDir,
      convert_dir: convertDir,
    },
    reports: parsedReports,
  };

  const summaryPath = path.join(outputDir, "midmax_zhixiao_rows_manifest.json");
  writeJson(summaryPath, summary);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        summary_path: summaryPath,
        parsed_count: parsedReports.filter((report) => report.status === "parsed").length,
        missing_count: parsedReports.filter((report) => report.status !== "parsed").length,
      },
      null,
      2
    )
  );
}

main();
