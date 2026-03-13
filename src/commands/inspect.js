import path from 'path';
import { getClient } from '../session/client.js';
import { getStats, getModelInfo, getMaterials, getComponents, getScenes, getSelection } from '../api/adapters.js';
import { getCameraState, getExtents } from '../api/module83217.js';
import { printKV, printTable, printJSON } from '../output.js';

export function register(program) {
  program
    .command('stats')
    .description('Print model statistics')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const s = await client.evaluate(getStats());
      client.close();
      const data = {
        edges: s.num_edges ?? s.edges ?? '?',
        faces: s.num_faces ?? s.faces ?? '?',
        components: s.num_component_definitions ?? s.componentDefinitions ?? '?',
        materials: s.num_materials ?? s.materials ?? '?',
        units: s.units ?? s.unit ?? '?',
      };
      if (opts.json) { printJSON(data); return; }
      printKV({
        'Edges': data.edges,
        'Faces': data.faces,
        'Components': data.components,
        'Materials': data.materials,
        'Units': data.units,
      }, false);
    });

  program
    .command('info')
    .description('File metadata: name, path, version')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const info = await client.evaluate(getModelInfo());
      client.close();
      const data = {
        file: info.info?.name ?? path.basename(info.filePath ?? ''),
        path: info.filePath ?? '?',
        version: info.version ?? '?',
      };
      if (opts.json) { printJSON(data); return; }
      printKV({ 'File': data.file, 'Path': data.path, 'Version': data.version }, false);
    });

  program
    .command('extents')
    .description('Model bounding box (min/max XYZ)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const ext = await client.evaluate(getExtents());
      client.close();
      if (opts.json) { printJSON(ext); return; }
      printKV({
        'Left':   ext.left,
        'Right':  ext.right,
        'Top':    ext.top,
        'Bottom': ext.bottom,
        'Near':   ext.near,
        'Far':    ext.far,
      }, false);
    });

  program
    .command('camera')
    .description('Current camera transform and field of view')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const cam = await client.evaluate(getCameraState());
      client.close();
      if (opts.json) { printJSON({ matrix: cam.matrix, fov: cam.fov }); return; }
      console.log(`FOV: ${cam.fov}°`);
      const m = cam.matrix;
      console.log('Matrix:');
      const fields = [['m00','m01','m02','m03'],['m10','m11','m12','m13'],['m20','m21','m22','m23'],['m30','m31','m32','m33']];
      for (const row of fields) {
        console.log('  ' + row.map((k) => String((m[k] ?? 0).toFixed(4)).padStart(10)).join(' '));
      }
    });

  program
    .command('materials')
    .description('List all material names in the model')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const mats = await client.evaluate(getMaterials());
      client.close();
      if (opts.json) { printJSON(mats); return; }
      mats.forEach((m) => console.log(m));
    });

  program
    .command('components')
    .description('List all component definition names')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const comps = await client.evaluate(getComponents());
      client.close();
      if (opts.json) { printJSON(comps); return; }
      comps.forEach((c) => console.log(c));
    });

  program
    .command('scenes')
    .description('List all saved scenes/pages')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const scenes = await client.evaluate(getScenes());
      client.close();
      if (opts.json) { printJSON(scenes); return; }
      printTable(['INDEX', 'NAME'], scenes.map((s) => [s.index, s.name]), false);
    });

  program
    .command('selection')
    .description('Info about currently selected entities')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const sel = await client.evaluate(getSelection());
      client.close();
      if (opts.json) { printJSON(sel); return; }
      printKV({
        'Count':      sel.count,
        'Edges':      sel.edgeCount,
        'Title':      sel.title,
        'Name':       sel.instanceName,
        'Definition': sel.definitionName,
        'Area':       sel.area,
        'Volume':     sel.volume,
        'Visible':    sel.visible,
        'Locked':     sel.locked,
      }, false);
    });
}
