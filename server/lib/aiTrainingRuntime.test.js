const test = require('node:test');
const assert = require('node:assert/strict');

const {
  enhanceAiTrainingSkillResponse,
  generateAiTrainingAgentResponse,
  generateAiTrainingChatResponse,
  validateAiTrainingEnhancedResponse,
} = require('./aiTrainingRuntime');

function installMockFetch(t, responseContent) {
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    requests.push({
      url,
      ...JSON.parse(options.body || '{}'),
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: responseContent } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    };
  };
  t.after(() => { global.fetch = originalFetch; });
  return requests;
}

function buildSkillResponse() {
  const analysisProcess = {
    summary: '已完成支小数据分析。',
    steps: ['执行支小数据分析 Skill。'],
    trace_tags: ['Skill:支小数据分析'],
    llm_backed: false,
  };
  return {
    contentText: '支小 2026-07-15 大盘毛利 33309.257 元，距离 5 万毛利还差 16690.743 元。',
    structured: {
      summary: '支小距离 5 万毛利存在 16690.743 元缺口。',
      evidence: ['2026-07-15 大盘毛利为 33309.257 元。'],
      risk_reminders: ['投放毛利为负时不得直接扩量。'],
      actions: ['先复盘峰值日的高 ARPU 组合。'],
      confidence: 94,
      references: [{ id: 'fact-1', title: '支小日 KPI' }],
      data_preview: [{ metric: 'gross_profit', value: 33309.257 }],
      data_total: { gap_to_50k_gross_profit: 16690.743 },
      analysis_process: analysisProcess,
      runtime_meta: {
        mode: 'local_fact',
        skill_id: 1,
        skill_name: '支小数据分析',
        skill_version_id: 2,
        skill_version_no: 'v0.1',
      },
    },
    evidence: ['2026-07-15 大盘毛利为 33309.257 元。'],
    actions: ['先复盘峰值日的高 ARPU 组合。'],
    analysis_process: analysisProcess,
    runtime_mode: 'local_fact',
  };
}

test('general chat always calls the configured OpenAI-compatible endpoint', async t => {
  const requests = installMockFetch(t, '这是自由聊天模型回复。');

  const result = await generateAiTrainingChatResponse({
    session: { scene_code: 'general_chat', scene_label: '通用训练' },
    promptText: '帮我写一段复盘摘要',
    recentMessages: [{ role: 'user', content_text: '这是上一轮消息' }],
    llmConfigOverride: {
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
      model: 'test-model',
      source: 'system',
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(result.runtime_mode, 'llm_chat');
  assert.equal(result.structured.runtime_meta.candidate_selected, 'llm');
  assert.equal(result.contentText, '这是自由聊天模型回复。');
  assert.match(requests[0].messages.at(-1).content, /复盘摘要/);
});

test('general agent executes tool calls and returns a real tool trace', async t => {
  const requests = [];
  const originalFetch = global.fetch;
  let requestIndex = 0;
  global.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    requests.push({ url, ...body });
    requestIndex += 1;
    const message = requestIndex === 1
      ? {
        content: null,
        tool_calls: [{
          id: 'call_documents_count',
          type: 'function',
          function: { name: 'relation_documents_count', arguments: '{}' },
        }],
      }
      : { content: '当前账号在 Relation 文档中心可见 428 篇文档。' };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        model: 'test-agent-model',
        choices: [{ message }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
      }),
    };
  };
  t.after(() => { global.fetch = originalFetch; });

  const executed = [];
  const result = await generateAiTrainingAgentResponse({
    session: { scene_code: 'general_chat', scene_label: '通用训练' },
    promptText: '看看文档中心有多少篇文档',
    recentMessages: [],
    toolDefinitions: [{
      type: 'function',
      function: {
        name: 'relation_documents_count',
        description: '统计文档数量',
        parameters: { type: 'object', properties: {} },
      },
    }],
    executeTool: async (name, args) => {
      executed.push({ name, args });
      return {
        display_name: '统计 Relation 文档中心',
        result: { document_count: 428, permission_scope: 'current_user' },
        result_summary: '当前账号可见范围共有 428 篇文档。',
        evidence: ['Relation 权限过滤后的文档数量为 428 篇。'],
      };
    },
    llmConfigOverride: {
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
      model: 'test-agent-model',
      source: 'system',
    },
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].tools[0].function.name, 'relation_documents_count');
  assert.equal(requests[1].messages.at(-1).role, 'tool');
  assert.deepEqual(executed, [{ name: 'relation_documents_count', args: {} }]);
  assert.equal(result.runtime_mode, 'agent');
  assert.equal(result.structured.runtime_meta.candidate_selected, 'agent');
  assert.equal(result.structured.runtime_meta.tool_call_count, 1);
  assert.equal(result.analysis_process.tool_calls[0].status, 'success');
  assert.match(result.contentText, /428/);
  assert.match(result.evidence.join(' '), /428/);
});

test('skill review selects an enhanced result when verified facts remain unchanged', async t => {
  const requests = installMockFetch(t, JSON.stringify({
    final_answer: '结论：2026-07-15 大盘毛利 33309.257 元，距离 5 万毛利还差 16690.743 元。先复盘峰值日的高 ARPU 组合，并设置投放止损线。',
    summary: '距离 5 万毛利仍有 16690.743 元缺口。',
    evidence: ['2026-07-15 大盘毛利为 33309.257 元。'],
    risk_reminders: ['投放毛利为负时不得直接扩量。'],
    actions: ['先复盘峰值日的高 ARPU 组合。', '设置投放止损线。'],
    confidence: 94,
    review_notes: ['补充了动作优先级。'],
  }));

  const result = await enhanceAiTrainingSkillResponse({
    session: { scene_code: 'business_growth', business_line: 'zhixiao' },
    skill: { id: 1, skill_code: 'zhixiao_dashboard_analysis', name: '支小数据分析' },
    version: { id: 2, version_no: 'v0.1' },
    promptText: '分析支小 2026-07-15 距离 5 万毛利的缺口。',
    skillResponse: buildSkillResponse(),
    llmConfigOverride: {
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
      model: 'test-model',
      source: 'system',
    },
  });

  assert.equal(result.runtime_mode, 'skill_llm_hybrid');
  assert.equal(result.structured.runtime_meta.candidate_selected, 'llm_enhanced');
  assert.equal(result.structured.runtime_meta.validation_passed, true);
  assert.match(result.contentText, /设置投放止损线/);
  assert.equal(requests.length, 1);
});

test('skill review falls back when the model introduces an unverified business number', async t => {
  installMockFetch(t, JSON.stringify({
    final_answer: '2026-07-15 大盘毛利 33309.257 元，建议追加 88888 元预算。',
    summary: '建议追加预算。',
    evidence: ['大盘毛利为 33309.257 元。'],
    risk_reminders: [],
    actions: ['追加 88888 元预算。'],
    confidence: 90,
    review_notes: [],
  }));

  const result = await enhanceAiTrainingSkillResponse({
    session: { scene_code: 'business_growth', business_line: 'zhixiao' },
    skill: { id: 1, skill_code: 'zhixiao_dashboard_analysis', name: '支小数据分析' },
    version: { id: 2, version_no: 'v0.1' },
    promptText: '分析支小 2026-07-15 距离 5 万毛利的缺口。',
    skillResponse: buildSkillResponse(),
    llmConfigOverride: {
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
      model: 'test-model',
      source: 'system',
    },
  });

  assert.equal(result.runtime_mode, 'skill_llm_fallback');
  assert.equal(result.structured.runtime_meta.candidate_selected, 'skill');
  assert.equal(result.structured.runtime_meta.validation_passed, false);
  assert.doesNotMatch(result.contentText, /88888/);
});

test('fact validator rejects numbers that are absent from the prompt and Skill result', () => {
  const validation = validateAiTrainingEnhancedResponse({
    baseResponse: buildSkillResponse(),
    promptText: '分析 2026-07-15 的毛利。',
    enhancedText: '大盘毛利为 33309.257 元，新增预算为 99999 元。',
  });
  assert.equal(validation.passed, false);
  assert.match(validation.issues.join('；'), /99999/);
});

test('fact validator normalizes Chinese ten-thousand units', () => {
  const validation = validateAiTrainingEnhancedResponse({
    baseResponse: buildSkillResponse(),
    promptText: '目标是 5 万毛利。',
    enhancedText: '建议把目标改成 8 万毛利。',
  });
  assert.equal(validation.passed, false);
  assert.match(validation.issues.join('；'), /8 万/);
});
