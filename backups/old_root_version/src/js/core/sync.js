import { state, currentUser, currentCanvasId, LOCAL_KEY } from './state';
import { sb } from './supabase';
import { renderWidget } from './widgets';
import { applyCamera, camera } from './camera';

let syncTimer = null;
let isSyncing = false;
export const pendingChanges = new Set();

export function setSyncState(status, label) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (dot) dot.className = 'sync-dot ' + status;
  if (text) text.textContent = label || '';
}

export function saveLocal() {
  try {
    const plain = {};
    Object.values(state.widgets).forEach(w => {
      const copy = { ...w };
      if (w.type === 'spreadsheet') {
        copy.boldCells = w.boldCells instanceof Set ? [...w.boldCells] : (w.boldCells || []);
        copy.italicCells = w.italicCells instanceof Set ? [...w.italicCells] : (w.italicCells || []);
      }
      plain[w.id] = copy;
    });
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      widgets: plain,
      camera: { ...camera },
      showGrid: state.showGrid,
      snapOn: state.snapOn,
      connections: state.connections
    }));
  } catch (e) {
    console.error('saveLocal failed', e);
  }
}

export async function flushToCloud() {
  if (!sb || !currentUser || !currentCanvasId || currentCanvasId === 'local') return;
  if (isSyncing) return;
  isSyncing = true;

  try {
    const rows = [];
    const idsToPush = Array.from(pendingChanges);
    idsToPush.forEach(id => {
      const w = state.widgets[id];
      if (w) {
        rows.push({
          id: w.id,
          canvas_id: currentCanvasId,
          user_id: currentUser.id,
          type: w.type,
          x: w.x, y: w.y, w: w.w, h: w.h,
          z_index: w.zIndex,
          data: extractWidgetData(w),
          updated_at: new Date().toISOString(),
        });
      }
    });

    if (rows.length > 0) {
      const { error } = await sb.from('q_widgets').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      idsToPush.forEach(id => pendingChanges.delete(id));
    }

    await sb.from('q_canvases').update({
      camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      settings: {
        showGrid: state.showGrid,
        snapOn: state.snapOn,
        connections: state.connections
      },
      updated_at: new Date().toISOString(),
    }).eq('id', currentCanvasId);

    setSyncState('synced', '저장됨');
  } catch (err) {
    console.error('[Sync] Error:', err);
    setSyncState('error', '동기화 실패');
  } finally {
    isSyncing = false;
  }
}

function extractWidgetData(w) {
  if (w.type === 'memo') return { content: w.content, color: w.color, fontSize: w.fontSize };
  if (w.type === 'sketch') return { strokes: w.strokes, strokeColor: w.strokeColor, strokeWidth: w.strokeWidth };
  if (w.type === 'image') return { src: w.src, alt: w.alt, objectFit: w.objectFit };
  if (w.type === 'spreadsheet') return {
    rows: w.rows, cols: w.cols, cells: w.cells,
    colWidths: w.colWidths || {},
    rowHeights: w.rowHeights || {},
    cellFmt: w.cellFmt || {},
    boldCells: w.boldCells ? [...w.boldCells] : [],
    italicCells: w.italicCells ? [...w.italicCells] : [],
  };
  return {};
}

export function save(immediate = false) {
  saveLocal();
  if (!currentUser || !sb || !currentCanvasId || currentCanvasId === 'local') return;

  clearTimeout(syncTimer);
  setSyncState('syncing', '동기화 중...');
  if (immediate) flushToCloud();
  else syncTimer = setTimeout(flushToCloud, 1200);
}

export async function loadFromCloud(canvasId) {
  if (!sb || !canvasId || canvasId === 'local') return;
  setSyncState('syncing', '불러오는 중...');
  
  try {
    const { data: canvasMeta } = await sb.from('q_canvases').select('*').eq('id', canvasId).single();
    if (canvasMeta?.camera) {
      camera.x = canvasMeta.camera.x; camera.y = canvasMeta.camera.y; camera.zoom = canvasMeta.camera.zoom;
    }
    const { data: widgets } = await sb.from('q_widgets').select('*').eq('canvas_id', canvasId).order('z_index');
    
    document.querySelectorAll('.widget').forEach(el => el.remove());
    state.widgets = {};

    if (widgets) {
      widgets.forEach(row => {
        const w = rowToWidget(row);
        state.widgets[w.id] = w;
        state.nextZ = Math.max(state.nextZ, w.zIndex + 1);
        renderWidget(w);
      });
    }
    applyCamera();
    setSyncState('synced', canvasMeta?.name || '저장됨');
  } catch (err) {
    console.error('[Sync] Load error:', err);
    setSyncState('error', '로딩 실패');
  }
}

function rowToWidget(row) {
  const base = {
    id: row.id, type: row.type,
    x: row.x, y: row.y, w: row.w, h: row.h,
    zIndex: row.z_index,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
  const data = { ...row.data };
  if (row.type === 'spreadsheet') {
    data.boldCells = new Set(data.boldCells || []);
    data.italicCells = new Set(data.italicCells || []);
  }
  return { ...base, ...data };
}
