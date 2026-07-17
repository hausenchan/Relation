import {
  buildBulkShareTreeCheckState,
  buildFolderDocumentSelectionMap,
  chunkBulkDocumentIds,
  updateBulkFolderSelection,
} from './documentBulkShare';

describe('document bulk share selection', () => {
  const folders = [
    { id: 1, parent_id: null },
    { id: 2, parent_id: 1 },
    { id: 3, parent_id: 1 },
  ];
  const documents = [
    { id: 11, folder_id: 1, can_edit: 1 },
    { id: 12, folder_id: 2, can_edit: 1 },
    { id: 13, folder_id: 2, can_edit: 0 },
    { id: 14, folder_id: 3, can_edit: 1 },
  ];

  test('collects editable documents from the folder and every descendant folder', () => {
    const selectionMap = buildFolderDocumentSelectionMap(folders, documents);

    expect(selectionMap.get(1)).toEqual({
      documentIds: [11, 12, 13, 14],
      editableDocumentIds: [11, 12, 14],
    });
    expect(selectionMap.get(2)).toEqual({
      documentIds: [12, 13],
      editableDocumentIds: [12],
    });
  });

  test('adds and removes every editable document represented by a folder', () => {
    expect(updateBulkFolderSelection([99], [11, 12, 14], true)).toEqual([99, 11, 12, 14]);
    expect(updateBulkFolderSelection([11, 12, 14, 99], [11, 12, 14], false)).toEqual([99]);
  });

  test('marks folders checked or half checked from their descendant document selection', () => {
    const tree = [{
      key: 'folder-1',
      nodeType: 'folder',
      bulkDocumentIds: [11, 12, 14],
      children: [
        { key: 'document-11', nodeType: 'document', documentId: 11 },
        {
          key: 'folder-2',
          nodeType: 'folder',
          bulkDocumentIds: [12],
          children: [{ key: 'document-12', nodeType: 'document', documentId: 12 }],
        },
      ],
    }];

    expect(buildBulkShareTreeCheckState(tree, [11, 12])).toEqual({
      checked: ['document-11', 'document-12', 'folder-2'],
      halfChecked: ['folder-1'],
    });
    expect(buildBulkShareTreeCheckState(tree, [11, 12, 14])).toEqual({
      checked: ['document-11', 'document-12', 'folder-2', 'folder-1'],
      halfChecked: [],
    });
  });

  test('splits large folder selections into API-sized batches', () => {
    const batches = chunkBulkDocumentIds(Array.from({ length: 401 }, (_, index) => index + 1));
    expect(batches.map(batch => batch.length)).toEqual([200, 200, 1]);
  });
});
