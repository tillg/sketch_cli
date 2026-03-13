// STL export and parsing scripts

export function exportAndParseFaces() {
  return `(async () => {
    const origCreate = URL.createObjectURL.bind(URL);
    let stlBuffer = null;
    URL.createObjectURL = function(blob) {
      const url = origCreate(blob);
      blob.arrayBuffer().then(buf => { stlBuffer = buf; });
      return url;
    };

    const chunk = window.webpackChunksketchup_web_frontend;
    let wpRequire;
    chunk.push([['__cli_stl'], {}, (r) => { wpRequire = r; }]);
    const mod = wpRequire(83217);
    mod.nMW(mod.YFS.EXPORT_STL);

    // Wait up to 8 seconds for blob
    for (let i = 0; i < 160; i++) {
      if (stlBuffer !== null) break;
      await new Promise(r => setTimeout(r, 50));
    }
    URL.createObjectURL = origCreate;

    if (!stlBuffer) throw new Error('STL export timed out');

    const view = new DataView(stlBuffer);
    const numTriangles = view.getUint32(80, true);
    const triangles = [];
    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
      const normal = [
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true)
      ];
      const v1 = [view.getFloat32(offset+12,true), view.getFloat32(offset+16,true), view.getFloat32(offset+20,true)];
      const v2 = [view.getFloat32(offset+24,true), view.getFloat32(offset+28,true), view.getFloat32(offset+32,true)];
      const v3 = [view.getFloat32(offset+36,true), view.getFloat32(offset+40,true), view.getFloat32(offset+44,true)];
      triangles.push({ normal, vertices: [v1, v2, v3] });
      offset += 50;
    }
    return triangles;
  })()`;
}

export function exportAndParseEdges() {
  return `(async () => {
    const origCreate = URL.createObjectURL.bind(URL);
    let stlBuffer = null;
    URL.createObjectURL = function(blob) {
      const url = origCreate(blob);
      blob.arrayBuffer().then(buf => { stlBuffer = buf; });
      return url;
    };

    const chunk = window.webpackChunksketchup_web_frontend;
    let wpRequire;
    chunk.push([['__cli_stl_edges'], {}, (r) => { wpRequire = r; }]);
    const mod = wpRequire(83217);
    mod.nMW(mod.YFS.EXPORT_STL);

    for (let i = 0; i < 160; i++) {
      if (stlBuffer !== null) break;
      await new Promise(r => setTimeout(r, 50));
    }
    URL.createObjectURL = origCreate;
    if (!stlBuffer) throw new Error('STL export timed out');

    const view = new DataView(stlBuffer);
    const numTriangles = view.getUint32(80, true);
    const edgeCount = new Map();
    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
      const verts = [
        [view.getFloat32(offset+12,true), view.getFloat32(offset+16,true), view.getFloat32(offset+20,true)],
        [view.getFloat32(offset+24,true), view.getFloat32(offset+28,true), view.getFloat32(offset+32,true)],
        [view.getFloat32(offset+36,true), view.getFloat32(offset+40,true), view.getFloat32(offset+44,true)]
      ];
      for (const [a, b] of [[0,1],[1,2],[2,0]]) {
        const key = [verts[a], verts[b]]
          .map(v => v.map(x => x.toFixed(3)).join(','))
          .sort().join('|');
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
      offset += 50;
    }
    return [...edgeCount.entries()]
      .filter(([, c]) => c === 1)
      .map(([key]) => {
        const [aStr, bStr] = key.split('|');
        const start = aStr.split(',').map(Number);
        const end = bStr.split(',').map(Number);
        const dx = end[0]-start[0], dy = end[1]-start[1], dz = end[2]-start[2];
        const length = Math.sqrt(dx*dx + dy*dy + dz*dz);
        return { start, end, length: Math.round(length * 100) / 100 };
      });
  })()`;
}

export function captureBlob(yfsCommand) {
  return `(async () => {
    const origCreate = URL.createObjectURL.bind(URL);
    let blobBuffer = null;
    URL.createObjectURL = function(blob) {
      const url = origCreate(blob);
      blob.arrayBuffer().then(buf => {
        blobBuffer = Array.from(new Uint8Array(buf));
      });
      return url;
    };

    const chunk = window.webpackChunksketchup_web_frontend;
    let wpRequire;
    chunk.push([['__cli_export_${yfsCommand}'], {}, (r) => { wpRequire = r; }]);
    const mod = wpRequire(83217);
    mod.nMW(mod.YFS.${yfsCommand});

    for (let i = 0; i < 200; i++) {
      if (blobBuffer !== null) break;
      await new Promise(r => setTimeout(r, 50));
    }
    URL.createObjectURL = origCreate;
    if (!blobBuffer) throw new Error('Export timed out for ${yfsCommand}');
    return blobBuffer;
  })()`;
}
