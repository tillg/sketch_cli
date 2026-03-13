# Auth & Session Spec

## Decision: Playwright-based manual login

No OAuth token management or Trimble API credentials needed. The user logs in visually in a real browser window that Playwright controls.

**Flow:**
1. `sketchup-cli session start` — opens a headed Chromium window
2. SketchUp Web's login page loads automatically
3. User logs in manually (Trimble account)
4. CLI detects when a model is open and prints `Session ready.`
5. Playwright saves browser state (cookies, localStorage) to `~/.sketchup-cli/session.json`
6. All subsequent commands restore from `session.json` — no re-login until cookies expire

---

## Session Commands

```
sketchup-cli session start     # Open browser, wait for user login, save state
sketchup-cli session status    # Check if session is active and a model is open
sketchup-cli session stop      # Close the browser and clear saved state
```

---

## State Persistence

Playwright's `storageState` captures all cookies and localStorage needed to resume a session.

**Storage location:**
```
~/.sketchup-cli/
├── session.json     # Playwright storageState (cookies + localStorage)
├── daemon.sock      # Unix socket for IPC with the running browser process
└── daemon.log       # Browser process logs
```

**Restoring session state on daemon start:**
```js
const context = await browser.newContext({
  storageState: path.join(os.homedir(), '.sketchup-cli', 'session.json')
});
const page = await context.newPage();
await page.goto('https://app.sketchup.com/app');
// Cookies from session.json auto-authenticate — login page should be skipped
```

---

## Readiness Detection

A session is ready for commands when both APIs are available in the page:

```js
await page.waitForFunction(
  () => typeof window.SUCypress !== 'undefined' && typeof window.Module !== 'undefined',
  { timeout: 30000 }
);
```

`SUCypress` is only injected when a model is fully open — so this doubles as a "model is open" check.

---

## Daemon Architecture

The browser is a long-lived background process; CLI commands connect to it via a Unix socket.

```
sketchup-cli session start
  └─ forks daemon process → holds Playwright browser
       └─ listens on ~/.sketchup-cli/daemon.sock

sketchup-cli stats
  └─ connects to daemon.sock
       └─ sends JSON-RPC: { method: "evaluate", params: { script: "..." } }
       └─ receives:       { result: { edges: 1204, faces: 432, ... } }
```

**JSON-RPC over Unix socket (message format):**
```json
// Request
{ "id": 1, "method": "evaluate", "params": { "script": "Module.getModelInfo().stats" } }

// Response
{ "id": 1, "result": { "num_edges": 1204, "num_faces": 432 } }

// Error response
{ "id": 1, "error": { "code": 3, "message": "No model open" } }
```

---

## Session Breakdown Handling

Before each command, the daemon checks the page is still live:

```js
async function checkSession(page) {
  try {
    await page.evaluate(() => typeof window.SUCypress);
  } catch {
    return { ok: false, reason: 'page_crashed' };
  }
  if (!page.url().includes('app.sketchup.com/app')) {
    return { ok: false, reason: 'navigated_away' };
  }
  return { ok: true };
}
```

**On breakdown:** daemon responds with error code 2; CLI prints:
```
Error: Session lost (browser closed or navigated away).
Run: sketchup-cli session start
```
and exits with code 2.

