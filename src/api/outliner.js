// Outliner traversal scripts

export function getGroups() {
  return `(() => {
    const root = Module.WebOutliner_GetRootNode("");
    const result = [];
    function walk(node) {
      const type = node.getType();
      // 5=ComponentInstance, 20=Group, 2006=SolidComponent, 2007=SolidGroup, 2008=LiveComponent
      if (type === 5 || type === 20 || type === 2006 || type === 2007 || type === 2008) {
        result.push({
          id: node.getId(),
          name: node.getName(),
          type: type === 20 ? 'Group' : 'Component',
          visible: node.isVisible(),
          locked: node.isLocked(),
          childCount: node.numChildren()
        });
      }
      const kids = node.getChildren();
      for (let i = 0; i < kids.size(); i++) walk(kids.get(i));
    }
    walk(root);
    return result;
  })()`;
}

export function getOutlinerTree() {
  return `(() => {
    const TYPE_NAMES = {
      '-1': 'Root', 0: 'Entity', 1: 'ArcCurve', 2: 'Component',
      5: 'ComponentInstance', 7: 'ConstructionLine', 8: 'ConstructionPoint',
      9: 'Curve', 13: 'DimensionLinear', 14: 'DimensionRadial', 16: 'Edge',
      18: 'Face', 20: 'Group', 21: 'Image', 31: 'SectionPlane',
      36: 'Text', 51: 'Surface', 2006: 'SolidComponent',
      2007: 'SolidGroup', 2008: 'LiveComponent'
    };
    const root = Module.WebOutliner_GetRootNode("");
    function walk(node, depth) {
      const kids = node.getChildren();
      const children = [];
      for (let i = 0; i < kids.size(); i++) {
        children.push(walk(kids.get(i), depth + 1));
      }
      return {
        id: node.getId(),
        name: node.getName(),
        type: TYPE_NAMES[node.getType()] ?? String(node.getType()),
        visible: node.isVisible(),
        locked: node.isLocked(),
        depth,
        children
      };
    }
    const tree = walk(root, 0);
    return tree.children;
  })()`;
}

export function selectById(id) {
  return `(() => {
    const root = Module.WebOutliner_GetRootNode("");
    Module.WebOutliner_ClearSelectionSet();
    function find(node) {
      if (node.getId() === ${id}) {
        Module.WebOutliner_AddToSelectionSet(node);
        return true;
      }
      const kids = node.getChildren();
      for (let i = 0; i < kids.size(); i++) {
        if (find(kids.get(i))) return true;
      }
      return false;
    }
    return find(root);
  })()`;
}

export function clearSelection() {
  return `(() => { Module.WebOutliner_ClearSelectionSet(); })()`;
}
