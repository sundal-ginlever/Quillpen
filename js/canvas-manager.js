// ══════════════════════════════════════════
// CANVAS MANAGER — CRUD + Picker UI
// ══════════════════════════════════════════
import { state, currentUser, currentCanvasId, setCurrentCanvasId } from './state.js';
import { sb } from './supabase.js';
import { saveLocal, loadFromCloud, flushToCloud, setSyncState, pendingChanges, pendingDeletes } from './sync.js';
import { sanitize } from './utils.js';
import { clearUndoHistory } from './undo.js';

export async function fetchCanvases() {
  if (!sb || !currentUser) return [];
  const { data } = await sb.from('q_canvases').select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: false });
  return data || [];
}

export async function createNewCanvas() {
  if (!sb || !currentUser) return;
  
  // 기존 데이터 안전하게 백업 및 동기화 수행
  try {
    saveLocal();
    await flushToCloud();
  } catch (e) {
    console.error("Backup failed during canvas creation:", e);
  }

  // 데이터 동기화 완료 검증 (동기화되지 않은 수정 사항이 있으면 유실 확인)
  if (pendingChanges.size > 0 || pendingDeletes.size > 0) {
    if (!confirm('현재 캔버스의 최신 변경 사항이 클라우드에 아직 저장되지 못했습니다.\n이대로 진행하면 저장되지 않은 일부 데이터가 영구 유실될 수 있습니다. 계속하시겠습니까?')) {
      return;
    }
  }

  const name = prompt('캔버스 이름', '새 캔버스') || '새 캔버스';
  const { data } = await sb.from('q_canvases').insert({ user_id: currentUser.id, name }).select().single();
  if (data) {
    clearCanvas();
    setCurrentCanvasId(data.id);
    localStorage.setItem('quillpen_last_canvas_' + currentUser.id, data.id);
    closeCanvasPicker();
    setSyncState('synced', data.name);
  }
}

export async function switchCanvas(id, name) {
  try {
    saveLocal();
    if (sb && currentUser) await flushToCloud();
  } catch (e) {
    console.error("Backup failed during canvas switch:", e);
  }

  // 데이터 동기화 완료 검증 (동기화되지 않은 수정 사항이 있으면 유실 확인)
  if (pendingChanges.size > 0 || pendingDeletes.size > 0) {
    if (!confirm('현재 캔버스의 최신 변경 사항이 클라우드에 아직 저장되지 못했습니다.\n이대로 진행하면 저장되지 않은 일부 데이터가 영구 유실될 수 있습니다. 계속하시겠습니까?')) {
      return;
    }
  }

  clearCanvas();
  setCurrentCanvasId(id);
  localStorage.setItem('quillpen_last_canvas_' + currentUser?.id, id);
  await loadFromCloud();
  closeCanvasPicker();
  setSyncState('synced', name);
}

export function clearCanvas() {
  Object.keys(state.widgets).forEach(id => {
    const el = document.getElementById('w-' + id);
    if (el) {
      if (el._cleanupFn) {
        try {
          el._cleanupFn();
        } catch (e) {
          console.error('Cleanup failed for widget ' + id, e);
        }
      }
      el.remove();
    }
  });
  state.widgets = {};
  state.connections = {};
  state.selectedIds = new Set();
  state.nextZ = 1;
  if (pendingChanges) {
    pendingChanges.clear();
  }
  if (pendingDeletes) {
    pendingDeletes.clear();
  }
  clearUndoHistory();
}

export async function openCanvasPicker() {
  if (!currentUser) return;
  const picker = document.getElementById('canvas-picker');
  picker.style.display = 'flex';
  const list = document.getElementById('picker-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">불러오는 중...</div>';
  const canvases = await fetchCanvases();
  list.innerHTML = '';
  canvases.forEach(c => {
    const item = document.createElement('div');
    item.className = 'picker-item' + (c.id === currentCanvasId ? ' active' : '');
    const d = new Date(c.updated_at);
    const fmt = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    item.innerHTML = `<div class="picker-icon">🎨</div><div><div class="picker-name">${sanitize(c.name)}</div><div class="picker-meta">수정: ${fmt}</div></div>`;
    item.addEventListener('click', () => switchCanvas(c.id, c.name));
    list.appendChild(item);
  });
}

export function closeCanvasPicker() {
  document.getElementById('canvas-picker').style.display = 'none';
}

export function initCanvasPickerEvents() {
  const picker = document.getElementById('canvas-picker');
  picker.addEventListener('click', e => { if (e.target === picker) closeCanvasPicker(); });
}
