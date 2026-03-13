import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';

export const STATE_DIR = path.join(os.homedir(), '.sketchup-cli');
export const SOCKET_PATH = path.join(STATE_DIR, 'daemon.sock');
export const PID_FILE = path.join(STATE_DIR, 'daemon.pid');
export const SESSION_FILE = path.join(STATE_DIR, 'session.json');
export const READY_FILE = path.join(STATE_DIR, 'ready');

export async function daemonRunning() {
  if (!fs.existsSync(SOCKET_PATH)) return false;
  return new Promise((resolve) => {
    const socket = net.createConnection(SOCKET_PATH);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

export function daemonPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  } catch {
    return null;
  }
}
