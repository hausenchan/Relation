#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const DATE_START = "2026-04-01";
const DATE_END = "2026-06-30";

const REPORT_MAPPINGS = [
  {
    module: "income",
    seq: "01",
    name: "业务收入汇总",
    sources: ["收入汇总报表 (1).xls", "收入汇总报表.xls"],
  },
  {
    module: "income",
    seq: "02",
    name: "应用收入汇总",
    sources: ["应用收入汇总.xls"],
  },
  {
    module: "income",
    seq: "03",
    name: "灯火收入汇总",
    sources: ["灯火收入数据.xls"],
  },
  {
    module: "income",
    seq: "04",
    name: "主体收入汇总",
    sources: ["主体收入汇总.xls"],
  },
  {
    module: "runtime",
    seq: "06",
    name: "大盘汇总",
    sources: ["支小大盘汇总.xls"],
  },
  {
    module: "runtime",
    seq: "07",
    name: "订单汇总",
    sources: ["支小订单汇总.xls"],
  },
  {
    module: "runtime",
    seq: "08",
    name: "任务数据",
    sources: ["支小任务数据.xls"],
  },
  {
    module: "runtime",
    seq: "09",
    name: "订单维度",
    sources: ["订单维度.xls"],
  },
  {
    module: "app",
    seq: "16",
    name: "支小应用收入",
    sources: ["支小应用收入.xls"],
  },
  {
    module: "app",
    seq: "17",
    name: "支小广告类型数据",
    sources: ["广告类型数据.xls"],
  },
  {
    module: "app",
    seq: "18",
    name: "支小应用维度数据",
    sources: ["应用维度报表.xls"],
  },
  {
    module: "app",
    seq: "19",
    name: "支小拼量应用报表",
    sources: ["支小拼量应用报表.xls"],
  },
  {
    module: "app",
    seq: "20",
    name: "支小广告请求数据",
    sources: ["广告请求数据.xls"],
  },
  {
    module: "app",
    seq: "21",
    name: "支小应用媒体占比",
    sources: ["应用媒体数据占比.xls"],
  },
  {
    module: "adv",
    seq: "22",
    name: "广告位维度汇总",
    sources: ["广告位维度汇总.xls"],
  },
  {
    module: "adv",
    seq: "23",
    name: "支小多广告类型数据",
    sources: ["多广告类型数据.xls"],
  },
  {
    module: "adv",
    seq: "24",
    name: "支小广告类型收入报表",
    sources: ["支付宝广告类型收入报表.xls"],
  },
  {
    module: "media",
    seq: "25",
    name: "支小媒体数据",
    sources: ["支小媒体数据.xls"],
  },
  {
    module: "media",
    seq: "26",
    name: "支小媒体任务类型数据",
    sources: ["媒体任务类型数据.xls"],
  },
  {
    module: "media",
    seq: "27",
    name: "支小媒体入口数据",
    sources: ["媒体入口数据.xls"],
  },
  {
    module: "media",
    seq: "28",
    name: "支小媒体应用任务维度",
    sources: ["支小媒体应用任务维度.xls"],
  },
  {
    module: "media",
    seq: "29",
    name: "支小媒体任务数据",
    sources: ["媒体任务数据.xls"],
  },
  {
    module: "launch",
    seq: "17",
    name: "投放汇总",
    sources: ["投放汇总.xls"],
  },
  {
    module: "launch",
    seq: "18",
    name: "灯火投放",
    sources: ["灯火投放数据.xls"],
  },
  {
    module: "launch",
    seq: "19",
    name: "快手投放数据",
    sources: ["快手投放数据.xls"],
  },
  {
    module: "launch",
    seq: "20",
    name: "快手投放明细",
    sources: ["快手投放明细.xls"],
  },
];

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

async function exists(filePath) {
  try {
    await fsp.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(filePath) {
  if (await exists(filePath)) {
    await fsp.rm(filePath, { recursive: true, force: true });
    return true;
  }
  return false;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function buildTargetFileName(report) {
  return `midmax_report_zhixiao_${report.module}_${report.seq}_${report.name}_${DATE_START}_${DATE_END}.xls`;
}

async function pickSourceFile(downloadsDir, sourceNames) {
  const candidates = [];

  for (const sourceName of sourceNames) {
    const filePath = path.join(downloadsDir, sourceName);
    if (!(await exists(filePath))) {
      continue;
    }
    const stat = await fsp.stat(filePath);
    candidates.push({
      filePath,
      sourceName,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = path.join(distillationDir, "output");
  const downloadsDir = args["downloads-dir"] || path.join(os.homedir(), "Downloads");

  const removed = [];
  const moved = [];
  const missing = [];

  const oldReportFiles = (await fsp.readdir(distillationDir))
    .filter((name) => /^midmax_report_zhixiao_.*\.(xls|xlsx|csv)$/i.test(name))
    .map((name) => path.join(distillationDir, name));

  for (const oldFile of oldReportFiles) {
    if (await removeIfExists(oldFile)) {
      removed.push(oldFile);
    }
  }

  const generatedFiles = [
    path.join(distillationDir, "midmax_report_zhixiao_manifest.json"),
    path.join(distillationDir, "midmax_report_zhixiao_manifest.csv"),
    path.join(outputDir, "midmax_zhixiao_blocked_reports.json"),
    path.join(outputDir, "midmax_zhixiao_distill_payload.json"),
    path.join(outputDir, "midmax_zhixiao_import.sql"),
    path.join(outputDir, "midmax_zhixiao_rows_manifest.json"),
    path.join(outputDir, "converted_xlsx"),
    path.join(outputDir, "parsed_reports"),
    path.join(outputDir, "training"),
  ];

  for (const generatedPath of generatedFiles) {
    if (await removeIfExists(generatedPath)) {
      removed.push(generatedPath);
    }
  }

  await ensureDir(outputDir);
  await ensureDir(path.join(outputDir, "training"));

  for (const report of REPORT_MAPPINGS) {
    const source = await pickSourceFile(downloadsDir, report.sources);
    const targetFileName = buildTargetFileName(report);
    const targetPath = path.join(distillationDir, targetFileName);

    if (!source) {
      missing.push({
        module: report.module,
        seq: report.seq,
        name: report.name,
        expected_sources: report.sources,
      });
      continue;
    }

    await fsp.rename(source.filePath, targetPath);
    moved.push({
      module: report.module,
      seq: report.seq,
      name: report.name,
      from: source.filePath,
      to: targetPath,
      size: source.size,
    });
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: missing.length === 0,
        distillation_dir: distillationDir,
        downloads_dir: downloadsDir,
        removed_count: removed.length,
        moved_count: moved.length,
        missing_count: missing.length,
        removed,
        moved,
        missing,
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
