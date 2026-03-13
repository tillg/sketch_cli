import { getClient } from '../session/client.js';
import { getTags, createTag, setTagVisibility, selectByTag } from '../api/adapters.js';
import { nMW } from '../api/module83217.js';
import { printTable, printJSON } from '../output.js';

export function register(program) {
  const tag = program.command('tag').description('Tag/layer commands');

  tag
    .command('list')
    .description('List all tags with visibility')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient();
      const tags = await client.evaluate(getTags());
      client.close();
      if (opts.json) { printJSON(tags); return; }
      printTable(
        ['NAME', 'VISIBLE', 'COLOR'],
        tags.map((t) => [t.name, t.visible ? 'yes' : 'no', t.color ?? '—']),
        false
      );
    });

  tag
    .command('create <name>')
    .description('Create a new tag')
    .action(async (name) => {
      const client = await getClient();
      await client.evaluate(createTag(name));
      client.close();
      console.log(`Tag "${name}" created.`);
    });

  tag
    .command('select <name>')
    .description('Select all entities on a tag')
    .action(async (name) => {
      const client = await getClient();
      await client.evaluate(selectByTag(name));
      client.close();
    });

  tag
    .command('hide <name>')
    .description('Hide all entities on a tag')
    .action(async (name) => {
      const client = await getClient();
      const ok = await client.evaluate(setTagVisibility(name, false));
      client.close();
      if (!ok) {
        process.stderr.write(`Error: Tag "${name}" not found.\n`);
        process.exit(1);
      }
    });

  tag
    .command('show <name>')
    .description('Show all entities on a tag')
    .action(async (name) => {
      const client = await getClient();
      const ok = await client.evaluate(setTagVisibility(name, true));
      client.close();
      if (!ok) {
        process.stderr.write(`Error: Tag "${name}" not found.\n`);
        process.exit(1);
      }
    });

  program
    .command('tag-color-by-tag')
    .description('Toggle color-by-tag view mode')
    .action(async () => {
      const client = await getClient();
      await client.evaluate(nMW('VIEW_COLOR_BY_TAG'));
      client.close();
    });
}
