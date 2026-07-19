import {
  createDefaultOperationalPreparationContent,
  getOperationalPreparationAnswerCharacterCount,
  getOperationalPreparationSignature,
  getOperationalPreparationSubmissionStats,
  getOperationalPreparationSubmissionSignature,
  normalizeOperationalPreparationContent,
  operationalPreparationCanSubmit,
  operationalPreparationHasAnswers,
} from './operationalMeetingPreparation';

describe('operational meeting preparation content', () => {
  test('creates four fold lists with one editable numbered child each', () => {
    const value = createDefaultOperationalPreparationContent();

    expect(value.blocks.map(block => block.type)).toEqual([
      'fold-list', 'numbered',
      'fold-list', 'numbered',
      'fold-list', 'numbered',
      'fold-list', 'numbered',
    ]);
    expect(value.blocks.filter(block => block.type === 'fold-list').map(block => block.content)).toEqual([
      '本周核心结果', '一个最重要的判断', '需要会上决策的问题', '下周建议动作',
    ]);
    expect(value.blocks.filter(block => block.type === 'numbered').every(block => block.meta.indent === 1)).toBe(true);
  });

  test('converts legacy four-question content without dropping nested blocks', () => {
    const value = normalizeOperationalPreparationContent({
      questions: [
        {
          key: 'weekly_result',
          title: '本周核心结果',
          content: {
            blocks: [
              { id: 'legacy-answer', type: 'bullet', content: '<strong>收入增长</strong>', meta: { indent: 1 } },
            ],
          },
        },
      ],
    });

    expect(value.blocks).toHaveLength(2);
    expect(value.blocks[0]).toMatchObject({ type: 'fold-list', content: '本周核心结果' });
    expect(value.blocks[1]).toMatchObject({ type: 'bullet', content: '<strong>收入增长</strong>' });
    expect(value.blocks[1].meta.indent).toBe(2);
  });

  test('upgrades stored numbered prompts and adds missing child rows', () => {
    const value = normalizeOperationalPreparationContent({
      blocks: [
        { id: 'q1', type: 'numbered', content: '本周核心结果', meta: { indent: 0, template_question_key: 'weekly_result' } },
        { id: 'a1', type: 'numbered', content: '结果一', meta: { indent: 1 } },
        { id: 'q2', type: 'numbered', content: '一个最重要的判断', meta: { indent: 0, template_question_key: 'key_judgment' } },
      ],
    });

    expect(value.blocks.map(block => block.type)).toEqual(['fold-list', 'numbered', 'fold-list', 'numbered']);
    expect(value.blocks[1]).toMatchObject({ content: '结果一', meta: { indent: 1, template_question_parent: 'weekly_result' } });
    expect(value.blocks[3]).toMatchObject({ content: '', meta: { indent: 1, template_question_parent: 'key_judgment' } });
  });

  test('requires substantive preparation content before submission', () => {
    const empty = createDefaultOperationalPreparationContent();
    expect(operationalPreparationHasAnswers(empty)).toBe(false);
    expect(operationalPreparationCanSubmit(empty)).toBe(false);

    const filled = {
      ...empty,
      blocks: empty.blocks.map((block, index) => (
        index === 1 ? { ...block, content: '<strong>收入增长很好</strong>' } : block
      )),
    };
    expect(operationalPreparationHasAnswers(filled)).toBe(true);
    expect(getOperationalPreparationAnswerCharacterCount(filled)).toBe(6);
    expect(operationalPreparationCanSubmit(filled)).toBe(true);
    expect(getOperationalPreparationSignature(filled)).toBe(getOperationalPreparationSignature(filled));
    expect(getOperationalPreparationSignature(filled)).not.toBe(getOperationalPreparationSignature(empty));
  });

  test('requires more than five effective characters and ignores template headings and whitespace', () => {
    const empty = createDefaultOperationalPreparationContent();
    const exactlyFive = {
      ...empty,
      blocks: empty.blocks.map((block, index) => (
        index === 1 ? { ...block, content: '收入 增长好' } : block
      )),
    };
    expect(getOperationalPreparationAnswerCharacterCount(exactlyFive)).toBe(5);
    expect(operationalPreparationCanSubmit(exactlyFive)).toBe(false);
  });

  test('pending owners only include required sections that have not been submitted', () => {
    const sections = [
      { id: 1, owner_user_id: 11, owner_name: '陈豪赞', is_required: 1, status: 'submitted' },
      { id: 2, owner_user_id: 12, owner_name: '贺敏', is_required: 1, status: 'draft' },
      { id: 3, owner_user_id: 13, owner_name: '林璐韵', is_required: 1, status: 'draft' },
      { id: 4, owner_user_id: 14, owner_name: '陈锦标', is_required: 1, status: 'locked' },
      { id: 5, owner_user_id: 13, owner_name: '林璐韵', is_required: 0, status: 'draft' },
    ];
    const result = getOperationalPreparationSubmissionStats(sections, {
      2: { status: 'submitted' },
    });

    expect(result).toEqual({
      required: 4,
      submitted: 3,
      pendingOwners: [{ userId: 13, name: '林璐韵' }],
    });
  });

  test('does not invalidate submission when only a fold is expanded or collapsed', () => {
    const value = createDefaultOperationalPreparationContent();
    const collapsed = {
      ...value,
      blocks: value.blocks.map((block, index) => (
        index === 0 ? { ...block, meta: { ...block.meta, collapsed: true } } : block
      )),
    };

    expect(getOperationalPreparationSignature(collapsed)).not.toBe(getOperationalPreparationSignature(value));
    expect(getOperationalPreparationSubmissionSignature(collapsed)).toBe(
      getOperationalPreparationSubmissionSignature(value),
    );
  });

  test('does not invalidate submission for equivalent formatting-only changes', () => {
    const value = createDefaultOperationalPreparationContent();
    const plain = {
      ...value,
      blocks: value.blocks.map((block, index) => (
        index === 1 ? { ...block, content: '本周准备内容' } : block
      )),
    };
    const formatted = {
      ...plain,
      blocks: plain.blocks.map((block, index) => (
        index === 1 ? { ...block, content: '<strong>本周准备内容</strong>' } : block
      )),
    };

    expect(getOperationalPreparationSignature(formatted)).not.toBe(getOperationalPreparationSignature(plain));
    expect(getOperationalPreparationSubmissionSignature(formatted)).toBe(
      getOperationalPreparationSubmissionSignature(plain),
    );
  });
});
