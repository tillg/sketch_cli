import { getClient } from '../session/client.js';
import { nMW, typeVCB, projectScript, INJECT_MOD } from '../api/module83217.js';
import { getBlockingDialog, dismissBlockingDialogs } from '../dialogs.js';

export function register(program) {
  const draw = program.command('draw').description('Drawing commands');

  // draw rectangle <x> <y> <z> <width> <height>
  draw
    .command('rectangle <x> <y> <z> <width> <height>')
    .description('Draw a rectangle at the given model-space origin with exact dimensions')
    .action(async (x, y, z, width, height) => {
      const client = await getClient();

      // Activate rectangle tool
      await client.evaluate(nMW('ACTIVATE_RECTANGLE'));

      // Project origin to screen (inches), click there
      const pos = await client.evaluate(projectScript(Number(x) / 25.4, Number(y) / 25.4, Number(z) / 25.4));
      await client.mouseClick(pos.x, pos.y);

      // Mandatory mousemove to establish drawing direction
      await moveMouseBy(client, pos.x, pos.y, 80, 80);

      // Type dimensions: "width,height"
      await client.evaluate(typeVCB(`${width},${height}`));

      // Commit
      await client.pressKey('Enter');

      const dialog = await getBlockingDialog(client);
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

      await cleanupAfterDraw(client);

      client.close();
    });

  // draw circle <x> <y> <z> <radius>
  draw
    .command('circle <x> <y> <z> <radius>')
    .description('Draw a circle at the given model-space center with given radius')
    .option('--segments <n>', 'number of segments', '24')
    .action(async (x, y, z, radius, opts) => {
      const client = await getClient();

      await client.evaluate(nMW('ACTIVATE_CIRCLE'));

      // Project center to screen (inches), click there
      const pos = await client.evaluate(projectScript(Number(x) / 25.4, Number(y) / 25.4, Number(z) / 25.4));
      await client.mouseClick(pos.x, pos.y);

      await moveMouseBy(client, pos.x, pos.y, 80, 0);
      await client.evaluate(typeVCB(String(radius)));
      await client.pressKey('Enter');

      const dialog = await getBlockingDialog(client);
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

      await cleanupAfterDraw(client);

      client.close();
    });

  // draw line <x1,y1,z1> <x2,y2,z2>
  draw
    .command('line <start> <end>')
    .description('Draw a line from start to end (format: "x,y,z")')
    .action(async (startStr, endStr) => {
      const [x1, y1, z1] = startStr.split(',').map(Number);
      const [x2, y2, z2] = endStr.split(',').map(Number);

      if ([x1, y1, z1, x2, y2, z2].some(isNaN)) {
        process.stderr.write('Error: Coordinates must be numbers. Format: "x,y,z"\n');
        process.exit(1);
      }

      const client = await getClient();
      await client.evaluate(nMW('ACTIVATE_PENCIL'));

      const p1 = await client.evaluate(projectScript(x1 / 25.4, y1 / 25.4, z1 / 25.4));
      const p2 = await client.evaluate(projectScript(x2 / 25.4, y2 / 25.4, z2 / 25.4));

      await client.mouseClick(p1.x, p1.y);
      await client.mouseClick(p2.x, p2.y);
      const dialog = await getBlockingDialog(client);
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

      await cleanupAfterDraw(client);

      client.close();
    });

  // push-pull <x> <y> <z> <distance>
  program
    .command('push-pull <x> <y> <z> <distance>')
    .description('Extrude the face at the given coordinate by distance')
    .action(async (x, y, z, distance) => {
      const client = await getClient();

      await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));

      const pos = await client.evaluate(projectScript(Number(x) / 25.4, Number(y) / 25.4, Number(z) / 25.4));
      await client.mouseClick(pos.x, pos.y);

      const beforeFaces = await getFaceCount(client);
      await moveMouseBy(client, pos.x, pos.y, 0, -80);
      await client.evaluate(typeVCB(String(distance)));
      await client.pressKey('Enter');
      await sleep(200);

      const afterFaces = await getFaceCount(client);
      if (afterFaces <= beforeFaces) {
        process.stderr.write('Error: Push-pull produced no new geometry.\n');
        client.close();
        process.exit(1);
      }

      const dialog = await getBlockingDialog(client);
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

      await cleanupAfterDraw(client);

      client.close();
    });

  // draw wall <x1,y1> <x2,y2> <height> <thickness>
  draw
    .command('wall <start> <end> <height> <thickness>')
    .description('Draw a 3D wall (rectangle + push-pull). Coordinates are "x,y".')
    .action(async (startStr, endStr, height, thickness) => {
      const [x1, y1] = startStr.split(',').map(Number);
      const [x2, y2] = endStr.split(',').map(Number);

      if ([x1, y1, x2, y2].some(isNaN)) {
        process.stderr.write('Error: Coordinates must be numbers. Format: "x,y"\n');
        process.exit(1);
      }

      const w = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const dx = x2 - x1, dy = y2 - y1;
      const t = Number(thickness);

      // Perpendicular direction (clockwise in XY plane) for thickness extension
      const perpWX = dy / w;
      const perpWY = -dx / w;

      const client = await getClient();

      // Capture face count before rectangle
      const beforeFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);

      // Draw rectangle at floor level
      await client.evaluate(nMW('ACTIVATE_RECTANGLE'));

      // Project start, end, and perpendicular reference to screen
      const startScreen = await client.evaluate(projectScript(x1 / 25.4, y1 / 25.4, 0));
      const endScreen = await client.evaluate(projectScript(x2 / 25.4, y2 / 25.4, 0));
      const perpRefScreen = await client.evaluate(projectScript(
        (x1 + perpWX * t) / 25.4, (y1 + perpWY * t) / 25.4, 0
      ));

      // Wall direction in screen space
      const dxScreen = endScreen.x - startScreen.x;
      const dyScreen = endScreen.y - startScreen.y;
      const dirLen = Math.sqrt(dxScreen ** 2 + dyScreen ** 2);
      const nudgeX = dirLen > 0 ? Math.round((dxScreen / dirLen) * 80) : 80;
      const nudgeY = dirLen > 0 ? Math.round((dyScreen / dirLen) * 80) : 0;

      // Perpendicular direction in screen space (for thickness extension)
      const perpSX = perpRefScreen.x - startScreen.x;
      const perpSY = perpRefScreen.y - startScreen.y;
      const perpSLen = Math.sqrt(perpSX ** 2 + perpSY ** 2);
      const nudgePerpX = perpSLen > 0 ? Math.round((perpSX / perpSLen) * 20) : 0;
      const nudgePerpY = perpSLen > 0 ? Math.round((perpSY / perpSLen) * 20) : 0;

      await client.mouseClick(startScreen.x, startScreen.y);
      // Include perpendicular component so Rectangle tool extends thickness correctly
      await moveMouseBy(client, startScreen.x, startScreen.y, nudgeX + nudgePerpX, nudgeY + nudgePerpY);
      await client.evaluate(typeVCB(`${Math.round(w)},${thickness}`));
      await client.pressKey('Enter');

      // Verify rectangle created a face
      await sleep(200);
      const afterFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);
      if (afterFaces <= beforeFaces) {
        process.stderr.write('Error: Rectangle step produced no new face.\n');
        client.close();
        process.exit(1);
      }

      // Push-pull: click face center (midpoint + half-thickness perpendicular offset)
      await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));
      const faceCX = (x1 + x2) / 2 + perpWX * t / 2;
      const faceCY = (y1 + y2) / 2 + perpWY * t / 2;
      const facePos = await client.evaluate(projectScript(faceCX / 25.4, faceCY / 25.4, 0));
      await client.mouseClick(facePos.x, facePos.y);
      await moveMouseBy(client, facePos.x, facePos.y, 0, -80);
      await client.evaluate(typeVCB(String(height)));
      await client.pressKey('Enter');
      await sleep(200);

      const afterPushPullFaces = await getFaceCount(client);
      if (afterPushPullFaces <= afterFaces) {
        process.stderr.write('Error: Push-pull step produced no new geometry.\n');
        client.close();
        process.exit(1);
      }

      const dialog = await getBlockingDialog(client);
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

      await cleanupAfterDraw(client);

      client.close();
    });

  // draw box <x> <y> <z> <w> <d> <h>
  draw
    .command('box <x> <y> <z> <w> <d> <h>')
    .description('Draw a 3D box at origin with width, depth, height')
    .action(async (x, y, z, w, d, h) => {
      const client = await getClient();
      const boxX = Number(x);
      const boxY = Number(y);
      const boxZ = Number(z);
      const boxW = Number(w);
      const boxD = Number(d);
      const boxH = Number(h);
      const widthSign = boxW >= 0 ? 1 : -1;
      const depthSign = boxD >= 0 ? 1 : -1;
      const heightSign = boxH >= 0 ? 1 : -1;

      // Capture face count before rectangle
      const beforeFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);

      // Draw rectangle base
      await client.evaluate(nMW('ACTIVATE_RECTANGLE'));
      const startScreen = await client.evaluate(projectScript(boxX / 25.4, boxY / 25.4, boxZ / 25.4));
      const xRefScreen = await client.evaluate(projectScript(
        (boxX + widthSign * Math.min(Math.abs(boxW), 100)) / 25.4,
        boxY / 25.4,
        boxZ / 25.4
      ));
      const yRefScreen = await client.evaluate(projectScript(
        boxX / 25.4,
        (boxY + depthSign * Math.min(Math.abs(boxD), 100)) / 25.4,
        boxZ / 25.4
      ));
      const rectNudge = combineUnitDirections(startScreen, [xRefScreen, yRefScreen], 80, { x: 80, y: -10 });

      await client.mouseClick(startScreen.x, startScreen.y);
      await moveMouseBy(client, startScreen.x, startScreen.y, rectNudge.x, rectNudge.y);
      await client.evaluate(typeVCB(`${w},${d}`));
      await client.pressKey('Enter');

      // Verify rectangle created a face
      await sleep(200);
      const afterFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);
      if (afterFaces <= beforeFaces) {
        process.stderr.write('Error: Rectangle step produced no new face.\n');
        client.close();
        process.exit(1);
      }

      // Push-pull up - click near origin of the face (not center, which may be off-screen)
      await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));
      const facePos = await client.evaluate(projectScript(
        (boxX + boxW / 2) / 25.4,
        (boxY + boxD / 2) / 25.4,
        boxZ / 25.4
      ));
      const zRefScreen = await client.evaluate(projectScript(
        (boxX + boxW / 2) / 25.4,
        (boxY + boxD / 2) / 25.4,
        (boxZ + heightSign * Math.min(Math.abs(boxH), 100)) / 25.4
      ));
      const pushPullNudge = nudgeToward(facePos, zRefScreen, 80, { x: 0, y: -80 });
      await client.mouseClick(facePos.x, facePos.y);
      await moveMouseBy(client, facePos.x, facePos.y, pushPullNudge.x, pushPullNudge.y);
      await client.evaluate(typeVCB(String(h)));
      await client.pressKey('Enter');
      await sleep(200);

      const afterPushPullFaces = await getFaceCount(client);
      if (afterPushPullFaces <= afterFaces) {
        process.stderr.write('Error: Push-pull step produced no new geometry.\n');
        client.close();
        process.exit(1);
      }

      const dialog = await getBlockingDialog(client);
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

      await cleanupAfterDraw(client);

      client.close();
    });
}

async function moveMouseBy(client, x, y, dx, dy) {
  await sleep(50);
  await client.mouseMove(x + dx, y + dy);
}

async function getFaceCount(client) {
  return client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupAfterDraw(client) {
  await dismissBlockingDialogs(client, { attempts: 2, settleMs: 100 });
  await client.evaluate(nMW('ACTIVATE_SELECTION'));
  await dismissBlockingDialogs(client, { attempts: 2, settleMs: 100 });
}

function nudgeToward(from, to, pixels, fallback) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx ** 2 + dy ** 2);
  if (!len) return fallback;
  return {
    x: Math.round((dx / len) * pixels),
    y: Math.round((dy / len) * pixels),
  };
}

function combineUnitDirections(from, refs, pixels, fallback) {
  let sumX = 0;
  let sumY = 0;
  for (const ref of refs) {
    const dx = ref.x - from.x;
    const dy = ref.y - from.y;
    const len = Math.sqrt(dx ** 2 + dy ** 2);
    if (!len) continue;
    sumX += dx / len;
    sumY += dy / len;
  }
  const len = Math.sqrt(sumX ** 2 + sumY ** 2);
  if (!len) return fallback;
  return {
    x: Math.round((sumX / len) * pixels),
    y: Math.round((sumY / len) * pixels),
  };
}
