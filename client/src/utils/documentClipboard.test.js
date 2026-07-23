import {
  documentClipboardHasEmbeddedBlocks,
  flattenDocumentClipboardHtml,
  shouldSkipNestedClipboardListElement,
} from './documentClipboard';

describe('document clipboard', () => {
  test('flattens paragraph boundaries while preserving inline rich text', () => {
    expect(flattenDocumentClipboardHtml(
      '<div><strong>重点</strong></div><p><span style="color: red">下一行</span></p>'
    )).toBe('<strong>重点</strong><br><span style="color: red">下一行</span>');
  });

  test('keeps nested and adjacent list items on separate lines', () => {
    expect(flattenDocumentClipboardHtml(
      '<ul><li>父级<ul><li><em>子级</em></li></ul></li><li>同级</li></ul>'
    )).toBe('父级<br><em>子级</em><br>同级');
  });

  test('removes duplicate edge breaks from copied fragments', () => {
    expect(flattenDocumentClipboardHtml(
      '<!--StartFragment--><div>第一行<br><br></div><div>第二行</div><!--EndFragment-->'
    )).toBe('第一行<br>第二行');
  });

  test('recognizes content that must remain a standalone document block', () => {
    expect(documentClipboardHasEmbeddedBlocks('<p>文字</p><img src="demo.png">')).toBe(true);
    expect(documentClipboardHasEmbeddedBlocks('<table><tr><td>数据</td></tr></table>')).toBe(true);
    expect(documentClipboardHasEmbeddedBlocks('<p><strong>普通文本</strong></p>')).toBe(false);
  });

  test('skips Wolai layout nodes already contained by a list item', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul>
        <li>
          <div>6月24日数据比对</div>
          <p>抖音商城 点击1971</p>
          <table><tbody><tr><td>保留表格</td></tr></tbody></table>
          <img src="demo.png" alt="保留图片">
        </li>
      </ul>
      <p>列表外段落</p>
    `;

    const candidates = Array.from(container.querySelectorAll('li,div,p,table,img'));
    const kept = candidates
      .filter(element => !shouldSkipNestedClipboardListElement(element))
      .map(element => element.tagName.toLowerCase());

    expect(kept).toEqual(['li', 'table', 'img', 'p']);
  });
});
