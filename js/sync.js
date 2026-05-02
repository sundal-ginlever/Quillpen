// ══════════════════════════════════════════
// SYNC ENGINE — Cloud + Local Storage
// ══════════════════════════════════════════
import { LOCAL_KEY } from './config.js';
import { state, camera, currentUser, currentCanvasId, setCurrentCanvasName } from './state.js';
import { sb } from './supabase.js';
import { events } from './events.js';

// Storage Adapter (Preparing for IndexedDB)
const storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, val) => localStorage.setItem(key, val),
  removeItem: (key) => localStorage.removeItem(key)
};

// Sync on Tab Close / Visibility Change
window.addEventListener('beforeunload', () => {
  saveLocal(); // Ensure local storage is always up to date
});
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveLocal();
});

export let syncTimer = null;
export let realtimeSub = null;
export let isSyncing = false;
export let pendingChanges = new Set();

export function setSyncState(state_name, label) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (dot) dot.className = 'sync-dot ' + state_name;
  if (text) text.textContent = label || '';
}

export function schedulePush() {
  if (!currentUser || !sb || !currentCanvasId || currentCanvasId === 'local') return;
  clearTimeout(syncTimer);
  if (!isSyncing) setSyncState('syncing', '동기화 대기...');
  syncTimer = setTimeout(flushToCloud, 1200);
}

export async function flushToCloud() {
  if (!sb || !currentUser || !currentCanvasId || currentCanvasId === 'local') return;
  if (isSyncing) {
    schedulePush(); // Chain
    return;
  }
  if (pendingChanges.size === 0) return;

  isSyncing = true;
  setSyncState('syncing', '동기화 중...');
  const idsToPush = Array.from(pendingChanges);
  idsToPush.forEach(id => pendingChanges.delete(id)); // Move to syncing buffer

  try {
    const rows = [];
    idsToPush.forEach(id => {
      const w = state.widgets[id];
      if (w) {
        rows.push({
          id: w.id, canvas_id: currentCanvasId, user_id: currentUser.id,
          type: w.type, x: w.x, y: w.y, w: w.w, h: w.h,
          z_index: w.zIndex, data: widgetData(w),
          updated_at: new Date(w.updatedAt || Date.now()).toISOString(),
        });
      }
    });
    if (rows.length > 0) {
      const { error } = await sb.from('q_widgets').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    await sb.from('q_canvases').update({
      camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      settings: { showGrid: state.showGrid, snapOn: state.snapOn, connections: state.connections },
      updated_at: new Date().toISOString(),
    }).eq('id', currentCanvasId);
    setSyncState('synced', '저장됨');
  } catch (err) {
    console.error('sync error', err);
    idsToPush.forEach(id => pendingChanges.add(id)); // Revert to pending on error
    setSyncState('error', '동기화 실패');
  } finally { 
    isSyncing = false; 
    if (pendingChanges.size > 0) schedulePush(); // Chain
  }
}

function widgetData(w) {
  if (w.type === 'memo') return { content: w.content, color: w.color, fontSize: w.fontSize };
  if (w.type === 'sketch') return { strokes: w.strokes, strokeColor: w.strokeColor, strokeWidth: w.strokeWidth };
  if (w.type === 'image') return { src: w.src, alt: w.alt, objectFit: w.objectFit };
  if (w.type === 'spreadsheet') return {
    rows: w.rows, cols: w.cols, cells: w.cells,
    luckyData: w.luckyData || null,
    colWidths: w.colWidths || {}, rowHeights: w.rowHeights || {}, cellFmt: w.cellFmt || {},
    boldCells: w.boldCells instanceof Set ? [...w.boldCells] : (w.boldCells || []),
    italicCells: w.italicCells instanceof Set ? [...w.italicCells] : (w.italicCells || []),
  };
  return {};
}

export async function loadFromCloud() {
  if (!sb || !currentUser || !currentCanvasId || currentCanvasId === 'local') { loadLocal(); return; }
  setSyncState('syncing', '불러오는 중...');
  try {
    // Read local storage to merge offline changes
    let localWidgets = {};
    try {
      const d = JSON.parse(storage.getItem(LOCAL_KEY) || 'null');
      if (d && d.widgets) localWidgets = d.widgets;
    } catch(e) {}

    const { data: canvasMeta } = await sb.from('q_canvases').select('*').eq('id', currentCanvasId).single();
    if (canvasMeta?.camera) { camera.x = canvasMeta.camera.x; camera.y = canvasMeta.camera.y; camera.zoom = canvasMeta.camera.zoom; }
    if (canvasMeta?.settings) {
      if (canvasMeta.settings.showGrid !== undefined) state.showGrid = canvasMeta.settings.showGrid;
      if (canvasMeta.settings.snapOn !== undefined) state.snapOn = canvasMeta.settings.snapOn;
      if (canvasMeta.settings.connections) state.connections = canvasMeta.settings.connections;
    }
    const { data: widgets } = await sb.from('q_widgets').select('*').eq('canvas_id', currentCanvasId).order('z_index');
    
    let needsPush = false;
    if (widgets) {
      widgets.forEach(row => {
        const cloudW = rowToWidget(row);
        const localW = localWidgets[cloudW.id];
        let w = cloudW;

        if (localW && localW.updatedAt > cloudW.updatedAt) {
          // Local offline change is newer! Keep local and push it to cloud later
          w = localW;
          if (w.type === 'spreadsheet') {
            w.boldCells = new Set(w.boldCells || []); w.italicCells = new Set(w.italicCells || []);
            w.colWidths = w.colWidths || {}; w.rowHeights = w.rowHeights || {}; w.cellFmt = w.cellFmt || {};
            w.luckyData = w.luckyData || null;
          }
          pendingChanges.add(w.id);
          needsPush = true;
        }
        delete localWidgets[cloudW.id]; // Remove processed

        state.widgets[w.id] = w;
        state.nextZ = Math.max(state.nextZ, w.zIndex + 1);
        events.emit('widget:render', w);
      });
    }

    // Process leftover local widgets created completely offline
    Object.values(localWidgets).forEach(localW => {
      if (localW.type === 'spreadsheet') {
        localW.boldCells = new Set(localW.boldCells || []); localW.italicCells = new Set(localW.italicCells || []);
        localW.colWidths = localW.colWidths || {}; localW.rowHeights = localW.rowHeights || {}; localW.cellFmt = localW.cellFmt || {};
        localW.luckyData = localW.luckyData || null;
      }
      state.widgets[localW.id] = localW;
      state.nextZ = Math.max(state.nextZ, localW.zIndex + 1);
      events.emit('widget:render', localW);
      pendingChanges.add(localW.id);
      needsPush = true;
    });
    events.emit('camera:apply');
    events.emit('ui:update');
    events.emit('connections:render');
    setSyncState('synced', canvasMeta?.name || '캔버스');
    subscribeRealtime();

    if (needsPush) schedulePush();

  } catch (err) {
    console.error('load error', err);
    loadLocal();
    setSyncState('offline', '오프라인');
    events.emit('app:start'); // Ensure app starts even on error
  }
}

export function rowToWidget(row) {
  const base = { id: row.id, type: row.type, x: row.x, y: row.y, w: row.w, h: row.h, zIndex: row.z_index, createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime() };
  const data = { ...row.data };
  if (row.type === 'spreadsheet') {
    data.boldCells = new Set(data.boldCells || []);
    data.italicCells = new Set(data.italicCells || []);
    data.colWidths = data.colWidths || {};
    data.rowHeights = data.rowHeights || {};
    data.cellFmt = data.cellFmt || {};
    data.luckyData = data.luckyData || null;
  }
  return { ...base, ...data };
}

function subscribeRealtime() {
  if (realtimeSub) { sb.removeChannel(realtimeSub); realtimeSub = null; }
  if (!sb || !currentCanvasId || currentCanvasId === 'local') return;
  realtimeSub = sb.channel('canvas-' + currentCanvasId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'q_widgets', filter: `canvas_id=eq.${currentCanvasId}` }, payload => handleRealtimeChange(payload))
    .on('presence', { event: 'sync' }, () => {
      const state = realtimeSub.presenceState();
      const users = Object.values(state).flat();
      console.log('Active users:', users);
      // Future: Update UI with user cursors or list
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        setSyncState('synced', '실시간 연결');
        await realtimeSub.track({ user: currentUser?.email, online_at: new Date().toISOString() });
      }
      if (status === 'CHANNEL_ERROR') setSyncState('error', '연결 오류');
    });
}

function handleRealtimeChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'DELETE') {
    const id = oldRow.id;
    if (state.widgets[id]) {
      const el = document.getElementById('w-' + id);
      if (el) el.remove();
      delete state.widgets[id];
      events.emit('connections:render');
      if (state.minimapVisible) events.emit('minimap:update');
    }
  } else {
    const w = rowToWidget(newRow);
    const existing = state.widgets[w.id];
    
    // CONCURRENCY RULE:
    // 1. If we have pending local changes for this widget, ignore remote update to avoid "revert flickering".
    // 2. If remote updatedAt is newer than local, update.
    if (pendingChanges.has(w.id)) return;
    
    if (!existing || w.updatedAt > (existing.updatedAt || 0)) {
      state.widgets[w.id] = w;
      const el = document.getElementById('w-' + w.id);
      if (el) {
        // Update basic props without full re-render if possible
        el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
        el.style.width = w.w + 'px'; el.style.height = w.h + 'px';
        el.style.zIndex = w.zIndex;
        if (w.type === 'memo') {
          const ta = el.querySelector('textarea');
          if (ta && document.activeElement !== ta) ta.value = w.content || '';
          el.style.background = w.color || '#fefce8';
        }
        if (w.type === 'spreadsheet') { el.remove(); events.emit('widget:render', w); }
        // Sketch update is complex, full re-render for now
        if (w.type === 'sketch') { el.remove(); events.emit('widget:render', w); }
        if (w.type === 'image') {
          const img = el.querySelector('img');
          if (img && img.src !== w.src) img.src = w.src;
        }
      } else {
        events.emit('widget:render', w);
      }
      events.emit('connections:render');
      if (state.minimapVisible) events.emit('minimap:update');
    }
  }
}

export function saveLocal() {
  try {
    const plain = {};
    Object.values(state.widgets).forEach(w => {
      const copy = { ...w };
      if (w.type === 'spreadsheet') {
        copy.boldCells = w.boldCells instanceof Set ? [...w.boldCells] : (w.boldCells || []);
        copy.italicCells = w.italicCells instanceof Set ? [...w.italicCells] : (w.italicCells || []),
        copy.luckyData = w.luckyData || null;
      }
      plain[w.id] = copy;
    });
    storage.setItem(LOCAL_KEY, JSON.stringify({ widgets: plain, camera: { ...camera }, showGrid: state.showGrid, snapOn: state.snapOn, connections: state.connections }));
  } catch (e) { console.error('saveLocal failed', e); }
}

export function loadLocal() {
  try {
    const d = JSON.parse(storage.getItem(LOCAL_KEY) || 'null');
    if (!d) return;
    if (d.camera) { camera.x = d.camera.x; camera.y = d.camera.y; camera.zoom = d.camera.zoom; }
    if (d.showGrid !== undefined) state.showGrid = d.showGrid;
    if (d.snapOn !== undefined) state.snapOn = d.snapOn;
    if (d.widgets) {
      Object.values(d.widgets).forEach(w => {
        if (w.type === 'spreadsheet') {
          w.boldCells = new Set(w.boldCells || []); w.italicCells = new Set(w.italicCells || []);
          w.colWidths = w.colWidths || {}; w.rowHeights = w.rowHeights || {}; w.cellFmt = w.cellFmt || {};
          w.luckyData = w.luckyData || null;
        }
        state.widgets[w.id] = w;
        state.nextZ = Math.max(state.nextZ, w.zIndex + 1);
        events.emit('widget:render', w);
      });
    }
    if (d.connections) state.connections = d.connections;
    events.emit('camera:apply');
    events.emit('ui:update');
    events.emit('connections:render');
  } catch (e) { console.error('loadLocal failed', e); }
}

export function save() {
  // Take snapshot before applying remote change
  events.emit('undo:snapshot');
  saveLocal();
  schedulePush();
}
