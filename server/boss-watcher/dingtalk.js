const fs = require('fs');
const path = require('path');
const { groupEventsByRole, RULES } = require('./dispatch-rules');

const CONFIG_FILE = path.join(__dirname, 'dingtalk-config.json');
const ROLE_LABEL = { ceo: 'CEO', coo: 'COO', cto: 'CTO', cmo: 'CMO' };

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// 兼容老 schema：receiverUserId 回退到 ceo
function getReceivers(config) {
  if (!config) return {};
  if (config.receivers && typeof config.receivers === 'object') {
    return config.receivers;
  }
  if (config.receiverUserId) {
    return { ceo: config.receiverUserId };
  }
  return {};
}

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken(appKey, appSecret) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const res = await fetch('https://oapi.dingtalk.com/gettoken?' +
    `appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`);
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`钉钉获取 token 失败: ${data.errmsg}`);
  }
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
  return data.access_token;
}

async function sendWorkNotice(userId, title, content) {
  const config = loadConfig();
  if (!config) throw new Error('钉钉未配置');

  const token = await getAccessToken(config.appKey, config.appSecret);
  const agentId = config.agentId;

  const msg = {
    msgtype: 'markdown',
    markdown: { title, text: content }
  };

  const res = await fetch(`https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      userid_list: userId,
      msg
    })
  });
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`钉钉发送失败: ${data.errmsg}`);
  }
  return data;
}

const PER_COMPANY_LIMIT = 5;
const TYPE_LABEL = { new: '🆕 新出现', gone: '👋 已消失', status_change: '🔄 状态变化' };

function buildDetailLink(baseUrl, params = {}) {
  const root = (baseUrl || '').replace(/\/+$/, '');
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const path = '/executive/recruit-radar' + (qs ? `?${qs}` : '');
  return root ? root + path : path;
}

function buildEventMarkdown(roleLabel, events, baseUrl) {
  // 按公司聚合：每家公司一节
  const byCompany = new Map();
  for (const evt of events) {
    const key = evt.boss_company_id || evt.company_name || '_';
    if (!byCompany.has(key)) {
      byCompany.set(key, { name: evt.company_name || '(未知公司)', companyId: evt.boss_company_id, items: [] });
    }
    byCompany.get(key).items.push(evt);
  }

  let text = `## 招聘雷达 - ${roleLabel} 关注岗位变动\n\n`;
  text += `> 共 ${events.length} 条变动，涉及 ${byCompany.size} 家公司\n\n`;

  for (const { name, companyId, items } of byCompany.values()) {
    const counts = items.reduce((acc, e) => { acc[e.event_type] = (acc[e.event_type] || 0) + 1; return acc; }, {});
    const summary = Object.entries(counts).map(([t, n]) => `${TYPE_LABEL[t] || t} ${n}`).join(' · ');
    text += `### ${name}\n\n`;
    text += `${summary}\n\n`;

    const shown = items.slice(0, PER_COMPANY_LIMIT);
    for (const evt of shown) {
      const tag = TYPE_LABEL[evt.event_type] || evt.event_type;
      const status = evt.candidate_status ? ` · ${evt.candidate_status}` : '';
      text += `- ${tag} **${evt.candidate_name}** ${evt.candidate_title || ''}${status}（${evt.position_title || '-'}）\n`;
    }
    if (items.length > PER_COMPANY_LIMIT) {
      const link = buildDetailLink(baseUrl, { company: companyId });
      text += `\n[查看全部 ${items.length} 条 →](${link})\n`;
    }
    text += `\n---\n\n`;
  }

  const allLink = buildDetailLink(baseUrl);
  text += `[在系统中查看 →](${allLink})\n\n`;
  text += `*仅限内部参考，数据来源 Boss 直聘公开展示*`;
  return text;
}

async function sendEventNotice(events) {
  if (!events || events.length === 0) return;
  const config = loadConfig();
  if (!config) return;
  const receivers = getReceivers(config);
  const baseUrl = config.baseUrl || '';

  const buckets = groupEventsByRole(events);
  const errors = [];
  for (const role of ['ceo', 'coo', 'cto', 'cmo']) {
    const list = buckets[role];
    if (!list || list.length === 0) continue;
    const userId = receivers[role];
    if (!userId) {
      errors.push(`${ROLE_LABEL[role]} 未配置接收人，跳过 ${list.length} 条`);
      continue;
    }
    const text = buildEventMarkdown(ROLE_LABEL[role], list, baseUrl);
    try {
      await sendWorkNotice(userId, `招聘雷达: ${list.length}条变动 (${ROLE_LABEL[role]})`, text);
    } catch (err) {
      errors.push(`${ROLE_LABEL[role]} 推送失败: ${err.message}`);
    }
  }
  if (errors.length > 0) throw new Error(errors.join('; '));
}

function getConfigStatus() {
  const config = loadConfig();
  if (!config) return { configured: false, receivers: {}, baseUrl: '' };
  const receivers = getReceivers(config);
  return {
    configured: !!(config.appKey && config.appSecret && config.agentId),
    appKey: config.appKey ? '***' + config.appKey.slice(-4) : '',
    agentId: config.agentId || '',
    baseUrl: config.baseUrl || '',
    receivers
  };
}

module.exports = {
  loadConfig, saveConfig, sendWorkNotice, sendEventNotice, getConfigStatus,
  getReceivers, RULES
};
