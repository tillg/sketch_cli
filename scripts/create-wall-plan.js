#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../bin/sketchup-cli.js');

const planName = process.argv.slice(2).join(' ').trim();

if (!planName) {
  console.error('Usage: node scripts/create-wall-plan.js "Plan Name"');
  process.exit(1);
}

try {
  await runCli(['new']);
  await runCli(['draw', 'wall', '0,0', '5000,0', '2500', '250']);
  await runCli(['save-as', planName]);
  console.log(`Created plan "${planName}" with one wall.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: sketchup-cli ${args.join(' ')}`));
    });
  });
}
