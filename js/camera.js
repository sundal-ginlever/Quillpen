// ══════════════════════════════════════════
// CAMERA & NAVIGATION (SMOOTH)
// ══════════════════════════════════════════
import { MIN_ZOOM, MAX_ZOOM, SNAP } from './config.js';
import { state, camera, targetCamera, setTargetCamera, cameraAnimReq, setCameraAnimReq } from './state.js';
import { events } from './events.js';

export function applyCamera() {
  const world = document.getElementById('world');
  if (world) world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`;
  
  events.emit('camera:change');
  
  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = Math.round(camera.zoom * 100) + '%';
}

export function screenToWorld(sx, sy) {
  return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom };
}

export function worldToScreen(wx, wy) {
  return { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y };
}

function lerp(a, b, t) { return a + (b - a) * t; }

export function startCameraLoop() {
  if (cameraAnimReq) return;
  const loop = () => {
    const tc = targetCamera;
    const dx = Math.abs(tc.x - camera.x);
    const dy = Math.abs(tc.y - camera.y);
    const dz = Math.abs(tc.zoom - camera.zoom);

    if (dx < 0.1 && dy < 0.1 && dz < 0.001) {
      camera.x = tc.x; camera.y = tc.y; camera.zoom = tc.zoom;
      applyCamera();
      setCameraAnimReq(null);
      return;
    }

    camera.x = lerp(camera.x, tc.x, 0.2);
    camera.y = lerp(camera.y, tc.y, 0.2);
    camera.zoom = lerp(camera.zoom, tc.zoom, 0.2);
    applyCamera();
    setCameraAnimReq(requestAnimationFrame(loop));
  };
  setCameraAnimReq(requestAnimationFrame(loop));
}

export function pan(dx, dy, smooth = false) {
  if (smooth) {
    targetCamera.x += dx; targetCamera.y += dy;
    startCameraLoop();
  } else {
    camera.x += dx; camera.y += dy;
    targetCamera.x = camera.x; targetCamera.y = camera.y;
    applyCamera();
  }
}

export function zoomAt(sx, sy, factor, smooth = false) {
  const currentZ = smooth ? targetCamera.zoom : camera.zoom;
  const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZ * factor));
  const s = nz / currentZ;

  if (smooth) {
    targetCamera.x = sx - (sx - targetCamera.x) * s;
    targetCamera.y = sy - (sy - targetCamera.y) * s;
    targetCamera.zoom = nz;
    startCameraLoop();
  } else {
    camera.x = sx - (sx - camera.x) * s;
    camera.y = sy - (sy - camera.y) * s;
    camera.zoom = nz;
    targetCamera.x = camera.x; targetCamera.y = camera.y; targetCamera.zoom = camera.zoom;
    applyCamera();
  }
}

export function zoomToRect(rect, padding = 100) {
  if (!rect) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const aw = vw - padding * 2, ah = vh - padding * 2;
  let nz = Math.min(aw / rect.w, ah / rect.h);
  nz = Math.max(MIN_ZOOM, Math.min(2.0, nz));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  targetCamera.zoom = nz;
  targetCamera.x = vw / 2 - cx * nz;
  targetCamera.y = vh / 2 - cy * nz;
  startCameraLoop();
}

export function fitToAll() {
  const ids = Object.keys(state.widgets);
  if (ids.length === 0) {
    setTargetCamera({ x: 0, y: 0, zoom: 1 });
    startCameraLoop();
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ids.forEach(id => {
    const w = state.widgets[id];
    minX = Math.min(minX, w.x); minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.w); maxY = Math.max(maxY, w.y + w.h);
  });
  zoomToRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
}

export function fitToSelection() {
  if (state.selectedIds.size === 0) return fitToAll();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.selectedIds.forEach(id => {
    const w = state.widgets[id]; if (!w) return;
    minX = Math.min(minX, w.x); minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.w); maxY = Math.max(maxY, w.y + w.h);
  });
  zoomToRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
}
