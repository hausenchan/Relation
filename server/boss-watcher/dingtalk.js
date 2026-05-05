const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'dingtalk-config.json');

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

async function sendEventNotice(events) {
  const config = loadConfig();
  if (!config || !config.receiverUserId) return;

  if (events.length === 0) return;

  let text = '## 招聘雷达 - 人员变动提醒\n\n';
  for (const evt of events) {
    const typeLabel = evt.event_type === 'new' ? '🆕 新出现' :
                      evt.event_type === 'gone' ? '👋 已消失' : '🔄 状态变化';
    text += `**${typeLabel}** ${evt.candidate_name} - ${evt.candidate_title}\n\n`;
    text += `> 公司: ${evt.company_name} | 城市: ${evt.candidate_city}\n\n`;
    text += `> 关联岗位: ${evt.position_title}\n\n---\n\n`;
  }
  text += `*仅限内部参考，数据来源 Boss 直聘公开展示*`;

  await sendWorkNotice(config.receiverUserId, `招聘雷达: ${events.length}条变动`, text);
}

function getConfigStatus() {
  const config = loadConfig();
  if (!config) return { configured: false };
  return {
    configured: true,
    appKey: config.appKey ? '***' + config.appKey.slice(-4) : '',
    agentId: config.agentId || '',
    receiverUserId: config.receiverUserId || ''
  };
}

module.exports = { loadConfig, saveConfig, sendWorkNotice, sendEventNotice, getConfigStatus };
