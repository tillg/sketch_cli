import { getClient } from '../session/client.js';
import { nMW } from '../api/module83217.js';
import { captureBlob } from '../api/stl.js';
import { isSaveNeeded, getPlans } from '../api/adapters.js';
import { dismissBlockingDialogs, getBlockingDialog } from '../dialogs.js';
import { printJSON } from '../output.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function register(program) {
  const exp = program.command('export').description('Export commands');

  // export stl
  exp
    .command('stl')
    .description('Export model as STL (free plan)')
    .option('--output <file>', 'output file path', 'model.stl')
    .action(async (opts) => {
      const client = await getClient();
      console.error('Exporting STL...');
      const bytes = await client.evaluate(captureBlob('EXPORT_STL'));
      client.close();
      const outPath = path.resolve(opts.output);
      fs.writeFileSync(outPath, Buffer.from(bytes));
      console.log(`Saved to ${outPath} (${bytes.length} bytes)`);
    });

  // export png
  exp
    .command('png')
    .description('Export viewport as PNG (free plan)')
    .option('--output <file>', 'output file path', 'model.png')
    .action(async (opts) => {
      const client = await getClient();
      const outPath = path.resolve(opts.output);
      await client.screenshot(outPath);
      client.close();
      console.log(`Saved to ${outPath}`);
    });

  // Paid-plan exports
  for (const [fmt, cmd] of [['obj','EXPORT_OBJ'],['fbx','EXPORT_FBX'],['dae','EXPORT_DAE']]) {
    exp
      .command(fmt)
      .description(`Export as ${fmt.toUpperCase()} (requires paid plan)`)
      .option('--output <file>', `output file path`, `model.${fmt}`)
      .action(async (opts) => {
        const client = await getClient();
        console.error(`Exporting ${fmt.toUpperCase()} (paid plan required)...`);
        const bytes = await client.evaluate(captureBlob(cmd));
        client.close();
        const outPath = path.resolve(opts.output);
        fs.writeFileSync(outPath, Buffer.from(bytes));
        console.log(`Saved to ${outPath}`);
      });
  }

  exp
    .command('dwg')
    .description('Export as DWG (requires paid plan)')
    .option('--output <file>', 'output file path', 'model.dwg')
    .option('--2d', 'export 2D DWG')
    .option('--3d', 'export 3D DWG')
    .action(async (opts) => {
      const cmd = opts['3d'] ? 'EXPORT_DWG_3D' : 'EXPORT_DWG_2D';
      const client = await getClient();
      console.error('Exporting DWG (paid plan required)...');
      const bytes = await client.evaluate(captureBlob(cmd));
      client.close();
      const outPath = path.resolve(opts.output);
      fs.writeFileSync(outPath, Buffer.from(bytes));
      console.log(`Saved to ${outPath}`);
    });

  // download
  program
    .command('download')
    .description('Download the .skp file')
    .option('--output <file>', 'output file path', 'model.skp')
    .action(async (opts) => {
      const client = await getClient();
      console.error('Downloading SKP...');
      const bytes = await client.evaluate(captureBlob('DOWNLOAD_SKP'));
      client.close();
      const outPath = path.resolve(opts.output);
      fs.writeFileSync(outPath, Buffer.from(bytes));
      console.log(`Saved to ${outPath}`);
    });

  // save
  program
    .command('save')
    .description('Save model to cloud')
    .action(async () => {
      const client = await getClient();
      const needed = await client.evaluate(isSaveNeeded());
      if (!needed) {
        console.log('Model is up to date (no save needed).');
        client.close();
        return;
      }
      // SketchUp auto-saves on Ctrl+S / SAVE command
      await client.evaluate(nMW('SAVE'));
      // Small wait for save to complete
      await new Promise((r) => setTimeout(r, 1000));
      client.close();
      console.log('Saved.');
    });

  // save-as
  program
    .command('save-as <name>')
    .description('Save copy under new name')
    .action(async (name) => {
      const client = await getClient();
      await automateSaveAs(client, name);
      client.close();
      console.log(`Saved as ${name}.`);
    });

  // plans
  program
    .command('plans')
    .description('List all plans/files in Trimble Connect account')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const client = await getClient({ requireModel: false });
      const projects = await client.evaluate(getPlans());
      client.close();
      if (opts.json || !projects) { printJSON(projects); return; }
      if (Array.isArray(projects)) {
        for (const p of projects) {
          console.log(`${p.id ?? p.projectId ?? '?'}\t${p.name ?? p.title ?? JSON.stringify(p)}`);
        }
      } else {
        printJSON(projects);
      }
    });

  // open
  program
    .command('open <file-id>')
    .description('Open a model by file ID (use `plans` to discover IDs)')
    .action(async (fileId) => {
      const client = await getClient({ requireModel: false });
      // Navigate to the model URL
      await client.navigate(`https://app.sketchup.com/app#${fileId}`);
      // Wait for model to load
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const status = await client.checkSession();
        if (status.ok) {
          console.log('Model opened.');
          client.close();
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      client.close();
      process.stderr.write('Error: Timed out waiting for model to open.\n');
      process.exit(1);
    });

  // new
  program
    .command('new')
    .description('Open a new blank model')
    .action(async () => {
      const client = await getClient({ requireModel: false });
      const session = await client.checkSession();

      if (!session.ok && session.reason === 'no_model') {
        // On the home page — click the "Create new" button
        await client.evaluate(`(() => {
          const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create new'));
          if (btn) btn.click();
        })()`);
      } else {
        // Already inside a model — use the YFS command
        await client.evaluate(nMW('NEW_MODEL'));
      }

      // Wait for model to become ready, handling dialogs and page transitions
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await dismissBlockingDialogs(client, { attempts: 2, settleMs: 200 });
          const status = await client.checkSession();
          if (status.ok) {
            const dialog = await getBlockingDialog(client);
            if (!dialog) {
              console.log('New model created.');
              client.close();
              return;
            }
          }
        } catch {
          // Page may be navigating — context temporarily lost; keep polling
        }
      }
      client.close();
      console.error('Warning: Timed out waiting for new model to load.');
    });

  // run-script
  program
    .command('run-script <file>')
    .description('Execute a JS file in the browser context')
    .action(async (file) => {
      const scriptPath = path.resolve(file);
      if (!fs.existsSync(scriptPath)) {
        process.stderr.write(`Error: File not found: ${scriptPath}\n`);
        process.exit(1);
      }
      const script = fs.readFileSync(scriptPath, 'utf8');
      const client = await getClient();
      const result = await client.evaluate(script);
      client.close();
      if (result !== null && result !== undefined) {
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      }
    });
}

async function automateSaveAs(client, name) {
  await client.evaluate(nMW('SAVE_AS'));

  await waitFor(client, `(() => {
    return [...document.querySelectorAll('*')].some(el =>
      (el.innerText || '').trim() === 'Projects'
    );
  })()`, 15000, 250);

  await waitFor(client, `(() => {
    const hasNameInput = [...document.querySelectorAll('input')].some(el =>
      el.placeholder === 'Enter a model name here'
    );
    const hasDestinationCard = [...document.querySelectorAll('*')].some(el => {
      const text = el.innerText || '';
      const rect = el.getBoundingClientRect();
      return text.includes('SketchUp') && text.includes('Server:') && rect.width > 150 && rect.width < 400 && rect.height > 100;
    });
    return hasNameInput || hasDestinationCard;
  })()`, 15000, 250);

  let hasNameInput = await client.evaluate(`(() => {
    return [...document.querySelectorAll('input')].some(el =>
      el.placeholder === 'Enter a model name here'
    );
  })()`);

  if (!hasNameInput) {
    const sketchupCard = await client.evaluate(`(() => {
      const card = [...document.querySelectorAll('*')].find(el =>
        (() => {
          const text = el.innerText || '';
          const rect = el.getBoundingClientRect();
          return text.includes('SketchUp') && text.includes('Server:') && rect.width > 150 && rect.width < 400 && rect.height > 100;
        })()
      );
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);

    if (!sketchupCard) {
      throw new Error('Save As destination card not found');
    }

    await client.mouseClick(sketchupCard.x, sketchupCard.y);
    await waitFor(client, `(() => {
      return [...document.querySelectorAll('input')].some(el =>
        el.placeholder === 'Enter a model name here'
      );
    })()`, 15000, 250);
    hasNameInput = true;
  }

  if (!hasNameInput) {
    throw new Error('Save As name input not found');
  }

  await client.evaluate(`(() => {
    const input = [...document.querySelectorAll('input')].find(el =>
      el.placeholder === 'Enter a model name here'
    );
    if (!input) throw new Error('Save As name input not found');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setValue.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  const saveHere = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b =>
      (b.innerText || '').trim() === 'Save here'
    );
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);

  if (!saveHere) {
    throw new Error('Save As submit button not found');
  }

  await client.mouseClick(saveHere.x, saveHere.y);

  await waitFor(client, `(() => {
    const inputPresent = [...document.querySelectorAll('input')].some(el =>
      el.placeholder === 'Enter a model name here'
    );
    const saveButtonPresent = [...document.querySelectorAll('button')].some(b =>
      (b.innerText || '').trim() === 'Save here'
    );
    return !inputPresent && !saveButtonPresent;
  })()`, 30000, 500);

  await waitFor(client, `(() => {
    return (document.body.innerText || '').includes(${JSON.stringify(name)});
  })()`, 30000, 500).catch(() => {});
}

async function waitFor(client, script, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(script)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for SketchUp UI state');
}
