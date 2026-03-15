// JS snippets injected into the SketchUp browser page.
// All exported functions return strings suitable for page.evaluate().

export const INJECT_MOD = `(() => {
  if (window.__skuMod) return window.__skuMod;
  const chunk = window.webpackChunksketchup_web_frontend;
  let wpRequire;
  chunk.push([['__cli_probe'], {}, (r) => { wpRequire = r; }]);
  window.__skuMod = wpRequire(83217);
  window.__skuWpRequire = wpRequire;
  return window.__skuMod;
})()`;

export function nMW(commandName) {
  return `(() => {
    const mod = ${INJECT_MOD};
    mod.nMW(mod.YFS.${commandName});
  })()`;
}

export function getCameraState() {
  return `(() => {
    const mod = ${INJECT_MOD};
    const m = mod.rYl();
    return { matrix: m, fov: mod.jzI() };
  })()`;
}

export function getExtents() {
  return `(() => {
    const mod = ${INJECT_MOD};
    return mod.AT7();
  })()`;
}

export function getCanvasCenter() {
  return `(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    };
  })()`;
}

export function getViewportDimensions() {
  return `(() => {
    return Module.getViewportDimensions();
  })()`;
}

// Project a model-space point to screen coordinates using the current camera.
// Returns a JS function body string (for use inside evaluate).
// Uses view matrix (rYl) + frustum-based projection for correct results in
// both perspective and parallel projection modes.
// Inputs must be in inches (SketchUp's internal unit). Callers with mm values
// must divide by 25.4 before calling: projectScript(xMm/25.4, yMm/25.4, zMm/25.4).
export function projectScript(mx, my, mz) {
  return `(() => {
    const mod = ${INJECT_MOD};
    const m = mod.rYl();
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const frustum = Module.getViewFrustum();
    const isPerspective = Module.getPerspective();
    // rYl() returns camera-to-world. Invert: R^T for rotation, -R^T*t for translation.
    const r00 = m.m00, r01 = m.m10, r02 = m.m20;
    const r10 = m.m01, r11 = m.m11, r12 = m.m21;
    const r20 = m.m02, r21 = m.m12, r22 = m.m22;
    const tx = -(r00*m.m03 + r01*m.m13 + r02*m.m23);
    const ty = -(r10*m.m03 + r11*m.m13 + r12*m.m23);
    const tz = -(r20*m.m03 + r21*m.m13 + r22*m.m23);
    const ex = r00*${mx} + r01*${my} + r02*${mz} + tx;
    const ey = r10*${mx} + r11*${my} + r12*${mz} + ty;
    const ez = r20*${mx} + r21*${my} + r22*${mz} + tz;
    let ndcX, ndcY;
    if (isPerspective) {
      ndcX = (2*frustum.near*ex/ez - (frustum.right+frustum.left)) / (frustum.right-frustum.left);
      ndcY = (2*frustum.near*ey/ez - (frustum.top+frustum.bottom)) / (frustum.top-frustum.bottom);
    } else {
      ndcX = (2*ex - (frustum.right+frustum.left)) / (frustum.right-frustum.left);
      ndcY = (2*ey - (frustum.top+frustum.bottom)) / (frustum.top-frustum.bottom);
    }
    const screenX = rect.left + (ndcX + 1) / 2 * rect.width;
    const screenY = rect.top + (1 - ndcY) / 2 * rect.height;
    return { x: screenX, y: screenY };
  })()`;
}

export function typeVCB(valueStr) {
  const keys = {
    '0': [48, 48], '1': [49, 49], '2': [50, 50], '3': [51, 51],
    '4': [52, 52], '5': [53, 53], '6': [54, 54], '7': [55, 55],
    '8': [56, 56], '9': [57, 57], ',': [44, 188], '.': [46, 190],
    '-': [45, 189],
  };
  const physicalKeys = {
    '0': 'Digit0', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3',
    '4': 'Digit4', '5': 'Digit5', '6': 'Digit6', '7': 'Digit7',
    '8': 'Digit8', '9': 'Digit9', ',': 'Comma', '.': 'Period', '-': 'Minus',
  };
  const calls = [...String(valueStr)].map((ch) => {
    const [inputChar, keyCode] = keys[ch] ?? [ch.charCodeAt(0), ch.charCodeAt(0)];
    const physicalKey = physicalKeys[ch] ?? `Key${ch.toUpperCase()}`;
    return `Module.onKeyDown({ physicalKey: '${physicalKey}', inputChar: ${inputChar}, keyCode: ${keyCode} });`;
  });
  return `(() => {
    ${calls.join('\n    ')}
  })()`;
}

// Find the screen position of a model-space point by probing SketchUp's internal
// screen-to-model mapping. Uses projectScript as initial guess, then refines with
// Module.mouseMoveHandler + Module.getPointerPosition (Newton's method on ground plane).
// Input coordinates are in inches. Returns a script that evaluates to {x, y}.
export function findScreenPosScript(mx, my, mz) {
  return `(async () => {
    const mod = ${INJECT_MOD};
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const frustum = Module.getViewFrustum();
    const isPerspective = Module.getPerspective();
    const m = mod.rYl();
    // Initial guess from projection formula
    const r00 = m.m00, r01 = m.m10, r02 = m.m20;
    const r10 = m.m01, r11 = m.m11, r12 = m.m21;
    const r20 = m.m02, r21 = m.m12, r22 = m.m22;
    const tx = -(r00*m.m03 + r01*m.m13 + r02*m.m23);
    const ty = -(r10*m.m03 + r11*m.m13 + r12*m.m23);
    const tz = -(r20*m.m03 + r21*m.m13 + r22*m.m23);
    const ex = r00*${mx} + r01*${my} + r02*${mz} + tx;
    const ey = r10*${mx} + r11*${my} + r12*${mz} + ty;
    const ez = r20*${mx} + r21*${my} + r22*${mz} + tz;
    let ndcX, ndcY;
    if (isPerspective) {
      ndcX = (2*frustum.near*ex/ez - (frustum.right+frustum.left)) / (frustum.right-frustum.left);
      ndcY = (2*frustum.near*ey/ez - (frustum.top+frustum.bottom)) / (frustum.top-frustum.bottom);
    } else {
      ndcX = (2*ex - (frustum.right+frustum.left)) / (frustum.right-frustum.left);
      ndcY = (2*ey - (frustum.top+frustum.bottom)) / (frustum.top-frustum.bottom);
    }
    let sx = rect.left + (ndcX + 1) / 2 * rect.width;
    let sy = rect.top + (1 - ndcY) / 2 * rect.height;
    // Refine with Newton's method (3 iterations)
    const targetX = ${mx}, targetY = ${my};
    for (let i = 0; i < 3; i++) {
      Module.mouseMoveHandler(Math.round(sx), Math.round(sy));
      const p = Module.getPointerPosition();
      const errX = p.x - targetX;
      const errY = p.y - targetY;
      if (Math.abs(errX) < 0.5 && Math.abs(errY) < 0.5) break;
      // Compute Jacobian by finite differences
      const h = 5;
      Module.mouseMoveHandler(Math.round(sx + h), Math.round(sy));
      const px = Module.getPointerPosition();
      Module.mouseMoveHandler(Math.round(sx), Math.round(sy + h));
      const py = Module.getPointerPosition();
      const dxdsx = (px.x - p.x) / h, dydsx = (px.y - p.y) / h;
      const dxdsy = (py.x - p.x) / h, dydsy = (py.y - p.y) / h;
      const det = dxdsx * dydsy - dydsx * dxdsy;
      if (Math.abs(det) < 1e-10) break;
      sx -= (dydsy * errX - dxdsy * errY) / det;
      sy -= (-dydsx * errX + dxdsx * errY) / det;
    }
    return { x: Math.round(sx), y: Math.round(sy) };
  })()`;
}

export function dispatchMousemove(dx = 80, dy = 80) {
  return `(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, cancelable: true, view: window,
      clientX: cx + ${dx}, clientY: cy + ${dy}, buttons: 0
    }));
  })()`;
}
