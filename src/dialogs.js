import { checkDialog, dismissBlockingDialogs as dismissBlockingDialogsScript } from './api/adapters.js';

export async function dismissBlockingDialogs(client, { attempts = 3, settleMs = 150 } = {}) {
  const dismissed = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await client.evaluate(dismissBlockingDialogsScript());
    const batch = result?.dismissed ?? [];
    if (!batch.length) break;
    dismissed.push(...batch);
    if (settleMs > 0) await sleep(settleMs);
  }
  return dismissed;
}

export async function getBlockingDialog(client) {
  await dismissBlockingDialogs(client);
  return client.evaluate(checkDialog());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
