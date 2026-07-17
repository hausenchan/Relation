import {
  buildCollapsedDocumentBlockIds,
  buildDocumentBlockGuideMap,
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
});
