#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");

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

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeNullable(value) {
  const text = normalizeText(value);
  return text || null;
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

function withinTolerance(actual, expected, tolerance) {
  return Math.abs(Number(actual) - Number(expected)) <= Number(tolerance || 0);
}

function dateWindowKey(metricCode, start, end) {
  return [metricCode, start, end].join("::");
}

function rankingKey(metricCode, start, end, dimensionType) {
  return [metricCode, start, end, dimensionType].join("::");
}

function matchField(actual, expected) {
  return normalizeNullable(actual) === normalizeNullable(expected);
}

function buildPointMatcher(caseItem) {
  const payload = caseItem.input_payload_json;
  const filters = payload.filters || {};
  return {
    case_code: caseItem.case_code,
    case_item: caseItem,
    metric_code: payload.metric_code,
    window_start: payload.time_window.start,
    window_end: payload.time_window.end,
    expected: caseItem.expected_output_json,
    score_rule: caseItem.score_rule_json || {},
    matches(row) {
      return (
        matchField(row.subject_name, filters.subject_name) &&
        matchField(row.product_name, filters.product_name) &&
        matchField(row.media_name, filters.media_name) &&
        matchField(row.channel_name, filters.channel_name) &&
        matchField(row.experiment_key, filters.experiment_key)
      );
    },
  };
}

function buildCompareMatcher(caseItem, which) {
  const payload = caseItem.input_payload_json;
  const expected = caseItem.expected_output_json || {};
  const targetWindow = payload.compare_window[which];
  const entityScope = payload.entity_scope;

  return {
    case_code: caseItem.case_code,
    case_item: caseItem,
    metric_code: payload.metric_code,
    window_start: targetWindow.start,
    window_end: targetWindow.end,
    expected,
    entity_scope: entityScope,
    matches(row) {
      if (entityScope.type === "product") {
        if (entityScope.key && matchField(row.product_key, entityScope.key)) {
          return true;
        }
        return matchField(row.product_name, entityScope.name);
      }
      if (entityScope.type === "media") {
        if (entityScope.key && matchField(row.media_key, entityScope.key)) {
          return true;
        }
        return matchField(row.media_name, entityScope.name);
      }
      if (entityScope.type === "subject") {
        if (entityScope.key && matchField(row.subject_key, entityScope.key)) {
          return true;
        }
        return matchField(row.subject_name, entityScope.name);
      }
      return false;
    },
  };
}

function buildRankingMatcher(caseItem) {
  const payload = caseItem.input_payload_json;
  return {
    case_code: caseItem.case_code,
    case_item: caseItem,
    metric_code: payload.metric_code,
    window_start: `${payload.ranking_scope.date}${payload.ranking_scope.date.length === 7 ? "-01" : ""} 00:00:00`,
    window_end: null,
    dimension_type: payload.ranking_scope.dimension_type,
    expected: caseItem.expected_output_json,
    matches(row) {
      if (normalizeNullable(row.metric_code) !== normalizeNullable(payload.metric_code)) {
        return false;
      }
      if (normalizeNullable(row.experiment_key)) {
        return false;
      }
      if (payload.ranking_scope.date.length === 7) {
        return row.window_start.slice(0, 7) === payload.ranking_scope.date;
      }
      return row.window_start.slice(0, 10) === payload.ranking_scope.date;
    },
    getDimensionValue(row) {
      if (payload.ranking_scope.dimension_type === "product") {
        return normalizeNullable(row.product_name);
      }
      if (payload.ranking_scope.dimension_type === "media") {
        return normalizeNullable(row.media_name);
      }
      if (payload.ranking_scope.dimension_type === "subject") {
        return normalizeNullable(row.subject_name);
      }
      return null;
    },
  };
}

function parseResolvedRow(line) {
  const row = JSON.parse(line);
  return {
    ...row,
    metric_value: Number(row.metric_value),
  };
}

function buildMarkdownReport(summary, failures) {
  const lines = [];
  lines.push("# Zhixiao Offline Eval Report");
  lines.push("");
  lines.push(`生成时间：${summary.generated_at}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- 总用例数：${summary.total_cases}`);
  lines.push(`- 通过数：${summary.pass_count}`);
  lines.push(`- 失败数：${summary.fail_count}`);
  lines.push(`- 通过率：${summary.pass_rate}`);
  lines.push("");
  lines.push("## By Type");
  lines.push("");
  for (const item of summary.by_type) {
    lines.push(`- ${item.answer_type}: ${item.pass_count}/${item.total_count} (${item.pass_rate})`);
  }
  if (failures.length > 0) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    for (const failure of failures.slice(0, 20)) {
      lines.push(`- ${failure.case_code} | ${failure.answer_type} | ${failure.reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distillationDir = args["distillation-dir"] || path.resolve(__dirname, "..");
  const outputDir = args.output || path.join(distillationDir, "output");
  const trainingDir = args["training-dir"] || path.join(outputDir, "training");
  const factsPath =
    args.input || path.join(trainingDir, "zhixiao_skill_core_fact_values.jsonl");
  const casesPath =
    args.cases || path.join(trainingDir, "zhixiao_eval_cases.json");
  const outJsonPath =
    args["out-json"] || path.join(trainingDir, "zhixiao_eval_offline_run.json");
  const outMdPath =
    args["out-md"] || path.join(trainingDir, "zhixiao_eval_offline_report.md");

  const casesPayload = readJson(casesPath);
  const cases = casesPayload.cases || [];

  const pointMatchers = [];
  const compareMatchers = [];
  const rankingMatchers = [];

  for (const caseItem of cases) {
    const answerType = caseItem.expected_output_json?.answer_type;
    if (answerType === "metric_point_lookup") {
      pointMatchers.push(buildPointMatcher(caseItem));
      continue;
    }
    if (answerType === "metric_compare") {
      compareMatchers.push(buildCompareMatcher(caseItem, "start"));
      compareMatchers.push(buildCompareMatcher(caseItem, "end"));
      continue;
    }
    if (answerType === "ranking_top1") {
      rankingMatchers.push(buildRankingMatcher(caseItem));
    }
  }

  const pointMap = new Map();
  for (const matcher of pointMatchers) {
    const key = dateWindowKey(matcher.metric_code, matcher.window_start, matcher.window_end);
    if (!pointMap.has(key)) {
      pointMap.set(key, []);
    }
    pointMap.get(key).push(matcher);
  }

  const compareMap = new Map();
  for (const matcher of compareMatchers) {
    const key = dateWindowKey(matcher.metric_code, matcher.window_start, matcher.window_end);
    if (!compareMap.has(key)) {
      compareMap.set(key, []);
    }
    compareMap.get(key).push(matcher);
  }

  const rankingMap = new Map();
  for (const matcher of rankingMatchers) {
    const endKey = matcher.expected.time_window
      ? rankingKey(matcher.metric_code, matcher.expected.time_window.start, matcher.expected.time_window.end, matcher.dimension_type)
      : rankingKey(matcher.metric_code, matcher.window_start, matcher.window_start, matcher.dimension_type);
    rankingMap.set(endKey, matcher);
  }

  const pointResults = new Map();
  const compareResults = new Map();
  const rankingResults = new Map();

  const rl = readline.createInterface({
    input: fs.createReadStream(factsPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let scannedRows = 0;
  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    const row = parseResolvedRow(line);
    scannedRows += 1;

    const windowKey = dateWindowKey(row.metric_code, row.window_start, row.window_end);

    const pointCandidates = pointMap.get(windowKey) || [];
    for (const matcher of pointCandidates) {
      if (!matcher.matches(row)) {
        continue;
      }
      if (!pointResults.has(matcher.case_code)) {
        pointResults.set(matcher.case_code, row);
      }
    }

    const compareCandidates = compareMap.get(windowKey) || [];
    for (const matcher of compareCandidates) {
      if (!matcher.matches(row)) {
        continue;
      }
      if (!compareResults.has(matcher.case_code)) {
        compareResults.set(matcher.case_code, {});
      }
      const slot = compareResults.get(matcher.case_code);
      if (matcher.window_start === matcher.case_item.input_payload_json.compare_window.start.start) {
        slot.start = row;
      } else {
        slot.end = row;
      }
    }

    for (const matcher of rankingMatchers) {
      if (!matcher.matches(row)) {
        continue;
      }
      const dimensionValue = matcher.getDimensionValue(row);
      if (!dimensionValue) {
        continue;
      }
      if (!rankingResults.has(matcher.case_code)) {
        rankingResults.set(matcher.case_code, {
          row,
          dimension_value: dimensionValue,
        });
        continue;
      }
      const current = rankingResults.get(matcher.case_code);
      if (row.metric_value > current.row.metric_value) {
        rankingResults.set(matcher.case_code, {
          row,
          dimension_value: dimensionValue,
        });
      }
    }
  }

  const results = [];
  const failures = [];
  const byTypeCounter = new Map();

  function addTypeStats(answerType, pass) {
    if (!byTypeCounter.has(answerType)) {
      byTypeCounter.set(answerType, { answer_type: answerType, total_count: 0, pass_count: 0 });
    }
    const stats = byTypeCounter.get(answerType);
    stats.total_count += 1;
    if (pass) {
      stats.pass_count += 1;
    }
  }

  for (const caseItem of cases) {
    const answerType = caseItem.expected_output_json?.answer_type;
    let pass = false;
    let actualOutput = null;
    let reason = null;

    if (answerType === "metric_point_lookup") {
      const actualRow = pointResults.get(caseItem.case_code);
      if (!actualRow) {
        reason = "point_lookup_not_found";
      } else {
        actualOutput = {
          metric_code: actualRow.metric_code,
          metric_value: normalizeNumber(actualRow.metric_value),
          source_record_key: actualRow.source_record_key,
        };
        pass =
          normalizeNullable(actualRow.metric_code) === normalizeNullable(caseItem.expected_output_json.metric_code) &&
          withinTolerance(
            actualRow.metric_value,
            caseItem.expected_output_json.metric_value,
            caseItem.score_rule_json?.tolerance_abs
          );
        if (!pass) {
          reason = "point_lookup_value_mismatch";
        }
      }
    } else if (answerType === "metric_compare") {
      const actual = compareResults.get(caseItem.case_code);
      if (!actual || !actual.start || !actual.end) {
        reason = "compare_lookup_incomplete";
      } else {
        const deltaValue = normalizeNumber(Number(actual.end.metric_value) - Number(actual.start.metric_value));
        const trend = deltaValue > 0 ? "up" : deltaValue < 0 ? "down" : "flat";
        actualOutput = {
          start_value: normalizeNumber(actual.start.metric_value),
          end_value: normalizeNumber(actual.end.metric_value),
          delta_value: deltaValue,
          trend,
          source_record_keys: [actual.start.source_record_key, actual.end.source_record_key],
        };
        pass =
          withinTolerance(
            actual.start.metric_value,
            caseItem.expected_output_json.start_value,
            caseItem.score_rule_json?.tolerance_abs
          ) &&
          withinTolerance(
            actual.end.metric_value,
            caseItem.expected_output_json.end_value,
            caseItem.score_rule_json?.tolerance_abs
          ) &&
          trend === caseItem.expected_output_json.trend;
        if (!pass) {
          reason = "compare_value_or_trend_mismatch";
        }
      }
    } else if (answerType === "ranking_top1") {
      const actual = rankingResults.get(caseItem.case_code);
      if (!actual || !actual.row) {
        reason = "ranking_lookup_not_found";
      } else {
        actualOutput = {
          winner_name: actual.dimension_value,
          metric_value: normalizeNumber(actual.row.metric_value),
          source_record_key: actual.row.source_record_key,
        };
        pass =
          normalizeNullable(actual.dimension_value) === normalizeNullable(caseItem.expected_output_json.winner_name) &&
          withinTolerance(
            actual.row.metric_value,
            caseItem.expected_output_json.metric_value,
            caseItem.score_rule_json?.tolerance_abs
          );
        if (!pass) {
          reason = "ranking_winner_or_value_mismatch";
        }
      }
    } else {
      reason = "unsupported_answer_type";
    }

    addTypeStats(answerType, pass);
    const result = {
      case_code: caseItem.case_code,
      title: caseItem.title,
      answer_type: answerType,
      pass_flag: pass,
      actual_output_json: actualOutput,
      expected_output_json: caseItem.expected_output_json,
      reason,
    };
    results.push(result);
    if (!pass) {
      failures.push(result);
    }
  }

  const byType = Array.from(byTypeCounter.values()).map((item) => ({
    ...item,
    fail_count: item.total_count - item.pass_count,
    pass_rate: `${((item.pass_count / Math.max(item.total_count, 1)) * 100).toFixed(2)}%`,
  }));

  const passCount = results.filter((item) => item.pass_flag).length;
  const summary = {
    generated_at: new Date().toISOString(),
    facts_path: factsPath,
    cases_path: casesPath,
    scanned_rows: scannedRows,
    total_cases: results.length,
    pass_count: passCount,
    fail_count: results.length - passCount,
    pass_rate: `${((passCount / Math.max(results.length, 1)) * 100).toFixed(2)}%`,
    by_type: byType,
  };

  writeJson(outJsonPath, {
    summary,
    failures,
    results,
  });
  fs.writeFileSync(outMdPath, buildMarkdownReport(summary, failures), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        scanned_rows: scannedRows,
        total_cases: results.length,
        pass_count: passCount,
        fail_count: results.length - passCount,
        pass_rate: summary.pass_rate,
        report_json: outJsonPath,
        report_md: outMdPath,
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
