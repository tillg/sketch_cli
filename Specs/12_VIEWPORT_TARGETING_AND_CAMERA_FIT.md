# Viewport Targeting and Camera Fit for Coordinate-Based Drawing

> **Status: DRAFT — added 2026-03-15 from customer failure log + code review**

---

## Problem Statement

The current geometry-creation commands are still **viewport-dependent** even though
they accept model-space coordinates. They convert those coordinates to screen pixels
with `projectScript(...)`, then perform trusted Playwright mouse clicks.

This works only when the target point is already visible inside the current canvas.
For large coordinates or large faces, the projected point can land outside the canvas
or close enough to the edge that the click misses the intended entity.

Observed customer failures:

```bash
sketchup-cli draw box 0 12485 0 14900 415 2400
sketchup-cli draw box 0 0 0 14900 12900 100
sketchup-cli draw rectangle 0 0 0 14900 12900
sketchup-cli push-pull 7450 6450 0 100
```

Small geometry near the origin works. Large geometry fails during push-pull with:

```text
Error: Push-pull step produced no new geometry.
```

That message is downstream noise. The real failure is usually that the click target
was not visible in the viewport.

---

## Affected Commands

### Directly affected now

- `draw rectangle <x> <y> <z> <width> <height>`
- `draw circle <x> <y> <z> <radius>`
- `draw line <x1,y1,z1> <x2,y2,z2>`
- `push-pull <x> <y> <z> <distance>`
- `draw wall <x1,y1> <x2,y2> <height> <thickness>`
- `draw box <x> <y> <z> <w> <d> <h>`

### Indirectly affected

- Any future command that targets raw geometry by projected model-space click
- Any high-level "build from JSON" workflow built on `draw wall`, `draw box`, or `push-pull`

---

## Root Cause

The projection math in `projectScript(...)` can be correct while the overall command
still fails.

The missing assumption is:

> **A projected screen point is usable only if the target is actually visible inside
> the current viewport and is safely inside the canvas bounds.**

Current implementation gaps:

1. **No visibility guard before clicking.**
   The command projects a point and clicks it without checking whether it is within
   the canvas rectangle with a safety margin.

2. **`draw box` clicks the face center during push-pull.**
   The code comment says "click near origin of the face", but the implementation
   clicks `(boxX + boxW/2, boxY + boxD/2, boxZ)` — the center of the face. On a
   large rectangle, the center may be off-screen even when the rectangle's origin is visible.

3. **`draw wall` has the same large-face issue.**
   It clicks the face center of the wall base before push-pull. Long walls can place
   that center outside the viewport.

4. **No camera preparation for planned geometry.**
   `zoom extents` only frames geometry that already exists. It does not help before
   the initial click for new geometry located far from the origin, and it does not
   guarantee that a large face center will be visible after creation.

---

## Required Behavior

### R1 — Validate every projected click target

Before any `page.mouse.click(x, y)` driven by model-space projection:

- Read the canvas bounds via `getBoundingClientRect()`
- Require the point to be inside the canvas with a fixed margin (recommendation: 16 px)
- If not, abort before clicking with a dedicated visibility error

This applies to:

- first click of `draw rectangle`
- center click of `draw circle`
- both clicks of `draw line`
- face click of `push-pull`
- all composed steps in `draw wall` and `draw box`

Recommended helper contract:

```js
function validateCanvasTarget(label, point, canvasRect, margin = 16) {
  const inside =
    point.x >= canvasRect.left + margin &&
    point.x <= canvasRect.right - margin &&
    point.y >= canvasRect.top + margin &&
    point.y <= canvasRect.bottom - margin;

  if (!inside) {
    throw new Error(`${label} is outside the visible viewport`);
  }
}
```

### R2 — Use an inset face point, not the face center

For composed commands that create a face and immediately extrude it, the push-pull
click must target an **interior point near the visible starting corner**, not the
geometric center.

This keeps the second click close to the first click that already succeeded.

#### `draw box`

After the rectangle base is created, compute a push-pull target inside the face:

```js
const insetX = Math.min(Math.max(Math.abs(boxW) * 0.1, 10), Math.abs(boxW) / 2);
const insetY = Math.min(Math.max(Math.abs(boxD) * 0.1, 10), Math.abs(boxD) / 2);

const faceX = boxX + widthSign * insetX;
const faceY = boxY + depthSign * insetY;
const faceZ = boxZ;
```

Then project `(faceX, faceY, faceZ)` instead of the face center.

#### `draw wall`

After the wall rectangle is created, compute a point near the start end of the wall:

```js
const insetAlong = Math.min(Math.max(w * 0.1, 10), w / 2);
const insetAcross = Math.min(Math.max(Math.abs(t) * 0.5, 5), Math.abs(t));

const faceX = x1 + (dx / w) * insetAlong + perpWX * insetAcross;
const faceY = y1 + (dy / w) * insetAlong + perpWY * insetAcross;
```

Then project `(faceX, faceY, 0)` instead of the wall-face center.

### R3 — Distinguish visibility failure from geometry failure

Do not report:

```text
Push-pull produced no new geometry.
```

when the projected click target was outside the canvas.

Instead report a dedicated error:

```text
Error: Push-pull target is outside the visible viewport.
The face point at model coordinates (7450, 6450, 0) is not safely clickable.
```

This is important for user trust and for support diagnostics.

### R4 — Add camera preparation as a first-class step

Coordinate-based drawing commands need a camera strategy, not just projection.

Short-term requirement:

- Standardize on a deterministic drawing camera where possible:
  - `projection parallel`
  - `view top` for ground-plane rectangle/circle/box/wall creation
- Use that camera before rectangle creation in high-level commands
- Re-check target visibility after camera change

Medium-term requirement:

- Add a helper that frames a **planned bounding box**, not only existing model extents
- The helper should accept future geometry bounds and place the camera so the target
  region fits inside the canvas with margin
- Restore the previous camera after scripted draw/extrusion commands when practical
- If SketchUp exposes a direct camera-set API, use it; otherwise continue exploring
  internal modules until such control is found

### R5 — Keep the viewport-dependent path explicit in the spec

Until a planned-bounds camera-fit helper or true programmatic geometry API exists,
the command specs must state this limitation explicitly:

- `draw rectangle`, `draw circle`, `draw line`, `push-pull` are reliable only when
  the target point is visible in the current viewport
- `draw wall` and `draw box` must use inset targeting to reduce this problem, but
  are still not fully viewport-independent

---

## Implementation Plan

### Phase 1 — Correctness and diagnostics

1. Add a shared `getCanvasRect` / `validateCanvasTarget` helper
2. Validate every projected click before clicking
3. Change `draw box` push-pull targeting from face center to inset point
4. Change `draw wall` push-pull targeting from face center to inset point
5. Emit dedicated visibility errors instead of generic "no new geometry"

### Phase 2 — Deterministic camera setup

1. For box/wall creation, switch to parallel top view before the rectangle step
2. Re-project and validate after the camera change
3. If the target still does not fit, abort with the new visibility error

### Phase 3 — Planned-bounds camera fit

1. Discover a direct camera setter or equivalent internal API
2. Implement `fitPlannedBounds(bounds, margin)`
3. Use it before first-click operations on large-coordinate geometry
4. Restore the previous camera when practical ✅ implemented for scripted draw/extrusion commands

### Phase 4 — Programmatic geometry creation

1. Explore whether `window.Module` exposes direct face / group / solid creation
2. If viable, add a programmatic geometry backend
3. Build high-level architectural workflows on that backend instead of viewport clicks

---

## Acceptance Criteria

The following scenarios must succeed on a blank/Test model:

```bash
sketchup-cli new
sketchup-cli draw box 0 12485 0 14900 415 2400

sketchup-cli new
sketchup-cli draw box 0 0 0 14900 12900 100

sketchup-cli new
sketchup-cli draw rectangle 0 0 0 14900 12900
sketchup-cli push-pull 7450 6450 0 100
```

If any target is not visible, the command must fail **before clicking** with a
visibility-specific error.

---

## Non-Goals

- This spec does **not** require programmatic geometry creation immediately
- This spec does **not** promise arbitrary hidden-face targeting
- This spec does **not** remove the need for trusted Playwright clicks in the current backend

---

## Related Specs

- `Specs/03_CLI_COMMANDS.md` — command status and limitations
- `Specs/05_GEOMETRY_CREATION.md` — coordinate projection and face targeting sequences
- `Specs/09_ERROR_HANDLING.md` — visibility-specific user-facing errors
- `Specs/11_BUGS_AND_FIXES.md` — customer-reported bug summary and required fixes
