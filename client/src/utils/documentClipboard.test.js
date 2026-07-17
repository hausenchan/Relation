import {
  documentClipboardHasEmbeddedBlocks,
  flattenDocumentClipboardHtml,
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
});
