import { getClient } from '../session/client.js';
import { nMW } from '../api/module83217.js';

export function register(program) {
  const solid = program.command('solid').description('Solid/boolean commands');

  const ops = {
    union:       'ACTIVATE_UNION',
    intersect:   'ACTIVATE_INTERSECT',
    subtract:    'ACTIVATE_DIFFERENCE',
    trim:        'ACTIVATE_TRIM',
    split:       'ACTIVATE_SPLIT',
    'outer-shell': 'ACTIVATE_OUTER_SHELL',
  };

  for (const [name, yfsCmd] of Object.entries(ops)) {
    solid
      .command(name)
      .description(`Solid ${name} of selected solid groups`)
      .action(async () => {
        const client = await getClient();
        await client.evaluate(nMW(yfsCmd));
        client.close();
      });
  }
}
