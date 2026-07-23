const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLOSING_TEXT,
  OPENING_TEXT,
  OPERATIONAL_MEETING_PROMPT_VERSION,
  OperationalMeetingAgendaError,
  buildFallbackOperationalMeetingAgenda,
  buildOperationalMeetingAiSections,
  callOperationalMeetingLlm,
  hashOperationalMeetingSource,
  normalizeOperationalMeetingAgendaPayload,
  operationalMeetingAgendaLooksSensitive,
  operationalMeetingAgendaToDocumentBody,
  parseOperationalMeetingModelOutput,
  sanitizeOperationalMeetingInput,
} = require('./operationalMeetingAgenda');

function sampleAgenda() {
  return {
    meeting_goals: [
      '对齐本周国内、海外业务的核心变化。',
      '区分短期波动和结构性问题。',
      '明确跨模块资源排序和风险边界。',
      '将会议决策落实到Owner、时间和验证标准。',
    ],
    business_modules: [
      {
        title: '海外AFS',
        progress: ['本周消耗约9.5万美元，ROI约1.23。'],
        judgment: ['项目已进入稳定放大能力的验证阶段。'],
        discussion: ['下周主攻国家、投手分工和账号目标如何设置。'],
      },
      {
        title: '国内业务',
        progress: ['日均收入约11.17万元，ARPU环比下降31.9%。'],
        judgment: ['当前主要问题是收入质量和点击到申请转化下降。'],
        discussion: ['预算、核心媒体和产品入口如何排序。'],
      },
    ],
    decision_topics: Array.from({ length: 5 }, (_, index) => ({
      title: `决策议题${index + 1}`,
      background: ['现有业务进展需要管理层统一判断。'],
      discussion: ['需要讨论优先级、资源投入和风险边界。'],
      conclusions: ['Owner、验证周期、量化指标和止损条件待会上确认。'],
    })),
    agenda: [
      { minutes: 5, topic: '开场', scope: '确认会议目标。' },
      { minutes: 10, topic: '经营总览', scope: '同步核心变化。' },
      { minutes: 35, topic: '海外业务', scope: '讨论海外项目。' },
      { minutes: 30, topic: '国内业务', scope: '讨论国内业务。' },
      { minutes: 20, topic: 'AI与组织', scope: '讨论专项和资源。' },
      { minutes: 30, topic: '决策确认', scope: '确认Owner和指标。' },
      { minutes: 5, topic: '收口', scope: '确认下周动作。' },
    ],
    next_actions: [
      {
        module: '海外AFS',
        actions: ['明确主攻国家并验证账号放量能力。'],
        to_confirm: ['业务Owner、验证时间和风险预警线。'],
      },
      {
        module: '国内业务',
        actions: ['优先修复核心漏斗并完成预算排序。'],
        to_confirm: ['子项Owner、量化指标和暂停条件。'],
      },
    ],
    preparation_questions: [
      '本周最重要的经营变化是什么？',
      '下周最容易失控的风险是什么？',
      '资源只能支持两个方向时如何排序？',
      '哪些事项必须在会上拍板？',
      'AI最适合优先落地在哪个场景？',
    ],
  };
}

test('extracts submitted preparation questions and sanitizes sensitive clauses', () => {
  const rows = [{
    title: '国内业务准备',
    owner_name: '负责人A',
    default_questions_json: JSON.stringify([
      { key: 'weekly_result', title: '本周核心结果' },
      { key: 'decision_needed', title: '需要会上决策的问题' },
    ]),
    content_json: JSON.stringify({
      format: 'relation_document_blocks_v1',
      blocks: [
        {
          id: 'q1',
          type: 'fold-list',
          content: '本周核心结果',
          meta: { indent: 0, template_question_key: 'weekly_result' },
        },
        {
          id: 'a1',
          type: 'bullet',
          content: '毛利：5.31万元，收入：11.17万元，成本：5.86万元',
          meta: { indent: 1 },
        },
        {
          id: 'q2',
          type: 'fold-list',
          content: '需要会上决策的问题',
          meta: { indent: 0, template_question_key: 'decision_needed' },
        },
        {
          id: 'a2',
          type: 'table-simple',
          content: '',
          meta: { rows: [['项目', '待决策'], ['AFS', '投手分工']] },
        },
      ],
    }),
  }];

  const sections = buildOperationalMeetingAiSections(rows);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].questions.length, 2);
  assert.match(sections[0].questions[0].content, /\[已脱敏经营指标\]/);
  assert.match(sections[0].questions[0].content, /收入：11\.17万元/);
  assert.match(sections[0].questions[0].content, /成本：5\.86万元/);
  assert.doesNotMatch(sections[0].questions[0].content, /5\.31/);
  assert.match(sections[0].questions[1].content, /项目 \| 待决策/);
  assert.match(sections[0].questions[1].content, /AFS \| 投手分工/);
});

test('sanitizer removes direct sensitive values without dropping adjacent operating data', () => {
  const value = sanitizeOperationalMeetingInput('毛利率为47.51%，收入为11.17万元，成本为5.86万元');
  assert.equal(value, '[已脱敏经营指标]，收入为11.17万元，成本为5.86万元');
});

test('extracts legacy fold bodies and legacy question arrays without frontend migration', () => {
  const sections = buildOperationalMeetingAiSections([
    {
      title: '旧折叠准备',
      default_questions_json: JSON.stringify([{ key: 'weekly_result', title: '本周核心结果' }]),
      content_json: JSON.stringify({
        blocks: [{
          id: 'legacy-fold',
          type: 'fold-list',
          content: '本周核心结果',
          meta: { template_question_key: 'weekly_result', body: '旧折叠回答仍需保留' },
        }],
      }),
    },
    {
      title: '旧问题数组',
      content_json: JSON.stringify({
        questions: [{
          title: '一个最重要的判断',
          content: { blocks: [{ id: 'legacy-answer', type: 'paragraph', content: '旧数组回答仍需保留', meta: {} }] },
        }],
      }),
    },
  ]);

  assert.equal(sections[0].questions[0].content, '旧折叠回答仍需保留');
  assert.equal(sections[1].questions[0].question, '一个最重要的判断');
  assert.equal(sections[1].questions[0].content, '旧数组回答仍需保留');
});

test('validates semantic agenda and converts every point to native document blocks', () => {
  const agenda = normalizeOperationalMeetingAgendaPayload(sampleAgenda());
  const body = operationalMeetingAgendaToDocumentBody(agenda, 'source-hash');
  const texts = body.blocks.map(block => block.content);

  assert.equal(body.format, 'relation_document_blocks_v1');
  assert.equal(body.blocks[0].type, 'heading1');
  assert.equal(body.blocks[0].content, '经营周会会前提纲');
  assert.equal(body.blocks[1].content, OPENING_TEXT);
  assert.equal(body.blocks.at(-1).content, CLOSING_TEXT);
  assert.ok(body.blocks.some(block => block.type === 'heading2' && block.content === '二、本周经营总览'));
  assert.ok(body.blocks.some(block => block.type === 'heading3' && block.content === '1. 海外AFS'));
  assert.ok(body.blocks.some(block => block.type === 'heading4' && block.content === '需要形成的结论'));
  assert.ok(body.blocks.some(block => block.type === 'bullet' && block.content.includes('ROI约1.23')));
  assert.equal(body.blocks.filter(block => block.type === 'numbered').length, 12);
  assert.equal(new Set(body.blocks.map(block => block.id)).size, body.blocks.length);
  assert.equal(texts.some(text => /材料来源|数据口径|敏感数据说明|数据说明/.test(text)), false);
  assert.equal(body.blocks.filter(block => ['bullet', 'numbered'].includes(block.type))
    .every(block => block.meta?.hierarchy === 'list' && block.meta?.indent === 0), true);
});

test('rejects invalid topic counts, agenda duration and sensitive output', () => {
  const tooFewTopics = sampleAgenda();
  tooFewTopics.decision_topics = tooFewTopics.decision_topics.slice(0, 4);
  assert.throws(
    () => normalizeOperationalMeetingAgendaPayload(tooFewTopics),
    error => error instanceof OperationalMeetingAgendaError && error.code === 'AI_OUTPUT_INVALID',
  );

  const invalidDuration = sampleAgenda();
  invalidDuration.agenda = [{ minutes: 90, topic: '过短议程', scope: '总时长不足。' }];
  assert.throws(
    () => normalizeOperationalMeetingAgendaPayload(invalidDuration),
    /总时长必须为120-150分钟/,
  );

  const sensitive = sampleAgenda();
  sensitive.business_modules[0].progress = ['本周利润为100万元。'];
  assert.throws(
    () => normalizeOperationalMeetingAgendaPayload(sensitive),
    error => error instanceof OperationalMeetingAgendaError && error.code === 'AI_OUTPUT_SENSITIVE',
  );
});

test('parses fenced model JSON and records a stable source hash', () => {
  const agenda = sampleAgenda();
  const parsed = parseOperationalMeetingModelOutput(`\`\`\`json\n${JSON.stringify(agenda)}\n\`\`\``);
  assert.equal(parsed.meeting_goals.length, 4);
  const meeting = { id: 7, title: '经营周会', week_start: '2026-07-13', week_end: '2026-07-19' };
  const sections = [{ title: '国内', owner: '负责人A', questions: [{ question: '结果', content: '收入增长' }] }];
  assert.equal(hashOperationalMeetingSource(meeting, sections), hashOperationalMeetingSource(meeting, sections));
  assert.notEqual(
    hashOperationalMeetingSource(meeting, sections),
    hashOperationalMeetingSource(meeting, [{ ...sections[0], owner: '负责人B' }]),
  );
});

test('returns structured fallback when no model is configured', async () => {
  const sections = [{
    title: '海外业务',
    owner: '负责人A',
    questions: [{ question: '本周核心结果', content: '本周消耗增长，ROI保持稳定。' }],
  }];
  const fallback = buildFallbackOperationalMeetingAgenda(sections);
  assert.equal(fallback.meeting_goals.length, 4);
  assert.equal(fallback.decision_topics.length, 5);
  assert.equal(fallback.agenda.reduce((sum, item) => sum + item.minutes, 0), 135);
  assert.equal(operationalMeetingAgendaLooksSensitive(fallback), false);

  const result = await callOperationalMeetingLlm({ sections, config: null });
  assert.equal(result.runtime.mode, 'fallback');
  assert.equal(result.agenda.decision_topics.length, 5);
});

test('calls the configured model with the v2 prompt and validates its JSON response', async () => {
  const agenda = sampleAgenda();
  let requestBody;
  const result = await callOperationalMeetingLlm({
    meeting: { title: '经营周会', week_start: '2026-07-13', week_end: '2026-07-19' },
    sections: [{ title: '国内业务', owner: '负责人A', questions: [{ question: '结果', content: '收入增长' }] }],
    config: {
      baseUrl: 'https://example.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
      provider: 'openai_compatible',
      timeoutMs: 5000,
    },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'test-model',
          choices: [{ message: { content: JSON.stringify(agenda) } }],
          usage: { total_tokens: 100 },
        }),
      };
    },
  });

  assert.equal(result.runtime.mode, 'llm');
  assert.equal(result.agenda.meeting_goals.length, 4);
  assert.equal(requestBody.response_format.type, 'json_object');
  assert.match(requestBody.messages[0].content, /只输出一个 JSON 对象/);
  assert.match(requestBody.messages[0].content, /材料来源/);
  assert.equal(OPERATIONAL_MEETING_PROMPT_VERSION, 'operational-meeting-agenda-v2');
});
