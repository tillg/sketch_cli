import { getClient } from '../session/client.js';
import {
  INJECT_MOD,
  nMW,
  typeVCB,
  projectScript,
  getCanvasRect,
  getCameraSnapshot,
  getCameraRestorationData,
  setCameraFromRestorationData,
} from '../api/module83217.js';
import { getBlockingDialog, dismissBlockingDialogs } from '../dialogs.js';

const CANVAS_TARGET_MARGIN = 16;
const GROUND_PLANE_EPSILON = 1e-6;
const GROUND_PLANE_FIT_SCALE = 1.1;
const CAMERA_STABLE_POLL_MS = 50;
const CAMERA_STABLE_READS = 3;
const CAMERA_STABLE_TIMEOUT_MS = 2000;

export function register(program) {
  const draw = program.command('draw').description('Drawing commands');

  // draw rectangle <x> <y> <z> <width> <height>
  draw
    .command('rectangle <x> <y> <z> <width> <height>')
    .description('Draw a rectangle at the given model-space origin with exact dimensions')
    .action(async (x, y, z, width, height) => {
      const rectX = parseNumberArg(x, 'x');
      const rectY = parseNumberArg(y, 'y');
      const rectZ = parseNumberArg(z, 'z');
      const rectWidth = parseNumberArg(width, 'width');
      const rectHeight = parseNumberArg(height, 'height');
      const widthSign = rectWidth >= 0 ? 1 : -1;
      const heightSign = rectHeight >= 0 ? 1 : -1;

      await withManagedDrawClient(async (client) => {
        await dismissBlockingDialogs(client, { attempts: 3, settleMs: 100 });
        if (isGroundPlane(rectZ)) {
          await fitGroundPlaneBounds(client, getAxisAlignedBounds(rectX, rectY, rectX + rectWidth, rectY + rectHeight));
        }

        await client.evaluate(nMW('ACTIVATE_RECTANGLE'));

        const pos = await projectVisiblePoint(client, {
          label: 'Rectangle start point',
          pointLabel: 'start point',
          x: rectX,
          y: rectY,
          z: rectZ,
        });
        const xRef = await projectPoint(
          client,
          rectX + widthSign * Math.min(Math.abs(rectWidth), 100),
          rectY,
          rectZ,
        );
        const yRef = await projectPoint(
          client,
          rectX,
          rectY + heightSign * Math.min(Math.abs(rectHeight), 100),
          rectZ,
        );
        const rectNudge = combineUnitDirections(pos, [xRef, yRef], 80, { x: 80, y: -10 });
        await client.mouseClick(pos.x, pos.y);

        await moveMouseBy(client, pos.x, pos.y, rectNudge.x, rectNudge.y);
        await client.evaluate(typeVCB(`${width},${height}`));
        await client.pressKey('Enter');

        const dialog = await getBlockingDialog(client);
        if (dialog) {
          throw new Error(`SketchUp showed a blocking dialog: "${dialog}"`);
        }

        await cleanupAfterDraw(client);
      });
    });

  // draw circle <x> <y> <z> <radius>
  draw
    .command('circle <x> <y> <z> <radius>')
    .description('Draw a circle at the given model-space center with given radius')
    .option('--segments <n>', 'number of segments', '24')
    .action(async (x, y, z, radius, opts) => {
      const centerX = parseNumberArg(x, 'x');
      const centerY = parseNumberArg(y, 'y');
      const centerZ = parseNumberArg(z, 'z');
      parseNumberArg(radius, 'radius');

      await withManagedDrawClient(async (client) => {
        await dismissBlockingDialogs(client, { attempts: 3, settleMs: 100 });
        if (isGroundPlane(centerZ)) {
          await fitGroundPlaneBounds(client, {
            minX: centerX - Number(radius),
            maxX: centerX + Number(radius),
            minY: centerY - Number(radius),
            maxY: centerY + Number(radius),
          });
        }

        await client.evaluate(nMW('ACTIVATE_CIRCLE'));

        const pos = await projectVisiblePoint(client, {
          label: 'Circle center point',
          pointLabel: 'center point',
          x: centerX,
          y: centerY,
          z: centerZ,
        });
        await client.mouseClick(pos.x, pos.y);

        await moveMouseBy(client, pos.x, pos.y, 80, 0);
        await client.evaluate(typeVCB(String(radius)));
        await client.pressKey('Enter');

        const dialog = await getBlockingDialog(client);
        if (dialog) {
          throw new Error(`SketchUp showed a blocking dialog: "${dialog}"`);
        }

        await cleanupAfterDraw(client);
      });
    });

  // draw line <x1,y1,z1> <x2,y2,z2>
  draw
    .command('line <start> <end>')
    .description('Draw a line from start to end (format: "x,y,z")')
    .action(async (startStr, endStr) => {
      const [x1, y1, z1] = parseCoordinateTuple(startStr, 3, 'Coordinates must be numbers. Format: "x,y,z"');
      const [x2, y2, z2] = parseCoordinateTuple(endStr, 3, 'Coordinates must be numbers. Format: "x,y,z"');

      await withManagedDrawClient(async (client) => {
        await dismissBlockingDialogs(client, { attempts: 3, settleMs: 100 });
        if (isGroundPlane(z1) && isGroundPlane(z2)) {
          await fitGroundPlaneBounds(client, getAxisAlignedBounds(x1, y1, x2, y2));
        }
        await client.evaluate(nMW('ACTIVATE_PENCIL'));

        const p1 = await projectVisiblePoint(client, {
          label: 'Line start point',
          pointLabel: 'start point',
          x: x1,
          y: y1,
          z: z1,
        });
        const p2 = await projectVisiblePoint(client, {
          label: 'Line end point',
          pointLabel: 'end point',
          x: x2,
          y: y2,
          z: z2,
        });

        await client.mouseClick(p1.x, p1.y);
        await client.mouseClick(p2.x, p2.y);
        const dialog = await getBlockingDialog(client);
        if (dialog) {
          throw new Error(`SketchUp showed a blocking dialog: "${dialog}"`);
        }

        await cleanupAfterDraw(client);
      });
    });

  // push-pull <x> <y> <z> <distance>
  program
    .command('push-pull <x> <y> <z> <distance>')
    .description('Extrude the face at the given coordinate by distance')
    .action(async (x, y, z, distance) => {
      const faceX = parseNumberArg(x, 'x');
      const faceY = parseNumberArg(y, 'y');
      const faceZ = parseNumberArg(z, 'z');
      const pushPullDistance = parseNumberArg(distance, 'distance');
      const distanceSign = pushPullDistance >= 0 ? 1 : -1;

      await withManagedDrawClient(async (client) => {
        await dismissBlockingDialogs(client, { attempts: 3, settleMs: 100 });
        if (isGroundPlane(faceZ)) {
          await prepareExtrusionCamera(client);
        }

        await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));

        const pos = await projectVisiblePoint(client, {
          label: 'Push-pull target',
          pointLabel: 'face point',
          x: faceX,
          y: faceY,
          z: faceZ,
        });
        const zRef = await projectPoint(client,
          faceX,
          faceY,
          faceZ + distanceSign * Math.min(Math.abs(pushPullDistance), 100),
        );
        const pushPullNudge = nudgeToward(pos, zRef, 80, { x: 0, y: -80 });

        await client.mouseClick(pos.x, pos.y);

        const beforeFaces = await getFaceCount(client);
        await moveMouseBy(client, pos.x, pos.y, pushPullNudge.x, pushPullNudge.y);
        await client.evaluate(typeVCB(String(distance)));
        await client.pressKey('Enter');
        await sleep(200);

        const afterFaces = await getFaceCount(client);
        if (afterFaces <= beforeFaces) {
          throw new Error(
            `Push-pull target was visible, but SketchUp produced no new geometry. ` +
            `The face may not exist at the requested point (${formatModelPoint({ x: faceX, y: faceY, z: faceZ })}).`
          );
        }

        const dialog = await getBlockingDialog(client);
        if (dialog) {
          throw new Error(`SketchUp showed a blocking dialog: "${dialog}"`);
        }

        await cleanupAfterDraw(client);
      });
    });

  // draw wall <x1,y1> <x2,y2> <height> <thickness>
  draw
    .command('wall <start> <end> <height> <thickness>')
    .description('Draw a 3D wall (rectangle + push-pull). Coordinates are "x,y".')
    .action(async (startStr, endStr, height, thickness) => {
      const [x1, y1] = parseCoordinateTuple(startStr, 2, 'Coordinates must be numbers. Format: "x,y"');
      const [x2, y2] = parseCoordinateTuple(endStr, 2, 'Coordinates must be numbers. Format: "x,y"');

      const w = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const dx = x2 - x1, dy = y2 - y1;
      const t = parseNumberArg(thickness, 'thickness');
      const wallHeight = parseNumberArg(height, 'height');

      if (w <= GROUND_PLANE_EPSILON) {
        throw new Error('Wall start and end points must be different.');
      }

      // Perpendicular direction (clockwise in XY plane) for thickness extension
      const perpWX = dy / w;
      const perpWY = -dx / w;
      const thicknessSign = t >= 0 ? 1 : -1;

      await withManagedDrawClient(async (client) => {
        await dismissBlockingDialogs(client, { attempts: 3, settleMs: 100 });
        await fitGroundPlaneBounds(client, getWallBaseBounds(x1, y1, x2, y2, t));

        const beforeFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);

        await client.evaluate(nMW('ACTIVATE_RECTANGLE'));

        const startScreen = await projectVisiblePoint(client, {
          label: 'Wall start point',
          pointLabel: 'start point',
          x: x1,
          y: y1,
          z: 0,
        });
        const endScreen = await projectPoint(client, x2, y2, 0);
        const perpRefScreen = await projectPoint(client, x1 + perpWX * t, y1 + perpWY * t, 0);

        const dxScreen = endScreen.x - startScreen.x;
        const dyScreen = endScreen.y - startScreen.y;
        const dirLen = Math.sqrt(dxScreen ** 2 + dyScreen ** 2);
        const nudgeX = dirLen > 0 ? Math.round((dxScreen / dirLen) * 80) : 80;
        const nudgeY = dirLen > 0 ? Math.round((dyScreen / dirLen) * 80) : 0;

        const perpSX = perpRefScreen.x - startScreen.x;
        const perpSY = perpRefScreen.y - startScreen.y;
        const perpSLen = Math.sqrt(perpSX ** 2 + perpSY ** 2);
        const nudgePerpX = perpSLen > 0 ? Math.round((perpSX / perpSLen) * 20) : 0;
        const nudgePerpY = perpSLen > 0 ? Math.round((perpSY / perpSLen) * 20) : 0;

        await client.mouseClick(startScreen.x, startScreen.y);
        await moveMouseBy(client, startScreen.x, startScreen.y, nudgeX + nudgePerpX, nudgeY + nudgePerpY);
        await client.evaluate(typeVCB(`${Math.round(w)},${thickness}`));
        await client.pressKey('Enter');

        await sleep(200);
        const afterFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);
        if (afterFaces <= beforeFaces) {
          throw new Error('Rectangle step produced no new face.');
        }

        await prepareExtrusionCamera(client);
        await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));
        const insetAlong = Math.min(Math.max(w * 0.1, 10), w / 2);
        const insetAcross = Math.min(Math.max(Math.abs(t) * 0.5, 5), Math.abs(t));
        const faceX = x1 + (dx / w) * insetAlong + perpWX * thicknessSign * insetAcross;
        const faceY = y1 + (dy / w) * insetAlong + perpWY * thicknessSign * insetAcross;
        const facePos = await projectVisiblePoint(client, {
          label: 'Wall push-pull target',
          pointLabel: 'face point',
          x: faceX,
          y: faceY,
          z: 0,
        });
        const zRefScreen = await projectPoint(
          client,
          faceX,
          faceY,
          Math.sign(wallHeight || 1) * Math.min(Math.abs(wallHeight), 100),
        );
        const pushPullNudge = nudgeToward(facePos, zRefScreen, 80, { x: 0, y: -80 });

        await client.mouseClick(facePos.x, facePos.y);
        await moveMouseBy(client, facePos.x, facePos.y, pushPullNudge.x, pushPullNudge.y);
        await client.evaluate(typeVCB(String(height)));
        await client.pressKey('Enter');
        await sleep(200);

        const afterPushPullFaces = await getFaceCount(client);
        if (afterPushPullFaces <= afterFaces) {
          throw new Error(
            `Wall push-pull target was visible, but SketchUp produced no new geometry. ` +
            `The wall face point may not exist at (${formatModelPoint({ x: faceX, y: faceY, z: 0 })}).`
          );
        }

        const dialog = await getBlockingDialog(client);
        if (dialog) {
          throw new Error(`SketchUp showed a blocking dialog: "${dialog}"`);
        }

        await cleanupAfterDraw(client);
      });
    });

  // draw box <x> <y> <z> <w> <d> <h>
  draw
    .command('box <x> <y> <z> <w> <d> <h>')
    .description('Draw a 3D box at origin with width, depth, height')
    .action(async (x, y, z, w, d, h) => {
      const boxX = Number(x);
      const boxY = Number(y);
      const boxZ = Number(z);
      const boxW = Number(w);
      const boxD = Number(d);
      const boxH = Number(h);
      const widthSign = boxW >= 0 ? 1 : -1;
      const depthSign = boxD >= 0 ? 1 : -1;
      const heightSign = boxH >= 0 ? 1 : -1;

      ensureFiniteNumbers(
        [boxX, boxY, boxZ, boxW, boxD, boxH],
        'Coordinates and dimensions must be numbers.',
      );

      await withManagedDrawClient(async (client) => {
        await dismissBlockingDialogs(client, { attempts: 3, settleMs: 100 });
        if (isGroundPlane(boxZ)) {
          await fitGroundPlaneBounds(client, getAxisAlignedBounds(boxX, boxY, boxX + boxW, boxY + boxD));
        }

        const beforeFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);

        await client.evaluate(nMW('ACTIVATE_RECTANGLE'));
        const startScreen = await projectVisiblePoint(client, {
          label: 'Box start point',
          pointLabel: 'start point',
          x: boxX,
          y: boxY,
          z: boxZ,
        });
        const xRefScreen = await projectPoint(
          client,
          boxX + widthSign * Math.min(Math.abs(boxW), 100),
          boxY,
          boxZ,
        );
        const yRefScreen = await projectPoint(
          client,
          boxX,
          boxY + depthSign * Math.min(Math.abs(boxD), 100),
          boxZ,
        );
        const rectNudge = combineUnitDirections(startScreen, [xRefScreen, yRefScreen], 80, { x: 80, y: -10 });

        await client.mouseClick(startScreen.x, startScreen.y);
        await moveMouseBy(client, startScreen.x, startScreen.y, rectNudge.x, rectNudge.y);
        await client.evaluate(typeVCB(`${w},${d}`));
        await client.pressKey('Enter');

        await sleep(200);
        const afterFaces = await client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);
        if (afterFaces <= beforeFaces) {
          throw new Error('Rectangle step produced no new face.');
        }

        await prepareExtrusionCamera(client);
        await client.evaluate(nMW('ACTIVATE_PUSH_PULL'));
        const insetX = Math.min(Math.max(Math.abs(boxW) * 0.1, 10), Math.abs(boxW) / 2);
        const insetY = Math.min(Math.max(Math.abs(boxD) * 0.1, 10), Math.abs(boxD) / 2);
        const faceX = boxX + widthSign * insetX;
        const faceY = boxY + depthSign * insetY;
        const facePos = await projectVisiblePoint(client, {
          label: 'Box push-pull target',
          pointLabel: 'face point',
          x: faceX,
          y: faceY,
          z: boxZ,
        });
        const zRefScreen = await projectPoint(
          client,
          faceX,
          faceY,
          boxZ + heightSign * Math.min(Math.abs(boxH), 100),
        );
        const pushPullNudge = nudgeToward(facePos, zRefScreen, 80, { x: 0, y: -80 });

        await client.mouseClick(facePos.x, facePos.y);
        await moveMouseBy(client, facePos.x, facePos.y, pushPullNudge.x, pushPullNudge.y);
        await client.evaluate(typeVCB(String(h)));
        await client.pressKey('Enter');
        await sleep(200);

        const afterPushPullFaces = await getFaceCount(client);
        if (afterPushPullFaces <= afterFaces) {
          throw new Error(
            `Box push-pull target was visible, but SketchUp produced no new geometry. ` +
            `The box face point may not exist at (${formatModelPoint({ x: faceX, y: faceY, z: boxZ })}).`
          );
        }

        const dialog = await getBlockingDialog(client);
        if (dialog) {
          throw new Error(`SketchUp showed a blocking dialog: "${dialog}"`);
        }

        await cleanupAfterDraw(client);
      });
    });
}

async function moveMouseBy(client, x, y, dx, dy) {
  await sleep(50);
  await client.mouseMove(x + dx, y + dy);
}

async function getFaceCount(client) {
  return client.evaluate(`(() => Module.getModelInfo().stats.num_faces)()`);
}

async function projectPoint(client, x, y, z) {
  return client.evaluate(projectScript(x / 25.4, y / 25.4, z / 25.4));
}

async function projectVisiblePoint(client, { label, pointLabel, x, y, z, margin = CANVAS_TARGET_MARGIN }) {
  const point = await projectPoint(client, x, y, z);
  const canvasRect = await client.evaluate(getCanvasRect());
  validateCanvasTarget(label, point, canvasRect, margin, { pointLabel, modelPoint: { x, y, z } });
  return point;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupAfterDraw(client) {
  await dismissBlockingDialogs(client, { attempts: 2, settleMs: 100 });
  await client.evaluate(nMW('ACTIVATE_SELECTION'));
  await dismissBlockingDialogs(client, { attempts: 2, settleMs: 100 });
}

function nudgeToward(from, to, pixels, fallback) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx ** 2 + dy ** 2);
  if (!len) return fallback;
  return {
    x: Math.round((dx / len) * pixels),
    y: Math.round((dy / len) * pixels),
  };
}

function combineUnitDirections(from, refs, pixels, fallback) {
  let sumX = 0;
  let sumY = 0;
  for (const ref of refs) {
    const dx = ref.x - from.x;
    const dy = ref.y - from.y;
    const len = Math.sqrt(dx ** 2 + dy ** 2);
    if (!len) continue;
    sumX += dx / len;
    sumY += dy / len;
  }
  const len = Math.sqrt(sumX ** 2 + sumY ** 2);
  if (!len) return fallback;
  return {
    x: Math.round((sumX / len) * pixels),
    y: Math.round((sumY / len) * pixels),
  };
}

async function fitGroundPlaneBounds(client, bounds, margin = CANVAS_TARGET_MARGIN) {
  await client.evaluate(nMW('PARALLEL_PROJECTION'));
  await client.evaluate(nMW('VIEW_TOP'));
  await waitForCameraStable(client);
  await client.evaluate(buildSetGroundPlaneBoundsScript(bounds, margin));
  await waitForCameraStable(client);
}

async function prepareExtrusionCamera(client) {
  await client.evaluate(nMW('VIEW_ISO'));
  await client.evaluate(nMW('ACTIVATE_ZOOM_EXTENTS'));
  await waitForCameraStable(client);
}

async function waitForCameraStable(client, {
  timeoutMs = CAMERA_STABLE_TIMEOUT_MS,
  pollMs = CAMERA_STABLE_POLL_MS,
  stableReads = CAMERA_STABLE_READS,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let previous = null;
  let stableCount = 0;

  while (Date.now() < deadline) {
    const snapshot = JSON.stringify(await client.evaluate(getCameraSnapshot()));
    if (snapshot === previous) {
      stableCount += 1;
      if (stableCount >= stableReads) return;
    } else {
      previous = snapshot;
      stableCount = 0;
    }
    await sleep(pollMs);
  }

  throw new Error('Timed out waiting for the camera to settle.');
}

async function withManagedDrawClient(callback) {
  const client = await getClient();
  const originalCamera = await captureCameraRestorationData(client);
  let result;
  let pendingError = null;

  try {
    result = await callback(client);
  } catch (error) {
    pendingError = error;
  }

  try {
    await restoreCamera(client, originalCamera);
  } catch (error) {
    if (!pendingError) pendingError = error;
  }

  client.close();

  if (pendingError) throw pendingError;
  return result;
}

async function captureCameraRestorationData(client) {
  return client.evaluate(getCameraRestorationData());
}

async function restoreCamera(client, cameraState) {
  if (!cameraState) return;
  await client.evaluate(setCameraFromRestorationData(cameraState));
  await waitForCameraStable(client);
}

function validateCanvasTarget(label, point, canvasRect, margin = CANVAS_TARGET_MARGIN, { pointLabel = 'target point', modelPoint } = {}) {
  const finitePoint = Number.isFinite(point?.x) && Number.isFinite(point?.y);
  const validCanvas = canvasRect
    && Number.isFinite(canvasRect.left)
    && Number.isFinite(canvasRect.right)
    && Number.isFinite(canvasRect.top)
    && Number.isFinite(canvasRect.bottom);
  const inside = finitePoint && validCanvas
    && point.x >= canvasRect.left + margin
    && point.x <= canvasRect.right - margin
    && point.y >= canvasRect.top + margin
    && point.y <= canvasRect.bottom - margin;

  if (inside) return;

  const coords = modelPoint ? `\nThe ${pointLabel} at model coordinates (${formatModelPoint(modelPoint)}) is not safely clickable.` : '';
  throw new Error(`${label} is outside the visible viewport.${coords}`);
}

function formatModelPoint({ x, y, z }) {
  return [x, y, z].map((value) => formatNumber(value)).join(', ');
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function parseNumberArg(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
}

function parseCoordinateTuple(value, expectedLength, errorMessage) {
  const parts = String(value).split(',').map(Number);
  if (parts.length !== expectedLength || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(errorMessage);
  }
  return parts;
}

function ensureFiniteNumbers(values, errorMessage) {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(errorMessage);
  }
}

function isGroundPlane(z) {
  return Math.abs(z) <= GROUND_PLANE_EPSILON;
}

function getAxisAlignedBounds(x1, y1, x2, y2) {
  return {
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
  };
}

function getWallBaseBounds(x1, y1, x2, y2, thickness) {
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const perpX = (y2 - y1) / length;
  const perpY = -(x2 - x1) / length;
  const corners = [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: x2 + perpX * thickness, y: y2 + perpY * thickness },
    { x: x1 + perpX * thickness, y: y1 + perpY * thickness },
  ];
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

function buildSetGroundPlaneBoundsScript(bounds, margin) {
  const payload = JSON.stringify(bounds);
  return `(() => {
    const bounds = ${payload};
    ${INJECT_MOD};

    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const safeWidth = Math.max(1, rect.width - ${margin * 2});
    const safeHeight = Math.max(1, rect.height - ${margin * 2});
    const aspect = rect.width / rect.height;

    const minX = bounds.minX / 25.4;
    const maxX = bounds.maxX / 25.4;
    const minY = bounds.minY / 25.4;
    const maxY = bounds.maxY / 25.4;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);

    const requiredHalfWidth = (boundsWidth / 2) * (rect.width / safeWidth) * ${GROUND_PLANE_FIT_SCALE};
    const requiredHalfHeight = (boundsHeight / 2) * (rect.height / safeHeight) * ${GROUND_PLANE_FIT_SCALE};
    let halfWidth = Math.max(requiredHalfWidth, requiredHalfHeight * aspect, 1);
    let halfHeight = Math.max(requiredHalfHeight, halfWidth / aspect, 1 / aspect);
    halfWidth = Math.max(halfWidth, halfHeight * aspect);
    halfHeight = halfWidth / aspect;

    const viewMatrix = Module.getViewMatrix();
    viewMatrix.m03 = centerX;
    viewMatrix.m13 = centerY;
    Module.setViewMatrix(viewMatrix);

    const frustum = Module.getViewFrustum();
    Module.setOrthographicViewExtents({
      left: -halfWidth,
      right: halfWidth,
      bottom: -halfHeight,
      top: halfHeight,
      near: frustum.near,
      far: frustum.far,
    });
  })()`;
}
