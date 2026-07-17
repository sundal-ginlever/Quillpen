// ══════════════════════════════════════════
// SYNC ENGINE — Cloud + Local Storage
// ══════════════════════════════════════════
import { LOCAL_KEY_LIVE, LOCAL_KEY_SYNCED, LOCAL_KEY_BACKUP, OLD_LOCAL_KEY } from './config.js';
import { state, camera, currentUser, currentCanvasId, setCurrentCanvasName } from './state.js';
import { sb } from './supabase.js';
import { events } from './events.js';

// Storage Adapter (Preparing for IndexedDB)
const storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, val) => localStorage.setItem(key, val),
  removeItem: (key) => localStorage.removeItem(key)
};

// Dynamic storage key helpers
function getLiveKey() {
  return currentCanvasId ? `qp_local_live_${currentCanvasId}` : LOCAL_KEY_LIVE;
}
function getSyncedKey() {
  return currentCanvasId ? `qp_local_synced_${currentCanvasId}` : LOCAL_KEY_SYNCED;
}
function getBackupKey() {
  return currentCanvasId ? `qp_local_backup_${currentCanvasId}` : LOCAL_KEY_BACKUP;
}

function migrateLiveKeyToDynamic() {
  if (!currentCanvasId) return;
  const oldLive = storage.getItem(LOCAL_KEY_LIVE);
  if (oldLive) {
    const dynamicKey = getLiveKey();
    if (!storage.getItem(dynamicKey)) {
      storage.setItem(dynamicKey, oldLive);
    }
    storage.removeItem(LOCAL_KEY_LIVE);
  }
  const oldSynced = storage.getItem(LOCAL_KEY_SYNCED);
  if (oldSynced) {
    const dynamicKey = getSyncedKey();
    if (!storage.getItem(dynamicKey)) {
      storage.setItem(dynamicKey, oldSynced);
    }
    storage.removeItem(LOCAL_KEY_SYNCED);
  }
  const oldBackup = storage.getItem(LOCAL_KEY_BACKUP);
  if (oldBackup) {
    const dynamicKey = getBackupKey();
    if (!storage.getItem(dynamicKey)) {
      storage.setItem(dynamicKey, oldBackup);
    }
    storage.removeItem(LOCAL_KEY_BACKUP);
  }
}

// Sync on Tab Close / Visibility Change
window.addEventListener('beforeunload', () => {
  saveLocal(); // Ensure local storage is always up to date
});
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveLocal();
});

// 비동기 Supabase 호출 무한 정체 방지를 위한 타임아웃 래퍼 (기본 8초)
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);
}

export let syncTimer = null;
export let realtimeSub = null;
export let isSyncing = false;
export let syncQueued = false;
export let pendingChanges = new Set();
export let pendingDeletes = new Set();
// 삭제된 이미지 위젯의 Storage 파일 (위젯 id → 파일명). 즉시 지우지 않고
// 다음 클라우드 동기화 시점에 처리해, Ctrl+Z로 위젯을 복원하면 파일도 살아있게 함
export let pendingStorageDeletes = new Map();
export let pendingCanvasMeta = false;

export function markCanvasMetaDirty() {
  if (!currentUser || !sb || !currentCanvasId || currentCanvasId === 'local') return;
  pendingCanvasMeta = true;
  setSyncState('pending', '동기화 필요');
}


export function setSyncState(state_name, label) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (dot) dot.className = 'sync-dot ' + state_name;
  if (text) text.textContent = label || '';
}

export function schedulePush() {
  if (!currentUser || !sb || !currentCanvasId || currentCanvasId === 'local') return;
  // Manual mode: No longer auto-pushing. Just notifying.
  setSyncState('pending', '동기화 필요');
}

export async function flushToCloud() {
  if (!sb || !currentUser || !currentCanvasId || currentCanvasId === 'local') return;
  if (isSyncing) {
    syncQueued = true;
    return;
  }
  if (pendingChanges.size === 0 && pendingDeletes.size === 0 && pendingStorageDeletes.size === 0 && !pendingCanvasMeta) {
    setSyncState('synced', '서버와 일치');
    return;
  }

  isSyncing = true;
  setSyncState('syncing', '서버 저장 중...');
  
  const flushStartTimestamp = Date.now(); // Race condition 방어용 통신 개시 동결 시각
  const idsToPush = Array.from(pendingChanges);
  const idsToDelete = Array.from(pendingDeletes);

  try {
    // 1. Bulk offline delete sync
    if (idsToDelete.length > 0) {
      const { error: delError } = await withTimeout(sb.from('q_widgets').delete().in('id', idsToDelete));
      if (delError) throw delError;
      idsToDelete.forEach(id => pendingDeletes.delete(id));
    }

    // 2. Bulk updates sync
    const rows = [];
    idsToPush.forEach(id => {
      const w = state.widgets[id];
      if (w) {
        rows.push({
          id: w.id, canvas_id: currentCanvasId, user_id: currentUser.id,
          type: w.type, x: w.x, y: w.y, w: w.w, h: w.h,
          z_index: w.zIndex, data: widgetData(w),
          updated_at: new Date(w.updatedAt || flushStartTimestamp).toISOString(),
        });
      }
    });

    if (rows.length > 0) {
      const { error } = await withTimeout(sb.from('q_widgets').upsert(rows, { onConflict: 'id' }));
      if (error) throw error;
    }

    // 3. 지연된 이미지 파일 삭제 처리 (Undo로 위젯이 복원되었으면 파일 삭제 취소)
    if (pendingStorageDeletes.size > 0) {
      const toRemove = [];
      pendingStorageDeletes.forEach((fileName, wid) => {
        if (state.widgets[wid]) { pendingStorageDeletes.delete(wid); return; }
        toRemove.push([wid, fileName]);
      });
      if (toRemove.length > 0) {
        const { error: rmError } = await withTimeout(sb.storage.from('quillpen-images').remove(toRemove.map(([, f]) => f)));
        if (!rmError) toRemove.forEach(([wid]) => pendingStorageDeletes.delete(wid));
        else console.error('Deferred image file removal failed', rmError);
      }
    }

    // Success: 비동기 통신이 이뤄지는 도중(await)에 새롭게 변경된 최신 좌표 데이터는 pendingChanges에서 지우지 않고 보존
    idsToPush.forEach(id => {
      const w = state.widgets[id];
      if (!w || (w.updatedAt || 0) <= flushStartTimestamp) {
        pendingChanges.delete(id);
      }
    });


    // 1. Fetch current remote connections to prevent LWW loss
    const { data: canvasMeta } = await withTimeout(sb.from('q_canvases').select('settings').eq('id', currentCanvasId).single());
    let mergedConnections = state.connections;
    if (canvasMeta && canvasMeta.settings && canvasMeta.settings.connections) {
      mergedConnections = { ...canvasMeta.settings.connections, ...state.connections };
      
      // 1) 로컬에서 명시적으로 삭제된 연결선의 원격 DB 좀비 부활 차단
      if (state.deletedConnectionIds) {
        state.deletedConnectionIds.forEach(cid => {
          delete mergedConnections[cid];
        });
      }

      // 2) 고아 연결선(참조 위젯이 존재하지 않거나 캔버스 삭제 예정 목록에 있는 경우) 제거
      Object.keys(mergedConnections).forEach(cid => {
        const c = mergedConnections[cid];
        const isOrphan = !state.widgets[c.fromId] || !state.widgets[c.toId] || 
                         pendingDeletes.has(c.fromId) || pendingDeletes.has(c.toId);
        if (isOrphan) {
          delete mergedConnections[cid];
        }
      });
    }

    await withTimeout(sb.from('q_canvases').update({
      camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      settings: { showGrid: state.showGrid, snapOn: state.snapOn, connections: mergedConnections },
      updated_at: new Date().toISOString(),
    }).eq('id', currentCanvasId));

    pendingCanvasMeta = false;
    setSyncState('synced', '저장 완료');
    saveLocal();

    
    // Update synced slot
    const liveStr = storage.getItem(getLiveKey());
    if (liveStr) {
      try {
        const live = JSON.parse(liveStr);
        if (live.widgets) {
          storage.setItem(getSyncedKey(), JSON.stringify({ hash: getHash(live.widgets), timestamp: Date.now() }));
          storage.removeItem(getBackupKey());
        }
      } catch(e) {}
    }

    setTimeout(() => {
      if (pendingChanges.size === 0) setSyncState('synced', '서버와 일치');
    }, 2000);
  } catch (err) {
    console.error('Manual sync error', err);
    setSyncState('error', err.message === 'TIMEOUT' ? '저장 실패 (시간 초과)' : '저장 실패');
  } finally { 
    isSyncing = false; 
    if (syncQueued) {
      syncQueued = false;
      setTimeout(flushToCloud, 100);
    }
  }
}

function widgetData(w) {
  const baseData = {};
  if (w.locked !== undefined) baseData.locked = w.locked;

  if (w.type === 'memo') return { ...baseData, content: w.content, title: w.title || '', color: w.color, fontSize: w.fontSize };
  if (w.type === 'sketch') return { ...baseData, strokes: w.strokes, strokeColor: w.strokeColor, strokeWidth: w.strokeWidth };
  if (w.type === 'image') return { ...baseData, src: w.src, alt: w.alt, objectFit: w.objectFit };
  if (w.type === 'spreadsheet') return {
    ...baseData,
    rows: w.rows, cols: w.cols, cells: w.cells,
    luckyData: w.luckyData || null,
    jdata: w.jdata || null,
    jwidths: w.jwidths || null,
    jstyle: w.jstyle || null,
    jmerge: w.jmerge || null,
    colWidths: w.colWidths || {}, rowHeights: w.rowHeights || {}, cellFmt: w.cellFmt || {},
    boldCells: w.boldCells instanceof Set ? [...w.boldCells] : (w.boldCells || []),
    italicCells: w.italicCells instanceof Set ? [...w.italicCells] : (w.italicCells || []),
  };
  return baseData;
}

export async function loadFromCloud() {
  if (!sb || !currentUser || !currentCanvasId || currentCanvasId === 'local') { loadLocal(); return; }
  migrateLiveKeyToDynamic();
  setSyncState('syncing', '불러오는 중...');
  try {
    // Read local storage to merge offline changes
    let localWidgets = {};
    try {
      const d = JSON.parse(storage.getItem(getLiveKey()) || 'null');
      if (d) {
        if (d.widgets) localWidgets = d.widgets;
        if (d.pendingDeletes) {
          pendingDeletes.clear();
          d.pendingDeletes.forEach(id => pendingDeletes.add(id));
        }
        if (d.pendingStorageDeletes) {
          pendingStorageDeletes.clear();
          d.pendingStorageDeletes.forEach(([wid, f]) => pendingStorageDeletes.set(wid, f));
        }
      }
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
        if (pendingDeletes.has(row.id)) {
          needsPush = true;
          return;
        }
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
            w.jdata = w.jdata || null;
            w.jwidths = w.jwidths || null;
            w.jstyle = w.jstyle || null;
            w.jmerge = w.jmerge || null;
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
        localW.jdata = localW.jdata || null;
        localW.jwidths = localW.jwidths || null;
        localW.jstyle = localW.jstyle || null;
        localW.jmerge = localW.jmerge || null;
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
    data.jdata = data.jdata || null;
    data.jwidths = data.jwidths || null;
    data.jstyle = data.jstyle || null;
    data.jmerge = data.jmerge || null;
  }
  return { ...base, ...data };
}

export function subscribeRealtime() {
  if (realtimeSub) { sb.removeChannel(realtimeSub); realtimeSub = null; }
  if (!sb || !currentCanvasId || currentCanvasId === 'local') return;
  realtimeSub = sb.channel('canvas-' + currentCanvasId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'q_widgets', filter: `canvas_id=eq.${currentCanvasId}` }, payload => handleRealtimeChange(payload))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'q_canvases', filter: `id=eq.${currentCanvasId}` }, payload => {
      const newCanvas = payload.new;
      if (newCanvas && newCanvas.settings && newCanvas.settings.connections) {
        state.connections = { ...state.connections, ...newCanvas.settings.connections };
        // 로컬에서 명시적으로 삭제한 연결선이 원격 브로드캐스트로 되살아나지 않도록 필터링
        if (state.deletedConnectionIds) {
          state.deletedConnectionIds.forEach(cid => { delete state.connections[cid]; });
        }
        events.emit('connections:render');
      }
    })
    .on('presence', { event: 'sync' }, () => {
      const presenceData = realtimeSub.presenceState();
      const users = Object.values(presenceData).flat();
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
      if (el) { if (el._cleanupFn) try{el._cleanupFn();}catch(e){} el.remove(); }
      delete state.widgets[id];
      events.emit('connections:render');
      if (state.minimapVisible) events.emit('minimap:update');
    }
  } else {
    const w = rowToWidget(newRow);
    const existing = state.widgets[w.id];
    
    // 3번 이슈: 스프레드시트 델타 병합 (LWW 덮어쓰기 충돌 완전 예방)
    if (existing && w.type === 'spreadsheet') {
      const localDelta = existing._localDelta || {};
      const remoteJdata = w.jdata || [];
      const mergedJdata = JSON.parse(JSON.stringify(remoteJdata));
      
      // 로컬 변경 셀들(Delta)을 리모트 데이터 위에 안전하게 오버레이
      let hasMerged = false;
      for (const key in localDelta) {
        const [r, c] = key.split(',').map(Number);
        while (mergedJdata.length <= r) mergedJdata.push([]);
        while (mergedJdata[r].length <= c) mergedJdata[r].push('');
        mergedJdata[r][c] = localDelta[key];
        hasMerged = true;
      }
      
      existing.jdata = mergedJdata;
      existing._baseJdata = JSON.parse(JSON.stringify(remoteJdata));
      existing.jwidths = w.jwidths || existing.jwidths;
      existing.jstyle = w.jstyle || existing.jstyle;
      existing.jmerge = w.jmerge || existing.jmerge;
      existing.updatedAt = Math.max(existing.updatedAt || 0, w.updatedAt || 0);

      if (hasMerged && window._appModules?.showUndoToast) {
        window._appModules.showUndoToast('스프레드시트가 동시 편집 중입니다! 셀 단위로 병합되었습니다.');
      }

      const el = document.getElementById('w-' + w.id);
      if (el) {
        // 2번 이슈: 현재 로컬 사용자가 셀 수정 중이면 리렌더링을 지연시킵니다 (포커스 유지)
        if (existing._isEditing || el.contains(document.activeElement)) {
          existing._applyPendingRemoteUpdate = () => {
            const freshEl = document.getElementById('w-' + w.id);
            if (freshEl) { if (freshEl._cleanupFn) try{freshEl._cleanupFn();}catch(e){} freshEl.remove(); }
            events.emit('widget:render', existing);
          };
        } else {
          if (el._cleanupFn) try{el._cleanupFn();}catch(e){}
          el.remove();
          events.emit('widget:render', existing);
        }
      }
      events.emit('connections:render');
      if (state.minimapVisible) events.emit('minimap:update');
      return;
    }

    // 2번 이슈: 포커스 탈취 방지 (로컬 사용자가 활발히 편집 중인 메모 등을 보호)
    const el = document.getElementById('w-' + w.id);
    const activeEl = document.activeElement;
    const isEditingThis = el && (el === activeEl || el.contains(activeEl) || (existing && existing._isEditing));

    if (isEditingThis) {
      if (w.type === 'memo') {
        if (existing) {
          existing.color = w.color;
          el.style.background = w.color || '#fefce8';
          const titleInput = el.querySelector('.memo-title-input');
          if (titleInput && titleInput !== activeEl) titleInput.value = w.title || '';
        }
        pendingChanges.add(w.id);
        return;
      }
    }

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
        el.classList.toggle('locked', !!w.locked);
        if (w.type === 'memo') {
          const ta = el.querySelector('textarea');
          if (ta && document.activeElement !== ta) ta.value = w.content || '';
          const titleInput = el.querySelector('.memo-title-input');
          if (titleInput && document.activeElement !== titleInput) titleInput.value = w.title || '';
          el.style.background = w.color || '#fefce8';
          el.style.fontSize = (w.fontSize || 14) + 'px';
        }
        if (w.type === 'spreadsheet') { if (el._cleanupFn) try{el._cleanupFn();}catch(e){} el.remove(); events.emit('widget:render', w); }
        // Sketch update is complex, full re-render for now
        if (w.type === 'sketch') { if (el._cleanupFn) try{el._cleanupFn();}catch(e){} el.remove(); events.emit('widget:render', w); }
        if (w.type === 'image') {
          const img = el.querySelector('img');
          if (img && img.src !== w.src) img.src = w.src;
          if (img) img.style.objectFit = w.objectFit || 'cover';
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
        copy.italicCells = w.italicCells instanceof Set ? [...w.italicCells] : (w.italicCells || []);
        copy.luckyData = w.luckyData || null;
        copy.jdata = w.jdata || null;
        copy.jwidths = w.jwidths || null;
        copy.jstyle = w.jstyle || null;
        copy.jmerge = w.jmerge || null;
      }
      // 런타임 전용 임시 속성(_baseJdata, _localDelta 등)은 저장 용량만 차지하므로 제외
      Object.keys(copy).forEach(k => { if (k.startsWith('_')) delete copy[k]; });
      plain[w.id] = copy;
    });
    storage.setItem(getLiveKey(), JSON.stringify({
      widgets: plain,
      camera: { ...camera },
      showGrid: state.showGrid,
      snapOn: state.snapOn,
      connections: state.connections,
      deletedConnectionIds: Array.from(state.deletedConnectionIds || []), // 로컬 삭제 연결선 보존
      pendingDeletes: Array.from(pendingDeletes),
      pendingChanges: Array.from(pendingChanges), // 로컬 수정 큐 보존
      pendingStorageDeletes: Array.from(pendingStorageDeletes.entries()) // 보류된 이미지 파일 삭제 큐 보존
    }));
  } catch (e) {
    console.error('saveLocal failed', e);
    if (window._appModules?.showUndoToast) {
      window._appModules.showUndoToast('로컬 저장 실패! 용량이 초과되었습니다.');
    }
  }
}

export function loadLocal() {
  try {
    const d = JSON.parse(storage.getItem(getLiveKey()) || 'null');
    if (!d) return;
    if (d.camera) { camera.x = d.camera.x; camera.y = d.camera.y; camera.zoom = d.camera.zoom; }
    if (d.showGrid !== undefined) state.showGrid = d.showGrid;
    if (d.snapOn !== undefined) state.snapOn = d.snapOn;
    
    // 오프라인 수정 큐 및 삭제 연결선 복구
    if (d.pendingDeletes) {
      pendingDeletes.clear();
      d.pendingDeletes.forEach(id => pendingDeletes.add(id));
    }
    if (d.pendingChanges) {
      pendingChanges.clear();
      d.pendingChanges.forEach(id => pendingChanges.add(id));
    }
    if (d.pendingStorageDeletes) {
      pendingStorageDeletes.clear();
      d.pendingStorageDeletes.forEach(([wid, f]) => pendingStorageDeletes.set(wid, f));
    }
    if (d.deletedConnectionIds) {
      state.deletedConnectionIds = new Set(d.deletedConnectionIds);
    } else {
      state.deletedConnectionIds = new Set();
    }

    if (d.widgets) {
      Object.values(d.widgets).forEach(w => {
        if (w.type === 'spreadsheet') {
          w.boldCells = new Set(w.boldCells || []); w.italicCells = new Set(w.italicCells || []);
          w.colWidths = w.colWidths || {}; w.rowHeights = w.rowHeights || {}; w.cellFmt = w.cellFmt || {};
          w.luckyData = w.luckyData || null;
          w.jdata = w.jdata || null;
          w.jwidths = w.jwidths || null;
          w.jstyle = w.jstyle || null;
          w.jmerge = w.jmerge || null;
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

// 연속 입력(메모 타이핑 등) 시 매 키 입력마다 전체 상태 딥클론(Undo 스냅샷)과
// localStorage 직렬화가 일어나지 않도록 저장 작업을 디바운스 (입력이 멈추면 300ms 후 1회 실행)
let saveDebounceTimer = null;
export function save() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    events.emit('undo:snapshot');
    saveLocal();
  }, 300);
  markCanvasMetaDirty();
}

// ── VERSIONING UTILS ──

function getHash(data) {
  const s = JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

export async function checkLocalVersionConflict() {
  try {
    migrateLiveKeyToDynamic();
    const live = storage.getItem(getLiveKey());
    if (!live) { migrateOldData(); return; }
    
    const synced = JSON.parse(storage.getItem(getSyncedKey()) || 'null');
    if (!synced) return;

    const liveObj = JSON.parse(live);
    const liveHash = getHash(liveObj.widgets || {});
    if (liveHash !== synced.hash) {
      // Conflict! Live data has changed since last cloud sync
      storage.setItem(getBackupKey(), live);
      const alert = document.getElementById('local-version-alert');
      if (alert) alert.style.display = 'block';
    }
  } catch (err) {
    console.error("Local version parsing self-healed:", err);
  }
}

function migrateOldData() {
  const old = storage.getItem(OLD_LOCAL_KEY);
  if (old) {
    storage.setItem(getLiveKey(), old);
    storage.removeItem(OLD_LOCAL_KEY);
  }
}

export function restoreFromBackup() {
  const backupStr = storage.getItem(getBackupKey());
  if (!backupStr) return;
  try {
    const backup = JSON.parse(backupStr);
    if (!backup.widgets) return;
    
    // Merge backup into current state
    Object.values(backup.widgets).forEach(w => {
      const existing = state.widgets[w.id];
      if (!existing || w.updatedAt > (existing.updatedAt || 0)) {
        if (w.type === 'spreadsheet') {
          w.boldCells = new Set(w.boldCells || []); w.italicCells = new Set(w.italicCells || []);
          w.colWidths = w.colWidths || {}; w.rowHeights = w.rowHeights || {}; w.cellFmt = w.cellFmt || {};
        }
        state.widgets[w.id] = w;
        const el = document.getElementById('w-' + w.id);
        if (el) { if (el._cleanupFn) try{el._cleanupFn();}catch(e){} el.remove(); }
        events.emit('widget:render', w);
        pendingChanges.add(w.id);
      }
    });
    save();
    discardBackup();
    events.emit('toast:show', '로컬 데이터가 병합되었습니다.');
  } catch(e) { console.error('restoreFromBackup failed', e); }
}

export function discardBackup() {
  storage.removeItem(getBackupKey());
  const alert = document.getElementById('local-version-alert');
  if (alert) alert.style.display = 'none';
}
