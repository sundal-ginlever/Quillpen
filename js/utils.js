// ══════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════
import { SNAP } from './config.js';
import { state, camera } from './state.js';
import { events } from './events.js';

export function nanoid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function snap(v) {
  return state.snapOn ? Math.round(v / SNAP) * SNAP : v;
}

export function snapRect(x, y, w, h) {
  if (!state.snapOn) return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
  const sx = snap(x), sy = snap(y), ex = snap(x + w), ey = snap(y + h);
  return { x: sx, y: sy, w: Math.max(SNAP, ex - sx), h: Math.max(SNAP, ey - sy) };
}

export function resizeHandleHTML() {
  return `<div class="resize-handle"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M10 2L2 10M10 6L6 10" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg></div>`;
}

export function attachResizeHandle(el, wid, minW, minH) {
  const rh = el.querySelector('.resize-handle');
  if (!rh) return;
  let isResizing = false;
  rh.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (isResizing) return;
    isResizing = true;
    rh.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, sw = state.widgets[wid].w, sh = state.widgets[wid].h;
    const onMove = ev => {
      let nw = Math.max(minW, sw + (ev.clientX - sx) / camera.zoom);
      let nh = Math.max(minH, sh + (ev.clientY - sy) / camera.zoom);
      
      const ww = state.widgets[wid];
      if (ww) {
        const s = snapRect(ww.x, ww.y, nw, nh);
        nw = s.w;
        nh = s.h;
      }

      state.widgets[wid].w = nw;
      state.widgets[wid].h = nh;
      state.widgets[wid].updatedAt = Date.now();
      el.style.width = nw + 'px';
      el.style.height = nh + 'px';
      events.emit('connections:render');
    };
    const onUp = (ev) => {
      isResizing = false;
      try { rh.releasePointerCapture(ev.pointerId); } catch(e){}
      events.emit('pending:add', wid);
      events.emit('app:save');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

export function sanitize(str) {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;'
  };
  return str.replace(/[&<>"'/]/g, m => map[m]);
}
