// ══════════════════════════════════════════
// WIDGET CORE — create, render, update, delete
// ══════════════════════════════════════════
import { state, currentUser, currentCanvasId } from '../state.js';
import { nanoid } from '../utils.js';
import { attachAnchors } from '../connections.js';
import { events } from '../events.js';
import { sb } from '../supabase.js';
import { pendingDeletes } from '../sync.js';
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
  events.emit('pending:add', id);
  events.emit('app:save');
  
  if (state.nextZ > 1000000) {
    const sorted = Object.values(state.widgets).sort((a, b) => a.zIndex - b.zIndex);
    sorted.forEach((w, idx) => {
      w.zIndex = idx + 1;
      const wEl = document.getElementById('w-' + w.id);
      if (wEl) wEl.style.zIndex = w.zIndex;
      events.emit('pending:add', w.id);
    });
    state.nextZ = sorted.length + 1;
    events.emit('app:save');
  }
}

export function deleteWidget(id) {
  if (state.widgets[id]?.locked) {
    if (window._appModules?.showUndoToast) window._appModules.showUndoToast('잠긴 위젯은 삭제할 수 없습니다 (Ctrl+L)');
    return;
  }

  // 4번 이슈: 이미지 위젯인 경우 Supabase Storage의 실제 파일도 삭제해 고아 파일 누수 방지
  const w = state.widgets[id];
  if (w && w.type === 'image' && w.src && sb) {
    const bucketPrefix = 'storage/v1/object/public/quillpen-images/';
    if (w.src.includes(bucketPrefix)) {
      const parts = w.src.split(bucketPrefix);
      if (parts.length > 1) {
        const fileName = decodeURIComponent(parts[1]);
        sb.storage.from('quillpen-images').remove([fileName]).then(({ error }) => {
          if (error) console.error('Failed to delete image file from Supabase storage', error);
          else console.log('Successfully deleted image file from Supabase storage:', fileName);
        });
      }
    }
  }

  const el = document.getElementById('w-' + id);
  if (el && el._cleanupFn) el._cleanupFn();
  if (el) el.remove();

  // Cleanup connections
  let connectionDeleted = false;
  Object.keys(state.connections).forEach(cid => {
    const c = state.connections[cid];
    if (c.fromId === id || c.toId === id) {
      delete state.connections[cid];
      connectionDeleted = true;
    }
  });

  pendingDeletes.add(id);
  delete state.widgets[id];
  state.selectedIds.delete(id);
  events.emit('pending:delete', id);
  events.emit('app:save');
  events.emit('connections:render');
  events.emit('ui:update');
  if (state.minimapVisible) events.emit('minimap:update');

  if (sb && currentCanvasId && currentCanvasId !== 'local') {
    sb.from('q_widgets').delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error('Immediate delete failed, keeping in pendingDeletes', error);
      } else {
        pendingDeletes.delete(id);
        events.emit('app:save-local');
      }
    });

    if (connectionDeleted) {
      // Fetch and merge to prevent LWW loss while deleting connection
      sb.from('q_canvases').select('settings').eq('id', currentCanvasId).single().then(({ data }) => {
        let mergedConnections = state.connections;
        if (data && data.settings && data.settings.connections) {
          mergedConnections = { ...data.settings.connections, ...state.connections };
          // Remove the specific deleted connections from remote if they still exist
          Object.keys(mergedConnections).forEach(cid => {
             const c = mergedConnections[cid];
             if (c.fromId === id || c.toId === id) delete mergedConnections[cid];
          });
        }
        sb.from('q_canvases').update({
          settings: { showGrid: state.showGrid, snapOn: state.snapOn, connections: mergedConnections }
        }).eq('id', currentCanvasId).then();
      });
    }
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
    memo:        { w: 240, h: 180, content: '', title: '', color: '#fefce8', fontSize: 14 },
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
