import { getClient } from '../session/client.js';
import { nMW } from '../api/module83217.js';
import { activateScene } from '../api/adapters.js';
import fs from 'fs';
import path from 'path';

const VIEW_MAP = {
  top: 'VIEW_TOP', front: 'VIEW_FRONT', back: 'VIEW_BACK',
  left: 'VIEW_LEFT', right: 'VIEW_RIGHT', bottom: 'VIEW_BOTTOM', iso: 'VIEW_ISO',
};

const STYLE_MAP = {
  wireframe: 'VIEW_WIREFRAME', shaded: 'VIEW_SHADED',
  textured: 'VIEW_SHADED_WITH_TEXTURES', xray: 'VIEW_XRAY',
};

export function register(program) {
  // view <direction>
  program
    .command('view <direction>')
    .description('Switch to a standard view (top|front|back|left|right|bottom|iso)')
    .action(async (direction) => {
      const cmd = VIEW_MAP[direction.toLowerCase()];
      if (!cmd) {
        process.stderr.write(`Error: Unknown view "${direction}". Use: ${Object.keys(VIEW_MAP).join('|')}\n`);
        process.exit(1);
      }
      const client = await getClient();
      await client.evaluate(nMW(cmd));
      client.close();
    });

  // zoom extents | selection
  const zoom = program.command('zoom').description('Zoom commands');
  zoom.command('extents').description('Zoom to fit entire model').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('ACTIVATE_ZOOM_EXTENTS'));
    client.close();
  });
  zoom.command('selection').description('Zoom to fit selection').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('ACTIVATE_ZOOM_SELECTION'));
    client.close();
  });

  // projection
  const proj = program.command('projection').description('Set projection mode');
  proj.command('perspective').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('PERSPECTIVE_PROJECTION'));
    client.close();
  });
  proj.command('parallel').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('PARALLEL_PROJECTION'));
    client.close();
  });

  // style
  program
    .command('style <mode>')
    .description('Set render style (wireframe|shaded|textured|xray)')
    .action(async (mode) => {
      const cmd = STYLE_MAP[mode.toLowerCase()];
      if (!cmd) {
        process.stderr.write(`Error: Unknown style "${mode}". Use: ${Object.keys(STYLE_MAP).join('|')}\n`);
        process.exit(1);
      }
      const client = await getClient();
      await client.evaluate(nMW(cmd));
      client.close();
    });

  // screenshot
  program
    .command('screenshot')
    .description('Capture viewport as PNG')
    .option('--output <file>', 'output file path', 'screenshot.png')
    .action(async (opts) => {
      const client = await getClient();
      const outPath = path.resolve(opts.output);
      await client.screenshot(outPath);
      client.close();
      console.log(`Saved to ${outPath}`);
    });

  // scene activate
  const scene = program.command('scene').description('Scene commands');
  scene
    .command('activate <name>')
    .description('Jump to a saved scene by name')
    .action(async (name) => {
      const client = await getClient();
      // Find index by name
      const scenes = await client.evaluate(`(async () => {
        const chunk = window.webpackChunksketchup_web_frontend;
        let wpRequire;
        chunk.push([['__cli_sc'], {}, (r) => { wpRequire = r; }]);
        const store = wpRequire(96459).store;
        return store.state.scenes.scenes.map((s, i) => ({ index: i, name: s.getName() }));
      })()`);
      const found = scenes.find((s) => s.name === name || String(s.index) === name);
      if (!found) {
        client.close();
        process.stderr.write(`Error: Scene "${name}" not found.\nAvailable: ${scenes.map((s) => s.name).join(', ')}\n`);
        process.exit(1);
      }
      await client.evaluate(activateScene(found.index));
      client.close();
    });
}
