const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TRAINING_OUTPUT_DIR = path.join(__dirname, '../../DaAgent/Distillation/output/training');
const ROLLUP_DB_PATH = path.join(TRAINING_OUTPUT_DIR, 'zhixiao_canonical_rollup.sqlite');
const EVAL_RUN_PATH = path.join(TRAINING_OUTPUT_DIR, 'zhixiao_eval_offline_run.json');

const BUSINESS_LINE_LABELS = {
  zhixiao: '支小',
};

const PRODUCT_METRICS = ['收入', '订单数'];
const MEDIA_METRICS = ['订单数'];
const PRODUCT_ROLE_MAP = {
  revenue_diagnosis: { business_side: '预算侧', budget_side: 'C端', owner_role: 'C端预算策略负责人' },
  budget_adjustment: { business_side: '预算侧', budget_side: 'C端', owner_role: 'C端预算运营负责人' },
  media_mix: { business_side: '流量侧', budget_side: '共享', owner_role: '流量运营' },
  collaboration: { business_side: '协同', budget_side: '共享', owner_role: '部门负责人' },
};

let rollupDbCache = null;
let rollupDbMtimeMs = null;
let suggestionsCache = null;
let suggestionsCacheKey = null;

function statMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getRollupDb() {
  const currentMtimeMs = statMtimeMs(ROLLUP_DB_PATH);
  if (!currentMtimeMs) return null;
  if (!rollupDbCache || rollupDbMtimeMs !== currentMtimeMs) {
    if (rollupDbCache) {
      try { rollupDbCache.close(); } catch {}
    }
    rollupDbCache = new Database(ROLLUP_DB_PATH, { readonly: true, fileMustExist: true });
    rollupDbCache.pragma('query_only = ON');
    rollupDbMtimeMs = currentMtimeMs;
  }
  return rollupDbCache;
}

function parseDay(value) {
  return String(value || '').slice(0, 10);
}

function shiftDay(day, offset) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildDayRange(endDay, length) {
  return Array.from({ length }, (_, index) => shiftDay(endDay, index - length + 1));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function avg(values) {
  return values.length ? sum(values) / values.length : 0;
}

function round(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return 0;
  return Number(Number(value).toFixed(digits));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatCount(value) {
  return Math.round(Number(value) || 0).toLocaleString('zh-CN');
}

function formatCurrency(value) {
  return round(value, 2).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '0%';
  return `${round(value, digits).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function getTrendPercent(currentValue, previousValue) {
  if (!Number.isFinite(Number(previousValue)) || Number(previousValue) === 0) return null;
  return ((Number(currentValue) - Number(previousValue)) / Number(previousValue)) * 100;
}

function detailScore(row) {
  return ['media_name', 'channel_name', 'experiment_key'].reduce((score, key) => (
    score + (row[key] ? 1 : 0)
  ), 0);
}

function choosePreferredRow(currentRow, nextRow) {
  if (!currentRow) return nextRow;
  const currentScore = detailScore(currentRow);
  const nextScore = detailScore(nextRow);
  if (nextScore < currentScore) return nextRow;
  if (nextScore > currentScore) return currentRow;
  if (nextRow.subject_name && !currentRow.subject_name) return nextRow;
  if (!nextRow.subject_name && currentRow.subject_name) return currentRow;
  if (Math.abs(Number(nextRow.metric_value_sum) || 0) > Math.abs(Number(currentRow.metric_value_sum) || 0)) return nextRow;
  return currentRow;
}

function dedupePreferredRows(rows, keyBuilder) {
  const rowMap = new Map();
  rows.forEach(row => {
    const key = keyBuilder(row);
    rowMap.set(key, choosePreferredRow(rowMap.get(key), row));
  });
  return [...rowMap.values()];
}

function getOrCreate(map, key, factory) {
  if (!map.has(key)) map.set(key, factory());
  return map.get(key);
}

function buildProductStats(productRows, latestDay) {
  const productMetricMap = new Map();
  productRows.forEach(row => {
    const productName = row.product_name;
    if (!productName) return;
    const metricMap = getOrCreate(productMetricMap, productName, () => new Map());
    const dayMap = getOrCreate(metricMap, row.metric_code, () => new Map());
    dayMap.set(row.day, row);
  });

  const recentDays = buildDayRange(latestDay, 7);
  const previousDays = buildDayRange(shiftDay(latestDay, -7), 7);

  return [...productMetricMap.entries()].map(([productName, metricMap]) => {
    const revenueByDay = metricMap.get('收入') || new Map();
    const orderByDay = metricMap.get('订单数') || new Map();
    const recentRevenueSeries = recentDays.map(day => Number(revenueByDay.get(day)?.metric_value_sum) || 0);
    const previousRevenueSeries = previousDays.map(day => Number(revenueByDay.get(day)?.metric_value_sum) || 0);
    const recentOrderSeries = recentDays.map(day => Number(orderByDay.get(day)?.metric_value_sum) || 0);
    const previousOrderSeries = previousDays.map(day => Number(orderByDay.get(day)?.metric_value_sum) || 0);
    const latestRevenueRow = revenueByDay.get(latestDay) || null;
    const latestOrderRow = orderByDay.get(latestDay) || null;
    const subjectName = latestRevenueRow?.subject_name || latestOrderRow?.subject_name || null;
    const recentRevenueAvg = avg(recentRevenueSeries);
    const previousRevenueAvg = avg(previousRevenueSeries);
    const recentOrderAvg = avg(recentOrderSeries);
    const previousOrderAvg = avg(previousOrderSeries);
    return {
      product_name: productName,
      subject_name: subjectName,
      business_line: latestRevenueRow?.business_line || latestOrderRow?.business_line || 'zhixiao',
      recent_revenue_avg: recentRevenueAvg,
      previous_revenue_avg: previousRevenueAvg,
      recent_revenue_sum: sum(recentRevenueSeries),
      previous_revenue_sum: sum(previousRevenueSeries),
      recent_order_avg: recentOrderAvg,
      previous_order_avg: previousOrderAvg,
      recent_order_sum: sum(recentOrderSeries),
      previous_order_sum: sum(previousOrderSeries),
      revenue_pct_change: getTrendPercent(recentRevenueAvg, previousRevenueAvg),
      order_pct_change: getTrendPercent(recentOrderAvg, previousOrderAvg),
      latest_revenue: Number(latestRevenueRow?.metric_value_sum) || 0,
      latest_orders: Number(latestOrderRow?.metric_value_sum) || 0,
      latest_revenue_row: latestRevenueRow,
      latest_order_row: latestOrderRow,
    };
  });
}

function buildMediaShareStats(mediaRows, productStats, latestDay) {
  const mediaMetricMap = new Map();
  mediaRows.forEach(row => {
    if (!row.product_name || !row.media_name) return;
    const productMap = getOrCreate(mediaMetricMap, row.product_name, () => new Map());
    const metricMap = getOrCreate(productMap, row.metric_code, () => new Map());
    metricMap.set(row.media_name, row);
  });

  return productStats.flatMap(productStat => {
    const metricMap = mediaMetricMap.get(productStat.product_name);
    if (!metricMap) return [];
    const orderRows = [...(metricMap.get('订单数') || new Map()).values()]
      .filter(row => row.day === latestDay)
      .sort((a, b) => Number(b.metric_value_sum || 0) - Number(a.metric_value_sum || 0));
    if (orderRows.length === 0) return [];
    const totalOrders = productStat.latest_orders > 0
      ? productStat.latest_orders
      : sum(orderRows.map(row => Number(row.metric_value_sum) || 0));
    if (!totalOrders) return [];
    const topRow = orderRows[0];
    const secondRow = orderRows[1] || null;
    return [{
      product_name: productStat.product_name,
      subject_name: productStat.subject_name,
      business_line: productStat.business_line,
      total_orders: totalOrders,
      top_media_name: topRow.media_name,
      top_media_orders: Number(topRow.metric_value_sum) || 0,
      top_media_share_pct: ((Number(topRow.metric_value_sum) || 0) / totalOrders) * 100,
      second_media_name: secondRow?.media_name || null,
      second_media_orders: Number(secondRow?.metric_value_sum) || 0,
      second_media_share_pct: secondRow ? ((Number(secondRow.metric_value_sum) || 0) / totalOrders) * 100 : 0,
      top_media_row: topRow,
      second_media_row: secondRow,
    }];
  });
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}

function statusFromPriority(priority, ready = false) {
  if (ready) return 'ready_to_execute';
  if (priority === 'low') return 'observing';
  return 'pending_review';
}

function buildReportNameLookup(db, groupHashes) {
  if (!groupHashes.length) return new Map();
  const uniqueHashes = [...new Set(groupHashes.filter(Boolean))];
  const placeholders = uniqueHashes.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT group_hash, report_name_cn
    FROM canonical_fact_source_reports
    WHERE group_hash IN (${placeholders})
  `).all(...uniqueHashes);
  const reportMap = new Map();
  rows.forEach(row => {
    const list = getOrCreate(reportMap, row.group_hash, () => []);
    if (row.report_name_cn && !list.includes(row.report_name_cn)) list.push(row.report_name_cn);
  });
  return reportMap;
}

function withSuggestionMeta(baseSuggestion, type) {
  return {
    ...baseSuggestion,
    ...PRODUCT_ROLE_MAP[type],
    type,
  };
}

function buildRevenueDropSuggestion(productStat, latestDay, recentStartDay, reportMap, mediaShareStat = null) {
  const revenueChangePct = productStat.revenue_pct_change || 0;
  const orderChangePct = productStat.order_pct_change;
  const priority = revenueChangePct <= -18 ? 'high' : 'medium';
  const confidence = round(clamp(
    80 + Math.min(10, Math.abs(revenueChangePct) / 3) + (productStat.recent_revenue_avg >= 5000 ? 3 : 0),
    80,
    94,
  ), 0);
  const evidenceHashes = [
    productStat.latest_revenue_row?.group_hash,
    productStat.latest_order_row?.group_hash,
    mediaShareStat?.top_media_row?.group_hash,
  ].filter(Boolean);
  const evidenceSources = [...new Set(evidenceHashes.flatMap(hash => reportMap.get(hash) || []))];
  const title = `${productStat.product_name}近7日收入较前7日回落${formatPercent(Math.abs(revenueChangePct))}`;
  const summary = `${productStat.product_name}近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，较前7日日均 ${formatCurrency(productStat.previous_revenue_avg)} 元下降 ${formatPercent(Math.abs(revenueChangePct))}。建议先从预算动作和核心入口质量排查。`;
  const highlights = [
    `近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，较前7日下降 ${formatPercent(Math.abs(revenueChangePct))}。`,
    `近7日日均订单 ${formatCount(productStat.recent_order_avg)}，${orderChangePct === null ? '前序窗口样本不足。' : `较前7日${orderChangePct >= 0 ? '变化' : '下降'} ${formatPercent(Math.abs(orderChangePct))}。`}`,
  ];
  if (mediaShareStat) {
    highlights.push(`最新一天 ${mediaShareStat.top_media_name} 贡献订单占比 ${formatPercent(mediaShareStat.top_media_share_pct)}，需要同步核验入口结构是否过于集中。`);
  }
  return withSuggestionMeta({
    id: `ai-revenue-drop-${productStat.product_name}`,
    title,
    priority,
    status: statusFromPriority(priority),
    confidence,
    business_line: BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小',
    summary,
    recommendation: `先复核 ${productStat.product_name} 最近 3 天预算变更、入口切换与异常名单，再优先收缩低转化入口的试探量。`,
    expected_impact: '先止住回撤段的无效消耗，再缩短异常定位时间。',
    window_label: `样本窗：${recentStartDay} ~ ${latestDay}`,
    scope_tags: ['预算侧', '收入回撤', BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小'],
    evidence_sources: evidenceSources.length > 0 ? evidenceSources : ['蒸馏事实表'],
    evidence_highlights: highlights,
    actions: [
      '复核最近 3 天预算与入口变更清单',
      '拉齐收入、订单与媒体结构的异常段',
      '对低转化入口先做小幅收量并观察次日回传',
    ],
    related_product_name: productStat.product_name,
    related_subject_name: productStat.subject_name,
  }, 'revenue_diagnosis');
}

function buildGrowthSuggestion(productStat, latestDay, recentStartDay, reportMap) {
  const revenueChangePct = productStat.revenue_pct_change || 0;
  const orderChangePct = productStat.order_pct_change || 0;
  const priority = revenueChangePct >= 18 ? 'high' : 'medium';
  const confidence = round(clamp(
    79 + Math.min(11, revenueChangePct / 4) + (productStat.recent_revenue_avg >= 8000 ? 2 : 0),
    79,
    93,
  ), 0);
  const evidenceHashes = [
    productStat.latest_revenue_row?.group_hash,
    productStat.latest_order_row?.group_hash,
  ].filter(Boolean);
  const evidenceSources = [...new Set(evidenceHashes.flatMap(hash => reportMap.get(hash) || []))];
  return withSuggestionMeta({
    id: `ai-growth-${productStat.product_name}`,
    title: `${productStat.product_name}近7日收入提升${formatPercent(revenueChangePct)}，可分层回补预算`,
    priority,
    status: 'ready_to_execute',
    confidence,
    business_line: BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小',
    summary: `${productStat.product_name}近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，较前7日增长 ${formatPercent(revenueChangePct)}；订单日均同步变化 ${formatPercent(orderChangePct)}。当前更适合小步回补，而不是一次性放量。`,
    recommendation: `优先给 ${productStat.product_name} 做分层回补：先补核心入口 10% 左右，再连续观察 2-3 天收入与订单是否继续同向增长。`,
    expected_impact: '把增长段延续下来，同时避免一次性抬量放大波动。',
    window_label: `样本窗：${recentStartDay} ~ ${latestDay}`,
    scope_tags: ['预算侧', '增长段', BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小'],
    evidence_sources: evidenceSources.length > 0 ? evidenceSources : ['蒸馏事实表'],
    evidence_highlights: [
      `近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，较前7日增长 ${formatPercent(revenueChangePct)}。`,
      `近7日日均订单 ${formatCount(productStat.recent_order_avg)}，较前7日变化 ${formatPercent(orderChangePct)}。`,
      `最新一天收入 ${formatCurrency(productStat.latest_revenue)} 元，订单 ${formatCount(productStat.latest_orders)}。`,
    ],
    actions: [
      '给核心入口补 10% 左右测试量',
      '按天跟踪收入与订单是否继续同向增长',
      '若次日效率回落，优先撤回新增试探量',
    ],
    related_product_name: productStat.product_name,
    related_subject_name: productStat.subject_name,
  }, 'budget_adjustment');
}

function buildMediaMixSuggestion(mediaShareStat, latestDay, reportMap) {
  const priority = mediaShareStat.top_media_share_pct >= 35 ? 'high' : 'medium';
  const confidence = round(clamp(
    77 + Math.min(12, mediaShareStat.top_media_share_pct / 4) + (mediaShareStat.total_orders >= 10000 ? 3 : 0),
    77,
    92,
  ), 0);
  const evidenceHashes = [
    mediaShareStat.top_media_row?.group_hash,
    mediaShareStat.second_media_row?.group_hash,
  ].filter(Boolean);
  const evidenceSources = [...new Set(evidenceHashes.flatMap(hash => reportMap.get(hash) || []))];
  return withSuggestionMeta({
    id: `ai-media-mix-${mediaShareStat.product_name}`,
    title: `${mediaShareStat.product_name}订单向 ${mediaShareStat.top_media_name} 偏集中，建议补第二梯队测试量`,
    priority,
    status: 'ready_to_execute',
    confidence,
    business_line: BUSINESS_LINE_LABELS[mediaShareStat.business_line] || mediaShareStat.business_line || '支小',
    summary: `最新一天 ${mediaShareStat.product_name} 共产生 ${formatCount(mediaShareStat.total_orders)} 单，其中 ${mediaShareStat.top_media_name} 占 ${formatPercent(mediaShareStat.top_media_share_pct)}。当单媒体占比偏高时，日波动会更敏感。`,
    recommendation: mediaShareStat.second_media_name
      ? `保持 ${mediaShareStat.top_media_name} 核心量级不变，同时给 ${mediaShareStat.second_media_name} 等第二梯队媒体补一轮 2-3 天测试量。`
      : `保持核心媒体量级不变，同时补一轮第二梯队媒体测试量，降低单媒体波动影响。`,
    expected_impact: '降低媒体过度集中的波动风险，让放量更平滑。',
    window_label: `样本窗：${latestDay}`,
    scope_tags: ['流量侧', '媒体结构', BUSINESS_LINE_LABELS[mediaShareStat.business_line] || mediaShareStat.business_line || '支小'],
    evidence_sources: evidenceSources.length > 0 ? evidenceSources : ['蒸馏事实表'],
    evidence_highlights: [
      `${mediaShareStat.top_media_name} 最新一天贡献订单 ${formatCount(mediaShareStat.top_media_orders)}，占比 ${formatPercent(mediaShareStat.top_media_share_pct)}。`,
      mediaShareStat.second_media_name
        ? `${mediaShareStat.second_media_name} 同期贡献订单 ${formatCount(mediaShareStat.second_media_orders)}，占比 ${formatPercent(mediaShareStat.second_media_share_pct)}。`
        : '第二梯队媒体样本较少，建议先补少量测试量观察。',
      `该产品最新一天总订单 ${formatCount(mediaShareStat.total_orders)}，具备做结构微调的样本基础。`,
    ],
    actions: [
      '拉出第二梯队媒体清单并分配小额测试量',
      '连续观察 2-3 天订单占比和收入波动',
      '保留高质量媒体的最小有效配额',
    ],
    related_product_name: mediaShareStat.product_name,
    related_subject_name: mediaShareStat.subject_name,
  }, 'media_mix');
}

function buildCollaborationSuggestion(productStat, latestDay, recentStartDay, reportMap, mediaShareStat = null) {
  const evidenceHashes = [
    productStat.latest_revenue_row?.group_hash,
    productStat.latest_order_row?.group_hash,
    mediaShareStat?.top_media_row?.group_hash,
  ].filter(Boolean);
  const evidenceSources = [...new Set(evidenceHashes.flatMap(hash => reportMap.get(hash) || []))];
  const revenueChangePct = productStat.revenue_pct_change || 0;
  return withSuggestionMeta({
    id: `ai-collaboration-${productStat.product_name}`,
    title: `${productStat.product_name}收入回撤段需要预算侧与流量侧联合复盘`,
    priority: 'high',
    status: 'pending_review',
    confidence: round(clamp(82 + Math.min(10, Math.abs(revenueChangePct) / 3), 82, 93), 0),
    business_line: BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小',
    summary: `${productStat.product_name}近7日收入较前7日回落 ${formatPercent(Math.abs(revenueChangePct))}。这个阶段更适合让预算侧和流量侧在同一观察窗内复盘预算动作与媒体结构，而不是分开看。`,
    recommendation: `创建一条联合复盘任务，预算侧给出预算与入口变更记录，流量侧给出媒体结构与量级波动说明，当天完成一次口径对齐。`,
    expected_impact: '减少跨角色反复对口径，缩短问题闭环时间。',
    window_label: `样本窗：${recentStartDay} ~ ${latestDay}`,
    scope_tags: ['协同', '联合复盘', BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小'],
    evidence_sources: evidenceSources.length > 0 ? evidenceSources : ['蒸馏事实表'],
    evidence_highlights: [
      `近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，较前7日下降 ${formatPercent(Math.abs(revenueChangePct))}。`,
      `近7日日均订单 ${formatCount(productStat.recent_order_avg)}，需要与预算动作一起复核。`,
      mediaShareStat
        ? `最新一天 ${mediaShareStat.top_media_name} 订单占比 ${formatPercent(mediaShareStat.top_media_share_pct)}，建议同步核验媒体结构是否放大了波动。`
        : '建议将预算动作、入口切换与订单变化放进同一复盘窗口。',
    ],
    actions: [
      '创建预算侧/流量侧联合复盘任务',
      '统一异常观察窗与复盘口径',
      '沉淀一次可复用的收入回撤排查模板',
    ],
    related_product_name: productStat.product_name,
    related_subject_name: productStat.subject_name,
  }, 'collaboration');
}

function buildObservationSuggestion(productStat, latestDay, recentStartDay, reportMap) {
  const evidenceHashes = [
    productStat.latest_revenue_row?.group_hash,
    productStat.latest_order_row?.group_hash,
  ].filter(Boolean);
  const evidenceSources = [...new Set(evidenceHashes.flatMap(hash => reportMap.get(hash) || []))];
  const pctText = productStat.revenue_pct_change === null
    ? '从低基数开始抬头'
    : `提升 ${formatPercent(productStat.revenue_pct_change)}`;
  return withSuggestionMeta({
    id: `ai-observing-${productStat.product_name}`,
    title: `${productStat.product_name}收入开始抬头，但仍建议继续观察`,
    priority: 'low',
    status: 'observing',
    confidence: round(clamp(72 + Math.min(10, productStat.recent_revenue_avg / 60), 72, 84), 0),
    business_line: BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小',
    summary: `${productStat.product_name}近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，${pctText}，但当前绝对量仍不高，贸然扩量容易把判断做偏。`,
    recommendation: `先保持当前量级，再补 2-3 天观察窗，等收入与订单继续同向增长后再决定是否加量。`,
    expected_impact: '避免低基数误判，把试探量放在更稳的判断之后。',
    window_label: `样本窗：${recentStartDay} ~ ${latestDay}`,
    scope_tags: ['观察', '低基数增长', BUSINESS_LINE_LABELS[productStat.business_line] || productStat.business_line || '支小'],
    evidence_sources: evidenceSources.length > 0 ? evidenceSources : ['蒸馏事实表'],
    evidence_highlights: [
      `近7日日均收入 ${formatCurrency(productStat.recent_revenue_avg)} 元，前7日日均 ${formatCurrency(productStat.previous_revenue_avg)} 元。`,
      `近7日日均订单 ${formatCount(productStat.recent_order_avg)}，当前仍属于小规模样本。`,
      `最新一天收入 ${formatCurrency(productStat.latest_revenue)} 元，建议先延长观察窗再决定动作。`,
    ],
    actions: [
      '延长观察窗 2-3 天',
      '补充渠道/入口质量信息',
      '只保留当前有效量级，不提前放大试探量',
    ],
    related_product_name: productStat.product_name,
    related_subject_name: productStat.subject_name,
  }, 'revenue_diagnosis');
}

function buildSuggestions(db, businessLine = 'zhixiao') {
  const windowInfo = db.prepare(`
    SELECT MIN(date(window_start)) as min_day, MAX(date(window_start)) as max_day
    FROM canonical_fact_rollup
    WHERE business_line = ?
  `).get(businessLine);
  if (!windowInfo?.max_day) {
    return {
      meta: {
        business_line: businessLine,
        business_line_label: BUSINESS_LINE_LABELS[businessLine] || businessLine,
        window_start: null,
        window_end: null,
        window_label: '',
      },
      suggestions: [],
    };
  }

  const latestDay = windowInfo.max_day;
  const recentStartDay = shiftDay(latestDay, -6);
  const lookbackStartDay = shiftDay(latestDay, -13);
  const productMetricPlaceholders = PRODUCT_METRICS.map(() => '?').join(',');
  const mediaMetricPlaceholders = MEDIA_METRICS.map(() => '?').join(',');
  const productRowsRaw = db.prepare(`
    SELECT
      group_hash,
      date(window_start) as day,
      business_line,
      subject_name,
      product_name,
      media_name,
      channel_name,
      experiment_key,
      metric_code,
      metric_name,
      metric_value_sum
    FROM canonical_fact_rollup
    WHERE business_line = ?
      AND date(window_start) BETWEEN ? AND ?
      AND product_name IS NOT NULL
      AND media_name IS NULL
      AND experiment_key IS NULL
      AND metric_code IN (${productMetricPlaceholders})
  `).all(businessLine, lookbackStartDay, latestDay, ...PRODUCT_METRICS);

  const mediaRowsRaw = db.prepare(`
    SELECT
      group_hash,
      date(window_start) as day,
      business_line,
      subject_name,
      product_name,
      media_name,
      channel_name,
      experiment_key,
      metric_code,
      metric_name,
      metric_value_sum
    FROM canonical_fact_rollup
    WHERE business_line = ?
      AND date(window_start) = ?
      AND product_name IS NOT NULL
      AND media_name IS NOT NULL
      AND experiment_key IS NULL
      AND metric_code IN (${mediaMetricPlaceholders})
  `).all(businessLine, latestDay, ...MEDIA_METRICS);

  const productRows = dedupePreferredRows(
    productRowsRaw,
    row => `${row.metric_code}::${row.day}::${row.product_name}`,
  );
  const mediaRows = dedupePreferredRows(
    mediaRowsRaw,
    row => `${row.metric_code}::${row.day}::${row.product_name}::${row.media_name}`,
  );

  const productStats = buildProductStats(productRows, latestDay)
    .filter(item => item.recent_revenue_sum > 0 || item.previous_revenue_sum > 0);
  const mediaShareStats = buildMediaShareStats(mediaRows, productStats, latestDay);
  const mediaShareByProduct = new Map(mediaShareStats.map(item => [item.product_name, item]));

  const negativeCandidates = productStats
    .filter(item => item.previous_revenue_avg >= 500 && item.revenue_pct_change !== null && item.revenue_pct_change <= -8)
    .sort((a, b) => (
      ((Math.abs(b.revenue_pct_change) * Math.max(b.previous_revenue_avg, b.recent_revenue_avg)))
      - ((Math.abs(a.revenue_pct_change) * Math.max(a.previous_revenue_avg, a.recent_revenue_avg)))
    ));

  const positiveCandidates = productStats
    .filter(item => item.recent_revenue_avg >= 500 && item.previous_revenue_avg >= 500 && item.revenue_pct_change !== null && item.revenue_pct_change >= 5)
    .sort((a, b) => (
      ((b.revenue_pct_change || 0) * Math.max(b.recent_revenue_avg, b.previous_revenue_avg))
      - ((a.revenue_pct_change || 0) * Math.max(a.recent_revenue_avg, a.previous_revenue_avg))
    ));

  const observationCandidates = productStats
    .filter(item => item.recent_revenue_avg >= 50 && item.recent_revenue_avg <= 500 && (
      item.previous_revenue_avg <= 100 || (item.revenue_pct_change !== null && item.revenue_pct_change >= 30)
    ))
    .sort((a, b) => b.recent_revenue_avg - a.recent_revenue_avg);

  const mediaMixCandidates = mediaShareStats
    .filter(item => item.total_orders >= 3000 && item.top_media_share_pct >= 20)
    .sort((a, b) => (
      ((b.top_media_share_pct * b.total_orders) - (a.top_media_share_pct * a.total_orders))
    ));

  const primaryRevenueDropCandidate = [...negativeCandidates]
    .filter(item => item.order_pct_change !== null && item.order_pct_change >= 0)
    .sort((a, b) => (
      ((Math.abs(b.revenue_pct_change || 0) * Math.max(b.previous_revenue_avg, b.recent_revenue_avg)) * (1 + ((b.order_pct_change || 0) / 100)))
      - ((Math.abs(a.revenue_pct_change || 0) * Math.max(a.previous_revenue_avg, a.recent_revenue_avg)) * (1 + ((a.order_pct_change || 0) / 100)))
    ))[0]
    || negativeCandidates[0]
    || null;

  const seedSuggestions = [];
  if (primaryRevenueDropCandidate) {
    seedSuggestions.push({
      kind: 'revenue_drop',
      payload: primaryRevenueDropCandidate,
      mediaShare: mediaShareByProduct.get(primaryRevenueDropCandidate.product_name) || null,
    });
  }
  if (positiveCandidates[0]) {
    seedSuggestions.push({
      kind: 'growth',
      payload: positiveCandidates[0],
    });
  }
  const mediaMixCandidate = mediaMixCandidates.find(item => (
    !seedSuggestions.some(entry => entry.payload?.product_name === item.product_name)
  )) || mediaMixCandidates[0] || null;
  if (mediaMixCandidate) {
    seedSuggestions.push({
      kind: 'media_mix',
      payload: mediaMixCandidate,
    });
  }
  const collaborationCandidate = negativeCandidates.find(item => (
    item.product_name !== primaryRevenueDropCandidate?.product_name
      && item.product_name !== positiveCandidates[0]?.product_name
      && item.order_pct_change !== null
  ))
    || negativeCandidates.find(item => item.product_name !== primaryRevenueDropCandidate?.product_name)
    || primaryRevenueDropCandidate
    || null;
  if (collaborationCandidate) {
    seedSuggestions.push({
      kind: 'collaboration',
      payload: collaborationCandidate,
      mediaShare: mediaShareByProduct.get(collaborationCandidate.product_name) || null,
    });
  }
  const observationCandidate = observationCandidates.find(item => (
    !seedSuggestions.some(entry => entry.payload?.product_name === item.product_name)
  ));
  if (observationCandidate) {
    seedSuggestions.push({
      kind: 'observing',
      payload: observationCandidate,
    });
  }

  const groupHashes = seedSuggestions.flatMap(entry => {
    if (entry.kind === 'media_mix') {
      return [entry.payload.top_media_row?.group_hash, entry.payload.second_media_row?.group_hash].filter(Boolean);
    }
    return [
      entry.payload.latest_revenue_row?.group_hash,
      entry.payload.latest_order_row?.group_hash,
      entry.mediaShare?.top_media_row?.group_hash,
    ].filter(Boolean);
  });
  const reportMap = buildReportNameLookup(db, groupHashes);

  const suggestions = seedSuggestions.map(entry => {
    if (entry.kind === 'revenue_drop') {
      return buildRevenueDropSuggestion(entry.payload, latestDay, recentStartDay, reportMap, entry.mediaShare);
    }
    if (entry.kind === 'growth') {
      return buildGrowthSuggestion(entry.payload, latestDay, recentStartDay, reportMap);
    }
    if (entry.kind === 'media_mix') {
      return buildMediaMixSuggestion(entry.payload, latestDay, reportMap);
    }
    if (entry.kind === 'collaboration') {
      return buildCollaborationSuggestion(entry.payload, latestDay, recentStartDay, reportMap, entry.mediaShare);
    }
    return buildObservationSuggestion(entry.payload, latestDay, recentStartDay, reportMap);
  }).filter(Boolean);

  suggestions.sort((a, b) => {
    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
  });

  const evalRun = readJsonIfExists(EVAL_RUN_PATH);
  return {
    meta: {
      generated_at: new Date().toISOString(),
      distillation_generated_at: evalRun?.summary?.generated_at || new Date(rollupDbMtimeMs || Date.now()).toISOString(),
      business_line: businessLine,
      business_line_label: BUSINESS_LINE_LABELS[businessLine] || businessLine,
      window_start: windowInfo.min_day,
      window_end: windowInfo.max_day,
      window_label: `${windowInfo.min_day} ~ ${windowInfo.max_day}`,
      eval_total_cases: evalRun?.summary?.total_cases || null,
      eval_pass_count: evalRun?.summary?.pass_count || null,
      eval_pass_rate: evalRun?.summary?.pass_rate || null,
      suggestion_count: suggestions.length,
    },
    suggestions,
  };
}

function getAiSuggestionFeed(options = {}) {
  const businessLine = options.businessLine || 'zhixiao';
  const db = getRollupDb();
  if (!db) {
    return {
      meta: {
        business_line: businessLine,
        business_line_label: BUSINESS_LINE_LABELS[businessLine] || businessLine,
        unavailable: true,
      },
      suggestions: [],
    };
  }
  const cacheKey = [
    businessLine,
    rollupDbMtimeMs || '0',
    statMtimeMs(EVAL_RUN_PATH) || '0',
  ].join('::');
  if (suggestionsCache && suggestionsCacheKey === cacheKey) return suggestionsCache;
  const feed = buildSuggestions(db, businessLine);
  suggestionsCache = feed;
  suggestionsCacheKey = cacheKey;
  return feed;
}

module.exports = {
  getAiSuggestionFeed,
};
