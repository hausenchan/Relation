#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DATE_START = "2026-04-01";
const DATE_END = "2026-06-30";

const REPORT_DEFINITIONS = [
  {
    module: "income",
    report_seq: "01",
    report_name_cn: "支小业务收入汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-income/report-new-alipay-incomttotal",
    file_name: `midmax_report_zhixiao_income_01_业务收入汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "income",
    report_seq: "02",
    report_name_cn: "支小应用收入汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-income/report-new-alipay-appincome",
    file_name: `midmax_report_zhixiao_income_02_应用收入汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "income",
    report_seq: "03",
    report_name_cn: "支小灯火收入汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-income/report-new-alipay-aggincome",
    file_name: `midmax_report_zhixiao_income_03_灯火收入汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "income",
    report_seq: "04",
    report_name_cn: "支小主体收入汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-income/report-new-alipay-principayincome",
    file_name: `midmax_report_zhixiao_income_04_主体收入汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "runtime",
    report_seq: "05",
    report_name_cn: "支小大盘监控",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-all-monitor",
    notes: "页面无导出按钮",
  },
  {
    module: "runtime",
    report_seq: "06",
    report_name_cn: "支小大盘汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-nwe-alipay-all-sum",
    file_name: `midmax_report_zhixiao_runtime_06_大盘汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "runtime",
    report_seq: "07",
    report_name_cn: "支小订单汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-ordersum",
    file_name: `midmax_report_zhixiao_runtime_07_订单汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "runtime",
    report_seq: "08",
    report_name_cn: "支小任务数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-all-task",
    file_name: `midmax_report_zhixiao_runtime_08_任务数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "runtime",
    report_seq: "09",
    report_name_cn: "支小订单维度",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-allorder",
    file_name: `midmax_report_zhixiao_runtime_09_订单维度_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "runtime",
    report_seq: "10",
    report_name_cn: "支小媒体监控",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-mediamonitor",
    notes: "页面无导出按钮",
  },
  {
    module: "runtime",
    report_seq: "11",
    report_name_cn: "支小单包监控",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-nwe-alipay-all-appmon",
    notes: "页面无导出按钮",
  },
  {
    module: "runtime",
    report_seq: "12",
    report_name_cn: "支小分媒体实时填充率",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-media-fill-rate",
    notes: "页面无导出按钮",
  },
  {
    module: "runtime",
    report_seq: "13",
    report_name_cn: "支小分渠道单包填充率",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-chaneel-fill-rate",
    notes: "页面无导出按钮",
  },
  {
    module: "runtime",
    report_seq: "14",
    report_name_cn: "支小分时分渠道分包UV",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-channel-uv",
    notes: "页面无导出按钮",
  },
  {
    module: "runtime",
    report_seq: "15",
    report_name_cn: "支小拼量监控",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-splicemon",
    notes: "页面无导出按钮",
  },
  {
    module: "app",
    report_seq: "16",
    report_name_cn: "支小应用收入",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-appincome",
    file_name: `midmax_report_zhixiao_app_16_支小应用收入_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "app",
    report_seq: "17",
    report_name_cn: "支小广告类型数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-advdata",
    file_name: `midmax_report_zhixiao_app_17_支小广告类型数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "app",
    report_seq: "18",
    report_name_cn: "支小应用维度数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-appdim",
    file_name: `midmax_report_zhixiao_app_18_支小应用维度数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "app",
    report_seq: "19",
    report_name_cn: "支小拼量应用报表",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-spliceapp",
    file_name: `midmax_report_zhixiao_app_19_支小拼量应用报表_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "app",
    report_seq: "20",
    report_name_cn: "支小广告请求数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-app-advreq",
    file_name: `midmax_report_zhixiao_app_20_支小广告请求数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "app",
    report_seq: "21",
    report_name_cn: "支小应用媒体占比",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-appmedia",
    file_name: `midmax_report_zhixiao_app_21_支小应用媒体占比_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "adv",
    report_seq: "22",
    report_name_cn: "广告位维度汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-adv/report-new-alipay-advdim",
    file_name: `midmax_report_zhixiao_adv_22_广告位维度汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "adv",
    report_seq: "23",
    report_name_cn: "支小多广告类型数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-adv/report-new-alipay-advmultidata",
    file_name: `midmax_report_zhixiao_adv_23_支小多广告类型数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "adv",
    report_seq: "24",
    report_name_cn: "支小广告类型收入报表",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-adv/report-new-alipay-advincome",
    file_name: `midmax_report_zhixiao_adv_24_支小广告类型收入报表_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "media",
    report_seq: "25",
    report_name_cn: "支小媒体数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-mediadata",
    file_name: `midmax_report_zhixiao_media_25_支小媒体数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "media",
    report_seq: "26",
    report_name_cn: "支小媒体任务类型数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-mediatask",
    file_name: `midmax_report_zhixiao_media_26_支小媒体任务类型数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "media",
    report_seq: "27",
    report_name_cn: "支小媒体入口数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-med-ent-data",
    file_name: `midmax_report_zhixiao_media_27_支小媒体入口数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "media",
    report_seq: "28",
    report_name_cn: "支小媒体应用任务维度",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-media-task-app",
    file_name: `midmax_report_zhixiao_media_28_支小媒体应用任务维度_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "media",
    report_seq: "29",
    report_name_cn: "支小媒体任务数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-medieadatadet",
    file_name: `midmax_report_zhixiao_media_29_支小媒体任务数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "user",
    report_seq: "30",
    report_name_cn: "用户维度",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-user",
    notes: "页面返回404",
  },
  {
    module: "launch",
    report_seq: "17",
    report_name_cn: "支小投放汇总",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-launch/report-new-alipay-launchtotal",
    file_name: `midmax_report_zhixiao_launch_17_投放汇总_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "launch",
    report_seq: "18",
    report_name_cn: "支小灯火投放",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-launch/report-new-alipay-luanchdh",
    file_name: `midmax_report_zhixiao_launch_18_灯火投放_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "launch",
    report_seq: "19",
    report_name_cn: "支小快手投放数据",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-launch/report-new-alipay-luanchks",
    file_name: `midmax_report_zhixiao_launch_19_快手投放数据_${DATE_START}_${DATE_END}.xls`,
  },
  {
    module: "launch",
    report_seq: "20",
    report_name_cn: "支小快手投放明细",
    source_url:
      "https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-launch/report-new-alipay-launchksdet",
    file_name: `midmax_report_zhixiao_launch_20_快手投放明细_${DATE_START}_${DATE_END}.xls`,
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

function csvEscape(value) {
  const raw = String(value == null ? "" : value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function buildManifest(distillationDir) {
  const reports = REPORT_DEFINITIONS.map((definition) => {
    const fileName = definition.file_name || "";
    const filePath = fileName ? path.join(distillationDir, fileName) : "";
    const exists = filePath ? fs.existsSync(filePath) : false;

    return {
      module: definition.module,
      report_seq: definition.report_seq,
      report_name_cn: definition.report_name_cn,
      status: exists ? "exported" : "not_exported",
      file_name: exists ? fileName : "",
      file_path: exists ? filePath : "",
      source_url: definition.source_url,
      notes: exists ? "" : definition.notes || "未找到导出文件",
    };
  });

  const exportedCount = reports.filter((report) => report.status === "exported").length;

  return {
    generated_at: "2026-07-05",
    source_system: "midmax",
    business_line: "zhixiao",
    date_range: {
      start: DATE_START,
      end: DATE_END,
    },
    export_summary: {
      total_reports_detected: reports.length,
      exported_count: exportedCount,
      not_exported_count: reports.length - exportedCount,
    },
    reports,
  };
}

function toCsv(manifest) {
  const headers = [
    "module",
    "report_seq",
    "report_name_cn",
    "status",
    "file_name",
    "file_path",
    "source_url",
    "notes",
  ];

  const rows = manifest.reports.map((report) =>
    headers.map((header) => csvEscape(report[header])).join(",")
  );

  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const jsonPath =
    args.json || path.join(distillationDir, "midmax_report_zhixiao_manifest.json");
  const csvPath =
    args.csv || path.join(distillationDir, "midmax_report_zhixiao_manifest.csv");

  const manifest = buildManifest(distillationDir);

  fs.writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, toCsv(manifest), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        json_path: jsonPath,
        csv_path: csvPath,
        total_reports_detected: manifest.export_summary.total_reports_detected,
        exported_count: manifest.export_summary.exported_count,
        not_exported_count: manifest.export_summary.not_exported_count,
      },
      null,
      2
    )
  );
}

main();
