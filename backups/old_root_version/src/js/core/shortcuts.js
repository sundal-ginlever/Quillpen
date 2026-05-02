import { state, setTheme } from './state';
import { save } from './sync';
import { deleteWidget, renderWidget } from './widgets';
import { fitToAll, applyCamera } from './camera';

export function initShortcuts() {
  window.addEventListener('keydown', e => {
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;

    // 1. Tool Shortcuts
    const toolMap = { 'v': 'select', 'h': 'hand', 'm': 'memo', 's': 'sketch', 't': 'spreadsheet', 'i': 'image' };
    if (toolMap[e.key.toLowerCase()]) {
      state.activeTool = toolMap[e.key.toLowerCase()];
      window.dispatchEvent(new CustomEvent('toolchanged', { detail: { tool: state.activeTool } }));
    }

    // 2. Zoom & View
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      state.cameraZoom *= 1.25;
      applyCamera();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      state.cameraZoom *= 0.8;
      applyCamera();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      state.cameraX = 0; state.cameraY = 0; state.cameraZoom = 1;
      applyCamera();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '9') {
      e.preventDefault();
      fitToAll();
    }

    // 3. Widget Operations
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      // Delete focused or selected (Original logic used selectedIds)
      // For now, handling basic delete
    }

    // 4. System
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      // Lock toggle logic
    }
    
    if (e.key === 'Escape') {
      // Close all modals
      document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
  });
}
