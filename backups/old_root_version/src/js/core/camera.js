import { state } from './state';

export const camera = {
  x: 0,
  y: 0,
  zoom: 1
};

let worldEl = null;
let gridCanvas = null;

export function initCamera(world, grid) {
  worldEl = world;
  gridCanvas = grid;
}

export function applyCamera() {
  state.cameraZoom = camera.zoom;
  if (worldEl) {
    worldEl.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`;
  }
  drawGrid();
}

export function pan(dx, dy) {
  camera.x += dx;
  camera.y += dy;
  applyCamera();
}

export function zoomAt(clientX, clientY, factor) {
  const newZoom = Math.min(Math.max(camera.zoom * factor, 0.05), 10);
  const dx = (clientX - camera.x) / camera.zoom;
  const dy = (clientY - camera.y) / camera.zoom;
  
  camera.zoom = newZoom;
  camera.x = clientX - dx * camera.zoom;
  camera.y = clientY - dy * camera.zoom;
  applyCamera();
}

export function screenToWorld(sx, sy) {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom
  };
}

export function snap(v) {
  const step = 20;
  return state.snapOn ? Math.round(v / step) * step : v;
}

/**
 * Fits all widgets into the viewport
 */
export function fitToAll() {
  const widgets = Object.values(state.widgets);
  if (widgets.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  widgets.forEach(w => {
    minX = Math.min(minX, w.x);
    minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.w);
    maxY = Math.max(maxY, w.y + w.h);
  });

  const padding = 100;
  const ww = window.innerWidth - padding * 2;
  const wh = window.innerHeight - padding * 2;
  const scale = Math.min(ww / (maxX - minX), wh / (maxY - minY), 1);
  
  camera.zoom = scale;
  camera.x = (window.innerWidth - (maxX - minX) * scale) / 2 - minX * scale;
  camera.y = (window.innerHeight - (maxY - minY) * scale) / 2 - minY * scale;
  applyCamera();
}

function drawGrid() {
  if (!gridCanvas || !state.showGrid) return;
  const ctx = gridCanvas.getContext('2d');
  gridCanvas.width = window.innerWidth;
  gridCanvas.height = window.innerHeight;
  
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  ctx.strokeStyle = state.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;

  const size = 40 * camera.zoom;
  const offsetX = camera.x % size;
  const offsetY = camera.y % size;

  ctx.beginPath();
  for (let x = offsetX; x < gridCanvas.width; x += size) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gridCanvas.height);
  }
  for (let y = offsetY; y < gridCanvas.height; y += size) {
    ctx.moveTo(0, y);
    ctx.lineTo(gridCanvas.width, y);
  }
  ctx.stroke();
}
