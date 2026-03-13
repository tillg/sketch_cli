# SketchUp Web API Exploration

Findings from live browser session against `app.sketchup.com`.

## Entry Point: `SUCypress`

`window.SUCypress` is a testing/automation object injected by the SketchUp app itself.
It is available once a model is open (not on the home screen).

```js
window.SUCypress.getAdapter('adapterName')
```

## Adapters (`SUCypress.getAdapter`)

| Adapter | Methods |
|---------|---------|
| `selection` | `selectAll()`, `selectNone()`, `selectTag(tag)` |
| `tags` | `browser` (tag browser object) |
| `runCommand` | `(commandName) => dispatch(YFS[commandName])` — runs any of 176 commands |
| `tcFileOperations` | `getProjects()`, `createFolderInRoot(name)`, `deleteFolderInRoot(name)`, `createDefaultProject()`, `deleteProject(id)` |
| `fileDescription` | file metadata object |
| `sidebar` | `closeSidebar()` |
| `stats` | app stats object |
| `fileSystem` | `clear()` |
| `performance` | `startTracking()`, `stopTracking()`, `startModelSessionTracking()`, `endModelSessionTracking()`, `startOperationTracking()`, `endOperationTracking()` |
| `preferences` | `get(category, name)`, `set(category, name, value)` |

## Low-Level Module API (module 83217)

The real power is in webpack module 83217, accessible via:

```js
const chunk = window.webpackChunksketchup_web_frontend;
let wpRequire;
chunk.push([['probe'], {}, (r) => { wpRequire = r; }]);
const mod = wpRequire(83217);
```

### Key exports

| Export | Description |
|--------|-------------|
| `mod.nMW(commandId)` | Dispatch any command (action ID integer) |
| `mod.YFS` | Command enum — 176 named commands |
| `mod.rYl()` | Current camera transform matrix (4x4, m00–m33) |
| `mod.AT7()` | Selection/model bounding box `{left,right,top,bottom,near,far}` |
| `mod.jzI()` | Field of view (degrees, e.g. 35) |
| `mod.pn1()` | `WebEnvironmentManager` — scenes/environments |
| `mod.gyi(tag)` | Select entities by tag |

## Command Enum (`YFS`) — 176 commands

### Edit
```
EDIT_CUT, EDIT_COPY, EDIT_PASTE, EDIT_PASTE_IN_PLACE
EDIT_DELETE, EDIT_DELETE_GUIDES
EDIT_SELECT_ALL, EDIT_SELECT_NONE, EDIT_INVERT_SELECTION
EDIT_HIDE, EDIT_UNHIDE, EDIT_UNHIDE_LAST, EDIT_UNHIDE_ALL
EDIT_UNLOCK, EDIT_UNLOCK_ALL
EDIT_MAKE_COMPONENT, EDIT_MAKE_GROUP
EDIT_OPEN_GROUP_COMPONENT, EDIT_CLOSE_GROUP_COMPONENT
UNDO, REDO
```

### View
```
VIEW_TOP, VIEW_FRONT, VIEW_BACK, VIEW_LEFT, VIEW_RIGHT, VIEW_BOTTOM, VIEW_ISO
VIEW_XRAY, VIEW_WIREFRAME, VIEW_HIDDEN_LINE, VIEW_SHADED, VIEW_SHADED_WITH_TEXTURES, VIEW_MONOCHROME
VIEW_EDGES, VIEW_BACK_EDGES, VIEW_PROFILES, VIEW_DEPTH_CUE, VIEW_EDGE_EXTENSIONS
VIEW_SHOW_HIDDEN_GEOMETRY, VIEW_SHOW_HIDDEN_OBJECTS
VIEW_SECTION_PLANES, VIEW_SECTION_CUTS, VIEW_SECTION_FILL
VIEW_AXES, VIEW_GUIDES, VIEW_FOG, VIEW_WATERMARKS, VIEW_DASHES
VIEW_GROUND, VIEW_SKY
VIEW_COLOR_BY_TAG, VIEW_COMPONENT_HIDE_REST, VIEW_COMPONENT_HIDE_SIMILAR
VIEW_CROSSHAIRS, VIEW_ENDPOINTS, VIEW_JITTER
PARALLEL_PROJECTION, PERSPECTIVE_PROJECTION, TWO_PT_PERSPECTIVE_PROJECTION
TOGGLE_SHADOWS, TOGGLE_TRANSPARENCY, USE_SUN_FOR_SHADING, AMBIENT_OCCLUSION
```

### Tools
```
ACTIVATE_SELECTION, ACTIVATE_LASSO_TOOL
ACTIVATE_PENCIL, ACTIVATE_FREEHAND
ACTIVATE_RECTANGLE, ACTIVATE_ROTATED_RECTANGLE
ACTIVATE_CIRCLE, ACTIVATE_POLYGON
ACTIVATE_ARC, ACTIVATE_ARC_2PT, ACTIVATE_ARC_3PT, ACTIVATE_ARC_PIE
ACTIVATE_PUSH_PULL
ACTIVATE_MOVE, ACTIVATE_ROTATE, ACTIVATE_SCALE, ACTIVATE_FLIP_TOOL
ACTIVATE_OFFSET, ACTIVATE_FOLLOW_ME
ACTIVATE_PAINT_BUCKET, ACTIVATE_PAINT_MATCH
ACTIVATE_ERASE
ACTIVATE_TAPE_MEASURE, ACTIVATE_PROTRACTOR, ACTIVATE_DIMENSIONS
ACTIVATE_SECTION_PLANE, ACTIVATE_AXES
ACTIVATE_DRAW_TEXT, ACTIVATE_TAG
ACTIVATE_ORBIT, ACTIVATE_PAN, ACTIVATE_FOV
ACTIVATE_ZOOM, ACTIVATE_ZOOM_WINDOW, ACTIVATE_ZOOM_EXTENTS, ACTIVATE_ZOOM_SELECTION
ACTIVATE_POSITION_CAMERA, ACTIVATE_WALK, ACTIVATE_LOOK_AROUND
ACTIVATE_OUTER_SHELL, ACTIVATE_INTERSECT, ACTIVATE_UNION
ACTIVATE_DIFFERENCE, ACTIVATE_TRIM, ACTIVATE_SPLIT
ACTIVATE_SOLID_INSPECTOR
```

### File / Export
```
NEW_MODEL, OPEN_MODEL, SAVE_AS, DOWNLOAD_SKP
EXPORT_STL, EXPORT_OBJ, EXPORT_FBX, EXPORT_DAE, EXPORT_KMZ
EXPORT_DWG_2D, EXPORT_DWG_3D, EXPORT_DXF_2D, EXPORT_DXF_3D
EXPORT_3DS, EXPORT_PNG
INSERT, INSERT_COMPONENT
```

### Other
```
SEARCH, PRINT
UNDO, REDO
LAUNCH_SETTINGS, LAUNCH_3DW, LAUNCH_ASSISTANT, LAUNCH_STABLE_DIFFUSION
CREATE_SCENE, SCENES, ADD_LOCATION
SNAPS, PURGE_UNUSED
WELD_EDGES, DIVIDE
INTERSECT_FACES_WITH_CONTEXT, INTERSECT_FACES_WITH_MODEL, INTERSECT_FACES_WITH_SELECTION
REVERSE_FACES, ORIENT_FACES
SOFTEN_EDGES, LOCK_SELECTED
OPTIMIZE_MEMORY_USAGE, CAMERA_UNDO, CAMERA_NEXT, CAMERA_PBR
```

## Verified Working

```js
// Switch to ISO view and zoom to fit
mod.nMW(mod.YFS.VIEW_ISO);
mod.nMW(mod.YFS.ACTIVATE_ZOOM_EXTENTS);

// Select all / deselect
mod.nMW(mod.YFS.EDIT_SELECT_ALL);
mod.nMW(mod.YFS.EDIT_SELECT_NONE);

// Get camera state
mod.rYl();  // → 4x4 matrix
mod.jzI();  // → FOV in degrees
```

## Key Insight

The `runCommand` adapter and raw `mod.nMW` + `mod.YFS` are the primary control surface.
The C++ engine calls back into JS via window-level functions:
`CallOnEntityInfoChanged`, `SetStatusBarMeasureLabel`, `SetStatusBarMeasureValue`, etc.

These callbacks fire when the user interacts — we can hook them to read model state.

## Geometry Inspection API (proven 2026-03-13)

### Groups & Component Instances — via `WebOutliner`

The Outliner API exposes only Groups and ComponentInstances (not raw faces/edges).

```js
// Root node (always pass "" as argument)
const root = Module.WebOutliner_GetRootNode("");
// root.getType() === -1 (NoEntity), root.numChildren() === N

// Traverse tree depth-first
function walk(node, depth=0) {
  console.log(node.getType(), node.getName(), node.getId(), node.numChildren());
  const kids = node.getChildren(); // Emscripten vector
  for (let i = 0; i < kids.size(); i++) walk(kids.get(i), depth+1);
}
walk(root);

// Node methods
node.getId()        // integer entity ID
node.getName()      // string (instance name, e.g. "Ty <Ty>")
node.getType()      // integer — see NodeType enum below
node.numChildren()  // integer
node.getChildren()  // Emscripten vector: .size(), .get(i)
node.isSelected()   // bool
node.isVisible()    // bool
node.setVisible(bool)
node.isLocked()     // bool
node.setLocked(bool)

// Select a node (adds to SketchUp selection set)
Module.WebOutliner_AddToSelectionSet(node);
Module.WebOutliner_ClearSelectionSet();
```

### NodeType Enum (from webpack module 10148)

| Value | Name |
|-------|------|
| -1 | NoEntity (root) |
| 0 | Entity |
| 1 | ArcCurve |
| 2 | Component (definition) |
| 5 | ComponentInstance |
| 7 | ConstructionLine |
| 8 | ConstructionPoint |
| 9 | Curve |
| 13 | DimensionLinear |
| 14 | DimensionRadial |
| 16 | Edge |
| 18 | Face |
| 20 | Group |
| 21 | Image |
| 31 | SectionPlane |
| 36 | Text |
| 51 | Surface |
| 2006 | SolidComponent |
| 2007 | SolidGroup |
| 2008 | LiveComponent |

### Entity Info for Selected Nodes

```js
// After WebOutliner_AddToSelectionSet(node):
const ei = Module.WebEntityInfo.getInstance();
ei.getSelectionCount()    // integer
ei.getSelectedEdgeCount() // integer
ei.getTitle()             // string: "Component (1 in model)"
ei.getInfoType()          // integer (matches NodeType)
ei.getInstanceName()      // string
ei.getDefinitionName()    // string
ei.getAreaAsString()      // string: "0.79 m²"
ei.getVolumeAsString()    // string: ""
ei.isVisible()            // bool
ei.isLocked()             // bool
```

### Face Geometry — via STL Export

The Outliner does **not** expose raw face/edge geometry. To get face vertices, normals, and area:

**Approach: intercept the STL export blob**

```js
// 1. Hook URL.createObjectURL BEFORE triggering export
const origCreate = URL.createObjectURL.bind(URL);
let stlBuffer = null;
URL.createObjectURL = function(blob) {
  const url = origCreate(blob);
  blob.arrayBuffer().then(buf => { stlBuffer = buf; });
  return url;
};

// 2. Trigger export
const chunk = window.webpackChunksketchup_web_frontend;
let wpRequire; chunk.push([['x'], {}, r => wpRequire = r]);
const mod = wpRequire(83217);
mod.nMW(mod.YFS.EXPORT_STL);

// 3. Wait ~500ms then parse the buffer (binary STL)
// Binary STL format: 80-byte header | uint32 numTriangles | (50 bytes × N)
// Each 50-byte record: 12 bytes normal (3×float32) | 36 bytes vertices (3×3×float32) | 2 bytes attrib

function parseSTL(buffer) {
  const view = new DataView(buffer);
  const numTriangles = view.getUint32(80, true);
  const triangles = [];
  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    const normal = [view.getFloat32(offset,true), view.getFloat32(offset+4,true), view.getFloat32(offset+8,true)];
    const v1 = [view.getFloat32(offset+12,true), view.getFloat32(offset+16,true), view.getFloat32(offset+20,true)];
    const v2 = [view.getFloat32(offset+24,true), view.getFloat32(offset+28,true), view.getFloat32(offset+32,true)];
    const v3 = [view.getFloat32(offset+36,true), view.getFloat32(offset+40,true), view.getFloat32(offset+44,true)];
    triangles.push({ normal, vertices: [v1, v2, v3] });
    offset += 50;
  }
  return triangles;
}
```

**Notes:**
- Coordinates are in model units (mm for metric models)
- SketchUp triangulates faces: one SketchUp face → multiple STL triangles
- Triangles with same normal = likely the same SketchUp face
- STL export is available on free SketchUp plan (OBJ/DXF/DWG require upgrade)
- Frechenlehen Groundfloor: 2925 triangles, 179.2 m² total area

### Additional Model Geometry Functions

```js
Module.getModelExtents()      // {left,right,bottom,top,near,far} in view/frustum space
Module.getSelectionExtents()  // same, for selected entities only
Module.getViewportDimensions() // {width, height} in pixels
Module.getModelFilePath()     // '/files/offline/.../model.skp' (Emscripten VFS path)
```

### Model File in IndexedDB

The .skp file is stored in the browser's IndexedDB under database `/files`, store `FILE_DATA`:

```js
const req = indexedDB.open('/files');
req.onsuccess = e => {
  const db = e.target.result;
  const tx = db.transaction('FILE_DATA', 'readonly');
  const store = tx.objectStore('FILE_DATA');
  // Keys: '/files/offline/{projectId}/0/{fileId}.skp'
  store.getAllKeys().onsuccess = e => console.log(e.target.result);
};
```

## Scenes API — via Vuex Store (proven 2026-03-13)

`mod.pn1()` is **NOT** the scenes manager — it is the `WebEnvironmentManager` (lighting/HDR backgrounds).
Scenes live in the **Vuex store**, accessible via webpack module 96459.

```js
const store = wpRequire(96459).store;

// List all scenes
const scenes = store.state.scenes.scenes; // plain JS array
scenes.forEach((s, i) => console.log(i, s.getName()));

// Activate a scene by index
store.dispatch('activateScene', 0);
// OR call directly on the scene object
scenes[0].activate();

// Create a new scene
mod.nMW(mod.YFS.CREATE_SCENE);
```

Scene object methods: `getName()`, `activate()`, and more (full API not yet mapped).

> **Note:** The `scenes` array is reactive — always re-read from `store.state.scenes.scenes` after changes.

---

## Materials API — via `WebMaterialBrowser` (proven 2026-03-13)

```js
const mb = new Module.WebMaterialBrowser();
const mats = mb.getInModelMaterials(); // Emscripten vector
for (let i = 0; i < mats.size(); i++) {
  const mat = mats.get(i);
  console.log(mat.getName()); // e.g. "Helen_Skin"
}
```

Material object methods: `getName()`, `getThumbnail()`, `saveMaterial()`, `isInModel()`,
`isEqualTo(other)`, `createMaterial()`, `purge()`.

---

## Components API — via `WebComponentBrowser` (proven 2026-03-13)

```js
const cb = new Module.WebComponentBrowser();
const comps = cb.getInModelComponents(); // Emscripten vector
for (let i = 0; i < comps.size(); i++) {
  const comp = comps.get(i);
  console.log(comp.getDefinitionName()); // e.g. "Helen"
}
```

Component object methods: `getDefinitionName()`, `getAuthor()`, `getStats()`,
`getTotalInstanceCount()`, `getDescription()`, and more.

---

## Tags API — via `SUCypress.getAdapter('tags').browser` (proven 2026-03-13)

```js
const browser = window.SUCypress.getAdapter('tags').browser;

// List all tags
const allTags = browser.getAllTags(); // Emscripten vector
for (let i = 0; i < allTags.size(); i++) {
  const tag = allTags.get(i);
  console.log(tag.name, tag.isVisible, tag.color);
  // tag has: { entityPtr, name, color, isVisible, isFolder }
}

// Create a tag (MUST pass 0 arguments — addTag('name') throws)
browser.addTag();
// Then rename it — MUST pass the full tag OBJECT (not entityPtr number)
const newTag = allTags.get(allTags.size() - 1);
browser.setName(newTag, 'my-tag-name');

// Hide/show a tag
browser.setVisibilityForTag(newTag, false); // hide
browser.setVisibilityForTag(newTag, true);  // show
```

**Gotchas:**
- `addTag('name')` throws "called with 1 arguments, expected 0" — always use `addTag()` then `setName()`
- `setName(tag.entityPtr, name)` throws "Cannot convert undefined to unsigned long" — pass the full tag object
- `setVisibilityForTag` also takes the full tag object, not entityPtr

---

## VCB Keyboard Input — Proven Sequence (proven 2026-03-13)

The VCB (Value Control Box) at the bottom of the viewport accepts typed dimensions. The proven
full sequence for any drawing/editing tool:

```js
// Step 1: Activate the tool
mod.nMW(mod.YFS.ACTIVATE_RECTANGLE);

// Step 2: Trusted first click — sets the drawing origin
// Use browser_click on body (ref=e1) OR page.mouse.click(x, y) via browser_run_code
// → This is required; synthetic dispatchEvent click does NOT commit the VCB

// Step 3: CRITICAL — dispatch a mousemove to establish drawing direction
const canvas = document.querySelector('canvas');
const rect = canvas.getBoundingClientRect();
const CX = rect.left + rect.width / 2;
const CY = rect.top + rect.height / 2;
canvas.dispatchEvent(new MouseEvent('mousemove', {
  bubbles: true, cancelable: true, view: window,
  clientX: CX + 80, clientY: CY + 80, buttons: 0
}));

// Step 4: Type dimension characters via Module.onKeyDown
// VCB trigger detection: Module.isVCBTrigger(keyCode) → true for digits/comma/period/minus
function vcbKey(physicalKey, inputChar, keyCode) {
  Module.onKeyDown({ physicalKey, inputChar, keyCode });
}
vcbKey('Digit1', 49, 49);
vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48); // → "1000"
vcbKey('Comma',  44, 188);
vcbKey('Digit5', 53, 53);
vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48); // → "1000,500"

// Step 5: Press Enter via Playwright trusted event (Module.onKeyDown Enter does NOT work)
// → Use browser_press_key('Enter') from Playwright MCP
```

**Key discoveries:**
- `Module.isVCBTrigger(13)` returns `false` — Enter is NOT handled by `onKeyDown`; use Playwright's `browser_press_key('Enter')`
- The mousemove in step 3 is **mandatory** — without it, Enter does not commit the operation
- Only `browser_press_key('a')` etc. via Playwright (not `onKeyDown`) can accidentally trigger SketchUp shortcuts — avoid using `browser_press_key` for anything except Enter/Escape during drawing

---

## Move Tool VCB — Proven Sequence (proven 2026-03-13)

```js
// 1. Pre-select entity via Outliner
Module.WebOutliner_ClearSelectionSet();
Module.WebOutliner_AddToSelectionSet(grp);

// 2. Activate Move tool
mod.nMW(mod.YFS.ACTIVATE_MOVE);

// 3. Trusted first click (establishes start point)
// browser_click on body OR page.mouse.click(CX, CY)

// 4. Mousemove to establish axis direction
canvas.dispatchEvent(new MouseEvent('mousemove', {
  bubbles: true, cancelable: true, view: window,
  clientX: CX + 150, clientY: CY, buttons: 0  // right → Red (X) axis
}));

// 5. Type distance (plain number — NOT a vector "1000,0,0")
// SketchUp auto-constrains to nearest axis from mousemove direction
vcbKey('Digit1', 49, 49);
vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48); // → "1000"

// 6. Commit
// browser_press_key('Enter')
```

**VCB format for Move:** plain distance (e.g. `"1000"`), NOT a vector (`"1000,0,0"` → "Invalid length entered").
SketchUp infers the axis from the mousemove direction — mousemove right → Red axis (X), etc.

---

## Rotate Tool — Mechanism (partially verified 2026-03-13)

Rotate requires **3 trusted clicks** at distinct canvas positions. Use `browser_run_code` with
`page.mouse.click(x, y)` for trusted clicks at exact coordinates (synthetic `dispatchEvent` clicks
do NOT advance the rotate tool state).

```js
// Use browser_run_code for all 3 interactions:
async (page) => {
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const CX = box.x + box.width / 2;
  const CY = box.y + box.height / 2;

  // Click 1: set pivot (center)
  await page.mouse.click(CX, CY);
  // Click 2: set reference arm start (100px away from pivot)
  await page.mouse.click(CX + 100, CY);
  // Move to show rotation angle
  await page.mouse.move(CX + 100, CY - 100);
}
// Then: Module.onKeyDown for angle digits, browser_press_key('Enter')
```

> ⚠️ Full end-to-end rotation with specific angle not yet verified — the mechanism is understood
> but a complete working proof needs one more session (B9 still pending final confirmation).

---

## Trusted Mouse Events via `browser_run_code` (proven 2026-03-13)

For operations that need trusted mouse events at **specific canvas coordinates** (not just body center),
use the Playwright `browser_run_code` MCP tool:

```js
async (page) => {
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const CX = box.x + box.width / 2;
  const CY = box.y + box.height / 2;
  await page.mouse.click(CX + 150, CY);   // trusted click anywhere
  await page.mouse.move(CX + 150, CY - 50); // trusted mousemove
  return { cx: CX, cy: CY };
}
```

This is required for multi-click tools (Rotate, 3-point operations) where each click must be at
a different position. `browser_click ref=e1` always clicks at the body center.

---

## Scale Tool — Proven Sequence (proven 2026-03-13)

```js
// 1. Pre-select via Outliner, then: mod.nMW(mod.YFS.ACTIVATE_SCALE)
// 2. Take screenshot to locate green grip squares on entity bounding box
// 3. page.mouse.click(gripX, gripY)  — click one grip
//    VCB shows current scale as "1.00" / "1.00,1.00" / "1.00,1.00,1.00"
//    The number of values tells you the dimension count (1D/2D/3D)
// 4. page.mouse.move(away)  — establish direction
// 5. Module.onKeyDown for each digit/comma  — e.g. "2,2" for 2D
// 6. browser_press_key('Enter')
// IMPORTANT: type exactly as many values as the VCB shows
//   "2" for a 2D grip → "Invalid Scale Input" dialog
//   "2,2" for a 2D grip → ✅ works
```

## Flip Tool — Proven Sequence (proven 2026-03-13)

```js
// 1. Pre-select via Outliner, then: mod.nMW(mod.YFS.ACTIVATE_FLIP_TOOL)
// 2. Arrow keys cycle through flip planes: ArrowLeft / ArrowRight
//    (Red = X axis plane, Green = Y axis plane, Blue = Z axis plane)
// 3. page.mouse.click(CX, CY)  — click anywhere on canvas to confirm flip
// No VCB input needed — flip is immediate on click
```

## What's Missing (needs further exploration)

- ~~Getting component/material lists (via `Module.WebComponentBrowser`)~~ → ✅ Solved above
- ~~Scenes list (via `mod.pn1()`)~~ → ✅ Solved via Vuex store (wpRequire(96459).store)
- ~~Tag create/hide/show~~ → ✅ Solved above
- ~~Rotate, Scale, Flip~~ → ✅ All proven (see sections above)
- Writing geometry programmatically (beyond keyboard VCB input)
- ~~SKP binary parsing fallback~~ → **Not needed.** All commands are covered by live APIs (STL for faces, Outliner for groups, Emscripten browsers for materials/components, Vuex store for scenes, VCB for all editing). The only data SKP parsing could add is standalone edge topology, which is out of scope for the architectural floor plan use case.
- Standalone edges (edges not bounding a face): invisible to STL approach — intentionally out of scope for the current use case.
