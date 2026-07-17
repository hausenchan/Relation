const HIERARCHICAL_LIST_TYPES = new Set(['bullet', 'numbered', 'fold-list']);

export function isDocumentBlockHierarchyMember(block) {
  if (!block || typeof block !== 'object') return false;
  if (HIERARCHICAL_LIST_TYPES.has(block.type)) return true;
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  return Number.isFinite(Number(meta.indent))
    && (meta.hierarchy === 'list' || meta.source_system === 'wolai_mcp');
}

export function canNestDocumentBlock(block) {
  return Boolean(block && typeof block === 'object' && block.type && block.type !== 'toc');
}

export function getDocumentBlockHierarchyIndent(block, maxIndent = 9) {
  if (!isDocumentBlockHierarchyMember(block)) return 0;
  const indent = Number(block?.meta?.indent);
  if (!Number.isFinite(indent)) return 0;
  return Math.max(0, Math.min(maxIndent, Math.floor(indent)));
}

export function buildCollapsedDocumentBlockIds(blocks = [], maxIndent = 9) {
  const hidden = new Set();
  let collapsedAncestors = [];
  blocks.forEach((block) => {
    const indent = getDocumentBlockHierarchyIndent(block, maxIndent);
    collapsedAncestors = collapsedAncestors.filter(item => indent > item.indent);
    const isHidden = collapsedAncestors.length > 0;
    if (isHidden) hidden.add(block.id);
    if (!isHidden && block?.type === 'fold-list' && block?.meta?.collapsed) {
      collapsedAncestors.push({ id: block.id, indent });
    }
  });
  return hidden;
}

export function buildDocumentBlockGuideMap(blocks = [], hiddenIds = new Set(), maxIndent = 9) {
  const visibleBlocks = blocks.filter(block => !hiddenIds.has(block.id));
  const map = new Map();

  visibleBlocks.forEach((block, index) => {
    if (!isDocumentBlockHierarchyMember(block)) return;
    const indent = getDocumentBlockHierarchyIndent(block, maxIndent);
    const nextBlocks = [];
    for (const next of visibleBlocks.slice(index + 1)) {
      if (!isDocumentBlockHierarchyMember(next)) break;
      nextBlocks.push(next);
    }
    const nextVisible = nextBlocks[0] || null;
    map.set(block.id, {
      ancestorLines: Array.from({ length: indent }, (_, level) => ({
        level,
        continuesBelow: nextBlocks.some(next => getDocumentBlockHierarchyIndent(next, maxIndent) >= level + 1),
      })),
      hasChildren: Boolean(nextVisible && getDocumentBlockHierarchyIndent(nextVisible, maxIndent) > indent),
    });
  });

  return map;
}
