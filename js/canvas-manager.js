// ══════════════════════════════════════════
// CANVAS MANAGER — CRUD + Picker UI
// ══════════════════════════════════════════
import { state, currentUser, currentCanvasId, setCurrentCanvasId } from './state.js';
import { sb } from './supabase.js';
import { saveLocal, loadFromCloud, flushToCloud, setSyncState } from './sync.js';
import { sanitize } from './utils.js';

export async function fetchCanvases() {
  if (!sb || !currentUser) return [];
  const { data } = await sb.from('q_canvases').select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: false });
  return data || [];
}

export async function createNewCanvas() {
  if (!sb || !currentUser) return;
  const name = prompt('캔버스 이름', '새 캔버스') || '새 캔버스';
  const { data } = await sb.from('q_canvases').insert({ user_id: currentUser.id, name }).select().single();
  if (data) {
    clearCanvas();
    setCurrentCanvasId(data.id);
    localStorage.setItem('inkcanvas_last_canvas_' + currentUser.id, data.id);
    closeCanvasPicker();
    setSyncState('synced', data.name);
  }
}

export async function switchCanvas(id, name) {
  saveLocal();
  if (sb && currentUser) await flushToCloud();
  clearCanvas();
  setCurrentCanvasId(id);
  localStorage.setItem('inkcanvas_last_canvas_' + currentUser?.id, id);
  await loadFromCloud();
  closeCanvasPicker();
  setSyncState('synced', name);
}

export function clearCanvas() {
  Object.keys(state.widgets).forEach(id => {
    const el = document.getElementById('w-' + id);
    if (el) el.remove();
  });
  state.widgets = {};
  state.selectedIds = new Set();
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
