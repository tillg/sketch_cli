# Project Structure

---

## Directory Layout

```
sketchup_cli/
├── package.json
├── bin/
│   └── sketchup-cli.js          # Entry point — shebang, commander root command
├── src/
│   ├── session/
│   │   ├── daemon.js            # Background process holding the Playwright browser
│   │   ├── client.js            # IPC client used by commands to talk to daemon
│   │   └── detect.js            # Readiness checks (SUCypress, Module available)
│   ├── browser/
│   │   ├── launch.js            # Playwright setup, storageState restore/save
│   │   └── evaluate.js          # page.evaluate() helpers + error wrapping
│   ├── api/
│   │   ├── module83217.js       # webpack chunk injection + mod.nMW wrapper
│   │   ├── outliner.js          # WebOutliner_* wrappers + tree traversal
│   │   ├── stl.js               # STL export blob intercept + binary parser
│   │   └── adapters.js          # SUCypress.getAdapter() wrappers
│   └── commands/
│       ├── session.js           # session start / status / stop
│       ├── inspect.js           # stats, info, extents, camera, selection
│       ├── geometry.js          # faces, edges, groups, outliner
│       ├── draw.js              # draw rectangle, circle, line
│       ├── edit.js              # select, delete, move, rotate, group, undo/redo, …
│       ├── view.js              # view, zoom, projection, style, screenshot
│       ├── tags.js              # tag list, create, select, hide, show
│       ├── export.js            # export stl/obj/fbx/png/dwg, download, save, open
│       └── solid.js             # solid union / intersect / subtract / trim / split
```

**Runtime state** (not in repo, created on first use):

```
~/.sketchup-cli/
├── session.json     # Playwright storageState (cookies + localStorage)
├── daemon.sock      # Unix socket for IPC
└── daemon.log       # Daemon process stdout/stderr
```

---

## Session Model

The CLI uses a **persistent daemon** that holds the Playwright browser open between commands. Commands connect to it via Unix socket IPC (<500ms per command after the first). The daemon is started automatically on first use and shut down explicitly with `sketchup-cli session stop`.

---

## package.json

```json
{
  "name": "sketchup-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "sketchup-cli": "./bin/sketchup-cli.js" },
  "dependencies": {
    "commander": "^12.0.0",
    "playwright": "^1.44.0"
  }
}
```

No build step — plain Node.js ESM. Minimum Node version: 18 (for `fetch`,
`structuredClone`, native ESM).

---

## Code Conventions

- Each `src/commands/*.js` file exports a `register(program)` function that
  attaches subcommands to the `commander` root.
- `src/api/*.js` files contain only `page.evaluate()` payloads — pure JS strings
  or serializable functions. No Playwright-specific code in `api/`.
- All `page.evaluate()` calls go through `src/browser/evaluate.js` which handles
  session-check and error wrapping uniformly.
- Output formatting (human-readable vs. JSON) is handled in command files, not
  in API files. API files return plain JS objects.
