// Output formatting utilities

export function printTable(headers, rows, asJson) {
  if (asJson) {
    const objects = rows.map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h.toLowerCase()] = row[i]; });
      return obj;
    });
    console.log(JSON.stringify(objects, null, 2));
    return;
  }

  // Human-readable aligned table
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const header = headers.map((h, i) => h.toUpperCase().padEnd(widths[i])).join('  ');
  console.log(header);
  for (const row of rows) {
    console.log(row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  '));
  }
}

export function printKV(obj, asJson) {
  if (asJson) {
    console.log(JSON.stringify(obj, null, 2));
    return;
  }
  const keys = Object.keys(obj);
  const maxKey = Math.max(...keys.map((k) => k.length));
  for (const [k, v] of Object.entries(obj)) {
    console.log(`${k.padEnd(maxKey)}  ${v}`);
  }
}

export function printJSON(data) {
  console.log(JSON.stringify(data, null, 2));
}

export function die(code, message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(code);
}

export function warn(message) {
  process.stderr.write(`Warning: ${message}\n`);
}
