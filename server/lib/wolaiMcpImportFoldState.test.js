const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('./wolaiMcpImport');

test('Wolai fold lists import expanded while preserving child indentation', () => {
  const blocks = __test.cleanImportedBlocks(__test.recordsToBlocks([
    { id: 'root-page', type: 'page', html: 'Root', order: 0, childIds: ['fold-1'] },
    { id: 'fold-1', parentId: 'root-page', parentType: 'page', type: 'toggle_list', html: 'Issues', order: 1 },
    { id: 'child-1', parentId: 'fold-1', parentType: 'toggle_list', type: 'enum_list', html: 'First issue', order: 2 },
    { id: 'child-2', parentId: 'child-1', parentType: 'enum_list', type: 'text', html: 'Screenshot note', order: 3 },
  ], 'https://www.wolai.com/root-page'), 'Root');

  assert.deepEqual(blocks.map(block => block.type), ['fold-list', 'numbered', 'paragraph']);
  const fold = blocks[0];
  assert.equal(fold.content, 'Issues');
  assert.equal(fold.meta.collapsed, false);
  assert.equal(fold.meta.hasChildren, true);
  assert.equal(blocks[1].meta.indent, 1);
  assert.equal(blocks[2].meta.indent, 2);
});
