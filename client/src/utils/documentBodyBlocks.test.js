import {
  buildDocumentBodyClipboardPayload,
  cloneDocumentBodyBlocks,
  DOCUMENT_BODY_CLIPBOARD_HTML_ATTR,
  DOCUMENT_BODY_CLIPBOARD_MIME,
  DOCUMENT_BODY_FORMAT,
  documentBodyToPlain,
  getDocumentBodyBlockUnitIds,
  getDocumentBodySelectionBlockIds,
  normalizeDocumentBodyValue,
  parseDocumentBodyClipboard,
  parseDocumentBodyClipboardData,
  rebaseDocumentBodyClipboardBlocks,
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

  test('merges Wolai visual and plain-text list depth without layout line breaks', () => {
    const value = parseDocumentBodyClipboard(`
      <div data-block-type="enum_list" style="margin-left: 28px">
        <div contenteditable="true">
          搜索套利本周消耗 $95000，毛利约 $21000
        </div>
      </div>
      <div data-block-type="enum_list" style="margin-left: 56px">
        <div contenteditable="true">
          自家 AFS 消耗占比提高到 25%
        </div>
      </div>
      <div data-block-type="enum_list" style="margin-left: 56px">
        <div contenteditable="true">
          本周谷歌政策调整
        </div>
      </div>
      <div data-block-type="enum_list" style="margin-left: 28px">
        <div contenteditable="true">
          IAP 本周消耗 $4753
        </div>
      </div>
    `, `a. 搜索套利本周消耗 $95000，毛利约 $21000
    i. 自家 AFS 消耗占比提高到 25%
    ii. 本周谷歌政策调整
b. IAP 本周消耗 $4753`);

    expect(value.blocks.map(block => block.type)).toEqual(['numbered', 'numbered', 'numbered', 'numbered']);
    expect(value.blocks.map(block => block.meta.indent)).toEqual([1, 2, 2, 1]);
    expect(value.blocks.map(block => block.content)).toEqual([
      '搜索套利本周消耗 $95000，毛利约 $21000',
      '自家 AFS 消耗占比提高到 25%',
      '本周谷歌政策调整',
      'IAP 本周消耗 $4753',
    ]);
    expect(value.blocks.every(block => !/[\r\n]/.test(block.content))).toBe(true);
  });

  test('rebases pasted Wolai hierarchy under the selected fold list item', () => {
    const blocks = rebaseDocumentBodyClipboardBlocks([
      { id: 'parent', type: 'numbered', content: '主项', meta: { indent: 0 } },
      { id: 'child', type: 'numbered', content: '子项', meta: { indent: 1 } },
    ], 1);

    expect(blocks.map(block => block.meta.indent)).toEqual([1, 2]);
  });

  test('copies multiple blocks with rich text, list depth, and structured clipboard data', () => {
    const payload = buildDocumentBodyClipboardPayload([
      { id: 'source-1', type: 'fold-list', content: '<strong>经营结果</strong>', meta: { indent: 0, collapsed: true } },
      { id: 'source-2', type: 'numbered', content: '<span style="color: #ef4444">收入增长</span>', meta: { indent: 1, hierarchy: 'list' } },
    ]);

    expect(payload.text).toBe('- 经营结果\n  1. 收入增长');
    expect(payload.html).toContain('data-block-type="fold-list"');
    expect(payload.html).toContain('data-indent="1"');
    expect(payload.html).toContain(DOCUMENT_BODY_CLIPBOARD_HTML_ATTR);
    expect(payload.blocks).toEqual([
      { type: 'fold-list', content: '<strong>经营结果</strong>', checked: false, meta: { indent: 0, collapsed: true } },
      { type: 'numbered', content: '<span style="color: #ef4444">收入增长</span>', checked: false, meta: { indent: 1, hierarchy: 'list' } },
    ]);
  });

  test('copies a formatted table with Word-compatible borders, merges, widths, and colors', () => {
    const payload = buildDocumentBodyClipboardPayload([{
      id: 'table',
      type: 'table-simple',
      content: '',
      meta: {
        rows: [
          ['<strong>员工试用期工作计划</strong>', '', ''],
          ['考核项', '计划', '评分'],
        ],
        columnWidths: [360, 420, 180],
        rowColumnWidths: { 1: [240, 540, 180] },
        rowHeights: { 0: 52 },
        mergedCells: [{ rowIndex: 0, columnIndex: 0, rowSpan: 1, colSpan: 3 }],
        cellStyles: { '0:0': { backgroundColor: '#dbeafe' } },
        verticalCenter: true,
      },
    }]);

    expect(payload.html).toContain('<table data-document-table-block="true"');
    expect(payload.html).toContain('border-collapse: collapse');
    expect(payload.html).toContain('mso-border-alt: solid #e5e7eb .75pt');
    expect(payload.html).toContain('colspan="3"');
    expect(payload.html).toContain('height="52"');
    expect(payload.html).toContain('bgcolor="#dbeafe"');
    expect(payload.html).toContain('<strong>员工试用期工作计划</strong>');
    expect(payload.html).toContain('<table data-document-table-block="true" width="624"');
  });

  test('pastes structured blocks with fresh ids and preserved hierarchy', () => {
    const clipboardData = {
      getData: type => (type === DOCUMENT_BODY_CLIPBOARD_MIME ? JSON.stringify({
        blocks: [
          { type: 'numbered', content: '<strong>目标</strong>', meta: { indent: 2, hierarchy: 'list' } },
          { type: 'todo', content: '确认', checked: true, meta: {} },
        ],
      }) : ''),
    };

    const firstPaste = parseDocumentBodyClipboardData(clipboardData);
    const secondPaste = parseDocumentBodyClipboardData(clipboardData);

    expect(firstPaste.map(block => block.type)).toEqual(['numbered', 'todo']);
    expect(firstPaste[0].meta).toEqual({ indent: 2, hierarchy: 'list' });
    expect(firstPaste[1].checked).toBe(true);
    expect(firstPaste[0].id).not.toBe(secondPaste[0].id);
  });

  test('restores structured blocks from the HTML clipboard envelope', () => {
    const payload = buildDocumentBodyClipboardPayload([
      { id: 'fold', type: 'fold-list', content: '<strong>周会模板</strong>', meta: { indent: 0, collapsed: true } },
      { id: 'child', type: 'numbered', content: '经营结果', meta: { indent: 1, hierarchy: 'list' } },
    ]);
    const clipboardData = {
      getData: type => (type === 'text/html' ? payload.html : ''),
    };

    const pasted = parseDocumentBodyClipboardData(clipboardData);

    expect(pasted.map(block => block.type)).toEqual(['fold-list', 'numbered']);
    expect(pasted[0].meta).toMatchObject({ collapsed: true, indent: 0 });
    expect(pasted[1].meta).toMatchObject({ hierarchy: 'list', indent: 1 });
  });

  test('selects a fold block together with its complete nested subtree', () => {
    const blocks = [
      { id: 'fold', type: 'fold-list', meta: { indent: 0 } },
      { id: 'child', type: 'numbered', meta: { indent: 1, hierarchy: 'list' } },
      { id: 'grandchild', type: 'paragraph', meta: { indent: 2, hierarchy: 'list' } },
      { id: 'next', type: 'paragraph', meta: {} },
    ];

    expect(getDocumentBodyBlockUnitIds(blocks, 'fold')).toEqual(['fold', 'child', 'grandchild']);
    expect(getDocumentBodyBlockUnitIds(blocks, 'child')).toEqual(['child']);
  });

  test('clones selected blocks with fresh ids and unchanged content metadata', () => {
    const source = [
      { id: 'fold', type: 'fold-list', content: '<strong>模板</strong>', checked: false, meta: { indent: 0, collapsed: true } },
      { id: 'todo', type: 'todo', content: '跟进', checked: true, meta: { indent: 1 } },
    ];

    const copies = cloneDocumentBodyBlocks(source);

    expect(copies.map(block => block.id)).not.toEqual(source.map(block => block.id));
    expect(copies.map(({ id, ...block }) => block)).toEqual(source.map(({ id, ...block }) => block));
  });

  test('finds only the blocks touched by a native multi-block selection', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-document-body-block-id="one">第一块</div>
      <div data-document-body-block-id="two">第二块</div>
      <div data-document-body-block-id="three">第三块</div>
    `;
    document.body.appendChild(root);
    const firstText = root.children[0].firstChild;
    const secondText = root.children[1].firstChild;
    const range = document.createRange();
    range.setStart(firstText, 1);
    range.setEnd(secondText, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    expect(getDocumentBodySelectionBlockIds(root, selection)).toEqual(['one', 'two']);

    selection.removeAllRanges();
    root.remove();
  });
});
