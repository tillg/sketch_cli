import { getClient } from '../session/client.js';
import { getGroups, getOutlinerTree } from '../api/outliner.js';
import { exportAndParseFaces, exportAndParseEdges } from '../api/stl.js';
import { printTable, printJSON } from '../output.js';

export function register(program) {
  program
    .command('faces')
    .description('List all faces (triangulated, via STL export)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      console.error('Exporting geometry (may take a moment)...');
      const triangles = await client.evaluate(exportAndParseFaces());
      client.close();
      if (opts.json) { printJSON(triangles); return; }
      console.log(`# ${triangles.length} triangles`);
      for (const t of triangles) {
        const n = t.normal.map((v) => v.toFixed(2)).join(',');
        const v = t.vertices.map((vert) => vert.map((x) => x.toFixed(1)).join(',')).join(' | ');
        console.log(`normal(${n})  ${v}`);
      }
    });

  program
    .command('edges')
    .description('List all face-bounding edges (via STL export)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      console.error('Exporting geometry (may take a moment)...');
      const edges = await client.evaluate(exportAndParseEdges());
      client.close();
      if (opts.json) { printJSON(edges); return; }
      console.log(`# ${edges.length} edges (face-bounding only)`);
      for (const e of edges) {
        const s = e.start.map((v) => v.toFixed(1)).join(',');
        const end = e.end.map((v) => v.toFixed(1)).join(',');
        console.log(`(${s}) → (${end})  len=${e.length}`);
      }
    });

  program
    .command('groups')
    .description('List all groups and components')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const groups = await client.evaluate(getGroups());
      client.close();
      if (opts.json) { printJSON(groups); return; }
      printTable(
        ['ID', 'NAME', 'TYPE', 'VISIBLE', 'LOCKED', 'CHILDREN'],
        groups.map((g) => [g.id, g.name, g.type, g.visible ? 'yes' : 'no', g.locked ? 'yes' : 'no', g.childCount]),
        false
      );
    });

  program
    .command('outliner')
    .description('Print model entity tree')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const tree = await client.evaluate(getOutlinerTree());
      client.close();
      if (opts.json) { printJSON(tree); return; }
      printTree(tree, 0);
    });
}

function printTree(nodes, depth) {
  for (const node of nodes) {
    const indent = '  '.repeat(depth);
    const locked = node.locked ? ' [locked]' : '';
    const hidden = !node.visible ? ' [hidden]' : '';
    console.log(`${indent}${node.type}  ${node.name || '(unnamed)'}  id=${node.id}${locked}${hidden}`);
    if (node.children && node.children.length > 0) {
      printTree(node.children, depth + 1);
    }
  }
}
