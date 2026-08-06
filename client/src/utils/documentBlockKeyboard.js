const BLOCK_LEVEL_HIERARCHY_KEYBOARD_TYPES = new Set([
  'attachment',
  'audio',
  'bilibili-video',
  'external-link',
  'image',
  'netease-music',
  'recent-image',
  'tencent-video',
  'video',
]);

export function supportsDocumentBlockHierarchyKeyboard(block) {
  return Boolean(block?.type && BLOCK_LEVEL_HIERARCHY_KEYBOARD_TYPES.has(block.type));
}

export function isEditableDocumentKeyTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('textarea, input, [contenteditable]:not([contenteditable="false"])'));
}

export function shouldIgnoreGlobalDocumentDelete(event) {
  return Boolean(event?.defaultPrevented || isEditableDocumentKeyTarget(event?.target));
}

export function mergeAdjacentDocumentBlocks(blocks = [], currentBlockId, previousPatch = {}) {
  const currentIndex = blocks.findIndex(block => block.id === currentBlockId);
  if (currentIndex <= 0) return { changed: false, blocks };

  const previousBlock = blocks[currentIndex - 1];
  const currentBlock = blocks[currentIndex];
  if (!previousBlock || !currentBlock) return { changed: false, blocks };

  const nextPreviousBlock = {
    ...previousBlock,
    ...previousPatch,
    id: previousBlock.id,
    type: previousBlock.type,
  };
  const nextBlocks = [...blocks];
  nextBlocks[currentIndex - 1] = nextPreviousBlock;
  nextBlocks.splice(currentIndex, 1);

  return {
    changed: true,
    blocks: nextBlocks,
    targetBlockId: previousBlock.id,
  };
}
