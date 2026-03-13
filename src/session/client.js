import net from 'net';
import { SOCKET_PATH, daemonRunning } from './detect.js';

let idCounter = 0;

export class Client {
  constructor() {
    this.socket = null;
    this.pending = new Map();
    this._buf = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(SOCKET_PATH);
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
      this.socket.on('data', (data) => {
        this._buf += data.toString();
        const lines = this._buf.split('\n');
        this._buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const cb = this.pending.get(msg.id);
            if (!cb) continue;
            this.pending.delete(msg.id);
            if (msg.error) {
              const err = new Error(msg.error.message);
              err.code = msg.error.code;
              cb.reject(err);
            } else {
              cb.resolve(msg.result);
            }
          } catch { /* malformed */ }
        }
      });
      this.socket.on('error', (err) => {
        for (const { reject } of this.pending.values()) reject(err);
        this.pending.clear();
      });
    });
  }

  close() {
    if (this.socket) this.socket.destroy();
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++idCounter;
      this.pending.set(id, { resolve, reject });
      try {
        this.socket.write(JSON.stringify({ id, method, params }) + '\n');
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  evaluate(script) { return this._send('evaluate', { script }); }
  pressKey(key) { return this._send('pressKey', { key }); }
  mouseClick(x, y, options) { return this._send('mouseClick', { x, y, options }); }
  mouseMove(x, y) { return this._send('mouseMove', { x, y }); }
  screenshot(filePath) { return this._send('screenshot', { path: filePath }); }
  getUrl() { return this._send('getUrl'); }
  checkSession() { return this._send('checkSession'); }
  captureBlob(commandId) { return this._send('captureBlob', { commandId }); }
  navigate(url) { return this._send('navigate', { url }); }
  saveSession() { return this._send('saveSession'); }
  stop() { return this._send('stop'); }
}

// Returns a connected client, or exits with an appropriate error.
export async function getClient({ requireModel = true } = {}) {
  if (!await daemonRunning()) {
    process.stderr.write('Error: No active session.\nRun: sketchup-cli session start\n');
    process.exit(2);
  }

  const client = new Client();
  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: No active session.\nRun: sketchup-cli session start\n');
    process.exit(2);
  }

  const session = await client.checkSession();
  if (!session.ok) {
    if (session.reason === 'no_model' && requireModel) {
      process.stderr.write(
        'Error: No model is open in SketchUp.\n' +
        'Open a model first: sketchup-cli open <file-id>\n' +
        'List available files: sketchup-cli plans\n'
      );
      process.exit(3);
    } else if (session.reason !== 'no_model') {
      process.stderr.write(
        'Error: Session lost (browser closed or navigated away).\n' +
        'Run: sketchup-cli session start\n'
      );
      process.exit(2);
    }
  }

  return client;
}
