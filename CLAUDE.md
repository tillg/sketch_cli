# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`sketchup_cli` is a CLI tool that programmatically controls SketchUp Web (`app.sketchup.com`) via Playwright browser automation. It injects JavaScript into the running SketchUp app to invoke internal APIs without clicking UI elements.

## Development Status

This is a spec-first project. The `Specs/` directory contains the authoritative reference for all API discoveries and command status. No build system or `package.json` exists yet — the immediate next step is to create a Node.js project with `commander` and `playwright` as dependencies.

## Architecture

### Entry Point into SketchUp's APIs

SketchUp Web is a webpack bundle. The primary access pattern:

```js
// Inject webpack require hook to get module 83217
const chunk = window.webpackChunksketchup_web_frontend;
let wpRequire;
chunk.push([['probe'], {}, (r) => { wpRequire = r; }]);
const mod = wpRequire(83217);
```

Module 83217 exposes:
- `mod.nMW(commandId)` — dispatch any of the 176 YFS commands
- `mod.YFS` — enum mapping command names → IDs (edit, view, tools, file/export operations)
- `mod.rYl()` — camera transform (4×4 matrix)
- `mod.AT7()` — bounding box extents
- `mod.pn1()` — WebEnvironmentManager (scenes)

### High-Level Adapter API

```js
const adapter = window.SUCypress.getAdapter('adapterName');
```

Adapters: `selection`, `tags`, `runCommand`, `tcFileOperations`, `fileDescription`, `sidebar`, `stats`, `fileSystem`, `performance`, `preferences`

### Geometry Inspection (Emscripten / `window.Module`)

```js
const root = Module.WebOutliner_GetRootNode("");  // "" is the required argument
```

Node methods: `getId()`, `getName()`, `getType()`, `numChildren()`, `getChildren()`, `isVisible()`, `isLocked()`, `setVisible(bool)`, `setLocked(bool)`

Selection: `Module.WebOutliner_AddToSelectionSet(node)`, `Module.WebOutliner_ClearSelectionSet()`

### Face Geometry via STL Export

Intercept blob before triggering export to capture binary geometry:

```js
const orig = URL.createObjectURL;
URL.createObjectURL = (blob) => { /* capture blob */ return orig(blob); };
mod.nMW(mod.YFS.EXPORT_STL);
```

Binary STL format: 80-byte header + uint32 triangle count + 50 bytes/triangle (3×float32 normal + 9×float32 vertices + 2-byte attrib).

### Authentication

OAuth 2.0 against Trimble's identity provider. Spawn a local HTTP server for the callback redirect; cache the token to avoid repeated logins.

## Specs Reference

| File | Contents |
|------|----------|
| `Specs/01_BASIC_ARCHITECTURE.md` | Stack overview, example command patterns |
| `Specs/02_API_EXPLORATION.md` | All adapters, module 83217 deep dive, proven code snippets |
| `Specs/03_CLI_COMMANDS.md` | 80+ commands with ✅/🔬/❌ status |
| `Specs/04_GEOMETRY_INSPECTION_PLAN.md` | Entity tree API, discovery decisions, success criteria |

## Decision Convention

The user marks inline decisions and comments in spec files with `->` (e.g. `-> we go for v2 right away`).

When digesting these:
1. Integrate the decision into **all affected spec files** — not just the file where the `->` comment appears.
2. Remove the `->` comment from the file once integrated.
3. Remove descriptions of any alternatives that were **rejected** by the decision — don't leave dead text explaining options we won't take.
4. Update `Specs/OPEN_QUESTIONS.md` to record what was decided and where it was propagated.

## Safety Rule

**Never test geometry-creation or editing APIs on the user's real architectural plans.** Always use a blank model or the file named "Test". Create a blank model via `File → New` or `mod.nMW(mod.YFS.NEW_FILE)`. Undo accidental edits with `mod.nMW(mod.YFS.UNDO)`.

## Orphaned Chrome Sessions

If Playwright leaves a hanging Chrome process:

```bash
pkill -f "chrome.*sketchup"
# or
ps aux | grep chrome | grep sketchup
kill <pid>
```
