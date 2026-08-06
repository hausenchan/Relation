import {
  getDocumentFolderAncestorIds,
  getDocumentTreeLocation,
} from './documentLibraryNavigation';

const folders = [
  { id: 1, name: '产运', domain: 'domestic_project', parent_id: null },
  { id: 2, name: '落地', domain: 'domestic_project', parent_id: 1 },
  { id: 3, name: '团队', domain: 'domestic_project', parent_id: 2 },
];

test('builds all directory expansion keys for a located document', () => {
  expect(getDocumentTreeLocation(folders, {
    id: 513,
    folder_id: 3,
    domain: 'domestic_project',
  })).toEqual({
    domain: 'domestic_project',
    folderId: 3,
    ancestorFolderIds: [1, 2, 3],
    expandedKeys: [
      'domain-domestic_project',
      'folder-1',
      'folder-2',
      'folder-3',
    ],
    documentKey: 'document-513',
  });
});

test('handles missing and cyclic folder parents without looping', () => {
  expect(getDocumentFolderAncestorIds([{ id: 9, parent_id: 10 }], 9)).toEqual([9]);
  expect(getDocumentFolderAncestorIds([
    { id: 11, parent_id: 12 },
    { id: 12, parent_id: 11 },
  ], 11)).toEqual([12, 11]);
  expect(getDocumentTreeLocation(folders, { id: 7, folder_id: null, domain: 'general' })).toEqual({
    domain: 'general',
    folderId: null,
    ancestorFolderIds: [],
    expandedKeys: ['domain-general'],
    documentKey: 'document-7',
  });
});
