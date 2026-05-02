// ══════════════════════════════════════════
// INTERACTION — Mouse, Touch, Keyboard Events
// ══════════════════════════════════════════
import { SNAP, MIN_DRAW } from './config.js';
import { state, camera, sketchDrawing } from './state.js';
import { nanoid, snapRect } from './utils.js';
import { screenToWorld, worldToScreen, pan, zoomAt, startCameraLoop, fitToAll, fitToSelection } from './camera.js';
import { renderConnections, getAnchorPos, getBezierPath } from './connections.js';
import { createWidget, renderWidget, deleteWidget, bringToFront, setSelected, updateWidget } from './widgets/core.js';
import { toggleMinimap, updateMinimap } from './minimap.js';
import { undo, redo, duplicateSelected, toggleLock, snapshotForUndo } from './undo.js';
import { openSearch, closeSearch } from './search.js';
import { openShareModal, closeShareModal } from './share.js';
import { openExportModal, closeExportModal } from './export.js';
import { openHelpModal, closeHelpModal } from './help.js';
import { closeCanvasPicker } from './canvas-manager.js';
import { events } from './events.js';

let rootEl, world, drag=null, pinch=null, selBox=null, drawBox=null, ghostEl, ghostLabel, ghostSize;

function isUI(e) {
  const t = e.target;
  return !!(t.closest('#toolbar') || t.closest('.mobile-fab') || t.closest('#statusbar') || t.closest('#search-bar') || t.closest('#minimap') || t.closest('.modal-backdrop'));
}

// ── Widget Context Menu (mobile long-press) ──
let ctxMenu = null;
function showWidgetContextMenu(cx, cy, wid) {
  closeWidgetContextMenu();
  ctxMenu = document.createElement('div');
  ctxMenu.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;background:var(--surface);border-radius:12px;box-shadow:var(--shadow-lg);border:1px solid var(--border-color);padding:6px 0;z-index:9999;min-width:140px`;
  const items = [
    { label: '🗑 삭제', action: () => deleteWidget(wid) },
    { label: '📋 복제', action: () => { setSelected([wid]); duplicateSelected(); } },
    { label: '🔒 잠금 토글', action: () => { setSelected([wid]); toggleLock(); } },
  ];
  items.forEach(it => {
    const btn = document.createElement('button');
    btn.textContent = it.label;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 16px;border:none;background:none;font-size:13px;cursor:pointer;color:var(--app-text)';
    btn.onpointerup = e => { e.stopPropagation(); it.action(); closeWidgetContextMenu(); };
    ctxMenu.appendChild(btn);
  });
  document.body.appendChild(ctxMenu);
}
function closeWidgetContextMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }

// ── Mobile FAB ──
function buildMobileFAB() {
  const fab = document.createElement('div');
  fab.className = 'mobile-fab';
  fab.innerHTML = `<div class="fab-menu">
    <div class="fab-item" onclick="window.createWidgetAtCenter('memo')"><span class="fab-item-label">메모</span><button class="fab-btn">📝</button></div>
    <div class="fab-item" onclick="window.createWidgetAtCenter('sketch')"><span class="fab-item-label">스케치</span><button class="fab-btn">✏️</button></div>
    <div class="fab-item" onclick="window.createWidgetAtCenter('spreadsheet')"><span class="fab-item-label">표</span><button class="fab-btn">⊞</button></div>
    <div class="fab-item" onclick="window.createWidgetAtCenter('image')"><span class="fab-item-label">이미지</span><button class="fab-btn">🖼</button></div>
  </div><button class="fab-main">+</button>`;
  fab.querySelector('.fab-main').addEventListener('click', () => fab.classList.toggle('open'));
  document.body.appendChild(fab);
}

// ── Selection Box helpers ──
function drawSelBox() {
  if (!selBox) return;
  const overlay = document.getElementById('sel-overlay');
  let box = overlay.querySelector('.sel-rect');
  if (!box) { box = document.createElement('div'); box.className = 'sel-rect'; box.style.cssText = 'position:absolute;border:1.5px dashed #6366f1;background:rgba(99,102,241,.06);pointer-events:none;z-index:200'; overlay.appendChild(box); }
  const s1 = worldToScreen(selBox.startWorld.x, selBox.startWorld.y);
  const s2 = worldToScreen(selBox.curWorld.x, selBox.curWorld.y);
  const x = Math.min(s1.x, s2.x), y = Math.min(s1.y, s2.y);
  box.style.left = x + 'px'; box.style.top = y + 'px';
  box.style.width = Math.abs(s2.x - s1.x) + 'px'; box.style.height = Math.abs(s2.y - s1.y) + 'px';
}
function clearSelBoxUI() { const overlay = document.getElementById('sel-overlay'); const box = overlay?.querySelector('.sel-rect'); if (box) box.remove(); }
function commitSelBox() {
  if (!selBox) return;
  const x0 = Math.min(selBox.startWorld.x, selBox.curWorld.x), y0 = Math.min(selBox.startWorld.y, selBox.curWorld.y);
  const x1 = Math.max(selBox.startWorld.x, selBox.curWorld.x), y1 = Math.max(selBox.startWorld.y, selBox.curWorld.y);
  const ids = Object.keys(state.widgets).filter(id => { const w = state.widgets[id]; return w.x < x1 && w.x + w.w > x0 && w.y < y1 && w.y + w.h > y0; });
  setSelected(ids); selBox = null;
}

export function initInteraction() {
  buildMobileFAB();
  rootEl = document.getElementById('root');
  world = document.getElementById('world');

  ghostEl = document.createElement('div');
  ghostEl.style.cssText = 'position:absolute;pointer-events:none;z-index:200;display:none;border:2px dashed #6366f1;background:rgba(99,102,241,.07);border-radius:10px';
  ghostLabel = document.createElement('div'); ghostLabel.style.cssText = 'position:absolute;top:6px;left:10px;font-size:11px;font-weight:600;color:#6366f1;font-family:monospace';
  ghostSize = document.createElement('div'); ghostSize.style.cssText = 'position:absolute;bottom:6px;right:10px;font-size:10px;color:#a5b4fc;font-family:monospace';
  ghostEl.appendChild(ghostLabel); ghostEl.appendChild(ghostSize);
  document.getElementById('sel-overlay').appendChild(ghostEl);

  function getWidgetEl(e) { return e.target.closest('[data-widget-id]'); }
  function updateGhost(sx, sy, sw, sh, type) {
    ghostEl.style.display = 'block'; ghostEl.style.left = sx + 'px'; ghostEl.style.top = sy + 'px'; ghostEl.style.width = sw + 'px'; ghostEl.style.height = sh + 'px';
    const icons = { memo: '📝 메모', sketch: '✏️ 스케치', spreadsheet: '⊞ 스프레드시트', image: '🖼 이미지' };
    ghostLabel.textContent = icons[type] || type;
    ghostSize.textContent = `${Math.round(sw / camera.zoom / SNAP)}×${Math.round(sh / camera.zoom / SNAP)} 블록`;
  }
  function hideGhost() { ghostEl.style.display = 'none'; }

  // ── Wheel ──
  rootEl.addEventListener('wheel', e => {
    e.preventDefault(); const rect = rootEl.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 0.9);
    else pan(-e.deltaX, -e.deltaY);
  }, { passive: false });

  // ── Connection anchor start ──
  let connStart = null;
  world.addEventListener('pointerdown', e => {
    const a = e.target.closest('.anchor-point');
    if (a) {
      e.preventDefault(); e.stopPropagation();
      const rect = rootEl.getBoundingClientRect();
      connStart = { wid: a.dataset.wid, side: a.dataset.side };
      const ghostPath = document.getElementById('ghost-conn');
      if (ghostPath) { ghostPath.style.display = 'block'; ghostPath.setAttribute('d', ''); }
      drag = { type: 'connect' };
    }
  });

  // ── Mouse pointerdown ──
  rootEl.addEventListener('pointerdown', e => {
    if (isUI(e)) return;
    if (e.pointerType === 'touch') return;
    const wEl = getWidgetEl(e), wid = wEl?.dataset.widgetId;
    const rect = rootEl.getBoundingClientRect();
    const sp = { x: e.clientX, y: e.clientY }, wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (state.activeTool === 'hand' || e.button === 1 || (e.button === 0 && e.altKey)) { e.preventDefault(); drag = { type: 'pan', last: sp }; rootEl.style.cursor = 'grabbing'; return; }
    if (['memo', 'sketch', 'spreadsheet', 'image'].includes(state.activeTool) && !wid) { drawBox = { startWorld: { ...wp }, curWorld: { ...wp }, type: state.activeTool }; drag = { type: 'draw', last: sp }; return; }
    if (state.activeTool === 'select') {
      if (wid) {
        if (!state.selectedIds.has(wid)) setSelected(e.shiftKey ? [...state.selectedIds, wid] : [wid]);
        bringToFront(wid);
        const positions = {}; state.selectedIds.forEach(id => { const ww = state.widgets[id]; if (ww) positions[id] = { x: ww.x, y: ww.y }; });
        drag = { type: 'move', start: sp, last: sp, positions };
      } else { setSelected([]); selBox = { startWorld: wp, curWorld: wp }; drag = { type: 'select', last: sp }; }
    }
  });

  let lastPanPt = { x: 0, y: 0 };
  rootEl.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; lastPanPt = { x: e.clientX, y: e.clientY }; }, { capture: true });

  // ── Mouse pointermove ──
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || !drag) return;
    const rect = rootEl.getBoundingClientRect();
    if (drag.type === 'pan') { pan(e.clientX - lastPanPt.x, e.clientY - lastPanPt.y); lastPanPt = { x: e.clientX, y: e.clientY }; }
    else if (drag.type === 'connect' && connStart) {
      const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const p1 = getAnchorPos(connStart.wid, connStart.side);
      document.getElementById('ghost-conn').setAttribute('d', getBezierPath(p1, wp, connStart.side, 'auto'));
    } else if (drag.type === 'move') {
      const tdx = (e.clientX - drag.start.x) / camera.zoom, tdy = (e.clientY - drag.start.y) / camera.zoom;
      Object.entries(drag.positions).forEach(([id, s]) => {
        if (state.widgets[id]?.locked) return;
        const el2 = document.getElementById('w-' + id);
        if (el2) { el2.style.transform = `translate3d(${tdx}px, ${tdy}px, 0)`; }
        if (state.widgets[id]) { state.widgets[id].x = s.x + tdx; state.widgets[id].y = s.y + tdy; }
      });
    } else if (drag.type === 'select' && selBox) {
      selBox.curWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top); drawSelBox();
    } else if (drag.type === 'draw' && drawBox) {
      drawBox.curWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const x0 = Math.min(drawBox.startWorld.x, drawBox.curWorld.x), y0 = Math.min(drawBox.startWorld.y, drawBox.curWorld.y);
      const x1 = Math.max(drawBox.startWorld.x, drawBox.curWorld.x), y1 = Math.max(drawBox.startWorld.y, drawBox.curWorld.y);
      const sr = snapRect(x0, y0, x1 - x0, y1 - y0), scr = worldToScreen(sr.x, sr.y);
      updateGhost(scr.x, scr.y, sr.w * camera.zoom, sr.h * camera.zoom, drawBox.type);
    }
    drag.last = { x: e.clientX, y: e.clientY };
  });

  // ── Mouse pointerup ──
  window.addEventListener('pointerup', e => {
    if (drag?.type === 'move') {
      state.selectedIds.forEach(id => {
        const ww = state.widgets[id]; if (!ww || ww.locked) return;
        const sn = snapRect(ww.x, ww.y, ww.w, ww.h); updateWidget(id, { x: sn.x, y: sn.y });
        const el2 = document.getElementById('w-' + id);
        if (el2) { 
          el2.style.transform = ''; 
          el2.style.left = sn.x + 'px'; el2.style.top = sn.y + 'px'; 
        }
      });
      events.emit('connections:render'); if (state.minimapVisible) events.emit('minimap:update');
      events.emit('app:save');
    }
    if (drag?.type === 'connect' && connStart) {
      document.getElementById('ghost-conn').style.display = 'none';
      const targetAnchor = (e.target.closest && e.target.closest('.anchor-point')) || document.elementFromPoint(e.clientX, e.clientY)?.closest('.anchor-point');
      if (targetAnchor && targetAnchor.dataset.wid !== connStart.wid) {
        snapshotForUndo();
        const id = nanoid();
        state.connections[id] = { id, fromId: connStart.wid, fromSide: connStart.side, toId: targetAnchor.dataset.wid, toSide: targetAnchor.dataset.side };
        events.emit('connections:render');
        events.emit('app:save');
      }
      connStart = null;
    }
    if (drag?.type === 'select' && selBox) commitSelBox();
    if (drag?.type === 'draw' && drawBox) {
      hideGhost();
      const x0 = Math.min(drawBox.startWorld.x, drawBox.curWorld.x), y0 = Math.min(drawBox.startWorld.y, drawBox.curWorld.y);
      const x1 = Math.max(drawBox.startWorld.x, drawBox.curWorld.x), y1 = Math.max(drawBox.startWorld.y, drawBox.curWorld.y);
      const sr = snapRect(x0, y0, x1 - x0, y1 - y0), min = MIN_DRAW[drawBox.type];
      const snapped = snapRect(sr.x, sr.y, Math.max(sr.w, min.w), Math.max(sr.h, min.h));
      const w = createWidget(drawBox.type, snapped.x, snapped.y); w.w = snapped.w; w.h = snapped.h;
      state.widgets[w.id] = w;
      events.emit('pending:add', w.id);
      renderWidget(w); setSelected([w.id]);
      events.emit('tool:set', 'select');
      events.emit('app:save');
      drawBox = null;
    }
    drag = null; rootEl.style.cursor = ''; clearSelBoxUI();
  });

  // ── Touch ──
  let touchTimer = null, touchStartX = 0, touchStartY = 0;

  rootEl.addEventListener('touchstart', e => {
    if (isUI(e)) return;
    if (sketchDrawing) return;
    if (e.touches.length === 2) {
      e.preventDefault(); pinch = { dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) };
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    } else if (e.touches.length === 1) {
      const t = e.touches[0], wEl = getWidgetEl(e), wid = wEl?.dataset.widgetId;
      touchStartX = t.clientX; touchStartY = t.clientY;
      const rect = rootEl.getBoundingClientRect(), wp = screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
      if (wid) {
        if (!state.selectedIds.has(wid)) setSelected([wid]);
        bringToFront(wid);
        const positions = {}; state.selectedIds.forEach(id => { const ww = state.widgets[id]; if (ww) positions[id] = { x: ww.x, y: ww.y }; });
        drag = { type: 'move', start: { x: t.clientX, y: t.clientY }, last: { x: t.clientX, y: t.clientY }, positions };
        touchTimer = setTimeout(() => { touchTimer = null; showWidgetContextMenu(t.clientX, t.clientY, wid); }, 500);
      } else {
        if (['memo', 'sketch', 'spreadsheet', 'image'].includes(state.activeTool)) { drawBox = { startWorld: { ...wp }, curWorld: { ...wp }, type: state.activeTool }; drag = { type: 'draw', last: { x: t.clientX, y: t.clientY } }; }
        else if (state.activeTool === 'select') { setSelected([]); selBox = { startWorld: wp, curWorld: wp }; drag = { type: 'select', last: { x: t.clientX, y: t.clientY } }; }
        else { drag = { type: 'pan', last: { x: t.clientX, y: t.clientY } }; lastPanPt = { x: t.clientX, y: t.clientY }; }
      }
    }
  }, { passive: false });

  rootEl.addEventListener('touchmove', e => {
    if (sketchDrawing) return;
    e.preventDefault();
    if (touchTimer) { const t = e.touches[0]; if (t && (Math.abs(t.clientX - touchStartX) > 10 || Math.abs(t.clientY - touchStartY) > 10)) { clearTimeout(touchTimer); touchTimer = null; } }
    if (e.touches.length === 2 && pinch) {
      const nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const rect = rootEl.getBoundingClientRect();
      zoomAt((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top, nd / pinch.dist);
      pinch.dist = nd;
    } else if (e.touches.length === 1 && drag) {
      const t = e.touches[0], rect = rootEl.getBoundingClientRect();
      if (drag.type === 'pan') { pan(t.clientX - lastPanPt.x, t.clientY - lastPanPt.y); lastPanPt = { x: t.clientX, y: t.clientY }; }
      else if (drag.type === 'move') {
        const tdx = (t.clientX - drag.start.x) / camera.zoom, tdy = (t.clientY - drag.start.y) / camera.zoom;
        Object.entries(drag.positions).forEach(([id, s]) => { 
          if (state.widgets[id]?.locked) return; 
          const el2 = document.getElementById('w-' + id); 
          if (el2) { el2.style.transform = `translate3d(${tdx}px, ${tdy}px, 0)`; } 
          if (state.widgets[id]) { state.widgets[id].x = s.x + tdx; state.widgets[id].y = s.y + tdy; } 
        });
      } else if (drag.type === 'draw' && drawBox) {
        drawBox.curWorld = screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
        const x0 = Math.min(drawBox.startWorld.x, drawBox.curWorld.x), y0 = Math.min(drawBox.startWorld.y, drawBox.curWorld.y);
        const x1 = Math.max(drawBox.startWorld.x, drawBox.curWorld.x), y1 = Math.max(drawBox.startWorld.y, drawBox.curWorld.y);
        const sr = snapRect(x0, y0, x1 - x0, y1 - y0), scr = worldToScreen(sr.x, sr.y);
        updateGhost(scr.x, scr.y, sr.w * camera.zoom, sr.h * camera.zoom, drawBox.type);
      } else if (drag.type === 'select' && selBox) { selBox.curWorld = screenToWorld(t.clientX - rect.left, t.clientY - rect.top); drawSelBox(); }
    }
  }, { passive: false });

  rootEl.addEventListener('touchend', e => {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    if (drag?.type === 'draw' && drawBox) {
      hideGhost();
      const x0 = Math.min(drawBox.startWorld.x, drawBox.curWorld.x), y0 = Math.min(drawBox.startWorld.y, drawBox.curWorld.y);
      const x1 = Math.max(drawBox.startWorld.x, drawBox.curWorld.x), y1 = Math.max(drawBox.startWorld.y, drawBox.curWorld.y);
      const sr = snapRect(x0, y0, x1 - x0, y1 - y0), min = MIN_DRAW[drawBox.type];
      const snapped = snapRect(sr.x, sr.y, Math.max(sr.w, min.w), Math.max(sr.h, min.h));
      const w = createWidget(drawBox.type, snapped.x, snapped.y); w.w = snapped.w; w.h = snapped.h;
      state.widgets[w.id] = w;
      events.emit('pending:add', w.id);
      renderWidget(w); setSelected([w.id]);
      events.emit('tool:set', 'select');
      events.emit('app:save');
      drawBox = null;
    }
    if (drag?.type === 'select' && selBox) commitSelBox();
    if (drag?.type === 'move') {
      state.selectedIds.forEach(id => { 
        const ww = state.widgets[id]; if (!ww || ww.locked) return; 
        const sn = snapRect(ww.x, ww.y, ww.w, ww.h); updateWidget(id, { x: sn.x, y: sn.y }); 
        const el2 = document.getElementById('w-' + id); 
        if (el2) { 
          el2.style.transform = ''; 
          el2.style.left = sn.x + 'px'; el2.style.top = sn.y + 'px'; 
        } 
      });
      renderConnections(); if (state.minimapVisible) updateMinimap();
      if (window._appModules?.save) window._appModules.save();
    }
    pinch = null; drag = null; clearSelBoxUI();
  });

  rootEl.addEventListener('pointerdown', () => closeWidgetContextMenu(), { capture: true });

  // ── Keyboard ──
  window.addEventListener('keydown', e => {
    const t = e.target; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); camera.x = 0; camera.y = 0; camera.zoom = 1; events.emit('camera:apply'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '9') { e.preventDefault(); fitToAll(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); fitToSelection(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25, true); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8, true); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); const d = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0; state.selectedIds.forEach(id => { const w = state.widgets[id]; if (w && !w.locked) { w.x += dx; w.y += dy; const el = document.getElementById('w-' + id); if (el) { el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; } } }); events.emit('connections:render'); if (state.minimapVisible) events.emit('minimap:update'); events.emit('app:save'); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); toggleLock(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); toggleMinimap(); return; }
    if (e.key === '?') { e.preventDefault(); openHelpModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') { e.preventDefault(); openShareModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') { e.preventDefault(); openExportModal(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.size) { e.preventDefault(); [...state.selectedIds].forEach(deleteWidget); return; }
    if (e.key === 'Escape') { setSelected([]); events.emit('tool:set', 'select'); closeShareModal(); closeExportModal(); closeHelpModal(); closeCanvasPicker(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); setSelected(Object.keys(state.widgets)); return; }
    const tm = { 'v': 'select', 'h': 'hand', 'p': 'sketch', 't': 'memo', 's': 'spreadsheet', 'i': 'image', 'c': 'connect', 'e': 'eraser' };
    if (tm[e.key.toLowerCase()]) { events.emit('tool:set', tm[e.key.toLowerCase()]); }
  });
}