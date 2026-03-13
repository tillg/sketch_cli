# Geometry Inspection — Exploration Plan

## Goal

Find the API to read individual entity geometry from an open SketchUp model:
faces (vertices, area, normal), edges (start/end points), groups/components (position, bounds).

## What We Know

### Confirmed entry points

```js
// Model-level stats (proven)
Module.getModelInfo().stats   // num_edges, num_faces, num_component_definitions, …

// Model bounding box (proven)
mod.AT7()  // {left, right, top, bottom, near, far}

// Entity selection by tag (proven)
Module.SelectEntitiesByTagName(tagName)

// Outliner node functions — found but NOT yet callable:
Module.WebOutliner_GetRootNode(???)         // needs 1 arg — type unknown
Module.WebOutliner_AddToSelectionSet(node)
Module.WebOutliner_RemoveFromSelectionSet(node)
Module.WebOutliner_RegisterListener(fn)
Module.WebOutliner_PrepareContextMenu(node)
Module.WebOutliner_CanReparent(nodeA, nodeB)
Module.WebOutliner_Reparent(nodeA, nodeB)
Module.WebOutliner_ClearSelectionSet()
Module.WebOutliner_ClearActivePath()
Module.WebOutliner_SetAllVisible(bool)

// Node properties (proven on demo node):
node.getId()          // integer entity ID
node.getName()        // string
node.setName(str)
node.getType()        // string: "group", "component", "face", …
node.numChildren()    // integer
node.getChildren()    // array of child nodes
node.isSelected()     // bool
node.isVisible()      // bool
node.setVisible(bool)
node.isLocked()       // bool
node.setLocked(bool)
```

### Key blocker

`Module.WebOutliner_GetRootNode` was called with 0 arguments and threw:
> "called with 0 arguments, expected 1"

The argument type is unknown. It likely takes one of:
- A model/context object (e.g. `0`, a handle integer, or a JS object)
- A scope enum value
- A boolean flag

---

## Exploration Steps

### Step 1 — Find argument type from source

```js
// Read the Emscripten binding for WebOutliner_GetRootNode to see its type descriptor
const src = wpRequire.m[83217].toString();
const idx = src.indexOf('WebOutliner_GetRootNode');
// Examine the surrounding binding code to identify the argType
```

Also search webpack modules for Vue/JS code that calls `WebOutliner_GetRootNode`:

```js
const modIds = Object.keys(wpRequire.m);
for (const id of modIds) {
  const s = wpRequire.m[id].toString();
  if (s.includes('GetRootNode')) console.log(id, s.slice(s.indexOf('GetRootNode')-100, s.indexOf('GetRootNode')+200));
}
```

### Step 2 — Try likely argument values

```js
// Try common Emscripten handle types
for (const arg of [0, 1, null, false, true, {}, Module]) {
  try {
    const node = Module.WebOutliner_GetRootNode(arg);
    console.log('works with', arg, '->', node);
    break;
  } catch(e) { console.log('failed', arg, e.message); }
}
```

### Step 3 — Traverse the node tree

Once `GetRootNode` works, traverse depth-first:

```js
function walk(node, depth=0) {
  console.log('  '.repeat(depth), node.getType(), node.getName(), node.getId());
  const kids = node.getChildren ? node.getChildren() : [];
  for (let i = 0; i < (node.numChildren?.() ?? kids.length); i++) {
    walk(typeof kids === 'array' ? kids[i] : node.getChild(i), depth+1);
  }
}
walk(Module.WebOutliner_GetRootNode(arg));
```

### Step 4 — Find geometry data on face/edge nodes

For nodes where `node.getType() === 'face'` or `'edge'`:

```js
// Look for geometry methods on the node object
const faceNode = /* first face node from traversal */;
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(faceNode)));
// Look for: getVertices, getArea, getNormal, getBounds, getPosition, …
```

Also search for standalone Module geometry functions:

```js
Object.keys(Module).filter(k => /vertex|vert|face|edge|point|position|bounds|normal|area/i.test(k))
```

### Step 5 — Alternative: SketchupMessageApiHandler

Module exposes `F9U` (SketchupMessageApiHandler) which is used by the embedded iframe postMessage API.
It may have higher-level geometry query methods accessible via message strings:

```js
// Find the message API handler and probe it
const src83 = wpRequire.m[83217].toString();
// Find F9U / SketchupMessageApiHandler usage
```

### Step 6 — Document findings

Update `Specs/02_API_EXPLORATION.md` with any new geometry reading API discovered.
Add proven commands to `Specs/03_CLI_COMMANDS.md` (change ❌ Blocked → ✅ Proven).

---

## Access Pattern (reminder)

```js
// Standard module access setup for page.evaluate():
const chunk = window.webpackChunksketchup_web_frontend;
let wpRequire;
chunk.push([['probe'], {}, (r) => { wpRequire = r; }]);
const mod = wpRequire(83217);
const M = window.Module;
```

---

## Success Criteria

- [x] `Module.WebOutliner_GetRootNode(x)` returns a node without error — **arg is `""` (empty string)**
- [x] Model tree can be traversed — groups and component instances fully accessible
- [x] At least one face node yields vertex coordinate data — **via STL export blob parsing**
- [x] `sketchup-cli faces` and `sketchup-cli groups` can be marked ✅ Proven

---

## Decisions

### D1: WebOutliner_GetRootNode argument is empty string `""`

Found by searching webpack module 17174 for `GetRootNode`. The arg is `a.value` where `a` is a Vue ref initialized to `""` and set to `""` on `viewInitialized`. Tried and confirmed: `Module.WebOutliner_GetRootNode("")` works.

### D2: Outliner only exposes Groups and ComponentInstances — not raw faces/edges

SketchUp's Outliner is a hierarchy browser for containers, not raw geometry. The NodeType enum has Face=18 and Edge=16 as types, but they never appear in the outliner tree — only NoEntity(-1), ComponentInstance(5), Group(20) nodes appear.

### D3: Face geometry extracted via STL export blob interception

No direct JS API exists for face vertex coordinates. The approach is:
1. Hook `URL.createObjectURL` before triggering export
2. `mod.nMW(mod.YFS.EXPORT_STL)` → C++ generates binary STL blob
3. Fetch blob as ArrayBuffer, parse binary STL in-memory
4. Each 50-byte triangle record: normal (3×float32) + 3 vertices (3×float32 each) + 2-byte attrib

STL is available on free SketchUp plan. OBJ/DWG/DXF/DAE/3DS all require paid upgrade.

### D4: Edge topology derivable from STL boundary edges

The STL export triangulates faces but all original face-boundary edges are preserved: a triangle edge that appears exactly once across all triangles is a boundary edge (original SketchUp edge); one that appears twice is an internal triangulation seam. Algorithm:

```js
const edgeCount = new Map();
for (const tri of triangles) {
  for (const [a, b] of [[0,1],[1,2],[2,0]]) {
    const key = [tri.vertices[a], tri.vertices[b]]
      .map(v => v.map(x => x.toFixed(3)).join(','))
      .sort().join('|');
    edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  }
}
const boundaryEdges = [...edgeCount.entries()]
  .filter(([, c]) => c === 1)
  .map(([key]) => key.split('|').map(pt => pt.split(',').map(Number)));
```

**Limitation:** Standalone edges (not bounding any face) and guide/construction lines are not in STL and remain inaccessible. For architectural floor plans, virtually all meaningful edges bound a face, so this is sufficient.

### D5: Coordinates are in model units (mm for metric models)

STL coordinate values are raw model-space coordinates in mm. Example: 29,404 mm ≈ 29.4 m for one dimension of the Frechenlehen floor plan. Convert: divide by 25.4 for inches, by 1000 for meters.

### D6: Model SKP file accessible in IndexedDB

The live .skp binary is stored in IDB database `/files`, store `FILE_DATA`, at the key path returned by `Module.GetModelFilePath()`. Could be used for full geometry parsing if a JS SKP parser existed.
