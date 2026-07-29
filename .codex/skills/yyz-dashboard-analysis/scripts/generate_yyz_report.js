#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const sourcePath = arg('source');
if (!sourcePath) {
  console.error('Usage: generate_yyz_report.js --source <source.json> [--out <report.html>] [--history-days <days>]');
  process.exit(2);
}
const src = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

function inclusiveDays(start, end) {
  const startMs = Date.parse(`${start || ''}T00:00:00Z`);
  const endMs = Date.parse(`${end || ''}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

const targetWindow = src.windows?.find(window => window.key === 'target') || {};
const historyWindow = src.windows?.find(window => window.key === 'history') || {};
const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(targetWindow.start || '') ? targetWindow.start : 'target';
const outPath = arg('out', path.join('YYZ', 'outputs', 'yyz-dashboard-analysis', targetDate, 'report.html'));
const derivedHistoryDays = inclusiveDays(historyWindow.start, historyWindow.end);
const historyDays = Number(arg('history-days', String(derivedHistoryDays || 91))) || 91;
const displaySourcePath = path.relative(process.cwd(), path.resolve(sourcePath)) || path.basename(sourcePath);
const num = (v) => {
  const s = String(v ?? '').replace(/,/g, '').replace(/%/g, '').replace(/¥/g, '').trim();
  if (!s || s === '-' || s === '暂无数据') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: d, minimumFractionDigits: d });
const money = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (a, b) => b ? (a - b) / b : 0;
const pctFmt = (x, d = 1) => (Number(x || 0) * 100).toFixed(d) + '%';
const rate = (v) => Number(v || 0).toFixed(2) + '%';
const pp = (a, b) => (num(a) - num(b)).toFixed(2) + 'pp';
const rec = (key, win) => src.data?.[key]?.[win];
const table = (r) => r?.tables?.[0];
const rows = (r) => {
  const t = table(r);
  return (t?.rows || [])
    .map(row => Object.fromEntries((t.headers || []).map((h, i) => [h, row[i] ?? ''])))
    .filter(o => Object.values(o).some(v => v && v !== '暂无数据'));
};
const summary = (r) => {
  const t = table(r);
  const row = t?.summaryRows?.[0];
  return row ? Object.fromEntries((t.headers || []).map((h, i) => [h, row[i] ?? ''])) : null;
};
const first = (key, win) => rows(rec(key, win))[0] || {};
const sum = (key, win) => summary(rec(key, win)) || first(key, win) || {};
const rowHtml = (cells) => '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
const th = (cells) => '<tr>' + cells.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
const trend = (value, goodUp = true) => `<b class="${(goodUp ? value >= 0 : value <= 0) ? 'good' : 'bad'}">${pctFmt(value)}</b>`;
const badge = (text, type = '') => `<span class="badge ${type}">${esc(text)}</span>`;
const metric = (label, value, sub, type = '') => `<div class="metric ${type}"><span>${esc(label)}</span><strong>${value}</strong><em>${sub}</em></div>`;

const target = sum('project', 'target');
const compare = sum('project', 'compare');
const history = sum('project', 'history');
const histAvg = {};
for (const key of ['收入','成本','毛利','访问人数','申请任务人数','完成任务人数','完成任务次数','申请任务次数','展示任务人数','点击任务人数']) histAvg[key] = num(history[key]) / historyDays;
histAvg['毛利率'] = num(history['毛利率']);

const budgetT = rows(rec('budget', 'target')).filter(r => r['业务线'] && r['业务线'] !== '-').map(r => ({
  name: r['业务线'], cost: num(r['成本']), apply: num(r['申请任务人数']), finishUsers: num(r['完成任务人数']), finish: num(r['完成任务次数']), taskRate: num(r['任务完成率']), perApply: num(r['访问用户人均申请']), perFinish: num(r['访问用户人均完成'])
}));
const budgetC = new Map(rows(rec('budget', 'compare')).filter(r => r['业务线']).map(r => [r['业务线'], {cost:num(r['成本']), finish:num(r['完成任务次数'])}]));
const totalBudgetCost = budgetT.reduce((a, x) => a + x.cost, 0);
const budgetRows = budgetT.sort((a, b) => b.cost - a.cost).map(x => ({...x, prev: budgetC.get(x.name) || {}, share: totalBudgetCost ? x.cost / totalBudgetCost : 0}));

const mediaT = rows(rec('mediaData', 'target')).map(r => ({media:r['媒体'], revenue:num(r['收入']), cost:num(r['成本']), profit:num(r['毛利']), roi:num(r['ROI投入产出比']), dau:num(r['DAU']), apply:num(r['申请任务人数']), finishUsers:num(r['完成任务人数']), finishOrders:num(r['完成订单数']), userRate:num(r['用户完成率'])}));
const mediaC = new Map(rows(rec('mediaData', 'compare')).map(r => [r['媒体'], {profit:num(r['毛利'])}]));
const topMedia = mediaT.sort((a, b) => b.profit - a.profit).slice(0, 10).map(x => ({...x, prev: mediaC.get(x.media) || {}}));
const mediaBudget = rows(rec('mediaBudget', 'target')).map(r => ({media:r['媒体'], budget:r['业务线'], cost:num(r['成本']), apply:num(r['申请任务人数']), finishUsers:num(r['完成任务人数']), finish:num(r['完成任务次数']), taskRate:num(r['任务完成率']), visitUsers:num(r['访问人数'])})).sort((a,b)=>b.cost-a.cost).slice(0,12);
const funnel = first('userActionTotal', 'target');
const funnelPrev = first('userActionTotal', 'compare');
const funnelRows = [['访问人数','访问人数'],['展示任务人数','展示任务人数'],['点击任务人数','点击任务人数'],['申请任务人数','申请任务人数'],['完成任务人数','完成任务人数'],['完成任务次数','完成任务次数']];

const reasons = [
  `目标日收入较对比日变化 ${money(num(target['收入']) - num(compare['收入']))}，成本变化 ${money(num(target['成本']) - num(compare['成本']))}，毛利变化 ${money(num(target['毛利']) - num(compare['毛利']))}。`,
  `对比历史日均：收入 ${pctFmt(pct(num(target['收入']), histAvg['收入']))}，成本 ${pctFmt(pct(num(target['成本']), histAvg['成本']))}，毛利 ${pctFmt(pct(num(target['毛利']), histAvg['毛利']))}。`,
  `成本结构中，${budgetRows.slice(0,3).map(x=>`${x.name} ${money(x.cost)}`).join('、')} 是主要预算消耗。`,
  `媒体利润侧，${topMedia.slice(0,4).map(x=>x.media).join('、')} 是主要正毛利来源。`
];

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YYZ项目数据分析</title><style>
body{margin:0;font:14px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#1d2939}header{padding:34px 42px 22px;background:#f6f9ff;border-bottom:1px solid #d0d5dd}main{padding:0 42px 48px;max-width:1500px}h1{margin:0 0 8px;font-size:30px}h2{margin:32px 0 12px;padding-left:10px;border-left:4px solid #175cd3;font-size:21px}h3{font-size:17px}.meta,.note{color:#667085}.metrics{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:12px;margin:18px 0}.metric{border:1px solid #d0d5dd;border-radius:8px;padding:13px}.metric span{display:block;color:#667085;font-size:12px}.metric strong{display:block;font-size:24px;margin:6px 0}.metric em{font-style:normal;color:#667085;font-size:12px}.warn{background:#fffbeb}.bad{color:#b42318}.good{color:#067647}.scroll{overflow:auto;border:1px solid #d0d5dd;border-radius:8px;margin:10px 0 18px}table{border-collapse:collapse;width:100%;min-width:980px;font-size:13px}th,td{border-bottom:1px solid #d0d5dd;border-right:1px solid #d0d5dd;padding:8px 9px;text-align:right;vertical-align:top}th{background:#f2f4f7}td:first-child,th:first-child{text-align:left}.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f6}.badge.good{background:#dcfae6;color:#067647}.badge.bad{background:#fee4e2;color:#b42318}.badge.warn{background:#fef0c7;color:#93370d}.panel{border:1px solid #d0d5dd;border-radius:8px;padding:16px;margin:12px 0}.callout{border-left:4px solid #175cd3;background:#f7fbff;padding:10px 12px;margin:8px 0;border-radius:6px}@media(max-width:980px){header,main{padding-left:18px;padding-right:18px}.metrics{grid-template-columns:1fr}}
</style></head><body><header><h1>YYZ 项目数据分析</h1><div class="meta">目标窗口：${esc(src.windows?.find(w=>w.key==='target')?.label || 'target')}；对比窗口：${esc(src.windows?.find(w=>w.key==='compare')?.label || 'compare')}；历史窗口：${esc(src.windows?.find(w=>w.key==='history')?.label || 'history')}</div></header><main>
<section class="metrics">${metric('收入',money(num(target['收入'])),`vs对比 ${trend(pct(num(target['收入']),num(compare['收入'])))}；vs历史 ${trend(pct(num(target['收入']),histAvg['收入']))}`)}${metric('成本',money(num(target['成本'])),`vs对比 ${trend(pct(num(target['成本']),num(compare['成本'])),false)}；vs历史 ${trend(pct(num(target['成本']),histAvg['成本']),false)}`,'warn')}${metric('毛利',money(num(target['毛利'])),`vs对比 ${trend(pct(num(target['毛利']),num(compare['毛利'])))}；vs历史 ${trend(pct(num(target['毛利']),histAvg['毛利']))}`)}${metric('毛利率',rate(num(target['毛利率'])),`对比 ${pp(target['毛利率'],compare['毛利率'])}；历史 ${rate(histAvg['毛利率'])}`)}${metric('完成任务人数',fmt(num(target['完成任务人数'])),`任务完成率 ${rate(num(target['任务完成率']))}`)}</section>
<div class="panel"><h2>Part3 汇总关键波动和原因</h2>${reasons.map(r=>`<div class="callout">${esc(r)}</div>`).join('')}<h3>优化建议</h3><ol><li>优先保留高毛利媒体和完成率稳定预算，逐步放量。</li><li>预算侧按成本占比、任务完成率和完成人均完成三项建立阈值。</li><li>媒体×预算维度排查同一媒体下低转化预算，避免用高质量媒体承接低效任务。</li><li>目标日低于历史毛利率时，先降本和优化漏斗，再追求收入放量。</li></ol></div>
<h2>Part1 营收角度</h2><h3>1. 项目总成本、毛利、组成和波动原因</h3><div class="scroll"><table><thead>${th(['指标','目标日','对比日','日环比','历史日均/历史率','对历史'])}</thead><tbody>${['收入','成本','毛利','访问人数','申请任务人数','完成任务人数','完成任务次数'].map(k=>rowHtml([esc(k),['收入','成本','毛利'].includes(k)?money(num(target[k])):fmt(num(target[k])),['收入','成本','毛利'].includes(k)?money(num(compare[k])):fmt(num(compare[k])),trend(pct(num(target[k]),num(compare[k])),k!=='成本'),['收入','成本','毛利'].includes(k)?money(histAvg[k]):fmt(histAvg[k]),trend(pct(num(target[k]),histAvg[k]),k!=='成本')])).join('')}${rowHtml(['毛利率',rate(num(target['毛利率'])),rate(num(compare['毛利率'])),pp(target['毛利率'],compare['毛利率']),rate(histAvg['毛利率']),pp(target['毛利率'],histAvg['毛利率'])])}</tbody></table></div>
<h3>2. 预算：总成本、毛利、分预算、组成和波动原因</h3><div class="scroll"><table><thead>${th(['预算/业务线','成本','成本占比','申请人数','完成人数','完成任务次数','任务完成率'])}</thead><tbody>${budgetRows.map(x=>rowHtml([esc(x.name),money(x.cost),pctFmt(x.share),fmt(x.apply),fmt(x.finishUsers),fmt(x.finish),rate(x.taskRate)])).join('')}</tbody></table></div>
<h3>3. 预算分媒体：同一预算跑不同媒体</h3><div class="scroll"><table><thead>${th(['媒体','预算','成本','申请人数','完成人数','完成任务次数','任务完成率'])}</thead><tbody>${mediaBudget.map(x=>rowHtml([esc(x.media),esc(x.budget),money(x.cost),fmt(x.apply),fmt(x.finishUsers),fmt(x.finish),rate(x.taskRate)])).join('')}</tbody></table></div>
<h3>4. 流量：分媒体营收、成本、毛利</h3><div class="scroll"><table><thead>${th(['媒体','收入','成本','毛利','ROI','申请人数','完成人数','完成订单数'])}</thead><tbody>${topMedia.map(x=>rowHtml([esc(x.media),money(x.revenue),money(x.cost),money(x.profit),fmt(x.roi,2),fmt(x.apply),fmt(x.finishUsers),fmt(x.finishOrders)])).join('')}</tbody></table></div>
<h3>5. 流量：媒体分预算角度</h3><p class="note">使用媒体×预算报表当前页成本 TOP 作为主要组成解释。</p>
<h2>Part2 漏斗角度</h2><h3>1. 预算漏斗与人均订单</h3><div class="scroll"><table><thead>${th(['预算/业务线','申请人数','完成人数','申请→完成','完成任务次数','完成人均完成','访问人均申请','访问人均完成'])}</thead><tbody>${budgetRows.map(x=>rowHtml([esc(x.name),fmt(x.apply),fmt(x.finishUsers),pctFmt(x.finishUsers/(x.apply||1)),fmt(x.finish),fmt(x.finish/(x.finishUsers||1),2),fmt(x.perApply,2),fmt(x.perFinish,2)])).join('')}</tbody></table></div>
<h3>2. 流量漏斗与分媒体人均订单</h3><div class="scroll"><table><thead>${th(['漏斗节点','目标日','对比日','日环比','历史日均','对历史'])}</thead><tbody>${funnelRows.map(([name,k])=>rowHtml([esc(name),fmt(num(funnel[k])),fmt(num(funnelPrev[k])),trend(pct(num(funnel[k]),num(funnelPrev[k]))),histAvg[k]?fmt(histAvg[k]):'-',histAvg[k]?trend(pct(num(funnel[k]),histAvg[k])):'-'])).join('')}</tbody></table></div>
<p class="note">数据文件：${esc(displaySourcePath)}。部分明细表只读取当前页，用于解释主要组成，不替代最终财务结算。</p></main></body></html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(JSON.stringify({ outPath, sourcePath, revenue: num(target['收入']), cost: num(target['成本']), profit: num(target['毛利']) }, null, 2));
