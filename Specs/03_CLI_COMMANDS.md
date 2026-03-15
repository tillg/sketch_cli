# SketchUp CLI — Command Reference

All commands assume a model is open in `app.sketchup.com` (via the running Playwright session).

---

## Inspection Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli stats` | Print model statistics (edge/face/component/material counts, units) | `Module.getModelInfo().stats` | ✅ Proven |
| `sketchup-cli info` | File metadata: name, file path, version | `Module.GetModelFilePath()`, `Module.GetModelVersion()`, `Module.getModelInfo()` | ✅ Proven |
| `sketchup-cli extents` | Model bounding box (min/max XYZ) | `mod.AT7()` | ✅ Proven |
| `sketchup-cli camera` | Current camera transform matrix and field of view | `mod.rYl()` (4×4 matrix), `mod.jzI()` (FOV degrees) | ✅ Proven |
| `sketchup-cli tags` | List all tags/layers with visibility state | `SUCypress.getAdapter('tags').browser` | ✅ Proven |
| `sketchup-cli materials` | List all material names | `new Module.WebMaterialBrowser().getInModelMaterials()` → `.getName()` per item | ✅ Proven |
| `sketchup-cli components` | List all component definition names | `new Module.WebComponentBrowser().getInModelComponents()` → `.getDefinitionName()` per item | ✅ Proven |
| `sketchup-cli scenes` | List all scenes/pages | `wpRequire(96459).store.state.scenes.scenes` (Vuex store, NOT `mod.pn1()`) | ✅ Proven |
| `sketchup-cli outliner` | Print model entity tree (groups, components, hierarchy) | `Module.WebOutliner_*` functions | ✅ Proven |
| `sketchup-cli selection` | Info about currently selected entities | `SUCypress.getAdapter('selection')` | ✅ Proven |

---

## View & Navigation Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli view top` | Switch to top view | `mod.nMW(mod.YFS.VIEW_TOP)` | ✅ Proven |
| `sketchup-cli view front` | Switch to front view | `mod.nMW(mod.YFS.VIEW_FRONT)` | ✅ Proven |
| `sketchup-cli view iso` | Switch to isometric view | `mod.nMW(mod.YFS.VIEW_ISO)` | ✅ Proven |
| `sketchup-cli view <back\|left\|right\|bottom>` | Other standard views | `mod.nMW(mod.YFS.VIEW_*)` | ✅ Proven |
| `sketchup-cli zoom extents` | Zoom to fit entire model | `mod.nMW(mod.YFS.ACTIVATE_ZOOM_EXTENTS)` | ✅ Proven |
| `sketchup-cli zoom selection` | Zoom to fit selection | `mod.nMW(mod.YFS.ACTIVATE_ZOOM_SELECTION)` | ✅ Proven |
| `sketchup-cli projection perspective` | Perspective projection | `mod.nMW(mod.YFS.PERSPECTIVE_PROJECTION)` | ✅ Proven |
| `sketchup-cli projection parallel` | Parallel/orthographic projection | `mod.nMW(mod.YFS.PARALLEL_PROJECTION)` | ✅ Proven |
| `sketchup-cli style <wireframe\|shaded\|textured\|xray>` | Set render style | `mod.nMW(mod.YFS.VIEW_WIREFRAME)` etc. | ✅ Proven |
| `sketchup-cli screenshot [--output file.png]` | Capture viewport as PNG | `mod.nMW(mod.YFS.EXPORT_PNG)` or Playwright screenshot | ✅ Proven |
| `sketchup-cli scene activate <name>` | Jump to a saved scene | `wpRequire(96459).store.dispatch('activateScene', index)` or `scene.activate()` | ✅ Proven |

---

## Drawing & Geometry Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli draw rectangle <x> <y> <z> <width> <height>` | Draw a rectangle face at given origin with exact dimensions | `ACTIVATE_RECTANGLE` + mouse click + `Module.onKeyDown` VCB input | ✅ Proven — ground-plane use fits planned bounds before clicking |
| `sketchup-cli draw circle <x> <y> <z> <radius> [--segments n]` | Draw a circle face | `ACTIVATE_CIRCLE` + mouse click + VCB input | ✅ Proven — ground-plane use fits planned bounds before clicking |
| `sketchup-cli draw line <x1,y1,z1> <x2,y2,z2>` | Draw a single line/edge | `ACTIVATE_PENCIL` + two canvas clicks (start + end point) via `page.mouse.click` | ✅ Proven — ground-plane use fits planned bounds before clicking; both endpoints must still be visible |
| `sketchup-cli push-pull <x> <y> <z> <distance>` | Extrude the face at given coordinate by distance | `ACTIVATE_PUSH_PULL` + canvas click at face coordinate + VCB distance | ✅ Proven — ground-plane use switches to ISO + zoom extents before clicking |
| `sketchup-cli draw wall <x1,y1> <x2,y2> <height> <thickness>` | High-level: draw a 3D wall (rectangle + push-pull) | Composed: `draw rectangle` + `push-pull` | ✅ Implemented — uses planned-bounds top fit, inset face targeting, and ISO extrusion prep |
| `sketchup-cli draw box <x> <y> <z> <w> <d> <h>` | High-level: draw a 3D box | Composed: `draw rectangle` + `push-pull` | ✅ Implemented — uses planned-bounds top fit, inset face targeting, and ISO extrusion prep |
| `sketchup-cli follow-me <profile-ref> <path-ref>` | Extrude a profile along a path | `ACTIVATE_FOLLOW_ME` | 🔬 Theoretical |
| `sketchup-cli intersect faces` | Intersect selected faces with model | `mod.nMW(mod.YFS.INTERSECT_FACES_WITH_MODEL)` | ✅ Proven |
| `sketchup-cli weld-edges` | Weld selected edges into a curve | `mod.nMW(mod.YFS.WELD_EDGES)` | ✅ Proven |
| `sketchup-cli reverse-faces` | Reverse face normals on selection | `mod.nMW(mod.YFS.REVERSE_FACES)` | ✅ Proven |
| `sketchup-cli orient-faces` | Orient all faces consistently | `mod.nMW(mod.YFS.ORIENT_FACES)` | ✅ Proven |

---

## Selection & Edit Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli select all` | Select all entities | `mod.nMW(mod.YFS.EDIT_SELECT_ALL)` | ✅ Proven |
| `sketchup-cli select none` | Deselect everything | `mod.nMW(mod.YFS.EDIT_SELECT_NONE)` | ✅ Proven |
| `sketchup-cli select invert` | Invert selection | `mod.nMW(mod.YFS.EDIT_INVERT_SELECTION)` | ✅ Proven |
| `sketchup-cli select tag <name>` | Select all entities on a tag | `Module.SelectEntitiesByTagName(name)` | ✅ Proven |
| `sketchup-cli delete` | Delete selected entities | `mod.nMW(mod.YFS.EDIT_DELETE)` | ✅ Proven |
| `sketchup-cli delete guides` | Delete all guide lines | `mod.nMW(mod.YFS.EDIT_DELETE_GUIDES)` | ✅ Proven |
| `sketchup-cli move <dx,dy,dz>` | Move selected by vector | `ACTIVATE_MOVE` + trusted click + mousemove (sets axis) + VCB plain distance | ✅ Proven |
| `sketchup-cli rotate <angle> [--axis x\|y\|z]` | Rotate selected around axis | `ACTIVATE_ROTATE` + 3 `page.mouse.click` via `browser_run_code` (pivot, ref-arm, then angle via VCB) | ✅ Proven |
| `sketchup-cli scale <factor>` | Scale selected uniformly | `ACTIVATE_SCALE` → click visible grip → type factor(s) matching VCB count (corner="2,2", edge="2") | ✅ Proven |
| `sketchup-cli flip <x\|y\|z>` | Flip selected along axis | `ACTIVATE_FLIP_TOOL` → ArrowLeft/Right to cycle flip planes → canvas click to confirm | ✅ Proven |
| `sketchup-cli hide` | Hide selected entities | `mod.nMW(mod.YFS.EDIT_HIDE)` | ✅ Proven |
| `sketchup-cli show --last` | Unhide last hidden | `mod.nMW(mod.YFS.EDIT_UNHIDE_LAST)` | ✅ Proven |
| `sketchup-cli show --all` | Unhide all hidden entities | `mod.nMW(mod.YFS.EDIT_UNHIDE_ALL)` | ✅ Proven |
| `sketchup-cli lock` | Lock selected | `mod.nMW(mod.YFS.LOCK_SELECTED)` | ✅ Proven |
| `sketchup-cli unlock --all` | Unlock all | `mod.nMW(mod.YFS.EDIT_UNLOCK_ALL)` | ✅ Proven |
| `sketchup-cli group` | Group selected entities | `mod.nMW(mod.YFS.EDIT_MAKE_GROUP)` | ✅ Proven |
| `sketchup-cli make-component <name>` | Make component from selection | `mod.nMW(mod.YFS.EDIT_MAKE_COMPONENT)` | ✅ Proven |
| `sketchup-cli copy` | Copy selection to clipboard | `mod.nMW(mod.YFS.EDIT_COPY)` | ✅ Proven |
| `sketchup-cli paste-in-place` | Paste at original position | `mod.nMW(mod.YFS.EDIT_PASTE_IN_PLACE)` | ✅ Proven |
| `sketchup-cli undo [n]` | Undo last n operations (default 1) | `mod.nMW(mod.YFS.UNDO)` | ✅ Proven |
| `sketchup-cli redo [n]` | Redo last n operations | `mod.nMW(mod.YFS.REDO)` | ✅ Proven |
| `sketchup-cli purge` | Purge unused components, materials, layers | `mod.nMW(mod.YFS.PURGE_UNUSED)` | ✅ Proven |

---

## Tag / Layer Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli tag list` | List all tags with visibility/color | `SUCypress.getAdapter('tags').browser` | ✅ Proven |
| `sketchup-cli tag create <name>` | Create a new tag | `browser.addTag()` (no args!) then `browser.setName(tagObj, name)` | ✅ Proven |
| `sketchup-cli tag select <name>` | Select all entities on tag | `Module.SelectEntitiesByTagName(name)` | ✅ Proven |
| `sketchup-cli tag hide <name>` | Hide all entities on tag | `browser.setVisibilityForTag(tagObj, false)` | ✅ Proven |
| `sketchup-cli tag show <name>` | Show all entities on tag | `browser.setVisibilityForTag(tagObj, true)` | ✅ Proven |
| `sketchup-cli tag color-by-tag` | Toggle color-by-tag view mode | `mod.nMW(mod.YFS.VIEW_COLOR_BY_TAG)` | ✅ Proven |

---

## Export & File Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli export stl [--output file]` | Export as STL | `mod.nMW(mod.YFS.EXPORT_STL)` + file intercept | ✅ Proven — free plan |
| `sketchup-cli export obj [--output file]` | Export as OBJ | `mod.nMW(mod.YFS.EXPORT_OBJ)` | ✅ Proven — **paid plan required** |
| `sketchup-cli export fbx [--output file]` | Export as FBX | `mod.nMW(mod.YFS.EXPORT_FBX)` | ✅ Proven — **paid plan required** |
| `sketchup-cli export dae [--output file]` | Export as Collada (.dae) | `mod.nMW(mod.YFS.EXPORT_DAE)` | ✅ Proven — **paid plan required** |
| `sketchup-cli export dwg [--2d\|--3d] [--output file]` | Export as DWG (2D or 3D) | `mod.nMW(mod.YFS.EXPORT_DWG_2D/3D)` | ✅ Proven — **paid plan required** |
| `sketchup-cli export png [--output file]` | Export viewport as PNG | `mod.nMW(mod.YFS.EXPORT_PNG)` | ✅ Proven — free plan |
| `sketchup-cli download [--output file.skp]` | Download the .skp file | `mod.nMW(mod.YFS.DOWNLOAD_SKP)` | ✅ Proven |
| `sketchup-cli save` | Save model to cloud | `Module.IsSaveNeeded()` + save pipeline | ✅ Proven |
| `sketchup-cli save-as <name>` | Save copy under new name | `mod.nMW(mod.YFS.SAVE_AS)` | ✅ Proven |
| `sketchup-cli plans` | List all available plans/files in the Trimble Connect account | `SUCypress.getAdapter('tcFileOperations').getProjects()` | ✅ Proven |
| `sketchup-cli open <file-id>` | Open a model by file ID (use `plans` to discover IDs) | `tcFileOperations` + file open pipeline | ✅ Proven |
| `sketchup-cli new` | Open a new blank model | `mod.nMW(mod.YFS.NEW_MODEL)` | ✅ Proven |
| `sketchup-cli run-script <file.js>` | Execute arbitrary JS in the browser context | `page.evaluate()` | ✅ Proven |

---

## Solid / Boolean Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli solid union` | Boolean union of selected solid groups | `mod.nMW(mod.YFS.ACTIVATE_UNION)` | ✅ Proven |
| `sketchup-cli solid intersect` | Boolean intersection | `mod.nMW(mod.YFS.ACTIVATE_INTERSECT)` | ✅ Proven |
| `sketchup-cli solid subtract` | Boolean subtraction | `mod.nMW(mod.YFS.ACTIVATE_DIFFERENCE)` | ✅ Proven |
| `sketchup-cli solid trim` | Trim one solid with another | `mod.nMW(mod.YFS.ACTIVATE_TRIM)` | ✅ Proven |
| `sketchup-cli solid split` | Split solids | `mod.nMW(mod.YFS.ACTIVATE_SPLIT)` | ✅ Proven |
| `sketchup-cli solid outer-shell` | Outer shell operation | `mod.nMW(mod.YFS.ACTIVATE_OUTER_SHELL)` | ✅ Proven |

---

## Geometry Inspection Commands

| Command | Description | API Backing | Status |
|---------|-------------|-------------|--------|
| `sketchup-cli geometry list [--type face\|edge\|group]` | List all top-level entities with type and bounding box | `Module.WebOutliner_GetRootNode("")` + traversal | ✅ Proven |
| `sketchup-cli geometry get <id>` | Get full details for one entity (vertices, area, layer, material) | `WebOutliner_AddToSelectionSet` + `WebEntityInfo.getInstance()` | ✅ Proven |
| `sketchup-cli faces` | List all faces with area, normal vector, and vertices (triangulated) | `EXPORT_STL` + intercept blob + parse binary STL | ✅ Proven |
| `sketchup-cli edges` | List all edges with start/end coordinates and length | STL export blob → extract boundary edges (triangle edges appearing once = original face edges) | ✅ Proven — **face-bounding edges only**; standalone edges and guide lines are not included (known limitation, acceptable for architectural floor plan use case) |
| `sketchup-cli groups` | List all groups/components with name, ID, type, visibility, lock state | `Module.WebOutliner_GetRootNode("")` + node traversal | ✅ Proven |

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Proven | API call confirmed working in live browser session |
| 🔬 Theoretical | API identified but not yet tested end-to-end; may need additional wiring |
| ❌ Blocked | Requires API not yet mapped — needs further browser exploration |
