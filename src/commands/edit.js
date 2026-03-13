import { getClient } from '../session/client.js';
import { nMW, typeVCB, dispatchMousemove, INJECT_MOD, getCanvasCenter } from '../api/module83217.js';
import { selectByTag } from '../api/adapters.js';
import { selectById, clearSelection } from '../api/outliner.js';
import { checkDialog } from '../api/adapters.js';

export function register(program) {
  // --- Selection ---
  const sel = program.command('select').description('Selection commands');

  sel.command('all').description('Select all entities').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_SELECT_ALL'));
    client.close();
  });

  sel.command('none').description('Deselect everything').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_SELECT_NONE'));
    client.close();
  });

  sel.command('invert').description('Invert selection').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_INVERT_SELECTION'));
    client.close();
  });

  sel.command('tag <name>').description('Select all entities on a tag').action(async (name) => {
    const client = await getClient();
    await client.evaluate(selectByTag(name));
    client.close();
  });

  sel.command('id <id>').description('Select entity by outliner ID').action(async (id) => {
    const client = await getClient();
    const found = await client.evaluate(selectById(Number(id)));
    client.close();
    if (!found) {
      process.stderr.write(`Error: Entity with id ${id} not found.\n`);
      process.exit(1);
    }
  });

  // --- Delete ---
  program.command('delete').description('Delete selected entities').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_DELETE'));
    client.close();
  });

  program.command('delete-guides').description('Delete all guide lines').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_DELETE_GUIDES'));
    client.close();
  });

  // --- Move ---
  program
    .command('move <dx,dy,dz>')
    .description('Move selected by vector (e.g. "1000,0,0"). Axis inferred from mousemove direction.')
    .option('--axis <axis>', 'constrain to axis (x|y|z)', 'x')
    .action(async (vec, opts) => {
      const parts = vec.split(',').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) {
        process.stderr.write('Error: Move requires "dx,dy,dz" format.\n');
        process.exit(1);
      }
      const [dx, dy, dz] = parts;
      const distance = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));

      // Determine mousemove direction based on dominant axis
      let mmDx = 0, mmDy = 0;
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) {
        mmDx = dx > 0 ? 150 : -150;
      } else if (Math.abs(dy) >= Math.abs(dz)) {
        mmDx = dy > 0 ? 150 : -150;
      } else {
        mmDy = dz > 0 ? -150 : 150;
      }

      const client = await getClient();
      const center = await client.evaluate(getCanvasCenter());
      await client.evaluate(nMW('ACTIVATE_MOVE'));
      await client.mouseClick(center.cx, center.cy);
      await client.evaluate(`(() => {
        const canvas = document.querySelector('canvas');
        canvas.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, cancelable: true, view: window,
          clientX: ${center.cx + mmDx}, clientY: ${center.cy + mmDy}, buttons: 0
        }));
      })()`);
      await client.evaluate(typeVCB(String(distance)));
      await client.pressKey('Enter');

      const dialog = await client.evaluate(checkDialog());
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }
      client.close();
    });

  // --- Rotate ---
  program
    .command('rotate <angle>')
    .description('Rotate selected by angle (degrees). Uses canvas center as pivot.')
    .action(async (angleStr) => {
      const angle = Number(angleStr);
      if (isNaN(angle)) {
        process.stderr.write('Error: Angle must be a number (degrees).\n');
        process.exit(1);
      }

      const client = await getClient();
      const center = await client.evaluate(getCanvasCenter());
      const cx = center.cx, cy = center.cy;

      await client.evaluate(nMW('ACTIVATE_ROTATE'));
      await client.mouseClick(cx, cy);
      await client.mouseClick(cx + 100, cy);
      await client.mouseMove(cx, cy - 100);
      await client.evaluate(typeVCB(String(angle)));
      await client.pressKey('Enter');

      const dialog = await client.evaluate(checkDialog());
      if (dialog) {
        process.stderr.write(`Error: SketchUp showed a blocking dialog: "${dialog}"\n`);
        process.exit(1);
      }
      client.close();
    });

  // --- Scale ---
  program
    .command('scale <factors>')
    .description('Scale selected. Match factor count to grip type: "2" (1D), "2,2" (2D), "2,2,2" (3D).')
    .action(async (factors) => {
      const client = await getClient();
      const center = await client.evaluate(getCanvasCenter());

      // Get grip positions by taking screenshot? For now click near entity bounding box corner
      // The grip is typically slightly outside the entity's visible area.
      // We click at canvas center + offset where grips typically appear.
      await client.evaluate(nMW('ACTIVATE_SCALE'));

      // Click a corner grip (typically upper-right of bounding box visible on screen)
      await client.mouseClick(center.cx + 60, center.cy - 60);
      await client.mouseMove(center.cx + 120, center.cy - 120);
      await client.evaluate(typeVCB(String(factors)));
      await client.pressKey('Enter');

      const dialog = await client.evaluate(checkDialog());
      if (dialog) {
        process.stderr.write(
          `Error: SketchUp rejected scale input: "${dialog}"\n` +
          'For scale, match factor count to grip type:\n' +
          '  edge midpoint → "2"   corner (2D) → "2,2"   corner (3D) → "2,2,2"\n'
        );
        process.exit(1);
      }
      client.close();
    });

  // --- Flip ---
  program
    .command('flip <axis>')
    .description('Flip selected along axis (x|y|z)')
    .action(async (axis) => {
      const axisMap = { x: 0, y: 1, z: 2 };
      const steps = axisMap[axis.toLowerCase()];
      if (steps === undefined) {
        process.stderr.write('Error: Axis must be x, y, or z.\n');
        process.exit(1);
      }

      const client = await getClient();
      const center = await client.evaluate(getCanvasCenter());

      await client.evaluate(nMW('ACTIVATE_FLIP_TOOL'));
      // Arrow keys cycle through planes (default is first plane)
      for (let i = 0; i < steps; i++) {
        await client.pressKey('ArrowRight');
      }
      await client.mouseClick(center.cx, center.cy);
      client.close();
    });

  // --- Hide / Show ---
  program.command('hide').description('Hide selected entities').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_HIDE'));
    client.close();
  });

  program
    .command('show')
    .description('Unhide entities')
    .option('--last', 'unhide only the last hidden (default)')
    .option('--all', 'unhide all hidden entities')
    .action(async (opts) => {
      const client = await getClient();
      if (opts.all) await client.evaluate(nMW('EDIT_UNHIDE_ALL'));
      else await client.evaluate(nMW('EDIT_UNHIDE_LAST'));
      client.close();
    });

  // --- Lock / Unlock ---
  program.command('lock').description('Lock selected entities').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('LOCK_SELECTED'));
    client.close();
  });

  program.command('unlock').description('Unlock all entities').option('--all', 'unlock all').action(async (opts) => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_UNLOCK_ALL'));
    client.close();
  });

  // --- Group / Component ---
  program.command('group').description('Group selected entities').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_MAKE_GROUP'));
    client.close();
  });

  program
    .command('make-component [name]')
    .description('Make a component from selected entities')
    .action(async (name) => {
      const client = await getClient();
      await client.evaluate(nMW('EDIT_MAKE_COMPONENT'));
      client.close();
    });

  // --- Clipboard ---
  program.command('copy').description('Copy selection to clipboard').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_COPY'));
    client.close();
  });

  program.command('paste-in-place').description('Paste at original position').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('EDIT_PASTE_IN_PLACE'));
    client.close();
  });

  // --- Undo / Redo ---
  program
    .command('undo [n]')
    .description('Undo last n operations (default 1)')
    .action(async (n = '1') => {
      const count = parseInt(n, 10) || 1;
      const client = await getClient();
      for (let i = 0; i < count; i++) {
        await client.evaluate(nMW('UNDO'));
      }
      client.close();
    });

  program
    .command('redo [n]')
    .description('Redo last n operations (default 1)')
    .action(async (n = '1') => {
      const count = parseInt(n, 10) || 1;
      const client = await getClient();
      for (let i = 0; i < count; i++) {
        await client.evaluate(nMW('REDO'));
      }
      client.close();
    });

  // --- Misc ---
  program.command('purge').description('Purge unused components, materials, layers').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('PURGE_UNUSED'));
    client.close();
  });

  program.command('intersect-faces').description('Intersect selected faces with model').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('INTERSECT_FACES_WITH_MODEL'));
    client.close();
  });

  program.command('weld-edges').description('Weld selected edges into a curve').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('WELD_EDGES'));
    client.close();
  });

  program.command('reverse-faces').description('Reverse face normals on selection').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('REVERSE_FACES'));
    client.close();
  });

  program.command('orient-faces').description('Orient all faces consistently').action(async () => {
    const client = await getClient();
    await client.evaluate(nMW('ORIENT_FACES'));
    client.close();
  });
}
