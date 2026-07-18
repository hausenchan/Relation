const DEFAULT_SECTION_TITLES = ['结论摘要', '核心证据', '风险提醒', '下一步建议'];

const SCENE_SUGGESTION_TYPE_MAP = {
  revenue_diagnosis: ['revenue_diagnosis', 'collaboration', 'media_mix'],
  budget_advice: ['budget_adjustment', 'revenue_diagnosis'],
  daily_report: ['revenue_diagnosis', 'budget_adjustment', 'collaboration', 'media_mix'],
  general_chat: ['revenue_diagnosis', 'budget_adjustment', 'collaboration', 'media_mix'],
};

const DEFAULT_LLM_MODEL = 'gpt-5.5';
const DEFAULT_LLM_BASE_URL = 'https://ai.midongtech.com/v1';
const OPENAI_COMPATIBLE_V1_HOSTS = new Set(['ai.midongtech.com', 'api.openai.com']);

function normalizeText(value) {
  return String(value || '').trim();
}

function clipText(value, maxLength = 48) {
  const chars = Array.from(normalizeText(value));
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}...` : chars.join('');
}

function compactWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizeLlmBaseUrl(value) {
  const raw = normalizeText(value || DEFAULT_LLM_BASE_URL).replace(/\/+$/g, '');
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    if (OPENAI_COMPATIBLE_V1_HOSTS.has(parsed.hostname) && (!parsed.pathname || parsed.pathname === '/')) {
      parsed.pathname = '/v1';
    }
    return parsed.toString().replace(/\/+$/g, '');
  } catch {
    return raw;
  }
}

function formatLlmBaseUrlForDisplay(value) {
  return normalizeLlmBaseUrl(value);
}

function buildChatCompletionsUrl(baseUrl) {
  return `${formatLlmBaseUrlForDisplay(baseUrl)}/chat/completions`;
}

function buildKeywordSet(value) {
  const matches = compactWhitespace(value)
    .toLowerCase()
    .match(/[\u4e00-\u9fa5]{2,8}|[a-z0-9_.:%+-]{2,}/gi) || [];
  return new Set(matches.map(item => item.trim()).filter(Boolean));
}

function hasDateLikeExpression(text) {
  return /(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}[./-]\d{1,2})|(今天|昨日|昨天|本周|上周|本月|上月|本季度|上季度|最近\s*\d+\s*[天日周月]|近\s*\d+\s*[天日周月]|4-6月|4月到6月)/.test(text);
}

function hasCompareLikeExpression(text) {
  return /(较前|环比|同比|对比|相比|上一|前一|回撤|增长|变化|波动|抬头|下降|提升)/.test(text);
}

function inferSectionTitles(outputSchema, outputTemplate) {
  if (Array.isArray(outputSchema?.sections) && outputSchema.sections.length > 0) {
    return outputSchema.sections.map(item => normalizeText(item)).filter(Boolean);
  }
  const headings = normalizeText(outputTemplate)
    .split(/\n+/)
    .map(item => normalizeText(item.replace(/[:：-]+$/g, '')))
    .filter(item => item && item.length <= 12);
  return headings.length >= 2 ? headings : DEFAULT_SECTION_TITLES;
}

function extractPromptSignals(promptText, session = {}) {
  const text = compactWhitespace(promptText);
  const lowerText = text.toLowerCase();
  return {
    text,
    lower_text: lowerText,
    keywords: buildKeywordSet(text),
    has_time_range: hasDateLikeExpression(text),
    has_compare_window: hasCompareLikeExpression(text),
    has_role_scope: Boolean(text.includes('预算侧')
      || text.includes('流量侧')
      || text.includes('负责人')
      || text.includes('运营')
      || text.includes('策略')
      || normalizeText(session.role_scope)
      || normalizeText(session.business_side)),
  };
}

function scoreSuggestionMatch(suggestion, session, signals, preferredTypes) {
  const item = suggestion || {};
  let score = 0;
  const haystack = compactWhitespace([
    item.title,
    item.summary,
    item.recommendation,
    item.related_product_name,
    item.related_subject_name,
    ...(item.scope_tags || []),
  ].join(' ')).toLowerCase();

  if (preferredTypes.includes(item.type)) score += 40;
  if (normalizeText(item.business_side) && normalizeText(item.business_side) === normalizeText(session.business_side)) score += 16;
  if (normalizeText(item.budget_side) && normalizeText(item.budget_side) === normalizeText(session.budget_side)) score += 10;
  if (normalizeText(item.owner_role) && normalizeText(item.owner_role).includes(normalizeText(session.role_scope))) score += 8;

  let exactMatchCount = 0;
  [
    item.related_product_name,
    item.related_subject_name,
    item.title,
  ].forEach(value => {
    const token = compactWhitespace(value).toLowerCase();
    if (token && signals.lower_text.includes(token)) {
      exactMatchCount += 1;
    }
  });
  score += exactMatchCount * 28;

  let keywordOverlap = 0;
  signals.keywords.forEach((keyword) => {
    if (keyword && haystack.includes(keyword)) keywordOverlap += 1;
  });
  score += Math.min(keywordOverlap, 8) * 5;

  score += Math.round(Number(item.confidence || 0) / 12);
  return score;
}

function selectRelevantSuggestions(feed, session, promptText, options = {}) {
  const limit = Math.max(1, Number(options.limit || 3));
  const preferredTypes = SCENE_SUGGESTION_TYPE_MAP[session.scene_code] || SCENE_SUGGESTION_TYPE_MAP.general_chat;
  const suggestions = Array.isArray(feed?.suggestions) ? feed.suggestions : [];
  const signals = extractPromptSignals(promptText, session);
  return suggestions
    .map((item) => ({
      ...item,
      _match_score: scoreSuggestionMatch(item, session, signals, preferredTypes),
    }))
    .filter(item => item._match_score > 0)
    .sort((a, b) => b._match_score - a._match_score)
    .slice(0, limit);
}

function buildFollowUpQuestions(version, session, promptSignals, matchedSuggestions) {
  const questions = [];
  const requiredFields = Array.isArray(version?.input_schema_json?.required_fields)
    ? version.input_schema_json.required_fields
    : [];
  const needBusinessObject = requiredFields.includes('业务对象');
  const needTimeRange = requiredFields.includes('时间范围');
  const needCompareWindow = requiredFields.includes('对照窗口') || session.scene_code !== 'general_chat';

  if (needBusinessObject && matchedSuggestions.length === 0) {
    questions.push('这次先聚焦哪个产品或主体？我可以按单产品口径继续下钻。');
  }
  if (needTimeRange && !promptSignals.has_time_range) {
    questions.push('请补充时间范围，比如最近7天、本月，或 2026-04-01 到 2026-06-30。');
  }
  if (needCompareWindow && !promptSignals.has_compare_window) {
    questions.push('这次希望对比哪个窗口？例如较前7天、上周、上月或同比窗口。');
  }
  if (!promptSignals.has_role_scope && !normalizeText(session.role_scope)) {
    questions.push('这次要按运营、策略，还是负责人视角来判断？');
  }
  return questions.slice(0, 3);
}

function buildRiskReminders(session, matchedSuggestions, followUpQuestions) {
  const risks = [];
  if (followUpQuestions.length > 0) {
    risks.push('当前关键口径还不完整，直接扩量或下结论容易把判断做偏。');
  }
  if (matchedSuggestions[0]?.type === 'media_mix') {
    risks.push('媒体过度集中时，日波动会被放大，建议先做第二梯队测试。');
  }
  if (matchedSuggestions[0]?.type === 'collaboration') {
    risks.push('预算侧和流量侧若不统一观察窗，复盘会反复对不上口径。');
  }
  if (matchedSuggestions[0]?.priority === 'high') {
    risks.push('当前问题优先级较高，建议当日完成一次证据复核和动作确认。');
  }
  if (risks.length === 0) {
    if (session.scene_code === 'budget_advice') {
      risks.push('证据不足时不建议一次性放量，先保留止损阈值。');
    } else if (session.scene_code === 'revenue_diagnosis') {
      risks.push('只看收入不看订单与结构，容易把问题错判成单一量级回撤。');
    } else {
      risks.push('如果缺少对照窗和责任归属，后续动作很难落地。');
    }
  }
  return risks.slice(0, 3);
}

function buildAnalysisProcess({
  session,
  skill,
  version,
  promptSignals,
  matchedSuggestions,
  examples,
  followUpQuestions,
  runtimeMode,
  modelName = null,
  modelError = null,
}) {
  const sceneLabel = normalizeText(session.scene_label || skill?.scene_code || '当前场景');
  const roleLabel = normalizeText(session.role_scope || session.business_side || skill?.role_scope || '当前角色');
  const businessLineLabel = normalizeText(session.business_line || skill?.business_line || '当前业务线');
  const exampleTitles = (examples || [])
    .map(item => normalizeText(item.source_case_title || item.note_text))
    .filter(Boolean)
    .slice(0, 2);
  const suggestionTitles = (matchedSuggestions || [])
    .map(item => normalizeText(item.title))
    .filter(Boolean)
    .slice(0, 3);

  const inputStepParts = [];
  inputStepParts.push(promptSignals?.has_time_range ? '已识别时间范围' : '缺少时间范围');
  inputStepParts.push(promptSignals?.has_compare_window ? '已识别对照窗口' : '缺少明确对照窗口');
  inputStepParts.push(promptSignals?.has_role_scope ? '角色视角明确' : '角色视角待补充');

  const evidenceParts = [];
  if (suggestionTitles.length > 0) evidenceParts.push(`命中 ${suggestionTitles.length} 条建议证据`);
  if (exampleTitles.length > 0) evidenceParts.push(`参考 ${exampleTitles.length} 条案例示例`);
  if (evidenceParts.length === 0) evidenceParts.push('当前主要依赖会话上下文和输出模板');

  const judgementStep = session.scene_code === 'revenue_diagnosis'
    ? '优先判断预算动作、入口质量和收入结构，再决定是否需要跨侧复盘。'
    : session.scene_code === 'budget_advice'
      ? '优先判断趋势连续性和承接质量，再决定试探回补还是继续观察。'
      : '先统一问题口径，再把结论、证据和动作拆开输出。';

  const processSummary = [
    `已按 ${businessLineLabel} / ${sceneLabel} / ${roleLabel} 识别问题场景。`,
    suggestionTitles.length > 0 || exampleTitles.length > 0
      ? `结合 ${suggestionTitles.length} 条建议证据与 ${exampleTitles.length} 条示例，整理结构化判断。`
      : '当前未命中外部证据，主要依赖模型或规则链路做首轮判断。',
    followUpQuestions.length > 0 ? `仍有 ${followUpQuestions.length} 个关键口径需要补齐。` : '当前输入口径基本可直接产出结论。',
  ].join('');

  return {
    summary: processSummary,
    steps: [
      `场景识别：${businessLineLabel} / ${sceneLabel} / ${roleLabel}`,
      `输入校验：${inputStepParts.join('，')}`,
      `证据装载：${evidenceParts.join('，')}`,
      `判断路径：${judgementStep}`,
      ...(followUpQuestions.length > 0 ? [`待补问题：${followUpQuestions.join('；')}`] : []),
    ],
    trace_tags: [
      runtimeMode === 'llm' ? `模型:${modelName || '系统模型'}` : '规则链路',
      skill?.name ? `Skill:${skill.name}` : '未绑定Skill',
      `${matchedSuggestions.length}条建议证据`,
      `${exampleTitles.length}条例子`,
    ],
    source_titles: {
      suggestions: suggestionTitles,
      examples: exampleTitles,
    },
    model_error: modelError || null,
    follow_up_required: followUpQuestions.length > 0,
    llm_backed: runtimeMode === 'llm',
  };
}

function buildDeterministicSkillResponse({
  session,
  skill,
  version,
  promptText,
  matchedSuggestions,
  examples,
  promptSignals,
  followUpQuestions,
}) {
  const topSuggestion = matchedSuggestions[0] || null;
  const sectionTitles = inferSectionTitles(version?.output_schema_json, version?.output_template_text);
  const focusText = clipText(promptText, 26) || '当前问题';
  const roleLabel = normalizeText(session.role_scope || session.business_side || skill?.role_scope || '当前角色');
  const sceneLabel = normalizeText(session.scene_label || skill?.scene_code || '当前场景');
  const businessLineLabel = normalizeText(session.business_line || skill?.business_line || '当前业务线');
  const exampleTitles = (examples || [])
    .map(item => normalizeText(item.source_case_title || item.note_text))
    .filter(Boolean)
    .slice(0, 2);

  let summary = `我先按 ${roleLabel} 视角，用 ${skill?.name || '当前 Skill'} 对“${focusText}”输出一版结构化判断。`;
  let evidence = [];
  let actions = [];

  if (topSuggestion) {
    summary = normalizeText(topSuggestion.summary || topSuggestion.title || summary);
    evidence = Array.isArray(topSuggestion.evidence_highlights) ? topSuggestion.evidence_highlights.slice(0, 3) : [];
    actions = Array.isArray(topSuggestion.actions) ? topSuggestion.actions.slice(0, 3) : [];
  }

  if (evidence.length === 0) {
    evidence = [
      `当前会话口径：${businessLineLabel} / ${sceneLabel} / ${roleLabel}。`,
      promptSignals.has_time_range ? '时间范围已明确，可以直接对比关键指标变化。' : '建议先补时间范围，再继续下钻判断。',
      exampleTitles.length > 0 ? `可参考历史案例：${exampleTitles.join('、')}。` : '建议优先把结论、证据、动作拆开输出，方便后续沉淀为案例。',
    ];
  }

  if (actions.length === 0) {
    if (session.scene_code === 'budget_advice') {
      actions = [
        '先补 5% 到 10% 的测试量，观察 2 到 3 天是否继续同向增长。',
        '把收入、订单和入口质量放到同一观察窗里跟踪。',
        '提前写清楚回撤阈值和回收动作，避免误放量。',
      ];
    } else if (session.scene_code === 'revenue_diagnosis') {
      actions = [
        '先核查最近 3 天预算、入口、媒体结构是否有异常变更。',
        '把收入、订单和结构拆开看，判断是量问题还是结构问题。',
        '若牵涉跨侧问题，当日发起预算侧与流量侧联合复盘。',
      ];
    } else {
      actions = [
        '先统一问题口径，再补证据和动作拆解。',
        '把建议压缩为 2 到 3 条可以直接执行的动作。',
      ];
    }
  }

  const risks = buildRiskReminders(session, matchedSuggestions, followUpQuestions);
  const analysisProcess = buildAnalysisProcess({
    session,
    skill,
    version,
    promptSignals,
    matchedSuggestions,
    examples,
    followUpQuestions,
    runtimeMode: 'deterministic',
  });
  const confidence = Math.max(
    58,
    Math.min(
      93,
      Number(topSuggestion?.confidence || 0)
      || (68 + (matchedSuggestions.length * 5) + (examples.length * 3) - (followUpQuestions.length * 6))
    ),
  );

  const structured = {
    summary,
    evidence,
    risk_reminders: risks,
    actions,
    follow_up_questions: followUpQuestions,
    confidence,
    references: matchedSuggestions.map((item) => ({
      id: item.id,
      title: item.title,
      related_product_name: item.related_product_name || null,
      related_subject_name: item.related_subject_name || null,
      type: item.type,
    })),
    analysis_process: analysisProcess,
    runtime_meta: {
      mode: 'deterministic',
      skill_id: skill?.id || null,
      skill_name: skill?.name || null,
      skill_version_id: version?.id || null,
      skill_version_no: version?.version_no || null,
      matched_suggestion_ids: matchedSuggestions.map(item => item.id),
      matched_suggestion_count: matchedSuggestions.length,
      model_name: null,
      llm_enabled: false,
    },
  };

  const contentText = [
    `${sectionTitles[0] || '结论摘要'}`,
    `- ${summary}`,
    '',
    `${sectionTitles[1] || '核心证据'}`,
    ...evidence.map(item => `- ${item}`),
    '',
    `${sectionTitles[2] || '风险提醒'}`,
    ...risks.map(item => `- ${item}`),
    '',
    `${sectionTitles[3] || '下一步建议'}`,
    ...actions.map(item => `- ${item}`),
    ...(followUpQuestions.length > 0
      ? [
        '',
        '补充问题',
        ...followUpQuestions.map(item => `- ${item}`),
      ]
      : []),
  ].join('\n');

  return {
    contentText,
    structured,
    evidence,
    actions,
    section_titles: sectionTitles,
    confidence,
    analysis_process: analysisProcess,
    runtime_mode: 'deterministic',
  };
}

function tryParseJsonPayload(text) {
  const raw = normalizeText(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function buildModelSystemPrompt({ session, skill, version, sectionTitles }) {
  return [
    normalizeText(version?.system_prompt || skill?.description || '你是一个业务分析助手。'),
    normalizeText(version?.guardrails_text || ''),
    '请严格输出 JSON 对象，不要输出额外解释。',
    `JSON 字段必须包含：summary, evidence, risk_reminders, actions, follow_up_questions, confidence, reasoning_summary, analysis_steps。`,
    `evidence, risk_reminders, actions, follow_up_questions, analysis_steps 必须是字符串数组。`,
    'reasoning_summary 是给业务同学看的简短分析过程摘要，不要输出内部原始思维链。',
    `最终展示会按以下章节落地：${sectionTitles.join(' / ')}。`,
    `当前业务线：${normalizeText(session.business_line || skill?.business_line || '当前业务线')}。`,
    `当前视角：${normalizeText(session.role_scope || session.business_side || skill?.role_scope || '当前角色')}。`,
  ].filter(Boolean).join('\n');
}

function buildModelUserPrompt({
  session,
  skill,
  version,
  promptText,
  matchedSuggestions,
  examples,
  followUpQuestions,
  recentMessages,
}) {
  return JSON.stringify({
    session: {
      id: session.id,
      scene_code: session.scene_code,
      scene_label: session.scene_label,
      business_line: session.business_line,
      business_side: session.business_side,
      budget_side: session.budget_side,
      role_scope: session.role_scope,
    },
    skill: {
      id: skill?.id || null,
      name: skill?.name || null,
      version_no: version?.version_no || null,
      reasoning_steps_text: version?.reasoning_steps_text || null,
      output_template_text: version?.output_template_text || null,
    },
    user_prompt: promptText,
    required_follow_up_questions: followUpQuestions,
    matched_suggestions: matchedSuggestions.map((item) => ({
      title: item.title,
      summary: item.summary,
      recommendation: item.recommendation,
      evidence_highlights: item.evidence_highlights || [],
      actions: item.actions || [],
      related_product_name: item.related_product_name || null,
      related_subject_name: item.related_subject_name || null,
      confidence: item.confidence || 0,
      type: item.type || null,
    })),
    few_shot_examples: (examples || []).slice(0, 3).map(item => ({
      title: item.source_case_title || item.note_text || '',
      input_text: item.input_text || '',
      expected_output_text: item.expected_output_text || '',
    })),
    recent_messages: (recentMessages || []).slice(-4),
  }, null, 2);
}

function normalizeModelStructuredResponse(payload, baseResponse, skill, version, matchedSuggestions) {
  const summary = normalizeText(payload?.summary || baseResponse.structured.summary || baseResponse.contentText);
  const evidence = Array.isArray(payload?.evidence) && payload.evidence.length > 0
    ? payload.evidence.map(item => normalizeText(item)).filter(Boolean)
    : baseResponse.evidence;
  const riskReminders = Array.isArray(payload?.risk_reminders) && payload.risk_reminders.length > 0
    ? payload.risk_reminders.map(item => normalizeText(item)).filter(Boolean)
    : baseResponse.structured.risk_reminders;
  const actions = Array.isArray(payload?.actions) && payload.actions.length > 0
    ? payload.actions.map(item => normalizeText(item)).filter(Boolean)
    : baseResponse.actions;
  const followUpQuestions = Array.isArray(payload?.follow_up_questions)
    ? payload.follow_up_questions.map(item => normalizeText(item)).filter(Boolean)
    : baseResponse.structured.follow_up_questions;
  const confidence = Math.max(0, Math.min(100, Number(payload?.confidence || baseResponse.confidence || 0)));
  const sectionTitles = baseResponse.section_titles;
  const reasoningSummary = normalizeText(
    payload?.reasoning_summary
    || payload?.analysis_process?.summary
    || baseResponse.analysis_process?.summary
    || ''
  );
  const analysisSteps = Array.isArray(payload?.analysis_steps) && payload.analysis_steps.length > 0
    ? payload.analysis_steps.map(item => normalizeText(item)).filter(Boolean)
    : (
      Array.isArray(payload?.analysis_process?.steps) && payload.analysis_process.steps.length > 0
        ? payload.analysis_process.steps.map(item => normalizeText(item)).filter(Boolean)
        : (baseResponse.analysis_process?.steps || [])
    );
  const analysisProcess = {
    ...(baseResponse.analysis_process || {}),
    summary: reasoningSummary || baseResponse.analysis_process?.summary || '',
    steps: analysisSteps,
    llm_backed: true,
  };

  const structured = {
    summary,
    evidence,
    risk_reminders: riskReminders,
    actions,
    follow_up_questions: followUpQuestions,
    confidence,
    references: baseResponse.structured.references,
    analysis_process: analysisProcess,
    runtime_meta: {
      mode: 'llm',
      skill_id: skill?.id || null,
      skill_name: skill?.name || null,
      skill_version_id: version?.id || null,
      skill_version_no: version?.version_no || null,
      matched_suggestion_ids: matchedSuggestions.map(item => item.id),
      matched_suggestion_count: matchedSuggestions.length,
      model_name: null,
      llm_enabled: true,
    },
  };

  const contentText = [
    `${sectionTitles[0] || '结论摘要'}`,
    `- ${summary}`,
    '',
    `${sectionTitles[1] || '核心证据'}`,
    ...evidence.map(item => `- ${item}`),
    '',
    `${sectionTitles[2] || '风险提醒'}`,
    ...riskReminders.map(item => `- ${item}`),
    '',
    `${sectionTitles[3] || '下一步建议'}`,
    ...actions.map(item => `- ${item}`),
    ...(followUpQuestions.length > 0
      ? [
        '',
        '补充问题',
        ...followUpQuestions.map(item => `- ${item}`),
      ]
      : []),
  ].join('\n');

  return {
    contentText,
    structured,
    evidence,
    actions,
    confidence,
    analysis_process: analysisProcess,
    runtime_mode: 'llm',
    section_titles: sectionTitles,
  };
}

function getEnvLlmModel() {
  return normalizeText(process.env.AI_TRAINING_LLM_MODEL
    || process.env.AI_MODEL
    || process.env.LLM_MODEL
    || process.env.OPENAI_MODEL
    || DEFAULT_LLM_MODEL);
}

function getEnvLlmBaseUrl() {
  return normalizeText(process.env.AI_TRAINING_LLM_BASE_URL
    || process.env.AI_BASE_URL
    || process.env.LLM_BASE_URL
    || process.env.OPENAI_BASE_URL
    || DEFAULT_LLM_BASE_URL);
}

function getEnvLlmTimeoutMs() {
  return Math.max(5000, Number(
    process.env.AI_TRAINING_LLM_TIMEOUT_MS
    || process.env.AI_TIMEOUT_MS
    || process.env.LLM_TIMEOUT_MS
    || 25000
  ));
}

function getEnvLlmTemperature() {
  return Number.isFinite(Number(
    process.env.AI_TRAINING_LLM_TEMPERATURE
    || process.env.AI_TEMPERATURE
    || process.env.LLM_TEMPERATURE
  ))
    ? Number(process.env.AI_TRAINING_LLM_TEMPERATURE
      || process.env.AI_TEMPERATURE
      || process.env.LLM_TEMPERATURE)
    : 0.2;
}

function getLlmConfig(overrides = null) {
  if (overrides?.disabled === true || overrides?.enabled === false) return null;
  const overrideApiKey = normalizeText(overrides?.apiKey || overrides?.api_key);
  const apiKey = overrideApiKey || process.env.AI_TRAINING_LLM_API_KEY
    || process.env.AI_API_KEY
    || process.env.LLM_API_KEY
    || process.env.OPENAI_API_KEY
    || '';
  if (!apiKey) return null;

  const model = normalizeText(
    overrideApiKey
      ? (overrides?.model || overrides?.model_name || DEFAULT_LLM_MODEL)
      : getEnvLlmModel()
  );
  const baseUrl = normalizeText(
    overrideApiKey
      ? (overrides?.baseUrl || overrides?.base_url || DEFAULT_LLM_BASE_URL)
      : getEnvLlmBaseUrl()
  );
  const timeoutMs = Math.max(5000, Number(
    overrideApiKey
      ? (overrides?.timeoutMs || overrides?.timeout_ms || 25000)
      : getEnvLlmTimeoutMs()
  ));
  const overrideTemperature = Number(overrides?.temperature);

  return {
    apiKey,
    model: model || DEFAULT_LLM_MODEL,
    baseUrl: normalizeLlmBaseUrl(baseUrl || DEFAULT_LLM_BASE_URL),
    timeoutMs,
    temperature: overrideApiKey && Number.isFinite(overrideTemperature)
      ? overrideTemperature
      : getEnvLlmTemperature(),
    source: overrideApiKey ? (overrides?.source || 'user') : 'env',
    provider: overrideApiKey ? (overrides?.provider || 'openai_compatible') : 'openai_compatible',
  };
}

function getLlmRuntimeStatus(overrides = null) {
  const config = getLlmConfig(overrides);
  const explicitDisabled = overrides?.disabled === true || overrides?.enabled === false;
  const targetModel = normalizeText(overrides?.model || overrides?.model_name || config?.model || getEnvLlmModel());
  const targetBaseUrl = normalizeText(overrides?.baseUrl || overrides?.base_url || config?.baseUrl || getEnvLlmBaseUrl());
  if (!config) {
    const displayBaseUrl = formatLlmBaseUrlForDisplay(targetBaseUrl);
    return {
      llm_enabled: false,
      preferred_runtime: 'deterministic',
      model_name: targetModel,
      base_url: displayBaseUrl,
      target_model_name: targetModel,
      config_source: explicitDisabled ? (overrides?.source || 'system') : 'none',
      fallback_enabled: true,
      status_text: explicitDisabled
        ? `${overrides?.disabledReason || '系统模型配置未启用'}，训练台会先走规则模式。`
        : `目标模型为 ${targetModel}，但当前缺少 API Key，训练台会先走规则模式。`,
      setup_hint: explicitDisabled
        ? '请在系统管理 / 通用配置 / 模型设置中启用模型并填写 API Key。'
        : '请在服务端配置 AI_TRAINING_LLM_API_KEY、AI_API_KEY、LLM_API_KEY 或 OPENAI_API_KEY。',
    };
  }

  const baseUrl = formatLlmBaseUrlForDisplay(config.baseUrl);
  return {
    llm_enabled: true,
    preferred_runtime: 'agent',
    model_name: config.model,
    base_url: baseUrl,
    target_model_name: config.model,
    config_source: config.source || 'env',
    provider: config.provider || 'openai_compatible',
    fallback_enabled: true,
    status_text: config.source === 'user'
      ? `个人模型 Key 已启用：${config.model}，规则链路仅作兜底。`
      : config.source === 'system'
        ? `系统模型配置已启用：${config.model}，对所有账号生效。`
      : `当前默认接入系统小模型 ${config.model}，规则链路仅作兜底。`,
    setup_hint: null,
  };
}

function getUrlHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return normalizeText(value || DEFAULT_LLM_BASE_URL);
  }
}

function normalizeLlmHttpErrorMessage(status, text) {
  const raw = normalizeText(text);
  if (!raw) return `模型接口返回 HTTP ${status}`;
  try {
    const parsed = JSON.parse(raw);
    const message = normalizeText(parsed?.error?.message || parsed?.message || raw);
    return `模型接口返回 HTTP ${status}：${message}`;
  } catch {
    return `模型接口返回 HTTP ${status}：${raw.slice(0, 300)}`;
  }
}

function normalizeLlmNonJsonResponseMessage(config, contentType) {
  const typeText = normalizeText(contentType || 'unknown content-type');
  return `模型接口返回非 JSON 响应（${typeText}）：当前请求地址为 ${buildChatCompletionsUrl(config?.baseUrl)}。如果这是公司 AI 网关，请确认 Base URL 填写到 /v1，例如 https://ai.midongtech.com/v1。`;
}

function normalizeLlmJsonParseErrorMessage(config) {
  return `模型接口 JSON 解析失败：当前请求地址为 ${buildChatCompletionsUrl(config?.baseUrl)}。请确认该地址是 OpenAI 兼容接口，而不是网关管理后台或网页地址。`;
}

function buildLlmFetchFailureMessage(error, config) {
  const baseUrl = formatLlmBaseUrlForDisplay(config?.baseUrl);
  const hostname = getUrlHostname(config?.baseUrl);
  const cause = error?.cause || {};
  const code = cause.code || cause.name || error?.code || error?.name || '';
  const detail = code ? `（${code}）` : '';

  if (error?.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
    return `模型接口连接超时${detail}：服务端在 ${Math.round(Number(config?.timeoutMs || 0) / 1000) || 15} 秒内无法访问 ${baseUrl}。请确认服务器网络可达，或把 Base URL 改为公司可访问的 OpenAI 兼容网关地址。`;
  }
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return `模型接口域名解析失败${detail}：服务端无法解析 ${hostname}。请检查 DNS、服务器网络，或把 Base URL 改为可访问的 OpenAI 兼容网关地址。`;
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET'].includes(code)) {
    return `模型接口连接失败${detail}：服务端访问 ${baseUrl} 时连接被拒绝或中断。请确认该 Base URL 在服务器环境可访问。`;
  }
  if (String(error?.message || '').includes('fetch failed')) {
    return `服务端访问模型接口失败：无法连接 ${baseUrl}。如果线上服务器不能直连 OpenAI，请在 Base URL 填写公司可访问的 OpenAI 兼容网关地址，或为服务器配置网络代理。`;
  }
  return `服务端访问模型接口失败${detail}：${normalizeText(error?.message || '未知网络错误')}。请确认 Base URL 在服务器环境可访问。`;
}

async function postChatCompletion(config, payload, useJsonMode = true) {
  const body = {
    model: config.model,
    temperature: config.temperature,
    messages: payload.messages,
  };
  if (Array.isArray(payload.tools) && payload.tools.length > 0) {
    body.tools = payload.tools;
    body.tool_choice = payload.tool_choice || 'auto';
    body.parallel_tool_calls = payload.parallel_tool_calls === true;
  }
  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new Error(buildLlmFetchFailureMessage(error, config));
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(normalizeLlmHttpErrorMessage(response.status, text));
  }
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!String(contentType).toLowerCase().includes('application/json')) {
    throw new Error(normalizeLlmNonJsonResponseMessage(config, contentType));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(normalizeLlmJsonParseErrorMessage(config));
  }
}

async function testLlmConnection(llmConfigOverride = null) {
  const config = getLlmConfig(llmConfigOverride);
  if (!config) {
    throw new Error('缺少 API Key，无法测试模型连接');
  }
  const completion = await postChatCompletion(config, {
    messages: [
      { role: 'system', content: '你是一个模型连接测试助手。' },
      { role: 'user', content: '请只回复 ok。' },
    ],
  }, false);
  const baseUrl = formatLlmBaseUrlForDisplay(config.baseUrl);
  return {
    success: true,
    model_name: completion?.model || config.model,
    base_url: baseUrl,
    config_source: config.source || 'env',
    usage: completion?.usage || null,
  };
}

async function generateAiTrainingSkillResponse({
  session,
  skill,
  version,
  promptText,
  matchedSuggestions,
  examples,
  recentMessages,
  llmConfigOverride = null,
  forceDeterministic = false,
}) {
  const promptSignals = extractPromptSignals(promptText, session);
  const followUpQuestions = buildFollowUpQuestions(version, session, promptSignals, matchedSuggestions);
  const baseResponse = buildDeterministicSkillResponse({
    session,
    skill,
    version,
    promptText,
    matchedSuggestions,
    examples,
    promptSignals,
    followUpQuestions,
  });
  const config = forceDeterministic ? null : getLlmConfig(llmConfigOverride);
  if (!config) {
    const runtimeMeta = {
      ...(baseResponse.structured.runtime_meta || {}),
      model_name: null,
      llm_enabled: false,
      model_config_source: 'none',
    };
    return {
      ...baseResponse,
      structured: {
        ...baseResponse.structured,
        runtime_meta: runtimeMeta,
      },
      follow_up_questions: followUpQuestions,
      prompt_signals: promptSignals,
      llm_usage: null,
    };
  }

  const messages = [
    { role: 'system', content: buildModelSystemPrompt({ session, skill, version, sectionTitles: baseResponse.section_titles }) },
    { role: 'user', content: buildModelUserPrompt({ session, skill, version, promptText, matchedSuggestions, examples, followUpQuestions, recentMessages }) },
  ];

  try {
    let completion;
    try {
      completion = await postChatCompletion(config, { messages }, true);
    } catch (error) {
      completion = await postChatCompletion(config, { messages }, false);
    }
    const content = normalizeText(completion?.choices?.[0]?.message?.content || '');
    const parsed = tryParseJsonPayload(content);
    if (!parsed) {
      const fallbackAnalysis = buildAnalysisProcess({
        session,
        skill,
        version,
        promptSignals,
        matchedSuggestions,
        examples,
        followUpQuestions,
        runtimeMode: 'deterministic',
        modelName: completion?.model || config.model,
        modelError: 'llm_response_not_json',
      });
      return {
        ...baseResponse,
        structured: {
          ...baseResponse.structured,
          analysis_process: fallbackAnalysis,
          runtime_meta: {
            ...(baseResponse.structured.runtime_meta || {}),
            mode: 'deterministic_fallback',
            model_name: completion?.model || config.model,
            llm_enabled: true,
            model_config_source: config.source || 'env',
          },
        },
        analysis_process: fallbackAnalysis,
        follow_up_questions: followUpQuestions,
        prompt_signals: promptSignals,
        llm_usage: completion?.usage || null,
        runtime_mode: 'deterministic_fallback',
        model_error: 'llm_response_not_json',
      };
    }
    const normalized = normalizeModelStructuredResponse(parsed, baseResponse, skill, version, matchedSuggestions);
    normalized.structured.runtime_meta = {
      ...(normalized.structured.runtime_meta || {}),
      model_name: completion?.model || config.model,
      llm_enabled: true,
      model_config_source: config.source || 'env',
    };
    return {
      ...normalized,
      follow_up_questions: followUpQuestions,
      prompt_signals: promptSignals,
      llm_usage: completion?.usage || null,
    };
  } catch (error) {
    const fallbackAnalysis = buildAnalysisProcess({
      session,
      skill,
      version,
      promptSignals,
      matchedSuggestions,
      examples,
      followUpQuestions,
      runtimeMode: 'deterministic',
      modelName: config.model,
      modelError: error.message,
    });
    return {
      ...baseResponse,
      structured: {
        ...baseResponse.structured,
        analysis_process: fallbackAnalysis,
        runtime_meta: {
          ...(baseResponse.structured.runtime_meta || {}),
          mode: 'deterministic_fallback',
          model_name: config.model,
          llm_enabled: true,
          model_config_source: config.source || 'env',
        },
      },
      analysis_process: fallbackAnalysis,
      follow_up_questions: followUpQuestions,
      prompt_signals: promptSignals,
      llm_usage: null,
      runtime_mode: 'deterministic_fallback',
      model_error: error.message,
    };
  }
}

function buildGeneralChatSystemPrompt(session = {}) {
  return [
    '你是组织中台 AI 训练台里的通用助手。',
    '用户未指定 Skill 时，请像通用 ChatGPT 助手一样直接、自然、完整地回答。',
    '可以处理业务、产品、技术、写作、分析和日常问题，不要强行套用固定业务模板。',
    '当事实或数据不足时明确说明限制，不要编造内部数据、文档内容或执行结果。',
    `当前会话场景：${normalizeText(session.scene_label || session.scene_code || '通用聊天')}。`,
    `当前业务线：${normalizeText(session.business_line || '未指定')}。`,
  ].filter(Boolean).join('\n');
}

function buildGeneralAgentSystemPrompt(session = {}, toolDefinitions = []) {
  const toolNames = toolDefinitions
    .map((item) => normalizeText(item?.function?.name))
    .filter(Boolean);
  return [
    '你是组织中台 AI 训练台里的通用执行 Agent。',
    '你的职责不是只做问答，而是根据任务自主判断是否需要调用工具或已发布 Skill，并根据工具结果继续工作直到形成可验证的最终答案。',
    '当用户询问组织内部文档、数据、Skill、项目或执行结果时，只要存在相关工具就必须调用工具，不能直接声称无法访问，也不能依赖模型记忆猜测。',
    'Skill 是可复用的专业工作流；当已有 Skill 与任务匹配时，优先调用 Skill，再结合其他工具校验或补充。',
    '工具返回的数据是事实来源。最终答案必须保留工具中的关键数字、口径、权限范围和限制，不得擅自修改或补造事实。',
    '如果没有合适工具或权限不足，应明确缺少的能力或授权，并给出下一步，而不是编造完成结果。',
    '直接给用户最终结果；系统会单独展示可审计的工具执行轨迹，不要输出隐藏思维链。',
    `当前会话场景：${normalizeText(session.scene_label || session.scene_code || '通用聊天')}。`,
    `当前业务线：${normalizeText(session.business_line || '未指定')}。`,
    toolNames.length > 0 ? `当前可用工具：${toolNames.join('、')}。` : '当前没有注册可执行工具。',
  ].filter(Boolean).join('\n');
}

function normalizeRecentChatMessages(recentMessages = []) {
  return recentMessages
    .slice(-8)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: normalizeText(item?.content || item?.content_text || ''),
    }))
    .filter((item) => item.content);
}

async function generateAiTrainingChatResponse({
  session,
  promptText,
  recentMessages = [],
  llmConfigOverride = null,
}) {
  const config = getLlmConfig(llmConfigOverride);
  if (!config) {
    throw new Error('系统模型尚未配置 API Key，通用聊天无法调用 ChatGPT/OpenAI 兼容接口。请先在系统设置中完成模型配置。');
  }

  const messages = [
    { role: 'system', content: buildGeneralChatSystemPrompt(session) },
    ...normalizeRecentChatMessages(recentMessages),
    { role: 'user', content: normalizeText(promptText) },
  ];
  const completion = await postChatCompletion(config, { messages }, false);
  const contentText = normalizeText(completion?.choices?.[0]?.message?.content || '');
  if (!contentText) throw new Error('模型接口返回了空回复，请重试');

  const modelName = completion?.model || config.model;
  const analysisProcess = {
    summary: '本轮未指定 Skill，已按自由聊天模式调用系统模型，并结合最近会话上下文生成回复。',
    steps: [
      '路由判断：未检测到已绑定或显式指定的 Skill。',
      `上下文装载：携带 ${normalizeRecentChatMessages(recentMessages).length} 条最近消息。`,
      `模型调用：通过 ${formatLlmBaseUrlForDisplay(config.baseUrl)} 调用 ${modelName}。`,
      '结果检查：确认模型返回非空内容后生成最终回复。',
    ],
    trace_tags: ['自由聊天', `模型:${modelName}`, `上下文:${normalizeRecentChatMessages(recentMessages).length}条`],
    llm_backed: true,
  };
  const summary = clipText(contentText.replace(/\n+/g, ' '), 160);

  return {
    contentText,
    structured: {
      summary,
      evidence: [],
      risk_reminders: [],
      actions: [],
      follow_up_questions: [],
      confidence: null,
      references: [],
      analysis_process: analysisProcess,
      runtime_meta: {
        mode: 'llm_chat',
        execution_mode: 'chat',
        skill_id: null,
        skill_name: null,
        skill_version_id: null,
        skill_version_no: null,
        model_name: modelName,
        llm_enabled: true,
        model_config_source: config.source || 'env',
        candidate_selected: 'llm',
      },
    },
    evidence: [],
    actions: [],
    confidence: null,
    analysis_process: analysisProcess,
    runtime_mode: 'llm_chat',
    llm_usage: completion?.usage || null,
  };
}

function parseAgentToolArguments(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('工具参数不是合法 JSON');
  }
}

function clipAgentValue(value, maxLength = 320) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = normalizeText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sanitizeAgentToolArguments(args = {}) {
  return Object.fromEntries(Object.entries(args).slice(0, 20).map(([key, value]) => {
    if (Array.isArray(value)) return [key, value.slice(0, 20).map((item) => clipAgentValue(item, 120))];
    if (value && typeof value === 'object') return [key, clipAgentValue(JSON.stringify(value), 320)];
    return [key, clipAgentValue(value)];
  }));
}

function normalizeAgentToolEnvelope(value, toolName) {
  const envelope = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { result: value };
  const hasExplicitResult = Object.prototype.hasOwnProperty.call(envelope, 'result');
  const result = hasExplicitResult ? envelope.result : envelope;
  return {
    result,
    result_summary: normalizeText(envelope.result_summary || envelope.summary || `${toolName} 已执行完成`),
    display_name: normalizeText(envelope.display_name || toolName),
    evidence: Array.isArray(envelope.evidence) ? envelope.evidence.map(normalizeText).filter(Boolean) : [],
    actions: Array.isArray(envelope.actions) ? envelope.actions.map(normalizeText).filter(Boolean) : [],
    references: Array.isArray(envelope.references) ? envelope.references.filter(Boolean) : [],
    invoked_skill: envelope.invoked_skill || null,
  };
}

function serializeAgentToolResult(value, maxLength = 30000) {
  let text;
  try {
    text = JSON.stringify(value ?? null);
  } catch {
    text = JSON.stringify({ error: '工具结果无法序列化' });
  }
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}\n[工具结果过长，已截断]`
    : text;
}

function mergeLlmUsage(total, usage) {
  if (!usage) return total;
  return {
    prompt_tokens: Number(total.prompt_tokens || 0) + Number(usage.prompt_tokens || 0),
    completion_tokens: Number(total.completion_tokens || 0) + Number(usage.completion_tokens || 0),
    total_tokens: Number(total.total_tokens || 0) + Number(
      usage.total_tokens || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0)
    ),
  };
}

async function generateAiTrainingAgentResponse({
  session,
  promptText,
  recentMessages = [],
  toolDefinitions = [],
  executeTool,
  llmConfigOverride = null,
  maxToolRounds = 6,
  onEvent = null,
}) {
  const config = getLlmConfig(llmConfigOverride);
  if (!config) {
    throw new Error('系统模型尚未配置 API Key，通用 Agent 无法调用模型。请先在系统设置中完成模型配置。');
  }
  const tools = (toolDefinitions || [])
    .filter((item) => item?.type === 'function' && item?.function?.name)
    .map((item) => ({
      type: 'function',
      function: {
        name: item.function.name,
        description: item.function.description || '',
        parameters: item.function.parameters || { type: 'object', properties: {} },
      },
    }));
  if (tools.length > 0 && typeof executeTool !== 'function') {
    throw new Error('Agent 已注册工具，但缺少工具执行器');
  }

  const messages = [
    { role: 'system', content: buildGeneralAgentSystemPrompt(session, tools) },
    ...normalizeRecentChatMessages(recentMessages),
    { role: 'user', content: normalizeText(promptText) },
  ];
  const toolTrace = [];
  const evidence = [];
  const actions = [];
  const references = [];
  const invokedSkills = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let modelName = config.model;
  let contentText = '';
  let toolRounds = 0;
  let eventIndex = 0;
  const emitEvent = async (event) => {
    if (typeof onEvent !== 'function') return;
    eventIndex += 1;
    await Promise.resolve(onEvent({
      index: eventIndex,
      created_at: new Date().toISOString(),
      ...event,
    })).catch(() => {});
  };

  await emitEvent({
    type: 'agent_started',
    label: '通用 Agent 已启动',
    detail: `已加载 ${tools.length} 个可用工具。`,
  });

  while (toolRounds <= Math.max(1, Number(maxToolRounds) || 6)) {
    const allowTools = tools.length > 0 && toolRounds < Math.max(1, Number(maxToolRounds) || 6);
    await emitEvent({
      type: 'model_started',
      label: toolRounds === 0 ? '正在理解任务并选择工具' : '正在根据工具结果继续分析',
      detail: `模型：${modelName}；工具轮次：${toolRounds + 1}。`,
    });
    const completion = await postChatCompletion(config, {
      messages,
      tools: allowTools ? tools : [],
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }, false);
    totalUsage = mergeLlmUsage(totalUsage, completion?.usage);
    modelName = completion?.model || modelName;
    const responseMessage = completion?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(responseMessage.tool_calls) ? responseMessage.tool_calls : [];
    if (!toolCalls.length) {
      contentText = normalizeText(responseMessage.content || '');
      if (contentText) break;
      throw new Error('Agent 模型返回了空回复，请重试');
    }

    messages.push({
      role: 'assistant',
      content: responseMessage.content || null,
      tool_calls: toolCalls,
    });
    toolRounds += 1;

    for (const toolCall of toolCalls) {
      const toolName = normalizeText(toolCall?.function?.name);
      const startedAt = Date.now();
      let args = {};
      let envelope;
      let status = 'success';
      try {
        args = parseAgentToolArguments(toolCall?.function?.arguments);
        await emitEvent({
          type: 'tool_started',
          label: `正在执行 ${toolName}`,
          tool_name: toolName,
          arguments: sanitizeAgentToolArguments(args),
        });
        envelope = normalizeAgentToolEnvelope(await executeTool(toolName, args), toolName);
      } catch (error) {
        status = 'failed';
        envelope = normalizeAgentToolEnvelope({
          result: { error: normalizeText(error.message || '工具执行失败') },
          result_summary: `${toolName} 执行失败：${normalizeText(error.message || '未知错误')}`,
        }, toolName);
      }
      const traceItem = {
        index: toolTrace.length + 1,
        type: 'tool_call',
        tool_name: toolName,
        display_name: envelope.display_name,
        status,
        arguments: sanitizeAgentToolArguments(args),
        result_summary: envelope.result_summary,
        result_preview: serializeAgentToolResult(envelope.result, 6000),
        latency_ms: Date.now() - startedAt,
      };
      toolTrace.push(traceItem);
      await emitEvent({
        type: 'tool_completed',
        label: envelope.display_name,
        tool_name: toolName,
        status,
        detail: envelope.result_summary,
        latency_ms: traceItem.latency_ms,
      });
      evidence.push(...envelope.evidence);
      actions.push(...envelope.actions);
      references.push(...envelope.references);
      if (envelope.invoked_skill?.skill_id) invokedSkills.push(envelope.invoked_skill);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: serializeAgentToolResult({
          status,
          summary: envelope.result_summary,
          result: envelope.result,
        }),
      });
    }
  }

  if (!contentText) {
    throw new Error('Agent 达到工具调用上限后仍未生成最终回复');
  }

  const uniqueReferences = references.filter((item, index, list) => {
    const key = `${item?.type || ''}:${item?.id || item?.title || index}`;
    return list.findIndex((candidate, candidateIndex) => (
      `${candidate?.type || ''}:${candidate?.id || candidate?.title || candidateIndex}` === key
    )) === index;
  });
  const uniqueInvokedSkills = invokedSkills.filter((item, index, list) => (
    list.findIndex((candidate) => Number(candidate?.skill_id) === Number(item?.skill_id)) === index
  ));
  const analysisProcess = {
    summary: toolTrace.length > 0
      ? `通用 Agent 根据任务自主完成 ${toolTrace.length} 次工具调用，并基于工具结果生成最终回复。`
      : '通用 Agent 判断本轮不需要调用内部工具，直接结合会话上下文生成回复。',
    steps: [
      '任务识别：由通用 Agent 判断问题类型、所需事实和可用能力。',
      ...(toolTrace.length > 0
        ? toolTrace.map((item) => `${item.status === 'success' ? '工具执行' : '工具异常'}：${item.display_name}；${item.result_summary}`)
        : ['工具判断：本轮未调用内部工具。']),
      '结果整理：基于已获得的工具事实和会话上下文生成最终回复。',
    ],
    tool_calls: toolTrace,
    trace_tags: [
      '通用Agent',
      `模型:${modelName}`,
      `工具:${toolTrace.length}次`,
      ...(uniqueInvokedSkills.map((item) => `Skill:${item.skill_code || item.skill_name || item.skill_id}`)),
    ],
    llm_backed: true,
  };
  const primarySkill = uniqueInvokedSkills[0] || null;
  const summary = clipText(contentText.replace(/\n+/g, ' '), 180);

  await emitEvent({
    type: 'agent_completed',
    label: 'Agent 已生成最终结果',
    detail: toolTrace.length > 0 ? `完成 ${toolTrace.length} 次工具调用。` : '本轮无需调用工具。',
  });

  return {
    contentText,
    structured: {
      summary,
      evidence: [...new Set(evidence)].slice(0, 20),
      risk_reminders: [],
      actions: [...new Set(actions)].slice(0, 20),
      follow_up_questions: [],
      confidence: toolTrace.some((item) => item.status === 'failed') ? 70 : null,
      references: uniqueReferences,
      analysis_process: analysisProcess,
      runtime_meta: {
        mode: 'agent',
        execution_mode: 'agent',
        skill_id: primarySkill?.skill_id || null,
        skill_name: primarySkill?.skill_name || null,
        skill_version_id: primarySkill?.skill_version_id || null,
        skill_version_no: primarySkill?.skill_version_no || null,
        invoked_skills: uniqueInvokedSkills,
        model_name: modelName,
        llm_enabled: true,
        model_config_source: config.source || 'env',
        candidate_selected: 'agent',
        tool_call_count: toolTrace.length,
      },
    },
    evidence: [...new Set(evidence)].slice(0, 20),
    actions: [...new Set(actions)].slice(0, 20),
    confidence: toolTrace.some((item) => item.status === 'failed') ? 70 : null,
    analysis_process: analysisProcess,
    runtime_mode: 'agent',
    llm_usage: totalUsage,
    invoked_skills: uniqueInvokedSkills,
  };
}

function extractSignificantNumbers(value) {
  const matches = String(value || '').match(/[-+]?\d[\d,]*(?:\.\d+)?\s*(?:%|万|亿)?/g) || [];
  return matches.map((raw) => {
    const normalizedRaw = raw.trim();
    const isPercent = normalizedRaw.endsWith('%');
    const unit = normalizedRaw.endsWith('亿') ? '亿' : normalizedRaw.endsWith('万') ? '万' : '';
    const multiplier = unit === '亿' ? 100000000 : unit === '万' ? 10000 : 1;
    const numeric = Number(normalizedRaw.replace(/,/g, '').replace(/[%万亿]$/, '').trim()) * multiplier;
    return { raw: normalizedRaw, numeric, isPercent };
  }).filter((item) => {
    if (!Number.isFinite(item.numeric)) return false;
    if (item.isPercent) return true;
    return Math.abs(item.numeric) >= 20 || String(item.raw).includes('.');
  });
}

function numbersAreEquivalent(left, right) {
  if (left.isPercent !== right.isPercent) return false;
  const tolerance = Math.max(0.02, Math.abs(left.numeric) * 0.001);
  return Math.abs(left.numeric - right.numeric) <= tolerance;
}

function validateAiTrainingEnhancedResponse({ baseResponse, promptText, enhancedText }) {
  const trustedText = [
    promptText,
    baseResponse?.contentText,
    JSON.stringify(baseResponse?.structured?.data_total || {}),
    JSON.stringify(baseResponse?.structured?.data_preview || []),
    ...(baseResponse?.evidence || []),
  ].join('\n');
  const trustedNumbers = extractSignificantNumbers(trustedText);
  const enhancedNumbers = extractSignificantNumbers(enhancedText);
  const unverifiedNumbers = enhancedNumbers.filter((candidate) => (
    !trustedNumbers.some((trusted) => numbersAreEquivalent(candidate, trusted))
  ));
  const issues = [];
  if (!normalizeText(enhancedText)) issues.push('模型增强结果为空');
  if (unverifiedNumbers.length > 0) {
    issues.push(`模型增强结果包含未验证数字：${unverifiedNumbers.slice(0, 5).map((item) => item.raw).join('、')}`);
  }
  return {
    passed: issues.length === 0,
    issues,
    trusted_number_count: trustedNumbers.length,
    checked_number_count: enhancedNumbers.length,
  };
}

function scoreAiTrainingCandidate(structured = {}, contentText = '') {
  const evidenceCount = Array.isArray(structured.evidence) ? structured.evidence.length : 0;
  const actionCount = Array.isArray(structured.actions) ? structured.actions.length : 0;
  const riskCount = Array.isArray(structured.risk_reminders) ? structured.risk_reminders.length : 0;
  const lengthScore = Math.min(12, Math.round(normalizeText(contentText).length / 120));
  return Math.min(99, 48 + Math.min(evidenceCount, 4) * 6 + Math.min(actionCount, 4) * 6 + Math.min(riskCount, 3) * 3 + lengthScore);
}

function buildSkillReviewSystemPrompt(skill, version) {
  return [
    '你是业务 Skill 输出审校器。你的任务是增强表达、补全归因和提高可执行性，不是重新编造事实。',
    'Skill 输出、数据预览和证据中的日期、金额、比例、订单量等数值属于已验证事实，必须保持一致。',
    '不得引入输入和 Skill 结果中不存在的业务数字、应用、媒体、广告位或文档结论。',
    '请严格输出 JSON 对象，不要输出额外解释。',
    'JSON 字段：final_answer, summary, evidence, risk_reminders, actions, confidence, review_notes。',
    'evidence、risk_reminders、actions、review_notes 必须是字符串数组。',
    `当前 Skill：${normalizeText(skill?.name || skill?.skill_code || '未命名 Skill')}。`,
    normalizeText(version?.system_prompt || ''),
    normalizeText(version?.guardrails_text || ''),
  ].filter(Boolean).join('\n');
}

async function enhanceAiTrainingSkillResponse({
  session,
  skill,
  version,
  promptText,
  skillResponse,
  recentMessages = [],
  llmConfigOverride = null,
}) {
  const config = getLlmConfig(llmConfigOverride);
  const baseStructured = skillResponse?.structured || {};
  const baseRuntimeMeta = baseStructured.runtime_meta || {};
  const baseScore = scoreAiTrainingCandidate(baseStructured, skillResponse?.contentText || '');
  const baseSteps = Array.isArray(skillResponse?.analysis_process?.steps)
    ? skillResponse.analysis_process.steps
    : [];

  if (!config) {
    const analysisProcess = {
      ...(skillResponse?.analysis_process || {}),
      summary: '已完成 Skill 执行，但系统模型未配置，当前保留 Skill 原结果。',
      steps: [
        ...baseSteps,
        '模型审校：系统模型缺少 API Key，未执行 ChatGPT/OpenAI 兼容接口审校。',
        '结果选择：保留通过 Skill 生成的原始结果。',
      ],
      trace_tags: [...(skillResponse?.analysis_process?.trace_tags || []), '模型未配置', '采用Skill结果'],
      model_error: 'missing_llm_api_key',
      llm_backed: false,
    };
    return {
      ...skillResponse,
      structured: {
        ...baseStructured,
        analysis_process: analysisProcess,
        runtime_meta: {
          ...baseRuntimeMeta,
          mode: 'skill_only',
          execution_mode: 'skill',
          candidate_selected: 'skill',
          candidate_scores: { skill: baseScore, enhanced: null },
          llm_enabled: false,
        },
      },
      analysis_process: analysisProcess,
      runtime_mode: 'skill_only',
      llm_usage: null,
      model_error: 'missing_llm_api_key',
    };
  }

  const messages = [
    { role: 'system', content: buildSkillReviewSystemPrompt(skill, version) },
    {
      role: 'user',
      content: JSON.stringify({
        session: {
          scene_code: session?.scene_code || null,
          business_line: session?.business_line || null,
          role_scope: session?.role_scope || null,
        },
        user_prompt: promptText,
        skill: {
          code: skill?.skill_code || null,
          name: skill?.name || null,
          version_no: version?.version_no || null,
        },
        verified_skill_result: {
          content_text: skillResponse?.contentText || '',
          summary: baseStructured.summary || '',
          evidence: baseStructured.evidence || skillResponse?.evidence || [],
          risk_reminders: baseStructured.risk_reminders || [],
          actions: baseStructured.actions || skillResponse?.actions || [],
          data_preview: baseStructured.data_preview || [],
          data_total: baseStructured.data_total || null,
          references: baseStructured.references || [],
        },
        recent_messages: normalizeRecentChatMessages(recentMessages).slice(-4),
      }, null, 2),
    },
  ];

  try {
    let completion;
    try {
      completion = await postChatCompletion(config, { messages }, true);
    } catch {
      completion = await postChatCompletion(config, { messages }, false);
    }
    const modelName = completion?.model || config.model;
    const content = normalizeText(completion?.choices?.[0]?.message?.content || '');
    const payload = tryParseJsonPayload(content);
    if (!payload || !normalizeText(payload.final_answer)) {
      throw new Error('skill_review_response_not_json');
    }

    const enhancedStructured = {
      ...baseStructured,
      summary: normalizeText(payload.summary || baseStructured.summary || payload.final_answer),
      evidence: Array.isArray(payload.evidence) && payload.evidence.length > 0
        ? payload.evidence.map(normalizeText).filter(Boolean)
        : (baseStructured.evidence || skillResponse?.evidence || []),
      risk_reminders: Array.isArray(payload.risk_reminders)
        ? payload.risk_reminders.map(normalizeText).filter(Boolean)
        : (baseStructured.risk_reminders || []),
      actions: Array.isArray(payload.actions) && payload.actions.length > 0
        ? payload.actions.map(normalizeText).filter(Boolean)
        : (baseStructured.actions || skillResponse?.actions || []),
      confidence: Math.max(0, Math.min(100, Number(payload.confidence || baseStructured.confidence || skillResponse?.confidence || 0))),
    };
    const enhancedText = normalizeText(payload.final_answer);
    const validation = validateAiTrainingEnhancedResponse({
      baseResponse: skillResponse,
      promptText,
      enhancedText: [
        enhancedText,
        enhancedStructured.summary,
        ...(enhancedStructured.evidence || []),
        ...(enhancedStructured.risk_reminders || []),
        ...(enhancedStructured.actions || []),
      ].join('\n'),
    });
    const enhancedScore = validation.passed ? scoreAiTrainingCandidate(enhancedStructured, enhancedText) : 0;
    const useEnhanced = validation.passed && enhancedScore >= Math.max(60, baseScore - 5);
    const selected = useEnhanced ? 'llm_enhanced' : 'skill';
    const selectedStructured = useEnhanced ? enhancedStructured : baseStructured;
    const selectedText = useEnhanced ? enhancedText : skillResponse.contentText;
    const analysisProcess = {
      ...(skillResponse?.analysis_process || {}),
      summary: useEnhanced
        ? '已完成 Skill 执行、模型审校和事实校验，最终采用模型增强结果。'
        : '已完成 Skill 执行和模型审校；增强结果未通过择优条件，最终保留 Skill 原结果。',
      steps: [
        ...baseSteps,
        `模型审校：通过 ${formatLlmBaseUrlForDisplay(config.baseUrl)} 调用 ${modelName}，基于 Skill 事实补强表达与动作。`,
        `事实校验：核对 ${validation.checked_number_count} 个增强结果数字，${validation.passed ? '未发现新增未验证数字' : validation.issues.join('；')}。`,
        `候选评分：Skill ${baseScore} 分，模型增强 ${enhancedScore} 分。`,
        `结果选择：${useEnhanced ? '采用模型增强结果' : '保留 Skill 原结果'}。`,
      ],
      trace_tags: [
        ...(skillResponse?.analysis_process?.trace_tags || []),
        `模型审校:${modelName}`,
        validation.passed ? '事实校验通过' : '事实校验未通过',
        useEnhanced ? '采用增强结果' : '采用Skill结果',
      ],
      review_notes: Array.isArray(payload.review_notes) ? payload.review_notes.map(normalizeText).filter(Boolean) : [],
      validation,
      llm_backed: true,
    };

    return {
      ...skillResponse,
      contentText: selectedText,
      structured: {
        ...selectedStructured,
        analysis_process: analysisProcess,
        runtime_meta: {
          ...baseRuntimeMeta,
          mode: useEnhanced ? 'skill_llm_hybrid' : 'skill_llm_fallback',
          execution_mode: 'skill',
          model_name: modelName,
          llm_enabled: true,
          model_config_source: config.source || 'env',
          candidate_selected: selected,
          candidate_scores: { skill: baseScore, enhanced: enhancedScore },
          validation_passed: validation.passed,
        },
      },
      evidence: selectedStructured.evidence || skillResponse.evidence || [],
      actions: selectedStructured.actions || skillResponse.actions || [],
      confidence: selectedStructured.confidence || skillResponse.confidence || null,
      analysis_process: analysisProcess,
      runtime_mode: useEnhanced ? 'skill_llm_hybrid' : 'skill_llm_fallback',
      llm_usage: completion?.usage || null,
      model_error: validation.passed ? null : validation.issues.join('；'),
    };
  } catch (error) {
    const analysisProcess = {
      ...(skillResponse?.analysis_process || {}),
      summary: 'Skill 已执行完成，但模型审校失败，当前保留 Skill 原结果。',
      steps: [
        ...baseSteps,
        `模型审校失败：${normalizeText(error.message || '未知错误')}。`,
        '结果选择：保留 Skill 原结果，避免审校异常影响已验证事实。',
      ],
      trace_tags: [...(skillResponse?.analysis_process?.trace_tags || []), '模型审校回退', '采用Skill结果'],
      model_error: normalizeText(error.message || 'skill_review_failed'),
      llm_backed: false,
    };
    return {
      ...skillResponse,
      structured: {
        ...baseStructured,
        analysis_process: analysisProcess,
        runtime_meta: {
          ...baseRuntimeMeta,
          mode: 'skill_llm_fallback',
          execution_mode: 'skill',
          model_name: config.model,
          llm_enabled: true,
          model_config_source: config.source || 'env',
          candidate_selected: 'skill',
          candidate_scores: { skill: baseScore, enhanced: null },
          validation_passed: false,
        },
      },
      analysis_process: analysisProcess,
      runtime_mode: 'skill_llm_fallback',
      llm_usage: null,
      model_error: normalizeText(error.message || 'skill_review_failed'),
    };
  }
}

function computeKeywordOverlapScore(sourceText, targetText) {
  const sourceKeywords = buildKeywordSet(sourceText);
  const targetKeywords = buildKeywordSet(targetText);
  if (sourceKeywords.size === 0 || targetKeywords.size === 0) return 0;
  let overlap = 0;
  sourceKeywords.forEach((item) => {
    if (targetKeywords.has(item)) overlap += 1;
  });
  return overlap / Math.max(sourceKeywords.size, targetKeywords.size);
}

function scoreAiTrainingEvalOutput({
  promptText,
  expectedOutputText,
  actualStructured,
  actualText,
  sectionTitles,
  referenceSuggestions,
}) {
  const safeText = compactWhitespace(actualText);
  const presentSections = (sectionTitles || DEFAULT_SECTION_TITLES).reduce((count, section) => (
    count + (safeText.includes(section) ? 1 : 0)
  ), 0);
  const structureScore = Math.min(0.99, Math.max(0.58, (presentSections / Math.max((sectionTitles || DEFAULT_SECTION_TITLES).length, 1)) * 0.85 + 0.12));
  const evidenceScore = Math.min(
    0.99,
    Math.max(
      0.55,
      ((actualStructured?.evidence || []).length >= 2 ? 0.68 : 0.52)
      + (((actualStructured?.evidence || []).join(' ').match(/\d+(\.\d+)?%?/g) || []).length >= 1 ? 0.14 : 0)
      + (referenceSuggestions.length > 0 ? 0.08 : 0),
    ),
  );
  const actionabilityScore = Math.min(
    0.99,
    Math.max(
      0.56,
      ((actualStructured?.actions || []).length >= 2 ? 0.7 : 0.54)
      + ((actualStructured?.actions || []).some(item => /(复核|观察|创建|统一|补|拉齐|核查|收量|回撤)/.test(item)) ? 0.12 : 0),
    ),
  );
  const overlapWithExpected = computeKeywordOverlapScore(expectedOutputText, safeText);
  const overlapWithPrompt = computeKeywordOverlapScore(promptText, safeText);
  const accuracyScore = Math.min(
    0.99,
    Math.max(
      0.54,
      0.48 + (overlapWithExpected * 0.32) + (overlapWithPrompt * 0.14) + (referenceSuggestions.length > 0 ? 0.06 : 0),
    ),
  );
  const passed = accuracyScore >= 0.72
    && structureScore >= 0.78
    && evidenceScore >= 0.72
    && actionabilityScore >= 0.72
    ? 1
    : 0;

  return {
    accuracy: Number(accuracyScore.toFixed(4)),
    structure: Number(structureScore.toFixed(4)),
    evidence: Number(evidenceScore.toFixed(4)),
    actionability: Number(actionabilityScore.toFixed(4)),
    passed,
  };
}

function estimateTokenCount(value) {
  const text = normalizeText(value);
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 2.2));
}

module.exports = {
  enhanceAiTrainingSkillResponse,
  extractPromptSignals,
  generateAiTrainingAgentResponse,
  generateAiTrainingChatResponse,
  generateAiTrainingSkillResponse,
  getLlmRuntimeStatus,
  inferSectionTitles,
  selectRelevantSuggestions,
  scoreAiTrainingEvalOutput,
  testLlmConnection,
  estimateTokenCount,
  validateAiTrainingEnhancedResponse,
};
