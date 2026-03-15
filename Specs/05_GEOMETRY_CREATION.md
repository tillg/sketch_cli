# Geometry Creation — Proven Sequences

> **Status: PROVEN — updated 2026-03-13 from live browser verification**

---

## VCB (Value Control Box) Input Mechanism

SketchUp's drawing tools accept precise dimensions via the VCB — the input field at the bottom of the viewport.

### Proven General Pattern

```js
// Step 1: Activate the drawing tool
mod.nMW(mod.YFS.ACTIVATE_RECTANGLE);

// Step 2: Trusted first click — sets drawing origin
// Either browser_click on body (ref=e1)  → clicks canvas center
// Or page.mouse.click(x, y) via browser_run_code → clicks at exact coordinates
// IMPORTANT: synthetic canvas.dispatchEvent('click') does NOT trigger VCB commit

// Step 3: CRITICAL — dispatch mousemove to establish drawing direction
// Without this step, pressing Enter does NOT commit the shape
const canvas = document.querySelector('canvas');
const rect = canvas.getBoundingClientRect();
const CX = rect.left + rect.width / 2;
const CY = rect.top + rect.height / 2;
canvas.dispatchEvent(new MouseEvent('mousemove', {
  bubbles: true, cancelable: true, view: window,
  clientX: CX + 80, clientY: CY + 80, buttons: 0
}));

// Step 4: Type dimension characters via Module.onKeyDown
// Module.isVCBTrigger(keyCode) → true for digits/comma/period/minus
// Enter (keyCode 13) returns false from isVCBTrigger — DO NOT use onKeyDown for Enter
function vcbKey(physicalKey, inputChar, keyCode) {
  Module.onKeyDown({ physicalKey, inputChar, keyCode });
}
// Example: type "1000,500"
vcbKey('Digit1', 49, 49); vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48); vcbKey('Digit0', 48, 48);
vcbKey('Comma',  44, 188);
vcbKey('Digit5', 53, 53); vcbKey('Digit0', 48, 48); vcbKey('Digit0', 48, 48);

// Step 5: Commit via Playwright trusted Enter (NOT Module.onKeyDown)
// → browser_press_key('Enter')
```

**Critical discoveries:**
- Mousemove in step 3 is **mandatory** — without it Enter does nothing
- `Module.isVCBTrigger(13)` returns `false` — Enter goes through a different path
- Use Playwright's `browser_press_key('Enter')` to commit; `Module.onKeyDown({keyCode:13})` does not work
- Avoid `browser_press_key` for any character key during drawing (risk of triggering SketchUp shortcuts like Arc tool on 'a'). Only use it for Enter/Escape.

---

## VCB Input Syntax by Command

| Command | VCB Input | Example (mm) |
|---------|-----------|--------------|
| Rectangle | `width,height` | `3000,4000` |
| Circle | `radius` | `1500` |
| Polygon | `radius,sides` | `1500,6` |
| Line (endpoint) | absolute coords `x,y,z` or relative? | TBD — needs testing |
| Push-Pull | `distance` | `2800` |
| Move | `dx,dy,dz` or `distance` | TBD — needs testing |
| Rotate | `angle` in degrees | `90` |
| Scale | `factor` or `dimension` | `2` or `6000` |

> All values are in model units. For metric models: mm. Check `Module.getModelInfo().stats.units` for the active model.

---

## Coordinate Mapping: Model Space → Screen Space

To click at a specific model coordinate (x, y, z), the 3D point must be projected to screen pixels using the current camera.

> Important: correct projection is **not sufficient**. The projected point must also
> be visible inside the current canvas. Large-coordinate drawing failures can occur
> even when `projectScript(...)` is mathematically correct, simply because the target
> lies outside the viewport. See `Specs/12_VIEWPORT_TARGETING_AND_CAMERA_FIT.md`.

**Required inputs:**
- `mod.rYl()` — 4×4 view/projection matrix
- `mod.jzI()` — field of view (degrees)
- `Module.getViewportDimensions()` — `{width, height}` in pixels

**Proposed projection function (not yet tested):**
```js
function projectToScreen(mx, my, mz, matrix, fovDeg, viewport) {
  // Apply 4×4 view matrix to model point
  const x = matrix.m00*mx + matrix.m01*my + matrix.m02*mz + matrix.m03;
  const y = matrix.m10*mx + matrix.m11*my + matrix.m12*mz + matrix.m13;
  const z = matrix.m20*mx + matrix.m21*my + matrix.m22*mz + matrix.m23;
  const w = matrix.m30*mx + matrix.m31*my + matrix.m32*mz + matrix.m33;
  // Perspective divide → NDC
  const ndcX = x / w;
  const ndcY = y / w;
  // NDC → screen pixels
  const screenX = (ndcX + 1) / 2 * viewport.width;
  const screenY = (1 - ndcY) / 2 * viewport.height;
  return { x: screenX, y: screenY };
}
```

> ⚠️ This needs to be verified in a live session. The matrix layout (row-major vs. column-major) and the exact projection convention SketchUp uses must be confirmed before any canvas-click-based command can work reliably.

---

## Face & Entity Targeting (for push-pull, move, rotate, scale)

These commands need to target a specific entity. Three approaches, in order of preference:

### Option 1: ID-based selection via Outliner (preferred for Groups/Components)

`WebOutliner_GetRootNode("")` + tree traversal gives every Group and ComponentInstance with an integer `node.getId()`. Use this ID to select the entity before activating the tool:

```js
// Find node by name or ID
const root = Module.WebOutliner_GetRootNode("");
function findById(node, targetId) {
  if (node.getId() === targetId) return node;
  const kids = node.getChildren();
  for (let i = 0; i < kids.size(); i++) {
    const found = findById(kids.get(i), targetId);
    if (found) return found;
  }
  return null;
}
const node = findById(root, 42);
Module.WebOutliner_ClearSelectionSet();
Module.WebOutliner_AddToSelectionSet(node);
// Now activate tool + VCB
mod.nMW(mod.YFS.ACTIVATE_MOVE);
await page.keyboard.type('1000,0,0');
await page.keyboard.press('Enter');
```

**Limitation:** Only works for Groups and ComponentInstances. Raw faces inside a group are not addressable via the Outliner.

### Option 2: Coordinate-based canvas click (for raw faces)

Project the face's known coordinate to screen pixels (see above), then simulate a mouse click to select it before activating the tool. Depends on the projection function being correct.

### Option 3: sketchup-cli name layer (fallback for complex cases)

If SketchUp entities don't have stable IDs across sessions, `sketchup-cli` can maintain its own name→entity mapping by:
- Assigning a naming convention to groups/components on creation (`sketchup-cli group --name "wall-north"`)
- Using `node.getName()` to look them up on subsequent commands

> **Recommendation:** Start with Option 1 (ID-based). The Outliner IDs appear to be stable within a session. Cross-session stability needs verification.

---

## Proposed Command Implementations

### `draw rectangle <x> <y> <z> <width> <height>` ✅ Proven

```js
// 1. Activate tool
mod.nMW(mod.YFS.ACTIVATE_RECTANGLE);
// 2. Trusted first click at origin (browser_click body or page.mouse.click)
// 3. Mousemove to establish direction (see general pattern above)
// 4. Type "width,height" via vcbKey()
// 5. browser_press_key('Enter')
```

### `draw circle <x> <y> <z> <radius> [--segments n]` ✅ Proven

```js
// 1. Activate tool
mod.nMW(mod.YFS.ACTIVATE_CIRCLE);
// 2. Trusted first click at circle center
// 3. Mousemove to establish radius direction
// 4. Type radius via vcbKey()  — e.g. "1500"
// 5. browser_press_key('Enter')
// NOTE: --segments: type segment count BEFORE the first click (pre-click VCB)
```

### `draw line <x1,y1,z1> <x2,y2,z2>` ✅ Proven

```js
// Requires two clicks (start + end) at distinct canvas positions
// Use browser_run_code with page.mouse.click for trusted clicks at coordinates
mod.nMW(mod.YFS.ACTIVATE_PENCIL);
// async (page) => {
//   await page.mouse.click(startX, startY);  // click 1: line start
//   await page.mouse.click(endX, endY);       // click 2: line end
// }
// VCB approach for absolute coords not reliable — use 2-click canvas approach
```

### `push-pull <x> <y> <z> <distance>` ✅ Proven

```js
// 1. Activate push-pull
mod.nMW(mod.YFS.ACTIVATE_PUSH_PULL);
// 2. Trusted click at face coordinate (estimated canvas position in ISO view)
//    Use browser_run_code: await page.mouse.click(faceX, faceY)
// 3. Mousemove on the face to show extrusion direction
// 4. Type distance via vcbKey()  — e.g. "2800"
// 5. browser_press_key('Enter')
// NOTE: Face targeting uses estimated screen coordinates — see Face Targeting below
```

Known limitation: this works reliably only when the target face point is already
visible inside the viewport. For large faces, clicking the geometric center is not
safe; high-level commands such as `draw box` and `draw wall` should use an inset
interior point near the already-visible starting corner instead.

### `move <dx,dy,dz>` ✅ Proven

```js
// 1. Pre-select entity via Outliner
Module.WebOutliner_ClearSelectionSet();
Module.WebOutliner_AddToSelectionSet(node);
// 2. Activate move
mod.nMW(mod.YFS.ACTIVATE_MOVE);
// 3. Trusted first click
// 4. Mousemove right (+X on screen) → constrains to Red axis (X)
//    Mousemove up (-Y on screen) → constrains to Green axis (Y)
canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true,
  view: window, clientX: CX + 150, clientY: CY, buttons: 0 }));
// 5. Type plain distance "1000" (NOT a vector — "1000,0,0" → "Invalid length entered")
vcbKey('Digit1', 49, 49); vcbKey('Digit0', 48, 48);
vcbKey('Digit0', 48, 48); vcbKey('Digit0', 48, 48);
// 6. browser_press_key('Enter')
```

### `rotate <angle>` ✅ Proven

```js
// Requires 3 trusted clicks — use browser_run_code for all interactions:
async (page) => {
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const CX = box.x + box.width / 2;
  const CY = box.y + box.height / 2;

  // Click 1: set pivot (center of rotation)
  await page.mouse.move(CX, CY);
  await page.mouse.click(CX, CY);

  // Click 2: set reference arm — MUST be different position from pivot
  await page.mouse.move(CX + 100, CY);
  await page.mouse.click(CX + 100, CY);

  // Move to show rotation angle
  await page.mouse.move(CX, CY - 100);
}
// Then type angle via vcbKey()  — e.g. "90"
// Then: browser_press_key('Enter')
// NOTE: synthetic dispatchEvent clicks do NOT advance rotate tool state
// NOTE: pivot and reference arm at same coords → zero rotation (immediate complete, nothing happens)
```

### `scale <factor>` ✅ Proven

```js
// 1. Pre-select entity via Outliner
// 2. mod.nMW(mod.YFS.ACTIVATE_SCALE)  — shows scale grips (green squares) on entity bounding box
// 3. Click a scale grip via page.mouse.click(gripX, gripY)
//    The VCB immediately shows current scale factor(s) — this tells you how many values to type:
//    - Corner grip in top/front view: "1.00,1.00"  → type "2,2" (2 values)
//    - Corner grip in 3D bounding box: "1.00,1.00,1.00" → type "2,2,2" (3 values)
//    - Edge midpoint grip: "1.00"  → type "2" (1 value)
// 4. Move mouse away to establish scale direction
// 5. Type scale factors via vcbKey() matching the VCB count
// 6. browser_press_key('Enter')
// NOTE: wrong number of values (e.g. "2" when "2,2" expected) → "Invalid Scale Input" dialog
// NOTE: locate scale grips by taking a screenshot first — they appear as green squares
```

### `flip <axis>` ✅ Proven

```js
// 1. Pre-select entity via Outliner
// 2. mod.nMW(mod.YFS.ACTIVATE_FLIP_TOOL)  — shows colored flip planes on entity
// 3. Arrow Keys cycle through flip planes (Red/Green/Blue axis)
//    e.g. await page.keyboard.press('ArrowLeft')
// 4. Canvas click to confirm flip
//    await page.mouse.click(CX, CY)
// NOTE: no VCB input needed — flip is a single-step operation
// NOTE: model auto-saves on commit confirming the operation worked
```

---

## Open Issues Referenced Here

| Item | Description |
|------|-------------|
| A2 | Write down the proven rectangle VCB code from earlier sessions |
| A3 | Face targeting strategy — confirm Option 1 (ID-based) or Option 2 (coordinate click) |
| B5 | Prove circle VCB sequence end-to-end |
| B6 | Prove line endpoint input method |
| B7 | Prove push-pull face targeting |
| B8–B11 | Prove move/rotate/scale/flip VCB sequences |
