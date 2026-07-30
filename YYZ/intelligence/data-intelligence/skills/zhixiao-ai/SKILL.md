---
name: zhixiao-ai
description: "Export mid-max 支小 report spreadsheets into D:\\weineng_work\\adOpt\\支小应用数据报表, then generate or maintain the fixed 支小应用数据 HTML report. Use when the user asks to run zhixiao_ai/zhixiao-ai, refresh 支小应用数据 end to end, download 支小 XLS reports and then update 支小数据new.html, or update income/cost/app/media/order/ad/delivery summaries from newly exported backend reports."
---

# Zhixiao AI

## Objective

Run the complete 支小应用数据 workflow in one pass:

1. Export the fixed 支小 backend spreadsheets from the mid-max report pages.
2. Move each browser download into the canonical report-data folder with filenames expected by the generator.
3. Run or maintain the existing report generator to produce `支小数据new.html`.
4. Verify the output HTML and report any missing or stale source data.

This skill contains the full export, archive, generation, and verification workflow. Do not require the user to invoke any separate 支小 export or report skill.

## Fixed Paths

- Browser download folder: `/Users/chenhaozan/Downloads`
- Source spreadsheet folder: `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表`
- New skill move helper: `/Users/chenhaozan/.codex/skills/zhixiao-ai/scripts/move_latest_download.py`
- Report project folder: `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis`
- Main generator: `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py`
- Fixed HTML output: `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/支小数据new.html`
- Old HTML not maintained by default: `支小每日数据.html`
- LAN server script, only when requested: `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/serve_report_lan.py`

Use the user's existing browser session, preferably local Chrome, for the mid-max backend. If the page opens to a login screen or has no access, ask the user to log in or grant access before continuing. Do not use internet search for internal mid-max URLs.

## Phase 1: Export Backend Reports

Ensure `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表` exists before exporting. Do not change date filters or other page filters unless the user explicitly asks for a date range or another condition. For the first seven reports, export with the page's current/default query state.

Export these pages directly:

| Canonical output filename | URL |
| --- | --- |
| `支小大盘汇总.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-nwe-alipay-all-sum` |
| `新后台订单.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-all/report-new-alipay-all-task` |
| `支小应用收入.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-appincome` |
| `广告位维度汇总.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-adv/report-new-alipay-advdim` |
| `支小媒体数据.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-mediadata` |
| `支小媒体应用任务维度.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-media/report-new-alipay-media-task-app` |
| `应用媒体数据占比 .xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-app/report-new-alipay-appmedia` |

Export the eighth report from the same ad-slot page with an extra channel filter:

| Canonical output filename | URL | Required filter |
| --- | --- | --- |
| `广告位维度汇总-灯火投放.xls` | `https://mid-max.midongtech.com/report-new/report-new-alipay/report-new-alipay-adv/report-new-alipay-advdim` | Click `展开`, enter `bb` in `渠道`, click `查询`, wait for reload, then export |

For each export:

1. Record a Unix timestamp immediately before clicking `导出`.
2. Open the report URL and wait for the table/query area to finish loading.
3. Click the main report-table `导出` button. Confirm any export prompt.
4. Run the move helper with `--after-epoch` and `--filename` set to the canonical output filename.
5. Confirm the moved file exists before proceeding to the next report.
6. Retry a failed export once; after the retry, report the exact failure.

Shell pattern:

```powershell
started=$(date +%s)
# click 导出 in the browser here
python3 "/Users/chenhaozan/.codex/skills/zhixiao-ai/scripts/move_latest_download.py" --after-epoch "$started" --filename "支小大盘汇总.xls"
```

The helper waits for a new completed spreadsheet in Downloads, waits until size is stable, creates the target folder if needed, and moves the file to the exact canonical filename. If the destination already exists, it overwrites it only after the newly downloaded file is complete. Moving out of Downloads may require escalated filesystem permission because the source file is deleted.

Browser interaction notes:

- Prefer visible text and accessible labels such as `查询`, `展开`, `导出`, `渠道`.
- If multiple `导出` buttons exist, use the one tied to the main report table/query toolbar.
- If a Playwright role locator for `导 出` times out after the page is visibly loaded, inspect visible `button` rectangles and click the unique main-table export button by coordinates.
- On Ant Design Pro query filters, `展开` may be an `<a>` collapse control in `.ant-pro-query-filter-actions`, not a `button`; click its visible text/coordinates, then find `请输入渠道`.
- After setting `渠道=bb`, wait for the filtered table to refresh before exporting.
- Resolve browser download prompts, blocked downloads, or duplicate-file warnings before running the move helper.

## Phase 2: Source File Preflight

The current report generator resolves aliases relative to `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表`:

```python
FILE_ALIASES = {
  "app": ["支小应用收入.xls"],
  "old": ["旧后台订单.xlsx", "旧后台订单.xls"],
  "new": ["新后台订单.xls"],
  "dashboard": ["支小大盘汇总.xls"],
  "adslot": ["广告位维度汇总.xls"],
  "denghuo_adslot": ["广告位维度汇总-灯火投放.xls", "广告位维度汇总-投放.xls"],
  "media": ["应用媒体数据占比 .xls", "支小应用媒体占比.xls"],
  "media_total": ["支小媒体数据.xls"],
  "media_task": ["支小媒体应用任务维度.xls"],
}
```

Before generation:

- Confirm the eight newly exported files exist with the canonical names from Phase 1.
- Treat `旧后台订单.xlsx` / `旧后台订单.xls` as optional historical order input. The current export flow does not fetch it, and the generator tolerates it missing by adding a note: `未导入旧后台订单.xlsx，本次未计入旧后台订单明细。`
- Confirm the latest date available in the source tables. Do not fabricate data for missing dates.
- Preserve `支小应用收入_历史缓存.xlsx` if present. If it is missing, the generated report will contain only dates present in the current `支小应用收入.xls`; report this note rather than treating it as a hard failure.

Read spreadsheet files through the existing generator logic, especially `read_best(path, keys)` and its field/header detection. Do not replace structured Excel parsing with temporary string concatenation. Normalize dates to `YYYY-MM-DD`. Normalize 小程序 ID / 应用 ID values from integers, floats, or scientific notation into full integer strings.

## Phase 3: Generate Or Maintain The HTML Report

Prioritize running and lightly maintaining `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py`. If the user asks for changed logic, read the current script first, patch the smallest relevant section, and keep its existing structure. Do not reimplement the whole HTML page.

The generator must read source tables from `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表`, not from `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis`.

投放成本 rules:

- Do not read `投放成本.xlsx`.
- Use existing 灯火返点后 CSV files from `/Users/chenhaozan/Documents/AI/Gcad/adsOperation/outputs`.
- The generator scans files matching `denghuo_ad_report_*merged_with_rebate.csv` and reads `消耗（返点后）` or `cost_after_rebate_yuan`.
- Do not assume `/Users/chenhaozan/Documents/AI/Gcad/adsOperation/denghuo_report_query.py` exists. If it is missing, do not block generation; report that no live 灯火 pull was possible.
- If the latest report date has no matching rebate CSV filename, continue generation and report the generator note: `未发现最新日期 YYYY-MM-DD 的灯火返点后 CSV，最新日投放成本按已有文件匹配结果计入。`
- Match 灯火计划名称 to known 小程序 names first. Count unmatched rows with spend in an `unmatched` statistic; do not assign them to an arbitrary app.

Run a compile check, then generate the page. Prefer the project/runtime Python already used on this machine; if needed, use the bundled workspace Python discovered by Codex:

```powershell
python3 -m py_compile "/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py"
python3 "/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py"
```

Generation may read Excel files and use compatibility parsing or COM fallback, so it can take a while. If permissions or file access block the command, rerun with the normal Codex escalation flow.

## Date Rules

When the user asks for a date update such as `更新 7-13 数据` or `新增统计昨日数据`:

- Check whether source tables contain the target date.
- Use available source dates from `2026-06-14` onward; do not hardcode an end date.
- If `支小应用收入_历史缓存.xlsx` is absent, available dates may be limited to the current backend export range, such as only the last 1-2 days. This is acceptable if generation succeeds, but mention the narrowed date range.
- Default the page to `DATES[-1]`, the latest available data date.
- Allow the date picker to select only dates with data.
- Daily comparisons use the previous available data date; detail modules that require a natural-yesterday口径 use `date - 1` or the generator's existing `prev` payload.
- Update the password localStorage key to `zfb_pass_multi_YYYY-MM-DD` for the latest date.
- If a source table lacks the target date, generate with existing logic and mention the missing source/date in the final response.

## Category And Business Mapping

Fixed categories:

- 短剧: 趣看小戏、探秘短剧、独乐乐短剧、指尖好戏来、轻影时光
- 播客: 慢声集、声里人间、视星物语、音浪社、夜听集、声阅时光、声享听伴
- 拼量: 月洲资讯聚合站、溜轴简讯头条、柳阳资讯阅闻、半盏时光、清言看点、点禄资讯集、资讯远见社
- 外接: 享宿-酒店自助服务、序贯博门锁管理
- 电商: 三羊甄选、嘉嘉福购、垚盛商行
- 猜价格: 耳语时光、时序品读、乐响资讯简知、今日热报、潮趣互动、乐响热闻口袋、容珍全景见闻、知行讯、福利星球签到领福利、潮讯看点
- 资讯: 凌晶每日知点

Fallback category order: `短剧`, `播客`, `拼量`, `外接`, `电商`, `猜价格`, `资讯`.

Business mapping:

- 短剧、播客、电商、猜价格、资讯 -> `yyz基本`
- 拼量 -> `拼量`
- 外接 -> `外接`

`声享听伴` must be `播客` and `yyz基本`. When adding or changing app categories, update both the generator's `CATS` / `BIZ` and this skill.

## Core Calculation Contract

`calc(date)` is the daily summary core:

- Read rows for the date from `支小应用收入.xls`.
- Aggregate duplicate rows by 小程序名称, summing 访问 UV, 灯火投放 UV, 收入, 广告点击数, and 组件曝光数, then recalculate 平均 CPM.
- Fill 外接 category using the existing external-data logic, only counting it under 外接.
- Read orders from `旧后台订单.xlsx` and `新后台订单.xls`, matching by date and app name/alias in 备注.
- Orders with `换量` in 备注 contribute only to top-level yyz cost supplement, not to individual app detail.
- `新后台` rows with `v4` in 备注 keep order count but set cost to 0.
- `旧后台` rows with `百度极速版` in 备注 keep order count but set cost to 0.
- Per-app 投放成本 equals the date/app sum of 灯火 `消耗（返点后）`.
- Hide app detail rows with income below 1.
- Every division must handle denominator 0.

Single-app formulas:

- 总成本 = yyz成本 + 投放成本
- 毛利 = 收入 - 总成本
- ROI = 收入 / 总成本
- 平均CPC = 收入 / 广告点击数
- 订单ARPU = 收入 / 订单数

Top summary formulas:

- yyz成本 = 已匹配应用 yyz成本 + 换量成本 + 未匹配新后台成本
- 总成本 = yyz成本 + 投放成本
- 总毛利 = 总收入 - 总成本
- ROI = 总收入 / 总成本
- 订单arpu = 总收入 / 总订单
- 平均CPC = 总收入 / 总点击
- 人均广告点击 = 广告点击数 / 支小uv

## HTML Report Contract

The output is a single HTML file with inline CSS/JS and no external CDN. Page title and H1 are `支小应用数据`. Password is `zfb666`. Hide report body and right navigation until password verification passes.

Right navigation:

1. 收入汇总
2. 应用汇总, default active
3. 流量汇总, placeholder button
4. 订单汇总, placeholder button
5. 广告汇总, placeholder button
6. 媒体汇总, independent page

应用汇总 page:

- Default page, date selector defaults to latest date.
- Each `.day-report` contains toolbar, metric cards, collapsible 毛利分析, 汇总数据表, 业务汇总数据表, 类目汇总数据表, 小程序详细数据表.
- 小程序详细数据 supports search, Excel export, recalculated searched totals, sticky header, sticky first 3 columns, and clickable 小程序名称 to open detail.
- Contrast values show current date versus previous available data day with red/green text only.

收入汇总 page:

- Independent right-nav page, hidden by default.
- Show monthly 收入/成本/毛利 cards.
- Show a dynamic dual-axis SVG line chart above the table.
- Trend dropdown options are all income-summary fields except 日期: 申请uv, 支小uv, 订单uv, 总收入, 总成本, yyz成本, 投放成本, 总毛利, ROI, 平均CPC, 广告点击数, 人均广告点击, 订单数, 订单arpu.
- Default left axis is 广告点击数; default right axis is 平均CPC.
- Show only latest-month data in the chart.
- Include `incomeTrendTooltip`.
- Below the income table, show 短剧汇总, 播客汇总, 电商汇总 in that order, with 类目 field removed and dates descending.

媒体汇总 page:

- Independent right-nav page, hidden by default.
- Date dropdown defaults to latest date.
- Top cards: 访问uv, 申请任务uv, 支小uv, 完成uv, 访问uv arpu, 申请uv arpu, 媒体成本, 媒体订单.
- Media table fields: 媒体ID, 媒体名称, 访问uv, 申请uv, 完成uv, 预估收入, 媒体成本, 预估毛利, 订单数, 访问uv arpu.
- Media summary combines `支小媒体数据.xls` and `支小媒体应用任务维度.xls`; forward-fill merged-cell blanks for date/media ID/media name before aggregation.
- Sort by 访问uv, 预估收入, 订单数 descending.

小程序详情 page:

- Header shows 小程序名称, current date, 小程序ID, 业务, 类目.
- Tabs are: 收入数据, 广告位数据, 媒体数据, 订单数据, 投放数据.
- Entering detail defaults to 收入数据; verify final JS calls `switchDetailTab('income', ...)` and renders income and delivery data first.
- 收入数据 tab uses `app_income_detail_html(name)`, shows all dates descending, no comparison values, and colors ROI as >=2.5 green, 2.0-2.5 yellow, <2 red.
- 广告位数据 tab uses `广告位维度汇总.xls` and injects `AD_DETAIL_DATA`.
- 媒体数据 tab uses `应用媒体数据占比 .xls` and injects `MEDIA_DETAIL_DATA`; limit media tables to about 10 rows high with vertical scroll.
- 订单数据 tab injects `ORDER_DETAIL_DATA`, shows 订单汇总, 订单分类, 媒体订单分析, with previous-day波动 where required.
- 投放数据 tab contains 投放 UV 数据, 灯火投放广告数据, and 灯火投放广告类型数据, all for the currently selected date.

投放数据 details:

- 投放 UV fields: 日期, 访问uv, yyz uv, 灯火投放uv, 灯火投放uv占比.
- 灯火投放广告数据 fields: 灯火投放uv, 广告请求, 填充率, 广告曝光, 广告点击, CTR, 人均请求, 人均曝光, 人均点击.
- 灯火投放广告类型数据 groups by `广告类型`; if missing, group by source `广告位类型` while displaying `广告类型`.
- For ad request/exposure fields, prefer `广告请求` / `广告曝光` if present; otherwise use `请求次数` / `广告展示成功`.
- Show natural-yesterday波动 under current values, red for up and green for down.

Front-end data and function names to preserve:

- Data objects: `AVAILABLE_DATES`, `APP_INCOME_DETAIL_DATA`, `APP_DELIVERY_DETAIL_DATA`, `AD_DETAIL_DATA`, `MEDIA_DETAIL_DATA`, `ORDER_DETAIL_DATA`.
- Functions: `switchReportPage`, `switchDate`, `toggleCompare`, `toggleIncomeCompare`, `updateDetail`, `exportTable`, `openAppDetail`, `switchDetailTab`, `renderIncomeDetail`, `renderDeliveryDetail`, `renderAdDetail`, `renderMediaDetail`, `renderOrderDetail`.

Style contract:

- Use inline CSS/JS in a single HTML file.
- Use shallow gray-blue background, white cards, light border, light shadow, system fonts and Microsoft YaHei.
- Use `font-variant-numeric: tabular-nums`.
- Left-align tables; support horizontal and vertical scroll for detail tables.
- Use sticky table headers and sticky first 3 columns for detail tables.
- Use colored labels for category/business.
- Use only red/green text for up/down changes.

## Verification Checklist

After export and generation, verify at minimum:

- Eight newly exported source files were moved to `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表` with canonical filenames.
- `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/支小数据new.html` exists and has a fresh modified time.
- Output HTML contains the latest source date and defaults to that latest date.
- Output HTML contains password `zfb666`.
- localStorage key is `zfb_pass_multi_最新日期`.
- `支小每日数据.html` was not updated unless explicitly requested.
- Navigation contains 收入汇总, 应用汇总, 媒体汇总, and 应用汇总 is default active.
- `mediaSummaryPage` displays when clicking 媒体汇总 and hides the other pages.
- 应用汇总 includes summary, business, category, and app-detail tables.
- 类目汇总 sorts by current-date income descending.
- 收入汇总 includes monthly cards, the dual-axis trend dropdowns `incomeTrendLeftField` and `incomeTrendRightField`, `incomeTrendTooltip`, the field `人均广告点击`, and 短剧/播客/电商 summary modules.
- 媒体汇总 includes date selection, the 8 top cards, and the expected media table fields.
- Output HTML labels `声享听伴` as `yyz基本` and `播客`.
- Generation logs or JSON output include `denghuo_cost` information, merged CSV path, row count, and unmatched row count.
- If `旧后台订单.xlsx` / `旧后台订单.xls`, `支小应用收入_历史缓存.xlsx`, or latest-date 灯火 rebate CSV is missing, confirm the generator emitted notes and include them in the final response.
- Injected objects `APP_INCOME_DETAIL_DATA`, `APP_DELIVERY_DETAIL_DATA`, `AD_DETAIL_DATA`, `MEDIA_DETAIL_DATA`, and `ORDER_DETAIL_DATA` exist.
- Detail tabs are in the fixed order and default to 收入数据.
- 投放数据 tab shows only the current date, includes 投放 UV, 灯火投放广告数据, and 灯火投放广告类型数据, with natural-yesterday波动 under current values.

Optional local HTTP verification:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:8000/%E6%94%AF%E5%B0%8F%E6%95%B0%E6%8D%AEnew.html' -UseBasicParsing -TimeoutSec 10
```

## LAN Service

Only when the user asks to start or restart LAN access, prefer the existing single-file server:

```powershell
python -m py_compile "/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/serve_report_lan.py"
Start-Process -WindowStyle Hidden -WorkingDirectory "/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis" -FilePath "python" -ArgumentList "/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/serve_report_lan.py"
```

`serve_report_lan.py` should expose only `支小数据new.html`; `/` redirects to the report and other paths return `404`. Do not default to directory-level `python -m http.server`.

After starting, verify:

```powershell
netstat -ano | Select-String ':8000'
Invoke-WebRequest -Uri 'http://127.0.0.1:8000/%E6%94%AF%E5%B0%8F%E6%95%B0%E6%8D%AEnew.html' -Method Head -UseBasicParsing -TimeoutSec 10
```

If port 8000 already has a service, identify the old process and ask before stopping it.

## Final Response

When the workflow completes, respond briefly with:

- Exported file paths.
- Updated date or feature.
- Output HTML path.
- Key verification results.
- Missing source tables or rows not included.
- Any generator notes, especially optional old-order data, missing income history cache, or missing latest-date 灯火 rebate CSV.
