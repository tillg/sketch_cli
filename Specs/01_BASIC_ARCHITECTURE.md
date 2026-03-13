# SketchUp CLI — Basic Architecture

## Goal

A CLI tool (`sketchup-cli`) that controls SketchUp Web (`app.sketchup.com`) to **inspect and modify SketchUp plans** programmatically.

## Approach

Browser automation via **Playwright** (Node.js), driving `app.sketchup.com` and calling the `window.sketchup` JavaScript API exposed in the browser context via `page.evaluate()`. This gives direct programmatic access to geometry operations and model manipulation without clicking UI elements.

## Stack

- **Language**: Node.js (ESM, Node 18+)
- **Browser automation**: Playwright (headed Chromium)
- **Auth**: Playwright-based manual login — user logs in visually in the browser window; session state saved to `~/.sketchup-cli/session.json` via Playwright `storageState`
- **Session model**: Persistent daemon — `sketchup-cli session start` opens a headed browser and keeps it alive; commands connect to it via Unix socket IPC at `~/.sketchup-cli/daemon.sock`
- **CLI framework**: `commander` (Node.js)

See `Specs/07_AUTH_AND_SESSION.md` for full session and auth details.
See `Specs/08_PROJECT_STRUCTURE.md` for directory layout and dependencies.

## Example Commands

```
sketchup-cli open <file>
sketchup-cli export --format stl
sketchup-cli run-script <script.js>
sketchup-cli inspect <entity>
```

## Starting Point

Prototype a Playwright script that:
1. Logs into `app.sketchup.com` via OAuth 2.0
2. Calls `window.sketchup` methods via `page.evaluate()` to confirm what model manipulation API is exposed
3. Wraps working interactions into CLI commands with `commander`
