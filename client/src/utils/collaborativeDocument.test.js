import { mergeCollaborativeDocumentBodies } from './collaborativeDocument';

const body = blocks => ({ format: 'relation_document_blocks_v1', blocks });
const block = (id, content) => ({ id, type: 'paragraph', content, meta: {} });

describe('collaborative document merge', () => {
  test('adopts remote changes when the local body is unchanged', () => {
    const base = body([block('a', '原内容')]);
    const result = mergeCollaborativeDocumentBodies(base, base, body([block('a', '远端内容')]));

    expect(result.value.blocks[0].content).toBe('远端内容');
    expect(result.hadConflicts).toBe(false);
  });

  test('keeps independent local and remote block edits', () => {
    const base = body([block('a', 'A'), block('b', 'B')]);
    const local = body([block('a', '本地 A'), block('b', 'B'), block('local', '本地新增')]);
    const remote = body([block('a', 'A'), block('b', '远端 B'), block('remote', '远端新增')]);
    const result = mergeCollaborativeDocumentBodies(base, local, remote);

    expect(Object.fromEntries(result.value.blocks.map(item => [item.id, item.content]))).toEqual({
      a: '本地 A',
      b: '远端 B',
      remote: '远端新增',
      local: '本地新增',
    });
    expect(result.hadConflicts).toBe(false);
  });

  test('keeps the local block and reports a conflict when both users edit it', () => {
    const base = body([block('a', 'A')]);
    const result = mergeCollaborativeDocumentBodies(
      base,
      body([block('a', '本地')]),
      body([block('a', '远端')])
    );

    expect(result.value.blocks[0].content).toBe('本地');
    expect(result.hadConflicts).toBe(true);
  });
});
