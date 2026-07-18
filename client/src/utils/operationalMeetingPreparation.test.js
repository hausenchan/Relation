import {
  createDefaultOperationalPreparationContent,
  normalizeOperationalPreparationContent,
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
});
