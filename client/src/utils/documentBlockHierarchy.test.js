import {
  buildCollapsedDocumentBlockIds,
  buildDocumentBlockGuideMap,
  buildDocumentNumberedListValues,
  canNestDocumentBlock,
  getDocumentBlockHierarchyIndent,
} from './documentBlockHierarchy';

describe('document block hierarchy', () => {
  const blocks = [
    { id: 'fold', type: 'fold-list', meta: { indent: 0, collapsed: true } },
    { id: 'text', type: 'paragraph', meta: { hierarchy: 'list', indent: 1 } },
    { id: 'bullet', type: 'bullet', meta: { indent: 1 } },
    { id: 'numbered', type: 'numbered', meta: { indent: 2 } },
    { id: 'root', type: 'paragraph', meta: {} },
  ];

  test('folding hides nested text and mixed list blocks until the hierarchy returns to the parent level', () => {
    expect([...buildCollapsedDocumentBlockIds(blocks)])
      .toEqual(['text', 'bullet', 'numbered']);
  });

  test('ordinary blocks can join a fold hierarchy and receive guide metadata', () => {
    expect(canNestDocumentBlock(blocks[1])).toBe(true);
    expect(getDocumentBlockHierarchyIndent(blocks[1])).toBe(1);

    const expanded = blocks.map(block => (block.id === 'fold' ? { ...block, meta: { ...block.meta, collapsed: false } } : block));
    const guides = buildDocumentBlockGuideMap(expanded);
    expect(guides.get('text').ancestorLines).toHaveLength(1);
    expect(guides.get('bullet').hasChildren).toBe(true);
    expect(guides.has('root')).toBe(false);
  });

  test('embedded Wolai references and media do not restart their parent numbered list', () => {
    const numberedValues = buildDocumentNumberedListValues([
      { id: 'first', type: 'numbered', meta: { source_system: 'wolai_mcp', indent: 0 } },
      { id: 'reference', type: 'external-link', meta: { source_system: 'wolai_mcp', indent: 1, reference_type: 'page' } },
      { id: 'image', type: 'image', meta: { source_system: 'wolai_mcp', indent: 1 } },
      { id: 'second', type: 'numbered', meta: { source_system: 'wolai_mcp', indent: 0 } },
      { id: 'plain', type: 'paragraph', meta: {} },
      { id: 'next-list', type: 'numbered', meta: { indent: 0 } },
    ]);

    expect(numberedValues.get('first')).toEqual({ index: 1, indent: 0 });
    expect(numberedValues.get('second')).toEqual({ index: 2, indent: 0 });
    expect(numberedValues.get('next-list')).toEqual({ index: 1, indent: 0 });
  });

  test('table children do not restart numbered siblings at the same indent', () => {
    const numberedValues = buildDocumentNumberedListValues([
      { id: 'section', type: 'numbered', meta: { indent: 1 } },
      { id: 'first', type: 'numbered', meta: { indent: 2 } },
      { id: 'first-table', type: 'table-simple', meta: { hierarchy: 'list', indent: 2 } },
      { id: 'second', type: 'numbered', meta: { indent: 2 } },
      { id: 'second-table', type: 'table-simple', meta: { hierarchy: 'list', indent: 2 } },
      { id: 'third', type: 'numbered', meta: { indent: 2 } },
    ]);

    expect(numberedValues.get('section')).toEqual({ index: 1, indent: 1 });
    expect(numberedValues.get('first')).toEqual({ index: 1, indent: 2 });
    expect(numberedValues.get('second')).toEqual({ index: 2, indent: 2 });
    expect(numberedValues.get('third')).toEqual({ index: 3, indent: 2 });
  });

  test('switching to another list type still restarts numbered siblings', () => {
    const numberedValues = buildDocumentNumberedListValues([
      { id: 'first', type: 'numbered', meta: { indent: 1 } },
      { id: 'table', type: 'table-simple', meta: { hierarchy: 'list', indent: 1 } },
      { id: 'second', type: 'numbered', meta: { indent: 1 } },
      { id: 'bullet', type: 'bullet', meta: { indent: 1 } },
      { id: 'after-bullet', type: 'numbered', meta: { indent: 1 } },
    ]);

    expect(numberedValues.get('first')).toEqual({ index: 1, indent: 1 });
    expect(numberedValues.get('second')).toEqual({ index: 2, indent: 1 });
    expect(numberedValues.get('after-bullet')).toEqual({ index: 1, indent: 1 });
  });
});
