// ══════════════════════════════════════════
// WIDGET CORE — create, render, update, delete
// ══════════════════════════════════════════
import { state, currentUser, currentCanvasId } from '../state.js';
import { nanoid } from '../utils.js';
import { attachAnchors } from '../connections.js';
import { events } from '../events.js';
import { sb } from '../supabase.js';
import { renderMemo } from './memo.js';
import { renderSketch } from './sketch.js';
import { renderSpreadsheet } from './spreadsheet.js';
import { renderImage } from './image.js';

export function updateWidget(id, updates) {
  if (!state.widgets[id]) return;
  Object.assign(state.widgets[id], updates, { updatedAt: Date.now() });
  events.emit('pending:add', id);
}

export function bringToFront(id) {
  state.widgets[id].zIndex = state.nextZ++;
  const el = document.getElementById('w-' + id);
  if (el) el.style.zIndex = state.widgets[id].zIndex;
}

export function deleteWidget(id) {
  if (state.widgets[id]?.locked) {
    if (window._appModules?.showUndoToast) window._appModules.showUndoToast('잠긴 위젯은 삭제할 수 없습니다 (Ctrl+L)');
    return;
  }
  const el = document.getElementById('w-' + id);
  if (el && el._cleanupFn) el._cleanupFn();
  if (el) el.remove();

  // Cleanup connections
  Object.keys(state.connections).forEach(cid => {
    const c = state.connections[cid];
    if (c.fromId === id || c.toId === id) delete state.connections[cid];
  });

  delete state.widgets[id];
  state.selectedIds.delete(id);
  events.emit('pending:delete', id);
  events.emit('app:save');
  events.emit('connections:render');
  events.emit('ui:update');
  if (state.minimapVisible) events.emit('minimap:update');

  if (sb && currentCanvasId && currentCanvasId !== 'local') {
    sb.from('q_widgets').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('Immediate delete failed', error);
    });
  }
}

export function setSelected(ids) {
  state.selectedIds.forEach(id => { document.getElementById('w-' + id)?.classList.remove('selected'); });
  state.selectedIds = new Set(ids);
  state.selectedIds.forEach(id => { document.getElementById('w-' + id)?.classList.add('selected'); });
}

export function createWidget(type, wx, wy) {
  const id = nanoid();
  const defaults = {
    memo:        { w: 240, h: 180, content: '', color: '#fefce8', fontSize: 14 },
    sketch:      { w: 320, h: 240, strokes: [], strokeColor: '#1e293b', strokeWidth: 2 },
    spreadsheet: { w: 380, h: 260, rows: 6, cols: 5, cells: {}, luckyData: null },
    image:       { w: 280, h: 200, src: '', alt: '', objectFit: 'contain' },
  };
  return { id, type, x: wx, y: wy, zIndex: state.nextZ++, locked: false, createdAt: Date.now(), updatedAt: Date.now(), ...defaults[type] };
}

export function renderWidget(w) {
  const wd = document.getElementById('world');
  if (!wd || document.getElementById('w-' + w.id)) return;
  let el;
  if (w.type === 'memo') el = renderMemo(w);
  else if (w.type === 'sketch') el = renderSketch(w);
  else if (w.type === 'spreadsheet') el = renderSpreadsheet(w);
  else if (w.type === 'image') el = renderImage(w);
  if (el) {
    el.style.zIndex = w.zIndex;
    if (w.locked) el.classList.add('locked');
    attachAnchors(el, w.id);
    wd.appendChild(el);
    events.emit('ui:update');
    if (state.minimapVisible) events.emit('minimap:update');
  }
}
