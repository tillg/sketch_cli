# Error Handling

---

## Principles

- **Errors → stderr**, **results → stdout** — enables piping and scripting
- Every error message says what to do next
- Exit codes are consistent across all commands (see `06_OUTPUT_FORMAT.md`)
- Warnings (non-fatal) go to stderr but exit with code 0

---

## Error Scenarios

### 1. No active session

**When:** Daemon socket not found, or `session.json` doesn't exist.

**Stderr:**
```
Error: No active session.
Run: sketchup-cli session start
```
**Exit code:** 2

---

### 2. Session broken (browser crashed or navigated away)

**When:** `page.evaluate()` throws, or `page.url()` is not `app.sketchup.com/app`.

**Stderr:**
```
Error: Session lost (browser closed or navigated away).
Run: sketchup-cli session start
```
**Exit code:** 2

---

### 3. No model open

**When:** `window.SUCypress` is not available (only injected when a model is loaded).

**Detection:**
```js
const ready = await page.evaluate(() => typeof window.SUCypress !== 'undefined');
if (!ready) throw { code: 3, message: 'no_model' };
```

**Stderr:**
```
Error: No model is open in SketchUp.
Open a model first: sketchup-cli open <file-id>
List available files: sketchup-cli plans
```
**Exit code:** 3

---

### 4. SketchUp modal dialog blocking execution

**When:** A dialog appeared and is blocking the viewport (e.g. "Unsaved changes",
"Invalid Scale Input", save confirmations).

**Detection:** Dialogs render as an `[active]` overlay element containing a heading
and action buttons. Detect before running any command:

```js
const dialog = await page.evaluate(() => {
  // Active dialogs appear as the last child of body with role/aria-modal,
  // or can be found by the presence of an "Okay" / "Close" button inside an overlay.
  const active = [...document.querySelectorAll('div[aria-modal="true"], div[role="dialog"]')];
  if (active.length) return active[0].textContent.trim().substring(0, 120);

  // Fallback: look for the accessibility pattern seen in live testing —
  // an element marked [active] containing a heading + Okay button
  const okBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Okay');
  if (okBtn) return okBtn.closest('div')?.textContent.trim().substring(0, 120) ?? 'unknown dialog';

  return null;
});
if (dialog) throw { code: 1, message: `blocking_dialog`, detail: dialog };
```

**Strategy:**
- Always report and exit — do not auto-dismiss. The user may need to act on the dialog.

**Stderr:**
```
Error: SketchUp is showing a blocking dialog: "Invalid Scale Input"
Dismiss it manually in the browser window, then retry.
```
**Exit code:** 1

---

### 5. VCB format error (tool-specific input dialog)

**When:** A geometry/edit command supplied the wrong number or type of VCB values and
SketchUp shows a named error dialog (e.g. "Invalid Scale Input", "Invalid length entered").
These are distinct from silent rejection (scenario 6) because SketchUp actively reports them.

**Known cases from live testing:**
- Scale: typing `"2"` for a 2D corner grip that expects `"2,2"` → "Invalid Scale Input" dialog
- Move: typing `"1000,0,0"` (vector) instead of `"1000"` (scalar) → "Invalid length entered" in status bar (no dialog — silent rejection; see scenario 6)

**Detection:** Same as scenario 4 — check for a blocking dialog after the command.
Run the dialog check immediately after `browser_press_key('Enter')`.

**Stderr:**
```
Error: SketchUp rejected the input — "Invalid Scale Input".
For scale, match the number of values to the grip type:
  corner grip (2D) → "2,2"   corner grip (3D) → "2,2,2"   edge grip → "2"
```
**Exit code:** 1

---

### 6. VCB input silently rejected

**When:** After typing dimensions and pressing Enter, the model state didn't change
and no dialog appeared (e.g. move vector with wrong format shows "Invalid length entered"
in the status bar only).

**Detection:** Check a relevant model stat before and after the command. If unchanged
after a short wait, assume the input was rejected.

```js
const before = await page.evaluate(() => window.Module.getModelExtents());
// ... run command ...
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.Module.getModelExtents());
const changed = JSON.stringify(before) !== JSON.stringify(after);
if (!changed) throw { code: 1, message: 'vcb_rejected' };
```

**Stderr:**
```
Error: SketchUp did not accept the input "1000,0,0".
Coordinates must be numbers in model units (mm for metric models).
Example: sketchup-cli draw rectangle 0 0 0 3000 4000
```
**Exit code:** 1

---

### 7. Projected target is outside the visible viewport

**When:** A command computes a screen position from model-space coordinates, but the
projected point lies outside the canvas bounds or too close to the edge for a safe click.

**Typical cases:**
- `draw rectangle` first click at a large coordinate far from the current camera
- `push-pull` click at the center of a large face
- `draw box` / `draw wall` composed operations on geometry larger than the current view

**Detection:** Before every trusted `page.mouse.click(x, y)` driven by projection,
compare the point to `canvas.getBoundingClientRect()` with a margin.

```js
const rect = canvas.getBoundingClientRect();
const margin = 16;
const inside =
  x >= rect.left + margin &&
  x <= rect.right - margin &&
  y >= rect.top + margin &&
  y <= rect.bottom - margin;

if (!inside) {
  throw {
    code: 1,
    message: 'target_offscreen',
    detail: { x, y },
  };
}
```

**Stderr:**
```
Error: Push-pull target is outside the visible viewport.
The face point at model coordinates (7450, 6450, 0) is not safely clickable.
```
**Exit code:** 1

---

### 8. Command dispatched but had no effect

**When:** `mod.nMW(commandId)` was called but nothing visibly changed (e.g. EDIT_DELETE
with nothing selected).

**Detection:** Best-effort only — most YFS commands don't return a value. Where possible,
check state before/after. Otherwise, issue a warning.

**Stderr:**
```
Warning: Command may not have taken effect (nothing selected?).
```
**Exit code:** 0 (warning only, non-fatal)

---

### 9. Session startup timeout

**When:** `session start` was run but `SUCypress` didn't become available within 60 seconds
(login not completed).

**Stderr:**
```
Error: Timed out waiting for a model to open (60s).
Make sure you are logged in and have a model open in the browser window.
```
**Exit code:** 1

---

## Error Handling in Code

All `page.evaluate()` calls are wrapped in a single helper in `src/browser/evaluate.js`:

```js
export async function evaluate(page, script) {
  // 1. Pre-check: session still live?
  const sessionOk = await checkSession(page);
  if (!sessionOk) exit(2, 'Session lost. Run: sketchup-cli session start');

  // 2. Run the script
  try {
    return await page.evaluate(script);
  } catch (err) {
    // Distinguish page crash from script error
    if (err.message.includes('Target closed')) exit(2, 'Session lost.');
    exit(1, `Script error: ${err.message}`);
  }
}

async function checkSession(page) {
  try {
    await page.evaluate(() => typeof window.SUCypress);
  } catch {
    return false;
  }
  return page.url().includes('app.sketchup.com/app');
}

function exit(code, message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(code);
}
```
