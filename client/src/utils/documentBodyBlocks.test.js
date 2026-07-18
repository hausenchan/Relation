import {
  DOCUMENT_BODY_FORMAT,
  documentBodyToPlain,
  normalizeDocumentBodyValue,
  parseDocumentBodyClipboard,
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

  test('preserves Wolai nested list hierarchy and inline formatting from clipboard HTML', () => {
    const value = parseDocumentBodyClipboard(`
      <ol>
        <li><font color="#d4380d"><strong>本周核心结果</strong></font>
          <ol type="a">
            <li>预算
              <ol type="i">
                <li><span style="background-color: #fff1b8; font-weight: 700">许愿星</span></li>
              </ol>
            </li>
          </ol>
        </li>
      </ol>
    `, '');

    expect(value.blocks.map(block => block.type)).toEqual(['numbered', 'numbered', 'numbered']);
    expect(value.blocks.map(block => block.meta.indent)).toEqual([0, 1, 2]);
    expect(value.blocks[0].content).toContain('color: #d4380d');
    expect(value.blocks[0].content).toContain('<strong>本周核心结果</strong>');
    expect(value.blocks[2].content).toContain('background-color: #fff1b8');
    expect(value.blocks[2].content).toContain('font-weight: 700');
  });

  test('parses Wolai div-based enum and bullet subnodes in source order', () => {
    const value = parseDocumentBodyClipboard(`
      <div data-block-type="enum_list">
        <div contenteditable="true"><font face="PingFang SC">本周核心结果</font></div>
        <div data-type="subnode">
          <div data-block-type="enum_list">
            <div contenteditable="true"><span style="color: rgb(212, 56, 13)">预算</span></div>
            <div data-type="subnode">
              <div data-block-type="bull_list">
                <div contenteditable="true"><strong>许愿星</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div data-block-type="enum_list"><div contenteditable="true">一个最重要的判断</div></div>
    `, '');

    expect(value.blocks.map(block => block.type)).toEqual(['numbered', 'numbered', 'bullet', 'numbered']);
    expect(value.blocks.map(block => block.meta.indent)).toEqual([0, 1, 2, 0]);
    expect(value.blocks.map(block => block.content.replace(/<[^>]+>/g, ''))).toEqual([
      '本周核心结果',
      '预算',
      '许愿星',
      '一个最重要的判断',
    ]);
    expect(value.blocks[0].content).toContain('font-family: PingFang SC');
    expect(value.blocks[1].content).toContain('color: rgb(212, 56, 13)');
    expect(value.blocks[2].content).toContain('<strong>许愿星</strong>');
  });
});
