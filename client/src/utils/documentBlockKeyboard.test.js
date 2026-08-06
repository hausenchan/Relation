import {
  mergeAdjacentDocumentBlocks,
  shouldIgnoreGlobalDocumentDelete,
  supportsDocumentBlockHierarchyKeyboard,
} from './documentBlockKeyboard';

describe('document block keyboard handling', () => {
  test('global block deletion ignores a Delete key coming from editable text', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.appendChild(child);

    expect(shouldIgnoreGlobalDocumentDelete({ target: child, defaultPrevented: false })).toBe(true);
    expect(shouldIgnoreGlobalDocumentDelete({ target: document.body, defaultPrevented: true })).toBe(true);
  });

  test('line-start merge only updates the previous block and removes the current block', () => {
    const blocks = [
      { id: 'parent', type: 'bullet', content: '账号纬度', meta: { indent: 1 } },
      { id: 'marker', type: 'bullet', content: '', meta: { indent: 2 } },
      { id: 'current', type: 'paragraph', content: '若3W/日', meta: { hierarchy: 'list', indent: 2 } },
      { id: 'next', type: 'bullet', content: '目前计划', meta: { indent: 2 } },
      { id: 'tail', type: 'paragraph', content: '账号上游诉求', meta: {} },
    ];

    const result = mergeAdjacentDocumentBlocks(blocks, 'current', {
      content: '若3W/日',
      meta: { indent: 2 },
    });

    expect(result.changed).toBe(true);
    expect(result.targetBlockId).toBe('marker');
    expect(result.blocks.map(block => block.id)).toEqual(['parent', 'marker', 'next', 'tail']);
    expect(result.blocks[1]).toMatchObject({ type: 'bullet', content: '若3W/日', meta: { indent: 2 } });
    expect(result.blocks[2]).toBe(blocks[3]);
    expect(result.blocks[3]).toBe(blocks[4]);
  });

  test('media and attachment blocks expose block-level Tab indentation', () => {
    ['image', 'recent-image', 'video', 'audio', 'external-link', 'attachment'].forEach(type => {
      expect(supportsDocumentBlockHierarchyKeyboard({ type })).toBe(true);
    });
    expect(supportsDocumentBlockHierarchyKeyboard({ type: 'numbered' })).toBe(false);
    expect(supportsDocumentBlockHierarchyKeyboard({ type: 'paragraph' })).toBe(false);
  });
});
