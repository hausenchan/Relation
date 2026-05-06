// 招聘雷达事件按岗位标题分发到对应老板
// 关键词命中即归类（不区分大小写），都不命中归 CEO 兜底

const RULES = [
  {
    role: 'cto',
    keywords: ['开发', '工程师', '研发', '架构', '算法', '数据', '测试', '运维',
      '前端', '后端', '全栈', 'sre', 'devops', 'ai', '机器学习', 'ml', '技术']
  },
  {
    role: 'coo',
    keywords: ['产品', '运营', '增长', '策划', '产品经理', 'pm', '用户研究', '用研']
  },
  {
    role: 'cmo',
    keywords: ['商务', '销售', 'bd', '市场', '品牌', '渠道', '客户成功']
  }
];

function classifyPosition(title) {
  if (!title) return 'ceo';
  const t = String(title).toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some(k => t.includes(k.toLowerCase()))) return rule.role;
  }
  return 'ceo';
}

function groupEventsByRole(events) {
  const buckets = { ceo: [], coo: [], cto: [], cmo: [] };
  for (const evt of events) {
    const role = classifyPosition(evt.position_title);
    buckets[role].push(evt);
  }
  return buckets;
}

module.exports = { classifyPosition, groupEventsByRole, RULES };
