// ══════════════════════════════════════════
// GRID RENDERER
// ══════════════════════════════════════════
import { SNAP } from './config.js';
import { state, camera } from './state.js';
import { events } from './events.js';

export function drawGrid() {
  const gridCanvas = document.getElementById('grid-canvas');
  if (!gridCanvas) return;
  const gridCtx = gridCanvas.getContext('2d');
  const w = window.innerWidth, h = window.innerHeight;
  gridCanvas.width = w; gridCanvas.height = h;
  gridCtx.clearRect(0, 0, w, h);
  if (!state.showGrid || camera.zoom < 0.1) return;
  const isDark = state.theme === 'dark';
  const minorColor = isDark ? 'rgba(51,65,85,0.6)' : 'rgba(203,213,225,0.55)';
  const majorColor = isDark ? 'rgba(71,85,105,0.5)' : 'rgba(148,163,184,0.4)';

  const minor = SNAP * camera.zoom, major = SNAP * 5 * camera.zoom;
  if (minor >= 8) {
    const ox = ((camera.x % minor) + minor) % minor, oy = ((camera.y % minor) + minor) % minor;
    gridCtx.strokeStyle = minorColor; gridCtx.lineWidth = 0.5; gridCtx.beginPath();
    for (let x = ox; x < w; x += minor) { gridCtx.moveTo(x, 0); gridCtx.lineTo(x, h); }
    for (let y = oy; y < h; y += minor) { gridCtx.moveTo(0, y); gridCtx.lineTo(w, y); }
    gridCtx.stroke();
  }
  if (major >= 6) {
    const ox = ((camera.x % major) + major) % major, oy = ((camera.y % major) + major) % major;
    gridCtx.strokeStyle = majorColor; gridCtx.lineWidth = 0.75; gridCtx.beginPath();
    for (let x = ox; x < w; x += major) { gridCtx.moveTo(x, 0); gridCtx.lineTo(x, h); }
    for (let y = oy; y < h; y += major) { gridCtx.moveTo(0, y); gridCtx.lineTo(w, y); }
    gridCtx.stroke();
  }
  const axisColor = isDark ? 'rgba(129,140,248,0.3)' : 'rgba(99,102,241,0.22)';
  if (camera.x > 0 && camera.x < w) { gridCtx.strokeStyle = axisColor; gridCtx.lineWidth = 1; gridCtx.beginPath(); gridCtx.moveTo(camera.x, 0); gridCtx.lineTo(camera.x, h); gridCtx.stroke(); }
  if (camera.y > 0 && camera.y < h) { gridCtx.strokeStyle = axisColor; gridCtx.lineWidth = 1; gridCtx.beginPath(); gridCtx.moveTo(0, camera.y); gridCtx.lineTo(w, camera.y); gridCtx.stroke(); }
}

export function initGridResize() {
  window.addEventListener('resize', drawGrid);
}
