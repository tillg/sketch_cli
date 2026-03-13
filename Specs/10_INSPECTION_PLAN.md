# Inspection Plan — Unproven Commands

## Purpose

This document is a step-by-step execution guide for a fresh session. Run it top-to-bottom to prove or disprove every 🔬 command in `Specs/03_CLI_COMMANDS.md` and resolve the open architecture questions in `Specs/OPEN_QUESTIONS.md`.

After each section, record findings in the relevant spec file and mark items in `OPEN_QUESTIONS.md` as resolved.

---

## Context (read before starting)

This project controls **SketchUp Web** (`app.sketchup.com`) via Playwright browser automation. JavaScript is injected into the running app via `page.evaluate()` to call internal SketchUp APIs.

**Tools available (Playwright MCP):**
- `mcp__playwright__browser_navigate` — navigate to a URL
- `mcp__playwright__browser_evaluate` — run JavaScript in the page
- `mcp__playwright__browser_take_screenshot` — capture the viewport
- `mcp__playwright__browser_click` — click at coordinates or selector
- `mcp__playwright__browser_press_key` — press a key
- `mcp__playwright__browser_type` — type text into focused element
- `mcp__playwright__browser_snapshot` — get accessibility tree (useful for finding dialog text)

**SAFETY RULE: Never run modifying commands (draw, delete, push-pull, etc.) on a real architectural model. Only use a blank model or the file named "Test".**

---

## Phase 0 — Session Setup

### Step 0.1 — Navigate and verify

```
browser_navigate → https://app.sketchup.com/app
```

Take a screenshot to confirm the app is loaded and a model is open. If the home screen is showing (no model open), open the "Test" file or create a new blank model via the UI before continuing.

```
browser_take_screenshot
```

### Step 0.2 — Inject the standard setup block

Run this once at the start. Re-run it if you get "mod is not defined" errors later.

```js
// Run via browser_evaluate:
const chunk = window.webpackChunksketchup_web_frontend;
let wpRequire;
chunk.push([['probe'], {}, (r) => { wpRequire = r; }]);
const mod = wpRequire(83217);
const M = window.Module;

// Verify
console.log('mod:', typeof mod);                          // "object"
console.log('YFS keys:', Object.keys(mod.YFS).length);   // ~176
console.log('Module:', typeof M);                         // "object"
console.log('SUCypress:', typeof window.SUCypress);       // "object"
```

**Expected:** all four lines print truthy values. If `mod` is undefined, the webpack chunk name may have changed — search for it:
```js
Object.keys(window).filter(k => k.startsWith('webpackChunk'))
```

### Step 0.3 — Switch to top view and zoom to fit

This gives a predictable camera state needed for coordinate→pixel projection later.

```js
mod.nMW(mod.YFS.VIEW_TOP);
mod.nMW(mod.YFS.ACTIVATE_ZOOM_EXTENTS);
```

### Step 0.4 — Get viewport dimensions and camera state

```js
const vp = Module.getViewportDimensions();
const cam = mod.rYl();
const fov = mod.jzI();
console.log('viewport:', JSON.stringify(vp));    // {width: N, height: N}
console.log('fov:', fov);
console.log('camera matrix:', JSON.stringify(cam));
```

Record these values — they are needed for the coordinate projection in Phase 4.

---

## Phase 1 — Read-only API Probes (no model modification)

Safe to run in any order. No undo needed.

---

### B3 + B14: Scenes API (`mod.pn1()`)

```js
const env = mod.pn1();
console.log('env type:', typeof env);
console.log('env keys:', JSON.stringify(Object.keys(env)));
// Also check prototype methods:
const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(env));
console.log('proto methods:', JSON.stringify(proto));
```

Look for: `getScenes`, `getEnvironments`, `getPages`, `getSceneCount`, `activateScene`, `setActiveScene`, `getActiveScene`, or similar. Try calling any that exist:

```js
// Try likely method names:
for (const name of ['getScenes','getPages','getEnvironments','getSceneList','count','size']) {
  try {
    const result = env[name]?.();
    if (result !== undefined) console.log(name, '->', JSON.stringify(result));
  } catch(e) { /* skip */ }
}
```

**Success:** We get a list of scene names and find an `activate` method.
**If empty:** Search other webpack modules for scene-related code:
```js
const ids = Object.keys(wpRequire.m);
for (const id of ids) {
  const s = wpRequire.m[id].toString();
  if (s.includes('activateScene') || s.includes('getScenes')) {
    console.log('found in module', id, s.slice(s.indexOf('Scene')-50, s.indexOf('Scene')+200));
  }
}
```

**Record in:** `Specs/02_API_EXPLORATION.md` (scenes section), then update `Specs/03_CLI_COMMANDS.md` B3 + B14 status.

---

### B1 + B2: Materials and Components API

```js
// Search Module for relevant function names
const matKeys = Object.keys(M).filter(k => /material|component|browser/i.test(k));
console.log('material/component keys:', JSON.stringify(matKeys));
```

If `WebComponentBrowser` or similar exists, probe it:

```js
// Try to get an instance or call it
['WebComponentBrowser', 'WebMaterialBrowser', 'WebComponentPanel'].forEach(name => {
  if (M[name]) {
    try {
      const inst = M[name].getInstance?.() ?? M[name]();
      console.log(name, 'instance:', JSON.stringify(Object.keys(inst ?? {})));
    } catch(e) { console.log(name, 'error:', e.message); }
  }
});
```

Also check `getModelInfo()` for count-only access:

```js
const info = M.getModelInfo();
console.log('stats:', JSON.stringify(info.stats));
// Look for: num_materials, num_component_definitions
```

If counts are available but not lists, search webpack modules for a listing API:

```js
for (const id of Object.keys(wpRequire.m)) {
  const s = wpRequire.m[id].toString();
  if (s.includes('getMaterial') || s.includes('getComponents')) {
    console.log('module', id, ':', s.slice(0, 300));
    break;
  }
}
```

**Record in:** `Specs/02_API_EXPLORATION.md`, update B1 + B2 in OPEN_QUESTIONS.

---

### B4: Outliner Deep Hierarchy

Only meaningful if the open model has nested groups/components. If the Test model is blank, use the real model briefly for this read-only test (read only — no modifications).

```js
const root = M.WebOutliner_GetRootNode("");

let maxDepth = 0;
let totalNodes = 0;
let errors = 0;

function walk(node, depth) {
  totalNodes++;
  if (depth > maxDepth) maxDepth = depth;
  try {
    const kids = node.getChildren();
    for (let i = 0; i < kids.size(); i++) {
      walk(kids.get(i), depth + 1);
    }
  } catch(e) { errors++; }
}

const t0 = Date.now();
walk(root, 0);
const elapsed = Date.now() - t0;

console.log(`nodes: ${totalNodes}, maxDepth: ${maxDepth}, errors: ${errors}, time: ${elapsed}ms`);
```

**Success criteria:** completes without crash, `errors === 0`, time < 5000ms.
**Record in:** `Specs/02_API_EXPLORATION.md`, update B4.

---

### B12: Tag Create API

```js
const tags = window.SUCypress.getAdapter('tags');
console.log('tags adapter:', JSON.stringify(tags));
console.log('tags.browser:', JSON.stringify(tags.browser));

// Look for create/add methods
const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(tags)).filter(k => typeof tags[k] === 'function');
console.log('tags methods:', JSON.stringify(methods));

// Also check the browser sub-object
if (tags.browser) {
  const bMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(tags.browser)).filter(k => typeof tags.browser[k] === 'function');
  console.log('tags.browser methods:', JSON.stringify(bMethods));
}
```

If a `create` / `add` / `createTag` method is found:
```js
// TEST — creates a tag named 'test-cli'. Undo manually after.
tags.browser.create?.('test-cli') ?? tags.createTag?.('test-cli');
```

Check if it appeared:
```js
console.log(JSON.stringify(tags.browser));
```

**Record in:** `Specs/02_API_EXPLORATION.md`, update B12.

---

## Phase 2 — VCB Rectangle (A2)

**Goal:** Reproduce the proven `draw rectangle` and write down the exact working code.

**Pre-condition:** Blank/Test model open, top view, zoom extents done (Phase 0.3).

### Step 2.1 — Get canvas center coordinates

```js
const vp = Module.getViewportDimensions();
console.log('center:', vp.width / 2, vp.height / 2);
```

The canvas fills the viewport. The center pixel is the drawing origin. Note these pixel values.

### Step 2.2 — Check model state before drawing

```js
const before = M.getModelInfo().stats;
console.log('faces before:', before.num_faces, 'edges before:', before.num_edges);
```

### Step 2.3 — Draw rectangle

Replace `CX` and `CY` with the center pixel values from 2.1.

```js
// Activate rectangle tool
mod.nMW(mod.YFS.ACTIVATE_RECTANGLE);
```

Then click at canvas center using the Playwright click tool:
```
browser_click → coordinates: { x: CX, y: CY }
```

Wait ~200ms, then type dimensions:
```
browser_type → text: "1000,500"
browser_press_key → key: "Enter"
```

Wait ~500ms, then verify:
```js
const after = M.getModelInfo().stats;
console.log('faces after:', after.num_faces, 'edges after:', after.num_edges);
// Success: num_faces increased by 1, num_edges increased by 4
```

### Step 2.4 — If step 2.3 failed (no face created)

The canvas click may have missed the active drawing area, or the VCB format was wrong. Try:
- `"1000;500"` (semicolon separator — some SketchUp locales use this)
- `"1000 500"` (space separator)
- Click somewhere off-center (avoid model edges that might trigger snapping)
- Take a screenshot before clicking to confirm the tool is active (cursor should change)

### Step 2.5 — Undo

```js
mod.nMW(mod.YFS.UNDO);
// Verify
const clean = M.getModelInfo().stats;
console.log('faces after undo:', clean.num_faces); // should be back to before value
```

**Record in:** `Specs/05_GEOMETRY_CREATION.md` — write the exact working sequence including pixel coordinates used, VCB format, and wait times.

---

## Phase 3 — Circle and Line VCB (B5, B6)

Run after Phase 2 — same model state (blank, top view).

### B5: Draw Circle

```js
mod.nMW(mod.YFS.ACTIVATE_CIRCLE);
```
```
browser_click → { x: CX, y: CY }
browser_type → "500"
browser_press_key → "Enter"
```
Verify face count increased by 1. Undo.

**If above fails — try setting segment count first (before clicking center):**
```
// Type segment count immediately after activating tool, before clicking
browser_type → "24"
browser_press_key → "Enter"
// Then click and type radius
browser_click → { x: CX, y: CY }
browser_type → "500"
browser_press_key → "Enter"
```

**Record in:** `Specs/05_GEOMETRY_CREATION.md`.

---

### B6: Draw Line

**Option A — two canvas clicks (most likely to work):**
```js
mod.nMW(mod.YFS.ACTIVATE_PENCIL);
```
```
browser_click → { x: CX, y: CY }       // start point
browser_click → { x: CX+100, y: CY }   // end point (100px to the right)
browser_press_key → "Escape"            // finish the line
```
Verify edge count increased. Undo.

**Option B — VCB absolute coordinates (test after Option A):**
```js
mod.nMW(mod.YFS.ACTIVATE_PENCIL);
```
```
browser_click → { x: CX, y: CY }       // set start point
browser_type → "1000,0,0"              // try absolute end coords in mm
browser_press_key → "Enter"
browser_press_key → "Escape"
```

**Record in:** `Specs/05_GEOMETRY_CREATION.md`.

---

## Phase 4 — Face Targeting and Push-Pull (A3, B7)

**Pre-condition:** Draw a rectangle first (Phase 2, Step 2.3) and leave it in the model for this phase. Undo at the end.

### Step 4.1 — Camera projection (A3, Option 1)

We need to project a known model-space coordinate to a screen pixel to click on the face.

The rectangle drawn at canvas center is at an unknown model coordinate. First, read the camera state to understand the current view transform:

```js
const cam = mod.rYl();    // 4×4 camera matrix
const fov = mod.jzI();
const vp = Module.getViewportDimensions();
const ext = mod.AT7();    // bounding box of visible geometry

console.log('extents:', JSON.stringify(ext));
console.log('camera:', JSON.stringify(cam));
// The extents give the model-space bounding box of the current view.
// The center of the extents should map to the center of the screen.
```

Attempt the projection:
```js
function projectPoint(mx, my, mz, cam, fov, vp) {
  // Apply 4×4 view matrix (row-major)
  const x = cam.m00*mx + cam.m01*my + cam.m02*mz + cam.m03;
  const y = cam.m10*mx + cam.m11*my + cam.m12*mz + cam.m13;
  const z = cam.m20*mx + cam.m21*my + cam.m22*mz + cam.m23;
  const w = cam.m30*mx + cam.m31*my + cam.m32*mz + cam.m33;
  // Perspective divide → NDC, then to pixels
  return {
    x: ((x / w) + 1) / 2 * vp.width,
    y: (1 - (y / w)) / 2 * vp.height
  };
}

// Project the center of the model bounding box
const cx = (ext.left + ext.right) / 2;
const cy = (ext.bottom + ext.top) / 2;
const cz = (ext.near + ext.far) / 2;
const screenPt = projectPoint(cx, cy, cz, cam, fov, vp);
console.log('projected center:', JSON.stringify(screenPt));
// Expected: should be close to viewport center (vp.width/2, vp.height/2)
```

Validate: if `screenPt` is close to `{x: vp.width/2, y: vp.height/2}`, the projection is working. If not, the matrix may be column-major — try transposing (`m00,m10,m20,m30` etc.) and re-test.

### Step 4.2 — Push-pull test (B7)

With the rectangle still in the model, and with a working projection:

```js
// Get the rectangle's face center (use bounding box center since it's a flat rectangle)
const ext = mod.AT7();
const fc = {
  x: (ext.left + ext.right) / 2,
  y: (ext.bottom + ext.top) / 2,
  z: 0   // flat rectangle is at z=0
};
const screenPt = projectPoint(fc.x, fc.y, fc.z, cam, fov, vp);
console.log('face screen coords:', JSON.stringify(screenPt));
```

Then:
```js
mod.nMW(mod.YFS.ACTIVATE_PUSH_PULL);
```
```
browser_click → { x: screenPt.x, y: screenPt.y }
browser_type → "500"
browser_press_key → "Enter"
```
Verify: face count should change (flat face becomes a box).

**If projection-based click fails:** Try selecting the face first via `EDIT_SELECT_ALL`, then activating push-pull:
```js
mod.nMW(mod.YFS.EDIT_SELECT_ALL);
mod.nMW(mod.YFS.ACTIVATE_PUSH_PULL);
```
Then click canvas center and type distance.

Undo both the push-pull and the rectangle:
```js
mod.nMW(mod.YFS.UNDO);
mod.nMW(mod.YFS.UNDO);
```

**Record in:** `Specs/05_GEOMETRY_CREATION.md` — projection formula validity, push-pull sequence.

---

## Phase 5 — Transform Commands (B8–B11)

**Pre-condition:** Create a group to transform.

### Setup: Create a test group

```js
// Draw a rectangle, then group it
mod.nMW(mod.YFS.ACTIVATE_RECTANGLE);
```
```
browser_click → { x: CX, y: CY }
browser_type → "1000,500"
browser_press_key → "Enter"
```
```js
mod.nMW(mod.YFS.EDIT_SELECT_ALL);
mod.nMW(mod.YFS.EDIT_MAKE_GROUP);

// Confirm a group exists in the outliner
const root = M.WebOutliner_GetRootNode("");
const kids = root.getChildren();
console.log('group count:', kids.size());
// Get the group node
const grp = kids.get(0);
console.log('group id:', grp.getId(), 'name:', grp.getName(), 'type:', grp.getType());
```

### B8: Move

```js
// Select the group via outliner
M.WebOutliner_ClearSelectionSet();
M.WebOutliner_AddToSelectionSet(grp);
mod.nMW(mod.YFS.ACTIVATE_MOVE);
```
```
// Click somewhere on the group (canvas center)
browser_click → { x: CX, y: CY }
browser_type → "1000,0,0"
browser_press_key → "Enter"
```
Verify: bounding box extents changed (`mod.AT7()` returns different values). Undo.

**Alternative if above fails:** try `"1000"` (distance only, along current move direction) or `"[1000,0,0]"`.

### B9: Rotate

```js
M.WebOutliner_AddToSelectionSet(grp);
mod.nMW(mod.YFS.ACTIVATE_ROTATE);
```
```
// First click: sets the rotation center
browser_click → { x: CX, y: CY }
// Second click: sets the rotation axis reference point
browser_click → { x: CX+50, y: CY }
// Type the angle
browser_type → "45"
browser_press_key → "Enter"
```
Undo.

**Note:** Rotate in SketchUp requires 3 clicks (center, reference, angle). VCB only provides the angle; center and axis are set by clicks. This may be hard to automate precisely.

### B10: Scale

```js
M.WebOutliner_AddToSelectionSet(grp);
mod.nMW(mod.YFS.ACTIVATE_SCALE);
```
```
// Click on a scale handle (try center first)
browser_click → { x: CX, y: CY }
browser_type → "2"
browser_press_key → "Enter"
```
Undo.

### B11: Flip

```js
M.WebOutliner_AddToSelectionSet(grp);
mod.nMW(mod.YFS.ACTIVATE_FLIP_TOOL);
```
Observe: does a flip UI appear? Can we select axis via keyboard shortcut?
Try pressing `X`, `Y`, `Z` after activation to set axis:
```
browser_press_key → "X"
```
Check if bounding box changed. Undo.

### Cleanup

```js
// Undo all steps in this phase
for (let i = 0; i < 6; i++) mod.nMW(mod.YFS.UNDO);
// Verify model is clean
const stats = M.getModelInfo().stats;
console.log('edges:', stats.num_edges, 'faces:', stats.num_faces); // should be 0 for blank model
```

**Record in:** `Specs/05_GEOMETRY_CREATION.md` — which VCB formats work for each transform.

---

## Phase 6 — Tag Commands (B13)

**Pre-condition:** At least one tag must exist (the real model has tags; or create one in the Test model).

### B13: Tag hide/show

```js
// Get the tag list
const tags = window.SUCypress.getAdapter('tags').browser;
console.log('tags:', JSON.stringify(tags));

// Find a tag to test with (e.g. first non-Default tag)
const tagList = tags.getAllTags?.() ?? tags.getTags?.() ?? tags;
console.log('tag list:', JSON.stringify(tagList));
```

Find a non-critical tag and test hiding it:

```js
// Get tag object (exact API depends on what was found above)
// Try selecting by tag name first
M.SelectEntitiesByTagName('SomeTagName');
// Then hide selected
mod.nMW(mod.YFS.EDIT_HIDE);
// Verify: check if entities on that tag are now hidden via outliner
```

Undo. Then test `EDIT_UNHIDE_ALL` to restore.

**Record in:** `Specs/02_API_EXPLORATION.md` + update B12, B13.

---

## After Each Phase — Recording Findings

For each item, record in the following locations:

| Finding type | Where to record |
|---|---|
| New working JS snippet | `Specs/02_API_EXPLORATION.md` |
| VCB input sequence | `Specs/05_GEOMETRY_CREATION.md` |
| Command status change (🔬 → ✅ or ❌) | `Specs/03_CLI_COMMANDS.md` |
| Architecture decision resolved | `Specs/05_GEOMETRY_CREATION.md` or `01_BASIC_ARCHITECTURE.md` |
| Check off completed item | `Specs/OPEN_QUESTIONS.md` |

---

## Quick Reference — Access Pattern

```js
// Always run this first in a new page.evaluate() context:
const chunk = window.webpackChunksketchup_web_frontend;
let wpRequire;
chunk.push([['probe'], {}, (r) => { wpRequire = r; }]);
const mod = wpRequire(83217);
const M = window.Module;
```

```js
// Common checks
M.getModelInfo().stats                        // face/edge/component counts
mod.AT7()                                     // bounding box {left,right,top,bottom,near,far}
Module.getViewportDimensions()                // {width, height} in px
mod.rYl()                                     // camera matrix 4×4
mod.jzI()                                     // FOV degrees

// Outliner
const root = M.WebOutliner_GetRootNode("");
const kids = root.getChildren();              // Emscripten vector: .size(), .get(i)
M.WebOutliner_ClearSelectionSet();
M.WebOutliner_AddToSelectionSet(node);

// YFS dispatch
mod.nMW(mod.YFS.UNDO);
mod.nMW(mod.YFS.EDIT_SELECT_ALL);
mod.nMW(mod.YFS.ACTIVATE_RECTANGLE);
// ... etc — full list in Specs/02_API_EXPLORATION.md
```
