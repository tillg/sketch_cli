# sketchup-cli: `draw box` fails on large coordinates

## Goal

Build the Frechenlehen Erdgeschoss (ground floor) from `erdgeschoss_elements.json` — a 14.9m x 12.9m floor plan with 18 walls, openings, and features. All dimensions in millimeters.

## What I did

### 1. Reinstalled sketchup-cli

```
cd /Users/tgartner/git/sketchup_cli && npm install && npm link
```

Worked fine.

### 2. Started session and opened new model

```
sketchup-cli session start   # OK
sketchup-cli new              # OK
```

### 3. Attempted to draw walls

**Small box succeeds:**
```
sketchup-cli draw box 0 0 0 5000 415 2400   # OK (silent success)
```

**Large box fails:**
```
sketchup-cli draw box 0 12485 0 14900 415 2400
# Error: Push-pull step produced no new geometry.

sketchup-cli draw box 0 0 0 14900 12900 100
# Error: Push-pull step produced no new geometry.

sketchup-cli draw box 0 5000 0 14900 415 2400
# Error: Push-pull step produced no new geometry.
```

**Even a raw rectangle + manual push-pull fails at scale:**
```
sketchup-cli draw rectangle 0 0 0 14900 12900   # OK (rectangle drawn)
sketchup-cli zoom extents                         # OK
sketchup-cli push-pull 7450 6450 0 100            # Error: Push-pull produced no new geometry.
```

**Tried different views first — still fails:**
```
sketchup-cli new && sketchup-cli view top && sketchup-cli draw box 0 0 0 14900 12900 100
# Error: Push-pull step produced no new geometry.
```

### 4. Investigated the source code

Read `src/commands/draw.js` and `src/api/module83217.js` to understand why.

## Root cause analysis

The `draw box` command works by:

1. **Projects** the 3D origin point to **screen coordinates** using the camera matrix (`projectScript`)
2. **Mouse-clicks** at that screen position to start the rectangle
3. **Mouse-moves** a small offset (80px) to establish the drawing direction
4. **Types** the dimensions into the VCB (Value Control Box) and presses Enter
5. **Projects** the face center to screen coordinates
6. **Mouse-clicks** at the face center to start push-pull
7. **Mouse-moves** upward and types the height

**The problem:** Steps 1, 2, 5, and 6 all rely on projecting model-space coordinates to screen-space pixels. When the model coordinates are large (e.g. x=14900mm, y=12485mm), the projected screen position lands **off-screen** or outside the canvas bounds. The mouse click either misses entirely or hits the wrong UI element.

Specifically:
- The initial camera on a new model is positioned near the origin and shows roughly a ~5m radius
- 14900mm = ~15m, so coordinates beyond ~5000mm from origin project off-screen
- Even after `zoom extents`, the push-pull face-center projection can still miss because the camera frustum doesn't encompass the new geometry well enough
- The `view top` command doesn't help because it doesn't zoom to fit — it just changes angle

## What would fix this

### Option A: Auto-zoom before each draw operation
Before drawing, the command could:
1. Calculate the bounding box of the geometry about to be drawn
2. Set the camera to encompass that area (parallel projection, top-down, with margin)
3. Draw the geometry
4. Restore the original camera

### Option B: Programmatic geometry creation via `run-script`
Bypass the viewport entirely. SketchUp Web's `Module` likely exposes geometry creation APIs (similar to the Ruby API's `Entities.add_face` / `Entities.add_group`). A `draw box` could call these directly instead of simulating mouse clicks.

This would be:
- More reliable (no viewport dependency)
- Faster (no mouse move/click/sleep overhead)
- Scale-independent (works for any coordinate range)

### Option C: `draw box --programmatic` flag
Keep the current mouse-based approach as default but add a flag that uses direct API calls.

### Option D: Built-in "build from JSON" command
For architectural workflows, a command like:
```
sketchup-cli build <json-file>
```
that reads a structured JSON (walls, openings, features) and creates all geometry in one batch via the programmatic API would be very powerful.

## The JSON file I was trying to build

`erdgeschoss_elements.json` contains:
- **18 walls** (4 exterior + 14 interior) with x, y, width, depth, height in mm
- **20 openings** (12 windows + 8 doors) with wall references, offsets, and dimensions
- **3 features** (staircase, Kachelofen, chimney) with approximate positions
- Full dimension verification data

The overall building footprint is **14,900mm x 12,900mm** with 2,400mm ceiling height.

## Environment

- macOS Darwin 25.3.0
- sketchup-cli 0.1.0 (npm-linked from ~/git/sketchup_cli)
- Node v22.13.1
- SketchUp Web (app.sketchup.com) via Playwright
