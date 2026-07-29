---
name: yyz-dashboard-analysis
description: Generate YYZ / 愉悦赚 dashboard analysis reports from mid-max 新业务线报表管理 data. Use when Codex needs to log in to mid-max, collect YYZ project data for a target date, compare against a prior date and an Apr-Jun historical window, and produce an HTML report covering revenue, budget, media, media-budget mix, funnel metrics, causes, and optimization advice.
---

# YYZ Dashboard Analysis

## Purpose

Use this skill to produce a reusable YYZ / 愉悦赚大盘数据分析报告 from mid-max 新业务线报表管理. Store each run under `YYZ/outputs/yyz-dashboard-analysis/<target-date>/` with:

- Part1: 营收角度
- Part2: 漏斗角度
- Part3: 关键波动、原因和优化建议

This directory is the authoritative source. `.codex/skills/yyz-dashboard-analysis/` is a generated runtime mirror and must not be edited directly.

## Required Data Windows

Always collect these three windows unless the user specifies different dates:

- Target day: the day being analyzed, for example `2026-07-05`.
- Compare day: the previous or requested comparison day, for example `2026-07-04`.
- Historical baseline: `2026-04-01` to `2026-06-30`; treat this as 91 days and compare target day against historical daily average for volume/cost/revenue/profit metrics.

## Report Mapping

Collect these YYZ reports from `https://mid-max.midongtech.com/` under 新业务线报表管理 > 愉悦赚:

| Key | Report | Route | Use |
| --- | --- | --- | --- |
| `project` | 愉悦赚综合报表 | `/report-new/report-new-yyz/report-new-yyz-all/report-new-yyz-all-multi` | project revenue, cost, profit, total funnel |
| `budget` | 愉悦赚综合报表-业务线维度 | `/report-new/report-new-yyz/report-new-yyz-all/report-new-yyz-all-multi-bis` | budget/business-line cost and funnel |
| `media` | 愉悦赚综合报表-媒体维度 | `/report-new/report-new-yyz/report-new-yyz-all/report-new-yyz-all-multi-media` | traffic/media funnel and cost mix |
| `mediaBudget` | 愉悦赚综合报表-媒体-业务线维度 | `/report-new/report-new-yyz/report-new-yyz-all/report-new-yyz-all-multi-cidbis` | same media running different budgets, and same budget across media |
| `mediaData` | 愉悦赚媒体数据报表 | `/report-new/report-new-yyz/report-new-yyz-media/report-new-yyz-media-data-all` | media revenue, cost, profit, ROI |
| `taskConsume` | 媒体业务线任务消耗报表 | `/report-new/report-new-yyz/report-new-yyz-media/report-new-yyz-mediebistask` | task/budget consumption details |
| `userActionTotal` | 用户行为统计 | `/report-new/report-new-yyz/report-new-yyz-user/report-new-yyz-useractiondate` | total funnel |
| `userActionBudget` | 用户行为统计-业务线维度 | `/report-new/report-new-yyz/report-new-yyz-user/report-new-yyz-useactionbis` | budget funnel |
| `taskRangeMedia` | 用户完成任务区间-媒体维度 | `/report-new/report-new-yyz/report-new-yyz-user/report-new-yyz-user-tkfinshrange-media` | media per-user completion distribution |

If a report has no date controls or no data, record it as a limitation and substitute the closest available report above. Do not fabricate missing metrics.

## Browser Collection Workflow

1. Open mid-max in Chrome or the browser selected for the target URL.
2. Confirm login. If login, CAPTCHA, or OTP blocks access, ask the user to sign in and continue after they confirm.
3. For each route and each window:
   - Navigate directly to the route.
   - Fill `开始日期` and `结束日期` with the window dates.
   - Click `查 询`.
   - Extract table headers, body rows, summary rows, pagination text, active tab, and date input values.
4. Save the collected JSON as `YYZ/outputs/yyz-dashboard-analysis/YYYY-MM-DD/source.json`. Do not commit production credentials, cookies, personal data, or unredacted user-level records.

The source JSON shape should be:

```json
{
  "windows": [{"key":"target","start":"2026-07-05","end":"2026-07-05"}],
  "reports": [{"key":"project","title":"愉悦赚综合报表","route":"..."}],
  "data": {"project": {"target": {"tables": [{"headers": [], "rows": [], "summaryRows": []}]}}}
}
```

## Generate HTML

Resolve `<skill-dir>` to the directory containing this `SKILL.md`, then run the bundled script after collecting JSON. This works from either the authoritative source or the generated Codex mirror:

```bash
node <skill-dir>/scripts/generate_yyz_report.js \
  --source YYZ/outputs/yyz-dashboard-analysis/2026-07-05/source.json \
  --out YYZ/outputs/yyz-dashboard-analysis/2026-07-05/report.html
```

`--source` is required. When `--out` is omitted, the script derives the target date from the source JSON and writes `YYZ/outputs/yyz-dashboard-analysis/<target-date>/report.html`.

## Interpretation Rules

- Treat project revenue/cost/profit from `project` as the financial source of truth.
- Treat `budget` business-line rows as budget/cost allocation when revenue columns are zero.
- Use `mediaData` for media revenue/profit and ROI.
- Use `mediaBudget` for media x budget diagnosis.
- Use historical summary rows divided by the number of days in the history window for daily-average comparisons.
- Separate conclusions into: direct numbers, likely causes inferred from decomposition, and optimization suggestions.

See `references/report-framework.md` for the required section checklist.
