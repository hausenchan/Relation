import {
  getWeeklyReportDraftSignature,
  normalizeWeeklyReportContent,
  serializeWeeklyReportContent,
  weeklyReportContentToPlain,
} from './weeklyReportContent';

describe('weekly report document content', () => {
  test('migrates legacy rich text into reusable document blocks', () => {
    const content = normalizeWeeklyReportContent('<h2>本周完成</h2><ul><li><strong>上线功能</strong></li></ul><table><tbody><tr><td>项目</td><td>结果</td></tr></tbody></table>');

    expect(content.blocks.map(block => block.type)).toEqual(['heading2', 'bullet', 'table-simple']);
    expect(weeklyReportContentToPlain(content)).toContain('上线功能');
    expect(weeklyReportContentToPlain(content)).toContain('项目 | 结果');
  });

  test('round trips structured blocks through encrypted text columns', () => {
    const source = {
      format: 'relation_document_blocks_v1',
      blocks: [
        { id: 'title', type: 'heading3', content: '<span style="color: #22c55e"><strong>已完成</strong></span>', meta: {} },
        { id: 'row', type: 'numbered', content: '联调上线', meta: { indent: 1 } },
      ],
    };

    const stored = serializeWeeklyReportContent(source);
    const restored = normalizeWeeklyReportContent(stored);

    expect(restored.blocks).toHaveLength(2);
    expect(restored.blocks[0].content).toContain('color: #22c55e');
    expect(restored.blocks[1]).toMatchObject({ type: 'numbered', meta: { indent: 1 } });
  });

  test('draft signatures change when structured content changes', () => {
    const base = {
      user_id: 8,
      week_range: ['2026-07-13', '2026-07-19'],
      completed: { blocks: [{ id: 'a', type: 'paragraph', content: '内容 A', meta: {} }] },
      next_week_plan: '',
      risks: '',
    };

    expect(getWeeklyReportDraftSignature(base)).not.toBe(getWeeklyReportDraftSignature({
      ...base,
      completed: { blocks: [{ id: 'a', type: 'paragraph', content: '内容 B', meta: {} }] },
    }));
  });
});
