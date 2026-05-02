// ══════════════════════════════════════════
// MINIMAP ENGINE
// ══════════════════════════════════════════
import { state, camera, targetCamera } from './state.js';
import { events } from './events.js';

let cachedDim = { w: 0, h: 0 };
let ro = null;

export function toggleMinimap() {
  state.minimapVisible = !state.minimapVisible;
  const el = document.getElementById('minimap');
  if (el) el.classList.toggle('show', state.minimapVisible);
  if (state.minimapVisible) updateMinimap();
  events.emit('ui:update');
}

export function updateMinimap() {
  const now = Date.now();
  if (now - state.lastMinimapUpdate < 50) return;
  state.lastMinimapUpdate = now;

  const container = document.getElementById('minimap');
  const cvs = document.getElementById('minimap-canvas');
  const vp = document.getElementById('minimap-vp');
  if (!container || !cvs || !vp || !state.minimapVisible) return;

  if (!ro) {
    ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        cachedDim.w = entry.contentRect.width;
        cachedDim.h = entry.contentRect.height;
      }
    });
    ro.observe(container);
    cachedDim.w = container.clientWidth; cachedDim.h = container.clientHeight;
  }

  const ctx = cvs.getContext('2d');
  const cw = cachedDim.w || container.clientWidth, ch = cachedDim.h || container.clientHeight;
  if (cvs.width !== cw) { cvs.width = cw; cvs.height = ch; }
  ctx.clearRect(0, 0, cw, ch);

  const widgets = Object.values(state.widgets);
  const vw = window.innerWidth, vh = window.innerHeight;
  const viewRect = { x: -camera.x / camera.zoom, y: -camera.y / camera.zoom, w: vw / camera.zoom, h: vh / camera.zoom };

  let minX = viewRect.x, minY = viewRect.y, maxX = viewRect.x + viewRect.w, maxY = viewRect.y + viewRect.h;
  widgets.forEach(w => {
    minX = Math.min(minX, w.x); minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.w); maxY = Math.max(maxY, w.y + w.h);
  });

  const worldW = maxX - minX, worldH = maxY - minY;
  const padding = 20;
  const scale = Math.min((cw - padding * 2) / worldW, (ch - padding * 2) / worldH);

  const offX = (cw - worldW * scale) / 2 - minX * scale;
  const offY = (ch - worldH * scale) / 2 - minY * scale;

  ctx.fillStyle = state.theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
  widgets.forEach(w => {
    ctx.fillRect(w.x * scale + offX, w.y * scale + offY, w.w * scale, w.h * scale);
  });

  vp.style.left = (viewRect.x * scale + offX) + 'px';
  vp.style.top = (viewRect.y * scale + offY) + 'px';
  vp.style.width = (viewRect.w * scale) + 'px';
  vp.style.height = (viewRect.h * scale) + 'px';

  if (!container.dataset.init) {
    container.dataset.init = '1';
    container.addEventListener('pointerdown', e => {
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
      const worldX = (clickX - offX) / scale, worldY = (clickY - offY) / scale;
      targetCamera.zoom = camera.zoom;
      targetCamera.x = vw / 2 - worldX * camera.zoom;
      targetCamera.y = vh / 2 - worldY * camera.zoom;
      events.emit('camera:loop');
    });
  }
}
