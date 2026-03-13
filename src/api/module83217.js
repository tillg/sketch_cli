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
export function projectScript(mx, my, mz) {
  return `(() => {
    const mod = ${INJECT_MOD};
    const m = mod.rYl();
    const vp = Module.getViewportDimensions();
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const x = m.m00*${mx} + m.m01*${my} + m.m02*${mz} + m.m03;
    const y = m.m10*${mx} + m.m11*${my} + m.m12*${mz} + m.m13;
    const z = m.m20*${mx} + m.m21*${my} + m.m22*${mz} + m.m23;
    const w = m.m30*${mx} + m.m31*${my} + m.m32*${mz} + m.m33;
    const ndcX = x / w;
    const ndcY = y / w;
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
