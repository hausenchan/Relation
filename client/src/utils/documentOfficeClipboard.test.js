import {
  buildOfficeClipboardEnvelope,
  buildOfficeTableHtml,
  buildOfficeTextBlockHtml,
} from './documentOfficeClipboard';

describe('documentOfficeClipboard', () => {
  test('serializes table borders, merges, widths, row heights, colors, and rich text for Word', () => {
    const html = buildOfficeTableHtml({
      rows: [
        ['<strong>试用期考核表</strong>', '', ''],
        ['姓名', '<span style="color:#2563eb">石夏</span>', '研发'],
      ],
      columnWidths: [450, 300, 150],
      rowColumnWidths: { 1: [300, 225, 375] },
      rowHeights: { 0: 48 },
      mergedCells: [{ rowIndex: 0, columnIndex: 0, rowSpan: 1, colSpan: 3 }],
      cellStyles: {
        '0:0': { backgroundColor: '#dbeafe', color: '#111827' },
        '1:0': { backgroundColor: '#f8fafc' },
      },
      verticalCenter: true,
      sanitizeCellHtml: value => value,
      tableAttributes: 'data-document-table-block="true"',
    });

    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('mso-border-alt: solid #e5e7eb .75pt');
    expect(html).toContain('data-document-table-block="true"');
    expect(html).toContain('colspan="3"');
    expect(html).toContain('height="48"');
    expect(html).toContain('bgcolor="#dbeafe"');
    expect(html).toContain('<strong>试用期考核表</strong>');
    expect(html).toContain('width="624"');
    expect(html).toContain('width="208"');
    expect((html.match(/<td /g) || [])).toHaveLength(4);
  });

  test('keeps compact tables at their original width', () => {
    const html = buildOfficeTableHtml({
      rows: [['A', 'B']],
      columnWidths: [120, 180],
    });
    expect(html).toContain('<table width="300"');
    expect(html).toContain('<col width="120"');
    expect(html).toContain('<col width="180"');
  });

  test('adds explicit Office typography and preserves the Relation clipboard envelope', () => {
    const block = buildOfficeTextBlockHtml({
      type: 'heading2',
      content: '<strong>考核标准</strong>',
      highlight: '#fef3c7',
    });
    const html = buildOfficeClipboardEnvelope(block, {
      attributeName: 'data-relation-document-blocks',
      encodedPayload: '%7B%22blocks%22%3A%5B%5D%7D',
    });

    expect(html).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(html).toContain('<!--StartFragment-->');
    expect(html).toContain('data-relation-document-blocks="%7B%22blocks%22%3A%5B%5D%7D"');
    expect(html).toContain("mso-fareast-font-family: &#39;Microsoft YaHei&#39;");
    expect(html).toContain('font-size: 20px');
    expect(html).toContain('background-color: #fef3c7');
  });
});
