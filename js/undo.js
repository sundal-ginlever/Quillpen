// ══════════════════════════════════════════
// UNDO / REDO + DUPLICATE + LOCK + FIT
// ══════════════════════════════════════════
import { UNDO_LIMIT } from './config.js';
import { state, camera } from './state.js';
import { renderConnections } from './connections.js';
import { applyCamera } from './camera.js';
import { events } from './events.js';
import { nanoid } from './utils.js';
import { setSelected } from './widgets/core.js';

const undoStack = [];
const redoStack = [];
export let undoBlocked = false;

function cloneWidget(w) {
  const c = { ...w };
  if (w.type === 'spreadsheet') {
    if (c.cells) c.cells = { ...c.cells };
    if (c.colWidths) c.colWidths = { ...c.colWidths };
    if (c.rowHeights) c.rowHeights = { ...c.rowHeights };
    if (c.cellFmt) c.cellFmt = { ...c.cellFmt };
    if (c.boldCells) c.boldCells = new Set(c.boldCells);
    if (c.italicCells) c.italicCells = new Set(c.italicCells);
  } else if (w.type === 'sketch') {
    if (c.strokes) c.strokes = c.strokes.map(s => ({ color: s.color, width: s.width, points: [...s.points] }));
  }
  return c;
}

export function snapshotForUndo() {
  if (undoBlocked) return;
  const snapWidgets = {};
  for (const id in state.widgets) snapWidgets[id] = cloneWidget(state.widgets[id]);
  undoStack.push({ widgets: snapWidgets, connections: JSON.parse(JSON.stringify(state.connections)), camera: { ...camera } });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function applySnapshot(snap) {
  Object.keys(state.widgets).forEach(id => { const el = document.getElementById('w-' + id); if (el) el.remove(); });
  state.widgets = {};
  state.selectedIds = new Set();
  state.connections = snap.connections || {};
  for (const id in snap.widgets) {
    const w = cloneWidget(snap.widgets[id]);
    state.widgets[w.id] = w;
    state.nextZ = Math.max(state.nextZ, (w.zIndex || 0) + 1);
    events.emit('widget:render', w);
  }
  if (snap.camera) { camera.x = snap.camera.x; camera.y = snap.camera.y; camera.zoom = snap.camera.zoom; applyCamera(); }
  renderConnections();
}

export function undo() {
  if (!undoStack.length) { showUndoToast('더 이상 되돌릴 수 없습니다'); return; }
  const currentSnap = {};
  for (const id in state.widgets) currentSnap[id] = cloneWidget(state.widgets[id]);
  redoStack.push({ widgets: currentSnap, connections: JSON.parse(JSON.stringify(state.connections)), camera: { ...camera } });
  undoBlocked = true;
  applySnapshot(undoStack.pop());
  undoBlocked = false;
  events.emit('app:save-local');
  showUndoToast('실행 취소');
}

export function redo() {
  if (!redoStack.length) { showUndoToast('다시 실행할 내용이 없습니다'); return; }
  const currentSnap = {};
  for (const id in state.widgets) currentSnap[id] = cloneWidget(state.widgets[id]);
  undoStack.push({ widgets: currentSnap, connections: JSON.parse(JSON.stringify(state.connections)), camera: { ...camera } });
  undoBlocked = true;
  applySnapshot(redoStack.pop());
  undoBlocked = false;
  events.emit('app:save-local');
  showUndoToast('다시 실행');
}

let undoToastTimer = null;
export function showUndoToast(msg) {
  const t = document.getElementById('undo-toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

export function duplicateSelected() {
  if (!state.selectedIds.size) return;
  const newIds = [];
  state.selectedIds.forEach(id => {
    const w = state.widgets[id]; if (!w) return;
    const copy = JSON.parse(JSON.stringify(w, (k, v) => v instanceof Set ? [...v] : v));
    copy.id = nanoid(); copy.x += 24; copy.y += 24; copy.zIndex = state.nextZ++; copy.locked = false;
    if (copy.type === 'spreadsheet') { copy.boldCells = new Set(copy.boldCells || []); copy.italicCells = new Set(copy.italicCells || []); }
    state.widgets[copy.id] = copy;
    events.emit('widget:render', copy);
    newIds.push(copy.id);
  });
  if (newIds.length) {
    setSelected(newIds);
    events.emit('app:save');
  }
}

export function toggleLock() {
  if (!state.selectedIds.size) return;
  const allLocked = [...state.selectedIds].every(id => state.widgets[id]?.locked);
  state.selectedIds.forEach(id => {
    events.emit('widget:update', id, { locked: !allLocked });
    const el = document.getElementById('w-' + id);
    if (el) el.classList.toggle('locked', !allLocked);
  });
  events.emit('app:save');
  showUndoToast(allLocked ? '잠금 해제' : '위젯 잠금');
}

export function fitToScreen() {
  const widgets = Object.values(state.widgets);
  if (!widgets.length) return;
  const PAD = 80, vw = window.innerWidth, vh = window.innerHeight;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  widgets.forEach(w => { minX = Math.min(minX, w.x); minY = Math.min(minY, w.y); maxX = Math.max(maxX, w.x + w.w); maxY = Math.max(maxY, w.y + w.h); });
  const bw = maxX - minX + PAD * 2, bh = maxY - minY + PAD * 2;
  const newZoom = Math.min(4, Math.max(0.05, Math.min(vw / bw, vh / bh)));
  camera.zoom = newZoom;
  camera.x = (vw - (maxX + minX) * newZoom) / 2;
  camera.y = (vh - (maxY + minY) * newZoom) / 2;
  applyCamera();
  const ff = document.getElementById('fit-flash');
  if (ff) { ff.classList.remove('flash'); void ff.offsetWidth; ff.classList.add('flash'); }
  showUndoToast('화면에 맞춤');
}
