import {
  createDocumentBodyBlock,
  DOCUMENT_BODY_FORMAT,
  normalizeDocumentBodyValue,
} from './documentBodyBlocks';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(normalizeDocumentBodyValue(value)));
}

function blockSignature(block) {
  return JSON.stringify(block || null);
}

function blocksEqual(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return blockSignature(left) === blockSignature(right);
}

function mergeBlockOrder(baseBlocks, localBlocks, remoteBlocks, survivingIds) {
  const result = [];
  const seen = new Set();
  const push = (id) => {
    if (!id || seen.has(id) || !survivingIds.has(id)) return;
    result.push(id);
    seen.add(id);
  };

  remoteBlocks.forEach(block => push(block.id));
  localBlocks.forEach((block, index) => {
    const id = block.id;
    if (!id || seen.has(id) || !survivingIds.has(id)) return;
    let insertAt = -1;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previousIndex = result.indexOf(localBlocks[cursor]?.id);
      if (previousIndex >= 0) {
        insertAt = previousIndex + 1;
        break;
      }
    }
    if (insertAt < 0) {
      for (let cursor = index + 1; cursor < localBlocks.length; cursor += 1) {
        const nextIndex = result.indexOf(localBlocks[cursor]?.id);
        if (nextIndex >= 0) {
          insertAt = nextIndex;
          break;
        }
      }
    }
    if (insertAt < 0) result.push(id);
    else result.splice(insertAt, 0, id);
    seen.add(id);
  });
  baseBlocks.forEach(block => push(block.id));
  return result;
}

export function getDocumentBodyValueSignature(value) {
  return JSON.stringify(normalizeDocumentBodyValue(value));
}

export function mergeCollaborativeDocumentBodies(baseValue, localValue, remoteValue) {
  const base = cloneValue(baseValue);
  const local = cloneValue(localValue);
  const remote = cloneValue(remoteValue);
  const baseSignature = getDocumentBodyValueSignature(base);
  const localSignature = getDocumentBodyValueSignature(local);
  const remoteSignature = getDocumentBodyValueSignature(remote);
  const localChanged = localSignature !== baseSignature;
  const remoteChanged = remoteSignature !== baseSignature;

  if (!remoteChanged) {
    return { value: local, hadRemoteChanges: false, hadConflicts: false };
  }
  if (!localChanged) {
    return { value: remote, hadRemoteChanges: true, hadConflicts: false };
  }

  const baseById = new Map(base.blocks.map(block => [block.id, block]));
  const localById = new Map(local.blocks.map(block => [block.id, block]));
  const remoteById = new Map(remote.blocks.map(block => [block.id, block]));
  const mergedById = new Map();
  let hadConflicts = false;

  new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]).forEach((id) => {
    const baseBlock = baseById.get(id) || null;
    const localBlock = localById.get(id) || null;
    const remoteBlock = remoteById.get(id) || null;
    const localBlockChanged = baseBlock ? !blocksEqual(localBlock, baseBlock) : Boolean(localBlock);
    const remoteBlockChanged = baseBlock ? !blocksEqual(remoteBlock, baseBlock) : Boolean(remoteBlock);
    let nextBlock = null;

    if (!baseBlock) {
      if (localBlock && remoteBlock && !blocksEqual(localBlock, remoteBlock)) hadConflicts = true;
      nextBlock = localBlock || remoteBlock;
    } else if (localBlock && remoteBlock) {
      if (localBlockChanged && remoteBlockChanged && !blocksEqual(localBlock, remoteBlock)) {
        hadConflicts = true;
        nextBlock = localBlock;
      } else {
        nextBlock = remoteBlockChanged ? remoteBlock : localBlock;
      }
    } else if (localBlock && !remoteBlock) {
      if (localBlockChanged) {
        hadConflicts = true;
        nextBlock = localBlock;
      }
    } else if (!localBlock && remoteBlock && remoteBlockChanged) {
      hadConflicts = true;
    }

    if (nextBlock) mergedById.set(id, JSON.parse(JSON.stringify(nextBlock)));
  });

  const mergedOrder = mergeBlockOrder(
    base.blocks,
    local.blocks,
    remote.blocks,
    new Set(mergedById.keys())
  );
  const blocks = mergedOrder.map(id => mergedById.get(id)).filter(Boolean);
  return {
    value: {
      format: DOCUMENT_BODY_FORMAT,
      blocks: blocks.length ? blocks : [createDocumentBodyBlock('paragraph', '')],
    },
    hadRemoteChanges: true,
    hadConflicts,
  };
}
