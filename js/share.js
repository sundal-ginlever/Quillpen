// ══════════════════════════════════════════
// SHARE LINK + READ-ONLY MODE
// ══════════════════════════════════════════
import { state, currentUser, currentCanvasId, setCurrentCanvasId, setCurrentCanvasName, setIsReadOnly } from './state.js';
import { sb, loadSupabase } from './supabase.js';
import { events } from './events.js';
import { rowToWidget } from './sync.js';

export async function checkShareMode() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('share');
  if (!shareId) return false;

  setIsReadOnly(true);
  document.getElementById('share-banner').style.display = 'flex';
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('sync-indicator').style.display = 'none';

  if (!sb) { await loadSupabase(); }
  if (!sb) return false;

  try {
    const { data: canvas } = await sb.from('q_canvases').select('*').eq('share_token', shareId).single();
    if (!canvas) { alert('공유 캔버스를 찾을 수 없습니다.'); return false; }
    if (canvas.camera) { camera.x = canvas.camera.x; camera.y = canvas.camera.y; camera.zoom = canvas.camera.zoom; }
    if (canvas.settings) {
      if (canvas.settings.showGrid !== undefined) state.showGrid = canvas.settings.showGrid;
      if (canvas.settings.snapOn !== undefined) state.snapOn = canvas.settings.snapOn;
    }
    setCurrentCanvasName(canvas.name || '공유 캔버스');
    const { data: widgets } = await sb.from('q_widgets').select('*').eq('canvas_id', canvas.id).order('z_index');
    if (widgets) {
      widgets.forEach(row => {
        const w = rowToWidget(row);
        state.widgets[w.id] = w;
        state.nextZ = Math.max(state.nextZ, w.zIndex + 1);
        events.emit('widget:render', w);
      });
    }
    events.emit('app:start');
    events.emit('camera:apply');
    disableEditing();
    return true;
  } catch (e) { console.error('share load error', e); return false; }
}

function disableEditing() {
  document.querySelectorAll('.tool-btn').forEach(b => {
    if (!['↖', '✋'].includes(b.textContent)) b.style.display = 'none';
  });
  document.querySelectorAll('.del-btn, .resize-handle, .add-row, .add-col').forEach(el => {
    el.style.pointerEvents = 'none'; el.style.opacity = '0.3';
  });
}

export function openShareModal() {
  if (!currentCanvasId || currentCanvasId === 'local') {
    alert('클라우드에 저장된 캔버스만 공유할 수 있습니다.\nSupabase를 설정하고 로그인해주세요.'); return;
  }
  document.getElementById('share-modal').style.display = 'flex';
  loadShareState();
}

export function closeShareModal() { document.getElementById('share-modal').style.display = 'none'; }

async function loadShareState() {
  if (!sb || !currentCanvasId) return;
  const { data } = await sb.from('q_canvases').select('share_token, share_enabled').eq('id', currentCanvasId).single();
  const enabled = data?.share_enabled || false;
  const token = data?.share_token;
  document.getElementById('share-enabled').checked = enabled;
  if (enabled && token) {
    document.getElementById('share-url-input').value = `${window.location.origin}${window.location.pathname}?share=${token}`;
  } else {
    document.getElementById('share-url-input').value = enabled ? '링크 생성 중...' : '공유가 비활성화되어 있습니다';
  }
}

export async function toggleShareEnabled(enabled) {
  if (!sb || !currentCanvasId) return;
  if (enabled) {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    await sb.from('q_canvases').update({ share_enabled: true, share_token: token }).eq('id', currentCanvasId);
    document.getElementById('share-url-input').value = `${window.location.origin}${window.location.pathname}?share=${token}`;
  } else {
    await sb.from('q_canvases').update({ share_enabled: false }).eq('id', currentCanvasId);
    document.getElementById('share-url-input').value = '공유가 비활성화되어 있습니다';
  }
}

export function copyShareUrl() {
  const val = document.getElementById('share-url-input').value;
  if (!val || val.includes('비활성화')) return;
  navigator.clipboard?.writeText(val).then(() => {
    const btn = document.getElementById('copy-share-btn');
    btn.textContent = '✓ 복사됨'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 2000);
  });
}

export async function renameCanvas(newName) {
  const { currentCanvasName, currentUser } = await import('./state.js');
  if (!newName || newName === currentCanvasName) return;
  setCurrentCanvasName(newName);
  document.title = `inkcanvas — ${newName}`;
  if (sb && currentUser && currentCanvasId && currentCanvasId !== 'local') {
    await sb.from('q_canvases').update({ name: newName }).eq('id', currentCanvasId);
  }
}
