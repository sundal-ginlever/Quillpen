import { state } from './state';
import { sb } from './supabase';

/**
 * Expose UI control functions to window for inline HTML events
 */
export function initGlobalUI() {
  window.closeShareModal = () => {
    const modal = document.getElementById('share-modal');
    if (modal) modal.style.display = 'none';
  };

  window.copyShareUrl = () => {
    const input = document.getElementById('share-url-input');
    if (!input) return;
    input.select();
    document.execCommand('copy');
    const btn = document.getElementById('copy-share-btn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✓ 복사됨';
      setTimeout(() => btn.textContent = original, 2000);
    }
  };

  window.toggleShareEnabled = async (enabled) => {
    if (!state.currentCanvasId) return;
    try {
      const shareToken = enabled ? Math.random().toString(36).slice(2, 11) : null;
      const { error } = await sb.from('q_canvases')
        .update({ share_enabled: enabled, share_token: shareToken })
        .eq('id', state.currentCanvasId);
      
      if (error) throw error;
      
      const input = document.getElementById('share-url-input');
      if (input) {
        input.value = enabled ? `${window.location.origin}/?share=${shareToken}` : '';
      }
    } catch (err) {
      console.error('Share toggle error:', err);
      alert('공유 상태 변경 실패');
    }
  };

  window.closeSearch = () => {
    const bar = document.getElementById('search-bar');
    if (bar) bar.classList.remove('open');
  };
  
  // Restore showUndoToast
  window.showUndoToast = (msg) => {
    const t = document.getElementById('undo-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  };
}
