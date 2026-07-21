const FIELD_CONFIGS = {
  goal: [
    ['title', '目标标题'],
    ['description', '目标描述'],
    ['result', '目标结果'],
    ['progress', '进度'],
    ['status', '状态'],
    ['deadline', '截止日期'],
    ['period', '周期'],
    ['scope_type', '归属颗粒度'],
    ['department', '部门'],
    ['team_id', '小组'],
    ['project_group_id', '项目组'],
    ['owner_id', '负责人'],
    ['parent_id', '上级目标'],
  ],
  weekly_report: [
    ['completed', '本周完成'],
    ['next_week_plan', '下周计划'],
    ['risks', '风险与问题'],
    ['week_start', '周开始日期'],
    ['week_end', '周结束日期'],
  ],
};

const OPERATIONAL_FIELD_CONFIGS = {
  agenda: [
    ['agenda', '会议提纲'],
    ['model_name', '生成模型'],
    ['safety_scan_status', '安全检查状态'],
  ],
  decision: [
    ['decision', '会议结论'],
    ['status', '状态'],
  ],
  section: [
    ['content', '准备内容'],
    ['status', '提交状态'],
  ],
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function valuesEqual(left, right) {
  return JSON.stringify(stableValue(left ?? null)) === JSON.stringify(stableValue(right ?? null));
}

function decodeBasicHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function plainText(value) {
  return decodeBasicHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function collectBlockText(block, output) {
  if (!block || typeof block !== 'object') return;
  const content = plainText(block.content);
  if (content) output.push(content);
  const body = plainText(block.meta?.body);
  if (body) output.push(body);
  if (Array.isArray(block.meta?.rows)) {
    block.meta.rows.forEach(row => {
      const rowText = (Array.isArray(row) ? row : [])
        .map(cell => plainText(cell))
        .filter(Boolean)
        .join(' | ');
      if (rowText) output.push(rowText);
    });
  }
  (Array.isArray(block.children) ? block.children : []).forEach(child => collectBlockText(child, output));
}

function parseStructuredString(value) {
  const text = String(value || '').trim();
  if (!text || !['{', '['].includes(text[0])) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeRevisionValue(value, limit = 260) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    const parsed = parseStructuredString(value);
    if (parsed !== null) return summarizeRevisionValue(parsed, limit);
    const text = plainText(value);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }
  if (Array.isArray(value)) {
    const text = value.map(item => summarizeRevisionValue(item, limit)).filter(Boolean).join('\n');
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }
  if (Array.isArray(value.blocks)) {
    const output = [];
    value.blocks.forEach(block => collectBlockText(block, output));
    const text = output.join('\n').trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }
  const preferredKeys = ['content', 'agenda', 'decision', 'text', 'title', 'name'];
  for (const key of preferredKeys) {
    if (value[key] !== undefined) {
      const summary = summarizeRevisionValue(value[key], limit);
      if (summary) return summary;
    }
  }
  const text = JSON.stringify(stableValue(value));
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getFieldConfig(entityType, scopeKey, before, after) {
  if (entityType === 'operational_meeting') {
    if (scopeKey === 'agenda') return OPERATIONAL_FIELD_CONFIGS.agenda;
    if (scopeKey === 'decision') return OPERATIONAL_FIELD_CONFIGS.decision;
    return OPERATIONAL_FIELD_CONFIGS.section;
  }
  if (FIELD_CONFIGS[entityType]) return FIELD_CONFIGS[entityType];
  return [...new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])].map(key => [key, key]);
}

function buildContentRevisionChanges(entityType, scopeKey, before, after) {
  if (!after || typeof after !== 'object') return [];
  const fields = getFieldConfig(entityType, scopeKey, before, after);
  const initial = !before || typeof before !== 'object';
  return fields.reduce((changes, [field, label]) => {
    if (!initial && valuesEqual(before[field], after[field])) return changes;
    const beforeText = initial ? '' : summarizeRevisionValue(before[field]);
    const afterText = summarizeRevisionValue(after[field]);
    if (!beforeText && !afterText) return changes;
    changes.push({
      field,
      label: initial ? `初始${label}` : label,
      before: beforeText,
      after: afterText,
    });
    return changes;
  }, []).slice(0, 8);
}

module.exports = {
  buildContentRevisionChanges,
  summarizeRevisionValue,
};
