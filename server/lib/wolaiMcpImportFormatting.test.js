const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('./wolaiMcpImport');

test('Wolai front_color marks are preserved as inline text colors', () => {
  assert.equal(
    __test.getNodeHtml({
      content: [
        { title: '产品', bold: true, type: 'text' },
        { title: '（进行中）--- 鹏涛', bold: true, front_color: 'orange', type: 'text' },
      ],
    }),
    '<strong>产品</strong><span style="color: #ea580c"><strong>（进行中）--- 鹏涛</strong></span>',
  );
});

test('Wolai bull_list records keep their nested bullet list styles', () => {
  const importedBlocks = __test.recordsToBlocks([
    {
      id: 'root-page',
      type: 'page',
      html: 'Root',
      order: 0,
      childIds: ['numbered-item'],
    },
    {
      id: 'numbered-item',
      parentId: 'root-page',
      parentType: 'page',
      type: 'enum_list',
      html: '数据录入',
      order: 1,
      childIds: ['bullet-item'],
    },
    {
      id: 'bullet-item',
      parentId: 'numbered-item',
      parentType: 'enumList',
      type: 'bull_list',
      html: '外接收入数据录入',
      order: 2,
      childIds: ['nested-bullet-item'],
    },
    {
      id: 'nested-bullet-item',
      parentId: 'bullet-item',
      parentType: 'bullList',
      type: 'bull_list',
      html: '放在固定电脑上的定时任务',
      order: 3,
    },
  ], 'https://www.wolai.com/root-page');
  const blocks = __test.cleanImportedBlocks(importedBlocks, 'Root');

  const listBlocks = blocks.filter(block => ['numbered', 'bullet'].includes(block.type));
  assert.deepEqual(
    listBlocks.map(block => ({ type: block.type, content: block.content, indent: block.meta.indent })),
    [
      { type: 'numbered', content: '数据录入', indent: 0 },
      { type: 'bullet', content: '外接收入数据录入', indent: 1 },
      { type: 'bullet', content: '放在固定电脑上的定时任务', indent: 2 },
    ],
  );
});
