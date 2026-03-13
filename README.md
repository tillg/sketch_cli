# sketchup-cli

A command-line tool that programmatically controls **SketchUp Web** (`app.sketchup.com`) via Playwright browser automation. It injects JavaScript into the running SketchUp app to inspect geometry, modify models, and trigger exports — without clicking UI elements.

## How it works

`sketchup-cli` drives a real Chromium browser (headed, so you can see what happens). A background **daemon** process holds the browser open and listens on a Unix socket. Each CLI command connects to the daemon, sends a JSON-RPC call, and prints the result — round-trips are under 500 ms.

All model data is read via SketchUp's internal JavaScript APIs (`window.Module`, `window.SUCypress`, webpack module 83217). No SketchUp plugin or API key is needed.

## Requirements

- Node.js 18+
- A free [Trimble / SketchUp account](https://app.sketchup.com)

## Installation

```bash
git clone https://github.com/tillg/sketch_cli.git
cd sketch_cli
npm install
npm link          # makes `sketchup-cli` available globally
```

## Quick start

```bash
# 1. Start the daemon — opens a real browser window
sketchup-cli session start

# 2. Log in to app.sketchup.com if prompted, then open a model.
#    The CLI prints "Session ready." once a model is detected.

# 3. Run commands
sketchup-cli stats
sketchup-cli groups
sketchup-cli export stl --output mymodel.stl

# 4. Stop the daemon when done
sketchup-cli session stop
```

Session state (cookies) is saved to `~/.sketchup-cli/session.json`. On subsequent runs the browser auto-logs-in — no manual login needed until cookies expire.

## Command reference

### Session

| Command | Description |
|---------|-------------|
| `session start` | Open browser, wait for model, start daemon |
| `session status` | Check if session is active and a model is open |
| `session stop` | Close browser, shut down daemon |

### Inspection

| Command | Description |
|---------|-------------|
| `stats [--json]` | Edge/face/component/material counts and units |
| `info [--json]` | File name, path, version |
| `extents [--json]` | Model bounding box (min/max XYZ) |
| `camera [--json]` | Camera transform matrix and FOV |
| `materials [--json]` | List all material names |
| `components [--json]` | List all component definition names |
| `scenes [--json]` | List all saved scenes/pages |
| `selection [--json]` | Info about currently selected entities |

### Geometry

| Command | Description |
|---------|-------------|
| `faces [--json]` | All faces as triangles (normal + vertices), via STL export |
| `edges [--json]` | All face-bounding edges with start/end/length |
| `groups [--json]` | All groups and component instances |
| `outliner [--json]` | Full entity tree with hierarchy |

### View & navigation

| Command | Description |
|---------|-------------|
| `view <top\|front\|back\|left\|right\|bottom\|iso>` | Switch standard view |
| `zoom extents` | Zoom to fit entire model |
| `zoom selection` | Zoom to fit selection |
| `projection <perspective\|parallel>` | Set projection mode |
| `style <wireframe\|shaded\|textured\|xray>` | Set render style |
| `screenshot [--output file.png]` | Capture viewport as PNG |
| `scene activate <name>` | Jump to a saved scene |

### Drawing & geometry creation

| Command | Description |
|---------|-------------|
| `draw rectangle <x> <y> <z> <width> <height>` | Draw a rectangle face at origin |
| `draw circle <x> <y> <z> <radius>` | Draw a circle face |
| `draw line <x1,y1,z1> <x2,y2,z2>` | Draw a line/edge |
| `draw wall <x1,y1> <x2,y2> <height> <thickness>` | Draw a 3D wall |
| `draw box <x> <y> <z> <w> <d> <h>` | Draw a 3D box |
| `push-pull <x> <y> <z> <distance>` | Extrude face at coordinate |

Coordinates are in model units (mm for metric models).

### Selection & editing

| Command | Description |
|---------|-------------|
| `select all \| none \| invert` | Bulk selection |
| `select tag <name>` | Select all entities on a tag |
| `select id <id>` | Select entity by outliner ID |
| `delete` | Delete selected entities |
| `move <dx,dy,dz>` | Move selected by vector (e.g. `1000,0,0`) |
| `rotate <angle>` | Rotate selected by degrees |
| `scale <factors>` | Scale selected (e.g. `2`, `2,2`, `2,2,2`) |
| `flip <x\|y\|z>` | Flip selected along axis |
| `hide` / `show [--all]` | Hide or unhide entities |
| `lock` / `unlock` | Lock or unlock entities |
| `group` | Group selected entities |
| `make-component` | Make component from selection |
| `copy` / `paste-in-place` | Clipboard operations |
| `undo [n]` / `redo [n]` | Undo/redo n steps |
| `purge` | Purge unused components, materials, layers |
| `intersect-faces` / `weld-edges` / `reverse-faces` / `orient-faces` | Mesh operations |

### Tags / layers

| Command | Description |
|---------|-------------|
| `tag list [--json]` | List all tags with visibility |
| `tag create <name>` | Create a new tag |
| `tag select <name>` | Select all entities on a tag |
| `tag hide <name>` / `tag show <name>` | Toggle tag visibility |
| `tag-color-by-tag` | Toggle color-by-tag view mode |

### Export & file operations

| Command | Description |
|---------|-------------|
| `export stl [--output file]` | Export as STL — **free plan** |
| `export png [--output file]` | Export viewport as PNG — **free plan** |
| `export obj/fbx/dae [--output file]` | Export — **paid plan required** |
| `export dwg [--2d\|--3d] [--output file]` | Export DWG — **paid plan required** |
| `download [--output file.skp]` | Download the .skp file |
| `save` | Save model to cloud |
| `save-as <name>` | Save copy under new name |
| `plans [--json]` | List all files in Trimble Connect account |
| `open <file-id>` | Open a model by file ID |
| `new` | Open a new blank model |
| `run-script <file.js>` | Execute arbitrary JS in the browser context |

### Solid / boolean

| Command | Description |
|---------|-------------|
| `solid union \| intersect \| subtract \| trim \| split \| outer-shell` | Boolean operations on solid groups |

## Output formats

All inspection commands support `--json` for machine-readable output:

```bash
sketchup-cli stats --json
# { "edges": 1204, "faces": 432, "components": 8, "materials": 3, "units": "mm" }

sketchup-cli groups --json
# [{ "id": 42, "name": "Ground Floor", "type": "Group", ... }]
```

Without `--json`, output is human-readable aligned tables or key-value pairs.

Errors go to stderr; results go to stdout. Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Command failed |
| 2 | No active session — run `session start` |
| 3 | No model open — open a model first |

## Daemon logs

The daemon writes its log to `~/.sketchup-cli/daemon.log`. Inspect it if something goes wrong:

```bash
tail -f ~/.sketchup-cli/daemon.log
```

If a Playwright Chrome process gets stuck:

```bash
pkill -f "chrome.*sketchup"
rm -f ~/.sketchup-cli/daemon.sock ~/.sketchup-cli/ready
```

## Architecture

```
sketchup-cli <command>
  └── src/session/client.js      IPC client (Unix socket)
        └── ~/.sketchup-cli/daemon.sock
              └── src/session/daemon.js   Playwright browser process
                    └── app.sketchup.com  (headed Chromium)
```

Source layout:

```
bin/sketchup-cli.js          Entry point (commander root)
src/
  session/
    daemon.js                Playwright daemon + JSON-RPC server
    client.js                IPC client
    detect.js                Socket/PID helpers
  api/
    module83217.js           Webpack injection, VCB input, coordinate projection
    adapters.js              SUCypress adapter wrappers
    outliner.js              WebOutliner tree traversal
    stl.js                   STL blob capture + binary parser
  commands/
    session.js  inspect.js  geometry.js  draw.js  edit.js
    view.js     tags.js     export.js    solid.js
  output.js                  Table/KV/JSON formatting
```
