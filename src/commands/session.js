import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { daemonRunning, daemonPid, READY_FILE, SOCKET_PATH } from '../session/detect.js';
import { Client } from '../session/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.resolve(__dirname, '../session/daemon.js');

export function register(program) {
  const session = program.command('session').description('Manage browser session');

  session
    .command('start')
    .description('Open browser, wait for model, start daemon')
    .action(async () => {
      if (await daemonRunning()) {
        console.log('Session already running.');
        return;
      }

      // Remove stale ready file
      if (fs.existsSync(READY_FILE)) fs.unlinkSync(READY_FILE);

      // Fork daemon
      const child = spawn(process.execPath, [DAEMON_SCRIPT], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      console.log(`Starting browser (pid ${child.pid})...`);
      console.log('Log in to SketchUp if prompted, then open a model.');

      // Wait up to 3 minutes for socket + ready file
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        if (fs.existsSync(READY_FILE)) {
          const content = fs.readFileSync(READY_FILE, 'utf8').trim();
          if (content === 'MODEL_READY') {
            console.log('Session ready.');
          } else {
            console.log('Browser open. Log in and open a model, then run commands.');
          }
          return;
        }
        await sleep(500);
      }

      process.stderr.write('Error: Timed out waiting for session to start (3 min).\n');
      process.exit(1);
    });

  session
    .command('status')
    .description('Check if session is active and a model is open')
    .action(async () => {
      if (!await daemonRunning()) {
        console.log('Status: No active session');
        return;
      }
      const client = new Client();
      await client.connect();
      const status = await client.checkSession();
      client.close();
      if (status.ok) {
        console.log('Status: Active — model is open');
      } else {
        console.log(`Status: Degraded — ${status.reason}`);
      }
    });

  session
    .command('stop')
    .description('Stop the daemon and close the browser')
    .action(async () => {
      if (!await daemonRunning()) {
        const pid = daemonPid();
        if (pid) {
          try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
        }
        console.log('Session stopped.');
        return;
      }
      const client = new Client();
      await client.connect();
      try {
        await Promise.race([
          client.stop(),
          sleep(2000),
        ]);
      } catch { /* daemon may have already closed */ }
      client.close();
      console.log('Session stopped.');
    });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
