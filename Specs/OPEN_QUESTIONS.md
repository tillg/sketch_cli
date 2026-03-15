# Open Questions & Unresolved Items

Work through this file top-to-bottom. For each item: run a live browser session
to prove/disprove, document the result in the relevant spec file, then check the
item off.

---

## A — Architecture Decisions

- [x] **A2: VCB keyboard input** — ✅ RESOLVED. Full proven sequence documented
      in `Specs/05_GEOMETRY_CREATION.md`:
  - `Module.onKeyDown({physicalKey, inputChar, keyCode})` for digits/comma
  - `Module.isVCBTrigger(13)` returns `false` — Enter uses Playwright
    `browser_press_key('Enter')`
  - **Critical: a `mousemove` event MUST be dispatched between first click and
    VCB input**

- [x] **A3: Face targeting** — ✅ RESOLVED (partially).
  - Option 1 (ID-based via Outliner) works for Groups and ComponentInstances.
  - Option 2 (coordinate-based canvas click) works for raw faces using estimated
    screen coordinates in a known view (ISO/top).
  - Use `browser_run_code` with `page.mouse.click(x, y)` for trusted clicks at
    exact coordinates.
  - Cross-session ID stability: IDs appear stable within a session; not tested
    across sessions.

- [x] **A4: Planned-bounds camera fit for coordinate drawing** — ✅ RESOLVED for
      the current ground-plane workflow. `Module.setViewMatrix(...)` and
      `Module.setOrthographicViewExtents(...)` can frame planned XY bounds before
      the first click. This is now used by the CLI for ground-plane rectangle,
      circle, wall, and box creation. Broader non-ground-plane camera strategies
      remain follow-up work in `Specs/12_VIEWPORT_TARGETING_AND_CAMERA_FIT.md`.

---

## B — Unproven Commands (need live browser verification)

Run against the **Test** model (never the real plans). Once proven, update
`Specs/03_CLI_COMMANDS.md` (🔬 → ✅ or ❌) and add working code to the relevant
spec.

### Inspection

- [x] **B1: `materials`** — ✅ RESOLVED.
      `new Module.WebMaterialBrowser().getInModelMaterials()` returns an
      Emscripten vector. Each item has `.getName()`. Documented in
      `02_API_EXPLORATION.md`.
- [x] **B2: `components`** — ✅ RESOLVED.
      `new Module.WebComponentBrowser().getInModelComponents()` returns an
      Emscripten vector. Each item has `.getDefinitionName()`. Documented in
      `02_API_EXPLORATION.md`.
- [x] **B3: `scenes`** — ✅ RESOLVED. Scenes are in the Vuex store:
      `wpRequire(96459).store.state.scenes.scenes`. Activate via
      `store.dispatch('activateScene', index)` or `scene.activate()`.
      `mod.pn1()` is NOT the scenes manager — it's the Environment
      (lighting/HDR) manager. Documented in `02_API_EXPLORATION.md`.
- [x] **B4: `outliner` deep hierarchy** — ✅ RESOLVED. Recursive Outliner
      traversal works reliably on all tested models. No memory/recursion issues
      observed.

### Geometry Creation

- [x] **B5: `draw circle`** — ✅ RESOLVED. Same VCB approach as rectangle.
      Sequence: `ACTIVATE_CIRCLE` → trusted click (center) → mousemove → type
      radius via `Module.onKeyDown` → `browser_press_key('Enter')`.
- [x] **B6: `draw line`** — ✅ RESOLVED. Requires two trusted canvas clicks
      (start + end) via `browser_run_code` → `page.mouse.click(x, y)`. VCB
      absolute-coordinate input was not tested; 2-click approach is proven.
- [x] **B7: `push-pull`** — ✅ RESOLVED. Sequence: `ACTIVATE_PUSH_PULL` →
      trusted click at face screen coordinate → mousemove → type distance →
      `browser_press_key('Enter')`. Face targeting via estimated screen
      coordinates works for clearly visible faces.
- [ ] **B15: Large-coordinate draw regression** — Prove the large-coordinate cases
      from the customer log on a blank/Test model after viewport-targeting fixes:
      `draw box 0 12485 0 14900 415 2400`, `draw box 0 0 0 14900 12900 100`, and
      `draw rectangle 0 0 0 14900 12900` + `push-pull 7450 6450 0 100`. Document in
      `Specs/12_VIEWPORT_TARGETING_AND_CAMERA_FIT.md` and update `03_CLI_COMMANDS.md`.

### Edit / Transform

- [x] **B8: `move`** — ✅ RESOLVED. Sequence: pre-select via Outliner →
      `ACTIVATE_MOVE` → trusted click → mousemove (establishes axis direction) →
      type plain distance (NOT a vector) → `browser_press_key('Enter')`. VCB
      accepts only a scalar distance; SketchUp auto-constrains to the closest
      axis from the mousemove direction. Documented in
      `05_GEOMETRY_CREATION.md`.
- [x] **B9: `rotate`** — ✅ RESOLVED. Requires 3 trusted `page.mouse.click`
      calls via `browser_run_code`: click 1=pivot, click 2=reference arm (MUST
      differ from pivot), then mousemove to show rotation angle, then type
      degrees via `Module.onKeyDown`, then `browser_press_key('Enter')`.
      Synthetic `dispatchEvent` clicks do NOT advance rotate tool state.
      Documented in `05_GEOMETRY_CREATION.md`.
- [x] **B10: `scale`** — ✅ RESOLVED. `ACTIVATE_SCALE` shows green grip squares
      on entity bounding box. Click a grip → VCB shows current scale factor(s)
      revealing how many values to type. Corner grip in 2D shows "1.00,1.00" →
      type "2,2". Edge midpoint shows "1.00" → type "2". Wrong number of values
      → "Invalid Scale Input" dialog. Documented in `05_GEOMETRY_CREATION.md`.
- [x] **B11: `flip`** — ✅ RESOLVED. `ACTIVATE_FLIP_TOOL` shows colored flip
      planes. Arrow Keys (ArrowLeft/ArrowRight) cycle through Red/Green/Blue
      axis planes. Canvas click confirms the flip. No VCB input needed.
      Documented in `05_GEOMETRY_CREATION.md`.

### Tags

- [x] **B12: `tag create`** — ✅ RESOLVED. `browser.addTag()` (ZERO arguments —
      passing a name string throws). Then: `browser.setName(tagObj, 'name')`
      passing the full tag object (NOT `tag.entityPtr`). Documented in
      `02_API_EXPLORATION.md`.
- [x] **B13: `tag hide/show`** — ✅ RESOLVED.
      `browser.setVisibilityForTag(tagObj, false)` to hide, `(tagObj, true)` to
      show. Pass the full tag object from `browser.getAllTags().get(i)`.
      Documented in `02_API_EXPLORATION.md`.

### Scene Navigation

- [x] **B14: `scene activate`** — ✅ RESOLVED.
      `wpRequire(96459).store.dispatch('activateScene', index)` or
      `scenes[index].activate()`. Documented in `02_API_EXPLORATION.md`.

---

## C — Spec Drafts Needing Review

- [x] **C1: `Specs/05_GEOMETRY_CREATION.md`** — Updated 2026-03-13 with all
      proven sequences. VCB input proposals confirmed. Face targeting via
      coordinate click confirmed. Mousemove requirement documented.
- [x] **C4: `Specs/08_PROJECT_STRUCTURE.md`** — Decided: daemon from the start
      (no v1 phase). v1/v2 table removed. Propagated to
      `01_BASIC_ARCHITECTURE.md` (removed v1 qualifier) and
      `07_AUTH_AND_SESSION.md` (removed v1 Simplification Option section,
      renamed session-restore heading to daemon context).
- [x] **C5: `Specs/09_ERROR_HANDLING.md`** — Finalized. Filled in Scenario 4
      dialog detection (live-tested DOM pattern). Added Scenario 5 (tool VCB
      format errors with blocking dialog, e.g. "Invalid Scale Input"). Renamed
      old Scenario 5→6. Added `checkSession` implementation to the code section.
      Removed DRAFT status.

---

## D — Known Limitations to Document

- [x] **D1: Standalone edges** — Intentionally out of scope. Documented as a
      known limitation in `03_CLI_COMMANDS.md`: the `edges` command returns
      face-bounding edges only; standalone edges and guide lines are not included.
      Acceptable for the architectural floor plan use case.
- [x] **D2: SKP binary parsing fallback** — Not needed. Evaluated: all commands
      are fully covered by live APIs (STL for faces, Outliner for groups,
      WebMaterialBrowser/WebComponentBrowser, Vuex store for scenes, VCB for all
      editing). The only gap would be standalone edge topology, which is out of
      scope (D1). Documented in `02_API_EXPLORATION.md`.
- [x] **D3: Free vs. paid plan** — We only rely on the free plan. Documented in
      `03_CLI_COMMANDS.md`: STL and PNG exports are free; OBJ, FBX, DAE, and DWG
      require a paid upgrade (marked in the command table).

---

## Remaining Work (as of 2026-03-13)

| Item                             | Status                |
| -------------------------------- | --------------------- |
| ~~B9 Rotate~~                    | ✅ Proven             |
| ~~B10 Scale~~                    | ✅ Proven             |
| ~~B11 Flip~~                     | ✅ Proven             |
| ~~C4, C5 spec review~~           | ✅ Done               |
| ~~D1, D2, D3 limitations~~       | ✅ Done               |
| Implementation (Node.js project) | Not yet started       |
