import {
  createDefaultOperationalPreparationContent,
  normalizeOperationalPreparationContent,
} from './operationalMeetingPreparation';

describe('operational meeting preparation content', () => {
  test('creates one extensible block collection with four numbered prompts', () => {
    const value = createDefaultOperationalPreparationContent();

    expect(value.blocks.map(block => block.type)).toEqual(['numbered', 'numbered', 'numbered', 'numbered']);
    expect(value.blocks.map(block => block.content)).toEqual([
      '本周核心结果',
      '一个最重要的判断',
      '需要会上决策的问题',
      '下周建议动作',
    ]);
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
    expect(value.blocks[0]).toMatchObject({ type: 'numbered', content: '本周核心结果' });
    expect(value.blocks[1]).toMatchObject({ type: 'bullet', content: '<strong>收入增长</strong>' });
    expect(value.blocks[1].meta.indent).toBe(2);
  });
});
