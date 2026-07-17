import {
  DOCUMENT_BODY_FORMAT,
  documentBodyToPlain,
  normalizeDocumentBodyValue,
} from './documentBodyBlocks';

describe('document body blocks', () => {
  test('migrates legacy rich text headings and lists into document blocks', () => {
    const value = normalizeDocumentBodyValue('<h2>经营结果</h2><ol><li>收入增长</li><li>成本下降</li></ol>');

    expect(value.format).toBe(DOCUMENT_BODY_FORMAT);
    expect(value.blocks.map(block => block.type)).toEqual(['heading2', 'numbered', 'numbered']);
    expect(value.blocks.map(block => block.content)).toEqual(['经营结果', '收入增长', '成本下降']);
  });

  test('keeps document blocks and includes folded content and tables in plain text', () => {
    const value = {
      format: DOCUMENT_BODY_FORMAT,
      blocks: [
        { id: 'fold', type: 'fold-list', content: '<strong>风险</strong>', meta: { body: '汇率波动' } },
        { id: 'table', type: 'table-simple', content: '', meta: { rows: [['项目', '结果'], ['海外', '增长']] } },
      ],
    };

    expect(documentBodyToPlain(value, input => String(input).replace(/<[^>]+>/g, '')))
      .toBe('风险\n汇率波动\n项目 | 结果\n海外 | 增长');
  });
});
