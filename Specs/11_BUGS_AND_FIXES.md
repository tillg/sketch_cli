# Known Bugs and Required Fixes

> Discovered during live CLI testing session on 2026-03-15. All issues below
> were reproduced against a fresh "Untitled" model.

---

## Bug 1 — `projectScript` produces wildly wrong screen coordinates

**Severity: Critical** — breaks every command that clicks at a model-space
coordinate.

**Affected commands:** `draw wall`, `draw box`, `draw rectangle`, `draw circle`,
`draw line`, `push-pull`

### Symptom

All projected coordinates land wildly off-screen:

```
(0,0,0)    → screen (412, -1698)   OFF-SCREEN
(1000,0,0) → screen (-14654, 3530) OFF-SCREEN
(3000,0,0) → screen (-44786, 13987) OFF-SCREEN
```

### Root Cause

`rYl()` returns the **camera-to-world** transform (eye→world), not the
world-to-eye view matrix. The current code computes `M * p`, which transforms a
camera-space point into world space — the exact opposite of what projection
requires.

The code also uses the wrong perspective formula: it uses `-ez` (OpenGL
convention) but SketchUp's camera looks down **+Z** in eye space, so in-front
points have **positive** ez.

### Required Fix

Invert the matrix before projecting. Since the 3×3 rotation block is
orthonormal, the inverse is cheap: `R^T` for the rotation, `-R^T * t` for the
translation.

```js
// Correct projection:
// 1. Compute view matrix: R^T for rotation, -R^T*t for translation
const r00 = m.m00,
  r01 = m.m10,
  r02 = m.m20; // row 0 of R^T = col 0 of R
const r10 = m.m01,
  r11 = m.m11,
  r12 = m.m21; // row 1 of R^T = col 1 of R
const r20 = m.m02,
  r21 = m.m12,
  r22 = m.m22; // row 2 of R^T = col 2 of R
const tx = -(r00 * m.m03 + r01 * m.m13 + r02 * m.m23);
const ty = -(r10 * m.m03 + r11 * m.m13 + r12 * m.m23);
const tz = -(r20 * m.m03 + r21 * m.m13 + r22 * m.m23);

// 2. Transform world point to eye space
const ex = r00 * mx + r01 * my + r02 * mz + tx;
const ey = r10 * mx + r11 * my + r12 * mz + ty;
const ez = r20 * mx + r21 * my + r22 * mz + tz;

// 3. Perspective (SketchUp looks down +Z, so in-front points have ez > 0)
//    Frustum values are from Module.getViewFrustum()
const ndcX =
  ((2 * frustum.near * ex) / ez - (frustum.right + frustum.left)) /
  (frustum.right - frustum.left);
const ndcY =
  ((2 * frustum.near * ey) / ez - (frustum.top + frustum.bottom)) /
  (frustum.top - frustum.bottom);

// 4. NDC to screen — confirmed correct (no X flip needed)
const screenX = rect.left + (ndcX + 1) / 2 * rect.width;
const screenY = rect.top  + (1 - ndcY) / 2 * rect.height;
```

> **Unit conversion required:** `projectScript` inputs must be in **inches**.
> SketchUp's internal coordinate system is always inches. Callers that work in mm
> must divide by 25.4: `projectScript(xMm/25.4, yMm/25.4, zMm/25.4)`.
> Verified: origin → `(385, 480)` matches the axis marker; `(1000mm/25.4)` along
> X → `(483, 493)` correctly places a click at the 1m mark.

### Parallel projection

Same matrix inversion applies. Replace only the NDC formula:

```js
const ndcX =
  (2 * ex - (frustum.right + frustum.left)) / (frustum.right - frustum.left);
const ndcY =
  (2 * ey - (frustum.top + frustum.bottom)) / (frustum.top - frustum.bottom);
// Then apply the same NDC→screen mapping as in the perspective case (step 4 above)
```

### Workaround (used in the 2026-03-15 session)

Switch to top view before drawing, then click at a known screen-space offset
from canvas center, type dimensions in the VCB. This avoids projection entirely
and is reliable for axis-aligned geometry on the ground plane:

```
VIEW_TOP → zoom extents → click at canvas_center + offset → VCB → Enter
```

---

## Bug 2 — `sketchup-cli new` fails from the home page

**Severity: High** — the most natural entry point (launching from the home page)
does not work.

### Symptom

`checkSession()` returns `{ ok: true }` even when the browser is on the SketchUp
home page (file picker), because `window.SUCypress` is injected into the whole
SPA, not only into the 3D editor. As a result, the `new` command takes the wrong
branch and tries `mod.nMW(mod.YFS.NEW_MODEL)`, which fails because the webpack
module runtime isn't loaded outside the editor.

### Root Cause

`checkSession` relies solely on `typeof window.SUCypress !== 'undefined'`. This
is not a reliable indicator of "model editor open" — it is true everywhere in
the SPA.

### Required Fix

**Two-part fix:**

**Part A — better `checkSession` heuristic.** After checking `SUCypress`, also
verify that the webpack module 83217 is accessible (which requires the 3D engine
to be loaded):

```js
// In daemon.js checkSession:
const isEditorReady = await page.evaluate(() => {
  try {
    if (typeof window.SUCypress === "undefined") return false;
    const chunk = window.webpackChunksketchup_web_frontend;
    let wpRequire;
    chunk.push([
      ["__cli_chk"],
      {},
      (r) => {
        wpRequire = r;
      },
    ]);
    if (typeof wpRequire !== "function") return false;
    const mod = wpRequire(83217);
    return typeof mod?.nMW === "function";
  } catch {
    return false;
  }
});
result = isEditorReady ? { ok: true } : { ok: false, reason: "no_model" };
```

**Part B — `new` command logic.** Once `checkSession` correctly distinguishes
home vs. editor, the `new` command can use a simpler branch:

- If `no_model` (home page): click the "Create new" button by finding the first
  `<button>` whose text contains `"Create new"`, then poll `checkSession` every
  1 s (up to 60 s), treating thrown errors as `no_model` (the page navigates and
  may temporarily lose the context).
- If `ok` (already in editor): dispatch `mod.nMW(mod.YFS.NEW_MODEL)`, then poll
  `checkSession` the same way. Note: if the current model has unsaved changes,
  SketchUp shows a "Save changes?" dialog. The wait loop must also call
  `checkDialog()` and either auto-dismiss it (click "Don't save") or surface the
  error to the caller.

The `requireModel: false` guard added in the 2026-03-15 session is correct; only
the branch condition needs updating once `checkSession` is fixed.

---

## Bug 3 — `draw wall` and `draw box` ignore the wall orientation

**Severity: Medium** — axis-aligned walls work accidentally; diagonal walls
don't.

### Symptom

`draw wall start end height thickness` computes `w = distance(start, end)` and
then draws a rectangle of size `(w, thickness)` at `start`. This rectangle is
always axis-aligned because the Rectangle tool draws aligned to the model axes.
For a wall from `(0,0)` to `(0,5000)` (along Y), the rectangle would be drawn
`(5000, 250)` in the X–Y plane — rotated 90° from the intended direction.

### Required Fix

With Bug 1 fixed (correct projection + inch conversion), the click lands at the
right model-space start point. The Rectangle tool VCB only accepts relative
dimensions — absolute second-corner input is not supported (confirmed Q2). The
orientation is controlled solely by the `dispatchMousemove` direction.

The fix: project the wall's **direction vector** to screen space and use that as
the mousemove offset. For a wall from `(x1,y1)` to `(x2,y2)`:

```js
const s = projectScript(x1/25.4, y1/25.4, 0);          // first corner screen pos
const e = projectScript(x2/25.4, y2/25.4, 0);          // second corner screen pos
const dxScreen = e.x - s.x;
const dyScreen = e.y - s.y;
// Normalise to a short nudge (keep direction, fix magnitude to ~80px)
const len = Math.sqrt(dxScreen**2 + dyScreen**2);
const nudgeX = (dxScreen / len) * 80;
const nudgeY = (dyScreen / len) * 80;
// dispatchMousemove with (nudgeX, nudgeY) from canvas centre
```

After that mousemove, the VCB `"length,thickness"` maps the first value to the
wall's length direction and the second to the perpendicular. Diagonal walls
should work correctly once the direction nudge matches the projected start→end
vector.

---

## Bug 4 — `draw wall` and `draw box` don't confirm rectangle success before push-pull

**Severity: Medium** — if the rectangle step silently fails (e.g. projection
misses the canvas), push-pull proceeds with no face to extrude, leaving the tool
active and producing no geometry.

### Required Fix

After the rectangle Enter, snapshot the face count:

```js
const adapter = window.SUCypress.getAdapter("stats");
const before = adapter.getStats().num_faces; // captured before ACTIVATE_RECTANGLE
// ... draw rectangle ...
const after = adapter.getStats().num_faces;
if (after <= before) throw new Error("Rectangle step produced no new face");
```

Capture `before` just prior to `ACTIVATE_RECTANGLE`. After `Enter`, wait 200 ms
for SketchUp to commit the geometry before reading `after`. If the count did not
increase, abort and report the failure rather than proceeding to push-pull with
a dangling tool.

---

## Bug 5 — coordinate-based drawing fails when the projected target is off-screen

**Severity: High** — breaks large-coordinate architectural workflows even when the
projection math itself is correct.

**Affected commands:** `draw rectangle`, `draw circle`, `draw line`, `push-pull`,
`draw wall`, `draw box`

### Symptom

Large-coordinate creation fails with generic geometry errors such as:

```text
Error: Push-pull produced no new geometry.
Error: Push-pull step produced no new geometry.
```

Typical reproductions from the customer report:

```bash
sketchup-cli draw box 0 12485 0 14900 415 2400
sketchup-cli draw box 0 0 0 14900 12900 100
sketchup-cli draw rectangle 0 0 0 14900 12900
sketchup-cli push-pull 7450 6450 0 100
```

### Root Cause

These commands project model-space coordinates to screen-space and click them with
Playwright. The code assumes that a valid projection is also a valid click target.
That is false when the current camera does not frame the target region.

There are two distinct problems:

1. **No viewport bounds check** before clicking a projected point
2. **Face-center targeting** in `draw wall` and `draw box`, which makes large faces
   fail even when the start corner is visible

### Required Fix

**Part A — validate all projected click targets.**

Before every projected click, require the point to be safely inside the canvas.
If not, abort with a dedicated visibility error instead of a geometry error.

**Part B — use inset face targeting for composed extrusions.**

For `draw box` and `draw wall`, click an interior point near the first successful
corner instead of the face center.

**Part C — add camera preparation.**

High-level ground-plane drawing commands should standardize on a predictable camera
(`PARALLEL_PROJECTION` + `VIEW_TOP`) and re-check visibility before the click.

**Part D — pursue planned-bounds camera fit and/or programmatic geometry.**

Long-term reliability requires either:

- a camera helper that can frame future geometry bounds, or
- direct geometry creation APIs that bypass viewport clicks entirely

Detailed requirements are in `Specs/12_VIEWPORT_TARGETING_AND_CAMERA_FIT.md`.

### Implementation Status

Implemented in CLI code:

- shared canvas-bounds validation before every projection-driven click
- dedicated visibility errors instead of generic downstream push-pull noise
- inset face targeting for `draw wall` and `draw box`
- direct planned-bounds camera fit for ground-plane rectangle/circle/box/wall creation via `Module.setViewMatrix` + `Module.setOrthographicViewExtents`
- deterministic extrusion camera prep via `VIEW_ISO` + `ACTIVATE_ZOOM_EXTENTS`
- previous camera restoration after draw/extrusion commands via `Module.getCameraRestorationData` + `Module.setCameraFromRestorationData`

Still open:

- broader camera-fit support beyond the current ground-plane/top-view strategy
- any future non-viewport geometry backend

---

## Summary Table

| #   | Component                                                         | Severity | Status       |
| --- | ----------------------------------------------------------------- | -------- | ------------ |
| 1   | `projectScript` — wrong matrix inverse, wrong sign, mm vs inches  | Critical | ✅ Implemented |
| 2   | `new` command + `checkSession` — home-page detection wrong        | High     | ✅ Implemented |
| 3   | `draw wall` — rectangle orientation not controlled                | Medium   | ✅ Implemented |
| 4   | `draw wall` / `draw box` — no success check between steps         | Medium   | ✅ Implemented |
| 5   | Coordinate-based drawing — no viewport validation / face-center targeting | High | ✅ Implemented (planned-bounds fit still open) |

---

## Questions / Open Topics — RESOLVED 2026-03-15

**Q1 — Bug 1 axis sign ✅ RESOLVED**

Tested with the corrected matrix inversion. Variant A (`screenX = (ndcX+1)/2 * width`,
no flip) is correct. The origin projected to screen `(385, 480)`, matching the
red/green/blue axis marker visible in the screenshot. The spec's step 4 formula must
be updated — remove the `(1 - …)` inversion:

```js
// CORRECT (Variant A — no X flip):
const screenX = rect.left + (ndcX + 1) / 2 * rect.width;
const screenY = rect.top  + (1 - ndcY) / 2 * rect.height;
```

Also confirmed: **`projectScript` inputs must be in inches**, not mm. SketchUp's
internal unit is always inches regardless of the display unit setting. All callers
that currently pass mm values (e.g. `draw wall "0,0" "5000,0"`) must divide by 25.4
before passing to `projectScript`. Empirical check: `projectScript(1000/25.4, 0, 0)`
(= 1m along red axis) projected to `(483, 493)` — visually correct; a rectangle
drawn from that click appeared at the expected model-space position.

**Q2 — Does the Rectangle tool VCB accept absolute coordinates? ✅ RESOLVED — No**

The Rectangle tool VCB only accepts **relative dimensions** (`width,height`), not
absolute second-corner coordinates. The typed values define the size of the rectangle
from the first click point outward in the direction of the mouse. There is no
absolute-coordinate input mode for the Rectangle tool (unlike the Line tool).

Consequence for Bug 3: the absolute-endpoint approach is off the table. The correct
fix is to project the wall direction vector to screen space (using the now-working
`projectScript`) and pass it as the `dispatchMousemove` offset so the VCB
`"length,thickness"` is interpreted along the right axes. See Bug 3 Required Fix.

**Q3 — Save Changes dialog labels ✅ RESOLVED**

Dialog title: **"Save Changes"**. Body: "Save changes to the current model?".
Buttons: **"Don't Save"** and **"Save"** (no Cancel/Discard). To auto-dismiss when
creating a new model, find the button whose `innerText` contains `"Don"` and click it:

```js
const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Don'));
if (btn) btn.click();
```

**Q4 — Webpack probe accumulates array entries ✅ RESOLVED — cache required**

Each `chunk.push(...)` call appends one entry to the array regardless of key
uniqueness. 10 calls grew the array by 10. The probe must not run on every
`checkSession` call. Fix: reuse the `window.__skuMod` cache that `INJECT_MOD`
already sets:

```js
// In daemon.js checkSession — safe version:
const isEditorReady = await page.evaluate(() => {
  try {
    if (typeof window.SUCypress === 'undefined') return false;
    // Reuse cached module if available (INJECT_MOD sets window.__skuMod)
    if (window.__skuMod) return typeof window.__skuMod.nMW === 'function';
    // Cold check — only runs until first command warms the cache
    const chunk = window.webpackChunksketchup_web_frontend;
    let wp; chunk.push([['__cli_chk'], {}, r => { wp = r; }]);
    if (typeof wp !== 'function') return false;
    return typeof wp(83217)?.nMW === 'function';
  } catch { return false; }
});
```

---

## What DID Work (confirmed in this session)

- Starting a session from the home page via "Create new" button click
- Switching to top view (`VIEW_TOP`) and zoom extents (`ACTIVATE_ZOOM_EXTENTS`)
- Rectangle tool activated, fixed screen-position click, VCB `5000,250`, Enter
- Push-pull activated, fixed screen-position click, VCB `2500`, Enter
- All of the above produce correct geometry at correct mm dimensions (confirmed
  by "Distance 2500 mm" in VCB and visual inspection)
- Model units are **millimeters** for the default new model

---

## Decisions

- **Bug 1 — mm/inch conversion at call sites, not in `projectScript`:** The spec requires
  `projectScript` inputs in inches. Rather than adding auto-conversion inside
  `projectScript` (which would silently assume all callers use mm), each caller
  explicitly divides by 25.4. This keeps the projection function unit-agnostic and
  makes the conversion visible at every call site.

- **Bug 2 — `checkSession` uses `__skuMod` cache first:** Per Q4 resolution, the webpack
  probe can accumulate array entries. The fix checks the `window.__skuMod` cache (set by
  `INJECT_MOD`) before falling back to a cold probe. This avoids the array-growth issue
  on repeated `checkSession` calls.

- **Bug 2 — dialog dismissal in polling loop:** The "Save changes?" dialog is dismissed
  inside the wait loop (not as a one-shot before it), because the dialog may appear at any
  point during the model transition. Errors during polling are caught and ignored since the
  page may be mid-navigation.

- **Bug 4 — 200ms delay before face count check:** SketchUp needs a brief moment to commit
  geometry after the VCB Enter keystroke. 200ms matches the spec's recommendation and
  balances reliability against responsiveness.
