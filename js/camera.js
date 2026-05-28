// ══════════════════════════════════════════
// CAMERA & NAVIGATION (SMOOTH)
// ══════════════════════════════════════════
import { MIN_ZOOM, MAX_ZOOM, SNAP } from './config.js';
import { state, camera, targetCamera, setTargetCamera, cameraAnimReq, setCameraAnimReq } from './state.js';
import { events } from './events.js';

export function applyCamera() {
  const world = document.getElementById('world');
  
  // 무한 우주 이탈 차단 (Clamping Bounds)
  const vw = window.innerWidth, vh = window.innerHeight;
  let minX = -3000, maxX = 3000, minY = -3000, maxY = 3000;
  const widgets = Object.values(state.widgets);
  if (widgets.length > 0) {
    minX = Math.min(...widgets.map(w => w.x)) - 3000;
    maxX = Math.max(...widgets.map(w => w.x + w.w)) + 3000;
    minY = Math.min(...widgets.map(w => w.y)) - 3000;
    maxY = Math.max(...widgets.map(w => w.y + w.h)) + 3000;
  }
  
  // 월드 중심 Clamping 제한
  const cx = (vw / 2 - camera.x) / camera.zoom;
  const cy = (vh / 2 - camera.y) / camera.zoom;
  const ccx = Math.max(minX, Math.min(maxX, cx));
  const ccy = Math.max(minY, Math.min(maxY, cy));
  camera.x = vw / 2 - ccx * camera.zoom;
  camera.y = vh / 2 - ccy * camera.zoom;
  
  // targetCamera 타겟 경계 제한 일치
  const tcx = (vw / 2 - targetCamera.x) / targetCamera.zoom;
  const tcy = (vh / 2 - targetCamera.y) / targetCamera.zoom;
  const tccx = Math.max(minX, Math.min(maxX, tcx));
  const tccy = Math.max(minY, Math.min(maxY, tcy));
  targetCamera.x = vw / 2 - tccx * targetCamera.zoom;
  targetCamera.y = vh / 2 - tccy * targetCamera.zoom;

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
  const safeW = Math.max(rect.w, 1);
  const safeH = Math.max(rect.h, 1);
  let nz = Math.min(aw / safeW, ah / safeH);
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
