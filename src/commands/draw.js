import { getClient } from '../session/client.js';
import { nMW, typeVCB, dispatchMousemove, projectScript, INJECT_MOD } from '../api/module83217.js';
import { checkDialog } from '../api/adapters.js';

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

      // Project origin to screen, click there
      const pos = await client.evaluate(projectScript(Number(x), Number(y), Number(z)));
      await client.mouseClick(pos.x, pos.y);

      // Mandatory mousemove to establish drawing direction
      await client.evaluate(dispatchMousemove(80, 80));

      // Type dimensions: "width,height"
      await client.evaluate(typeVCB(`${width},${height}`));

      // Commit
      await client.pressKey('Enter');

      // Check for blocking dialog
      const dialog = await client.evaluate(checkDialog());
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

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

      // Project center to screen, click there
      const pos = await client.evaluate(projectScript(Number(x), Number(y), Number(z)));
      await client.mouseClick(pos.x, pos.y);

      await client.evaluate(dispatchMousemove(80, 0));
      await client.evaluate(typeVCB(String(radius)));
      await client.pressKey('Enter');

      const dialog = await client.evaluate(checkDialog());
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

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

      const p1 = await client.evaluate(projectScript(x1, y1, z1));
      const p2 = await client.evaluate(projectScript(x2, y2, z2));

      await client.mouseClick(p1.x, p1.y);
      await client.mouseClick(p2.x, p2.y);
      await client.pressKey('Escape');

      client.close();
    });

  // push-pull <x> <y> <z> <distance>
  program
    .command('push-pull <x> <y> <z> <distance>')
    .description('Extrude the face at the given coordinate by distance')
    .action(async (x, y, z, distance) => {
      const client = await getClient();

      await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));

      const pos = await client.evaluate(projectScript(Number(x), Number(y), Number(z)));
      await client.mouseClick(pos.x, pos.y);

      await client.evaluate(dispatchMousemove(0, -80));
      await client.evaluate(typeVCB(String(distance)));
      await client.pressKey('Enter');

      const dialog = await client.evaluate(checkDialog());
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }

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

      const client = await getClient();

      // Draw rectangle at floor level
      await client.evaluate(nMW('ACTIVATE_RECTANGLE'));
      const pos = await client.evaluate(projectScript(x1, y1, 0));
      await client.mouseClick(pos.x, pos.y);
      await client.evaluate(dispatchMousemove(80, 80));
      await client.evaluate(typeVCB(`${Math.round(w)},${thickness}`));
      await client.pressKey('Enter');

      // Push-pull the face up by height
      await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));
      const facePos = await client.evaluate(projectScript(x1 + (x2-x1)/2, y1 + (y2-y1)/2, 0));
      await client.mouseClick(facePos.x, facePos.y);
      await client.evaluate(dispatchMousemove(0, -80));
      await client.evaluate(typeVCB(String(height)));
      await client.pressKey('Enter');

      client.close();
    });

  // draw box <x> <y> <z> <w> <d> <h>
  draw
    .command('box <x> <y> <z> <w> <d> <h>')
    .description('Draw a 3D box at origin with width, depth, height')
    .action(async (x, y, z, w, d, h) => {
      const client = await getClient();

      // Draw rectangle base
      await client.evaluate(nMW('ACTIVATE_RECTANGLE'));
      const pos = await client.evaluate(projectScript(Number(x), Number(y), Number(z)));
      await client.mouseClick(pos.x, pos.y);
      await client.evaluate(dispatchMousemove(80, 80));
      await client.evaluate(typeVCB(`${w},${d}`));
      await client.pressKey('Enter');

      // Push-pull up
      await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));
      const facePos = await client.evaluate(projectScript(
        Number(x) + Number(w)/2, Number(y) + Number(d)/2, Number(z)
      ));
      await client.mouseClick(facePos.x, facePos.y);
      await client.evaluate(dispatchMousemove(0, -80));
      await client.evaluate(typeVCB(String(h)));
      await client.pressKey('Enter');

      client.close();
    });
}
