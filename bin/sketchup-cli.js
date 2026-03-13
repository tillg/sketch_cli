#!/usr/bin/env node
import { program } from 'commander';
import { register as registerSession } from '../src/commands/session.js';
import { register as registerInspect } from '../src/commands/inspect.js';
import { register as registerGeometry } from '../src/commands/geometry.js';
import { register as registerDraw } from '../src/commands/draw.js';
import { register as registerEdit } from '../src/commands/edit.js';
import { register as registerView } from '../src/commands/view.js';
import { register as registerTags } from '../src/commands/tags.js';
import { register as registerExport } from '../src/commands/export.js';
import { register as registerSolid } from '../src/commands/solid.js';

program
  .name('sketchup-cli')
  .description('Control SketchUp Web (app.sketchup.com) via Playwright automation')
  .version('0.1.0');

registerSession(program);
registerInspect(program);
registerGeometry(program);
registerDraw(program);
registerEdit(program);
registerView(program);
registerTags(program);
registerExport(program);
registerSolid(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
