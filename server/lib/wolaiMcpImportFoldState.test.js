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

test('Wolai todo trees preserve indentation and callout children stay grouped', () => {
  const blocks = __test.cleanImportedBlocks(__test.recordsToBlocks([
    { id: 'root-page', type: 'page', html: 'Root', order: 0 },
    { id: 'todo-root', parentId: 'root-page', parentType: 'page', type: 'todo_list', html: 'Task dispatch', order: 1 },
    { id: 'todo-child', parentId: 'todo-root', parentType: 'todoList', type: 'todo_list', html: 'Simple budget first', order: 2 },
    { id: 'todo-grandchild', parentId: 'todo-child', parentType: 'todoList', type: 'todo_list', html: 'Do not send H5', order: 3 },
    { id: 'callout', parentId: 'todo-root', parentType: 'todoList', type: 'callout', html: 'Media requirements:', order: 4 },
    { id: 'callout-line-1', parentId: 'callout', parentType: 'callout', type: 'text', html: 'Only two task types are accepted.', order: 5 },
    { id: 'callout-line-2', parentId: 'callout', parentType: 'callout', type: 'text', html: '1. Jump to another app and return.', order: 6 },
  ], 'https://www.wolai.com/root-page'), 'Root');

  assert.deepEqual(blocks.map(block => block.type), ['todo', 'todo', 'todo', 'emphasis']);
  assert.equal(blocks[0].meta.indent, 0);
  assert.equal(blocks[1].meta.indent, 1);
  assert.equal(blocks[2].meta.indent, 2);
  assert.equal(blocks[3].meta.indent, 1);
  assert.match(blocks[3].content, /📌 Media requirements:/);
  assert.match(blocks[3].content, /Only two task types are accepted/);
  assert.match(blocks[3].content, /Jump to another app/);
});
