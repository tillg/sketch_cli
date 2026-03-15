// Daemon process: holds the Playwright browser and serves JSON-RPC over Unix socket.
// Launched as a detached child by `sketchup-cli session start`.
//
// Usage: node src/session/daemon.js

import { chromium } from 'playwright';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

const STATE_DIR = path.join(os.homedir(), '.sketchup-cli');
const SESSION_FILE = path.join(STATE_DIR, 'session.json');
const SOCKET_PATH = path.join(STATE_DIR, 'daemon.sock');
const LOG_FILE = path.join(STATE_DIR, 'daemon.log');
const PID_FILE = path.join(STATE_DIR, 'daemon.pid');
const READY_FILE = path.join(STATE_DIR, 'ready');

fs.mkdirSync(STATE_DIR, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function log(msg) {
  logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
}

async function main() {
  log('Daemon starting');
  fs.writeFileSync(PID_FILE, String(process.pid));

  // Clean up stale socket
  if (fs.existsSync(SOCKET_PATH)) {
    try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
  }
  if (fs.existsSync(READY_FILE)) {
    try { fs.unlinkSync(READY_FILE); } catch { /* ignore */ }
  }

  // Launch browser
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });

  const contextOpts = {};
  if (fs.existsSync(SESSION_FILE)) {
    log('Restoring session from ' + SESSION_FILE);
    contextOpts.storageState = SESSION_FILE;
  }

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await page.goto('https://app.sketchup.com/app');
  log('Browser open, waiting for model to load (user may need to log in)');

  // Wait for model (up to 3 minutes to allow login)
  let modelReady = false;
  try {
    await page.waitForFunction(
      () => typeof window.SUCypress !== 'undefined' && typeof window.Module !== 'undefined',
      { timeout: 180000 }
    );
    modelReady = true;
    log('Model loaded and ready');
    await context.storageState({ path: SESSION_FILE });
    log('Session state saved');
  } catch (err) {
    log(`Warning: timed out waiting for model: ${err.message}`);
  }

  // Signal readiness (socket + ready file)
  const server = net.createServer(handleConnection.bind(null, page, context, browser));

  server.listen(SOCKET_PATH, () => {
    fs.writeFileSync(READY_FILE, modelReady ? 'MODEL_READY' : 'BROWSER_OPEN');
    log(`IPC socket ready at ${SOCKET_PATH}`);
  });

  // Periodic session save
  setInterval(async () => {
    try { await context.storageState({ path: SESSION_FILE }); } catch { /* ignore */ }
  }, 60000);

  // Graceful shutdown
  async function shutdown() {
    log('Shutting down');
    server.close();
    try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
    try { fs.unlinkSync(READY_FILE); } catch { /* ignore */ }
    try { await context.storageState({ path: SESSION_FILE }); } catch { /* ignore */ }
    await browser.close();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function handleConnection(page, context, browser, socket) {
  let buf = '';

  socket.on('data', (data) => {
    buf += data.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      dispatch(page, context, browser, msg, socket);
    }
  });

  socket.on('error', (err) => log(`Socket error: ${err.message}`));
}

async function dispatch(page, context, browser, msg, socket) {
  const { id, method, params = {} } = msg;
  try {
    let result;
    switch (method) {

      case 'evaluate': {
        result = await page.evaluate(params.script);
        break;
      }

      case 'pressKey': {
        await page.keyboard.press(params.key);
        result = null;
        break;
      }

      case 'mouseClick': {
        await page.mouse.click(params.x, params.y, params.options ?? {});
        result = null;
        break;
      }

      case 'mouseMove': {
        await page.mouse.move(params.x, params.y);
        result = null;
        break;
      }

      case 'screenshot': {
        if (params.path) {
          await page.screenshot({ path: params.path });
          result = params.path;
        } else {
          const buf = await page.screenshot();
          result = buf.toString('base64');
        }
        break;
      }

      case 'getUrl': {
        result = page.url();
        break;
      }

      case 'checkSession': {
        const url = page.url();
        if (!url.includes('app.sketchup.com/app')) {
          result = { ok: false, reason: 'wrong_url', url };
          break;
        }
        try {
          const isEditorReady = await page.evaluate(() => {
            try {
              if (typeof window.SUCypress === 'undefined') return false;
              // Reuse cached module if available (INJECT_MOD sets window.__skuMod)
              if (window.__skuMod) return typeof window.__skuMod.nMW === 'function';
              // Cold check — only runs until first command warms the cache
              const chunk = window.webpackChunksketchup_web_frontend;
              let wp; chunk.push([['__cli_chk'], {}, r => { wp = r; }]);
              if (typeof wp !== 'function') return false;
              const mod = wp(83217);
              if (!mod || typeof mod.nMW !== 'function') return false;
              window.__skuMod = mod;
              return true;
            } catch { return false; }
          });
          result = isEditorReady ? { ok: true } : { ok: false, reason: 'no_model' };
        } catch (err) {
          result = { ok: false, reason: 'page_crashed', error: err.message };
        }
        break;
      }

      case 'captureBlob': {
        // Capture a blob-URL download triggered by a YFS command
        const { commandId } = params;
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }),
          page.evaluate((cId) => {
            const chunk = window.webpackChunksketchup_web_frontend;
            let wpRequire;
            chunk.push([['__cli_dl'], {}, (r) => { wpRequire = r; }]);
            const mod = wpRequire(83217);
            mod.nMW(mod.YFS[cId]);
          }, commandId),
        ]);
        const tmpPath = path.join(os.tmpdir(), `sku-export-${Date.now()}`);
        await download.saveAs(tmpPath);
        const bytes = Array.from(fs.readFileSync(tmpPath));
        fs.unlinkSync(tmpPath);
        result = bytes;
        break;
      }

      case 'navigate': {
        await page.goto(params.url);
        result = null;
        break;
      }

      case 'saveSession': {
        await context.storageState({ path: SESSION_FILE });
        result = null;
        break;
      }

      case 'stop': {
        respond(socket, id, null);
        setTimeout(async () => {
          log('Stop requested via IPC');
          const sv = net.createServer(); // placeholder reference
          sv; // unused
          const shutdown = async () => {
            log('Shutting down via stop command');
            try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
            try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
            try { fs.unlinkSync(READY_FILE); } catch { /* ignore */ }
            try { await context.storageState({ path: SESSION_FILE }); } catch { /* ignore */ }
            await browser.close();
            process.exit(0);
          };
          await shutdown();
        }, 200);
        return;
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
    respond(socket, id, result);
  } catch (err) {
    log(`Error in ${method}: ${err.message}`);
    respondError(socket, id, 1, err.message);
  }
}

function respond(socket, id, result) {
  try { socket.write(JSON.stringify({ id, result }) + '\n'); } catch { /* client gone */ }
}

function respondError(socket, id, code, message) {
  try { socket.write(JSON.stringify({ id, error: { code, message } }) + '\n'); } catch { /* client gone */ }
}

main().catch((err) => {
  log(`Fatal: ${err.message}\n${err.stack}`);
  process.exit(1);
});
