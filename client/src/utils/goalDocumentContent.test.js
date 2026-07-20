import {
  goalDocumentContentToPlain,
  normalizeGoalDocumentContent,
  serializeGoalDocumentContent,
} from './goalDocumentContent';

describe('goal document content', () => {
  test('migrates legacy rich text into document blocks', () => {
    const value = normalizeGoalDocumentContent('<h2>季度目标</h2><ol><li><strong>收入增长</strong></li></ol>');

    expect(value.blocks.map(block => block.type)).toEqual(['heading2', 'numbered']);
    expect(goalDocumentContentToPlain(value)).toContain('收入增长');
  });

  test('round trips structured blocks without losing format or hierarchy', () => {
    const source = {
      blocks: [
        { id: 'fold', type: 'fold-list', content: '<strong>增长策略</strong>', meta: { indent: 0, collapsed: true } },
        { id: 'child', type: 'numbered', content: '<span style="color: #22c55e">完成</span>', meta: { indent: 1, hierarchy: 'list' } },
      ],
    };

    const restored = normalizeGoalDocumentContent(serializeGoalDocumentContent(source));

    expect(restored.blocks[0]).toMatchObject({ type: 'fold-list', meta: { collapsed: true } });
    expect(restored.blocks[1].content).toContain('color: #22c55e');
    expect(restored.blocks[1].meta.indent).toBe(1);
  });
});
