const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildContentRevisionChanges,
  summarizeRevisionValue,
} = require('./contentRevisionDiff');

function body(id, content) {
  return {
    format: 'relation_document_blocks_v1',
    blocks: [{ id, type: 'paragraph', content, meta: {} }],
  };
}

test('summarizes rich document blocks without exposing raw JSON or HTML', () => {
  assert.equal(
    summarizeRevisionValue(body('a', '<strong>本周完成</strong><br>上线共享功能')),
    '本周完成\n上线共享功能',
  );
});

test('builds readable goal field changes and skips unchanged fields', () => {
  const changes = buildContentRevisionChanges('goal', 'main', {
    title: '旧目标',
    description: body('old', '旧描述'),
    progress: 20,
  }, {
    title: '新目标',
    description: body('new', '新描述'),
    progress: 20,
  });
  assert.deepEqual(changes, [
    { field: 'title', label: '目标标题', before: '旧目标', after: '新目标' },
    { field: 'description', label: '目标描述', before: '旧描述', after: '新描述' },
  ]);
});

test('builds operational meeting edit records for each history scope', () => {
  assert.deepEqual(
    buildContentRevisionChanges('operational_meeting', 'agenda',
      { agenda: body('a', '原提纲') },
      { agenda: body('b', '新提纲') }),
    [{ field: 'agenda', label: '会议提纲', before: '原提纲', after: '新提纲' }],
  );
  assert.deepEqual(
    buildContentRevisionChanges('operational_meeting', 'section:8', null, {
      content: body('c', '准备内容'),
      status: 'draft',
    }),
    [
      { field: 'content', label: '初始准备内容', before: '', after: '准备内容' },
      { field: 'status', label: '初始提交状态', before: '', after: 'draft' },
    ],
  );
});
