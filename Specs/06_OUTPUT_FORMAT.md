# Output Format Spec

## Decisions

- **Default**: human-readable text (tables, key-value pairs, plain lists)
- **Machine-readable**: `--json` flag on any command outputs JSON to stdout
- All **error messages** go to stderr regardless of format
- All **results** go to stdout

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Command failed (error message on stderr) |
| 2 | No active session — run `sketchup-cli session start` |
| 3 | No model open in the active session |

---

## Human-Readable Format Examples

**List output** — plain table, header row, aligned columns:

```
$ sketchup-cli tags
NAME            VISIBLE  COLOR
Default         yes      —
Walls           yes      #FF0000
Roof            no       #0000FF
```

**Single-entity output** — key-value:

```
$ sketchup-cli info
File:     Frechenlehen-Groundfloor.skp
Path:     /files/offline/abc123/0/model.skp
Version:  SketchUp 2024
```

**Stats output**:

```
$ sketchup-cli stats
Edges:       1204
Faces:        432
Components:     8
Materials:      3
Units:         mm
```

**Groups/outliner output**:

```
$ sketchup-cli groups
ID    NAME              TYPE       VISIBLE  LOCKED  CHILDREN
42    Ground Floor      Group      yes      no       12
57    Ty <Ty>           Component  yes      no        3
```

**Geometry output** — one entry per line, compact:

```
$ sketchup-cli faces
# 2925 triangles (metric mm)
normal(0,0,1)  v1(0,0,0)  v2(3000,0,0)  v3(3000,4000,0)
normal(0,0,1)  v1(0,0,0)  v2(3000,4000,0)  v3(0,4000,0)
...
```

---

## JSON Format (`--json`)

Outputs a single JSON object or array to stdout. Field names are camelCase.

**`sketchup-cli tags --json`**
```json
[
  { "name": "Default", "visible": true, "color": null },
  { "name": "Walls", "visible": true, "color": "#FF0000" },
  { "name": "Roof", "visible": false, "color": "#0000FF" }
]
```

**`sketchup-cli stats --json`**
```json
{
  "edges": 1204,
  "faces": 432,
  "componentDefinitions": 8,
  "materials": 3,
  "units": "mm"
}
```

**`sketchup-cli groups --json`**
```json
[
  {
    "id": 42,
    "name": "Ground Floor",
    "type": "Group",
    "visible": true,
    "locked": false,
    "childCount": 12
  }
]
```

**`sketchup-cli faces --json`**
```json
[
  {
    "normal": [0, 0, 1],
    "vertices": [
      [0, 0, 0],
      [3000, 0, 0],
      [3000, 4000, 0]
    ]
  }
]
```

**`sketchup-cli camera --json`**
```json
{
  "matrix": [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
  "fov": 35
}
```

**`sketchup-cli extents --json`**
```json
{
  "left": 0,
  "right": 29404,
  "top": 14200,
  "bottom": 0,
  "near": -5000,
  "far": 5000,
  "units": "mm"
}
```

---

## Error Output Format

Errors always go to stderr, regardless of `--json`:

```
Error: No active session.
Run: sketchup-cli session start
```

With `--json` active, errors are also written to stderr as JSON (so stdout remains parseable):

```json
{ "error": "no_session", "message": "No active session. Run: sketchup-cli session start" }
```
