const DEFAULT_SECTION_TITLES = ['结论摘要', '核心证据', '风险提醒', '下一步建议'];

const SCENE_SUGGESTION_TYPE_MAP = {
  revenue_diagnosis: ['revenue_diagnosis', 'collaboration', 'media_mix'],
  budget_advice: ['budget_adjustment', 'revenue_diagnosis'],
  daily_report: ['revenue_diagnosis', 'budget_adjustment', 'collaboration', 'media_mix'],
  general_chat: ['revenue_diagnosis', 'budget_adjustment', 'collaboration', 'media_mix'],
};

const DEFAULT_LLM_MODEL = 'gpt-5.5';
const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';

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
    baseUrl: (baseUrl || DEFAULT_LLM_BASE_URL).replace(/\/+$/g, ''),
    timeoutMs,
    temperature: overrideApiKey && Number.isFinite(overrideTemperature)
      ? overrideTemperature
      : getEnvLlmTemperature(),
    source: overrideApiKey ? (overrides?.source || 'user') : 'env',
    provider: overrideApiKey ? (overrides?.provider || 'openai') : 'openai',
  };
}

function getLlmRuntimeStatus(overrides = null) {
  const config = getLlmConfig(overrides);
  const targetModel = normalizeText(config?.model || getEnvLlmModel());
  const targetBaseUrl = normalizeText(config?.baseUrl || getEnvLlmBaseUrl());
  if (!config) {
    let displayBaseUrl = targetBaseUrl;
    try {
      displayBaseUrl = new URL(targetBaseUrl).origin;
    } catch {}
    return {
      llm_enabled: false,
      preferred_runtime: 'deterministic',
      model_name: targetModel,
      base_url: displayBaseUrl,
      target_model_name: targetModel,
      config_source: 'none',
      fallback_enabled: true,
      status_text: `目标模型为 ${targetModel}，但当前缺少 API Key，训练台会先走规则模式。`,
      setup_hint: '请在服务端配置 AI_TRAINING_LLM_API_KEY、AI_API_KEY、LLM_API_KEY 或 OPENAI_API_KEY。',
    };
  }

  let baseUrl = config.baseUrl;
  try {
    baseUrl = new URL(config.baseUrl).origin;
  } catch {}
  return {
    llm_enabled: true,
    preferred_runtime: 'llm',
    model_name: config.model,
    base_url: baseUrl,
    target_model_name: config.model,
    config_source: config.source || 'env',
    provider: config.provider || 'openai',
    fallback_enabled: true,
    status_text: config.source === 'user'
      ? `个人模型 Key 已启用：${config.model}，规则链路仅作兜底。`
      : `当前默认接入系统小模型 ${config.model}，规则链路仅作兜底。`,
    setup_hint: null,
  };
}

async function postChatCompletion(config, payload, useJsonMode = true) {
  const body = {
    model: config.model,
    temperature: config.temperature,
    messages: payload.messages,
  };
  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM HTTP ${response.status}: ${text}`);
  }
  return response.json();
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
  let baseUrl = config.baseUrl;
  try {
    baseUrl = new URL(config.baseUrl).origin;
  } catch {}
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
  const config = getLlmConfig(llmConfigOverride);
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
  extractPromptSignals,
  generateAiTrainingSkillResponse,
  getLlmRuntimeStatus,
  inferSectionTitles,
  selectRelevantSuggestions,
  scoreAiTrainingEvalOutput,
  testLlmConnection,
  estimateTokenCount,
};
