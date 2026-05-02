// ══════════════════════════════════════════
// APP.JS — Entry Point & Module Orchestration
// ══════════════════════════════════════════
import { state, camera, setTheme, currentUser, currentCanvasId, currentCanvasName } from './state.js';
import { sb } from './supabase.js';
import { drawGrid, initGridResize } from './grid.js';
import { applyCamera, startCameraLoop, screenToWorld, worldToScreen, pan, zoomAt, fitToAll, fitToSelection } from './camera.js';
import { toggleMinimap, updateMinimap } from './minimap.js';
import { renderConnections, getAnchorPos, getBezierPath } from './connections.js';
import { createWidget, renderWidget, updateWidget, deleteWidget, bringToFront, setSelected } from './widgets/core.js';
import { save, saveLocal, loadLocal, pendingChanges, setSyncState, flushToCloud, loadFromCloud, rowToWidget } from './sync.js';
import { initAuth, initAuthUI } from './auth.js';
import { openCanvasPicker, closeCanvasPicker, createNewCanvas, switchCanvas, clearCanvas, initCanvasPickerEvents } from './canvas-manager.js';
import { buildToolbar, setTool, updateStatusBar, TOOLS } from './toolbar.js';
import { initInteraction } from './interaction.js';
import { snapshotForUndo, undo, redo, showUndoToast, duplicateSelected, toggleLock, fitToScreen, undoBlocked } from './undo.js';
import { openSearch, closeSearch, searchNav, initSearchEvents } from './search.js';
import { checkShareMode, openShareModal, closeShareModal, toggleShareEnabled, copyShareUrl, renameCanvas } from './share.js';
import { openExportModal, closeExportModal, exportJSON, importJSON, exportCSV, exportPNG } from './export.js';
import { openGuideModal, closeGuideModal, moveGuide } from './guide.js';
import { initPWA, triggerInstall } from './pwa.js';
import { openHelpModal, closeHelpModal } from './help.js';
import { events } from './events.js';

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════
events.on('camera:change', updateStatusBar);
events.on('camera:change', drawGrid);
events.on('camera:change', () => { if (state.minimapVisible) updateMinimap(); });

events.on('camera:apply', applyCamera);
events.on('widget:render', renderWidget);
events.on('ui:update', () => { buildToolbar(); updateStatusBar(); });
events.on('connections:render', renderConnections);
events.on('app:save', save);
events.on('app:save-local', saveLocal);
events.on('pending:add', id => pendingChanges.add(id));
events.on('pending:delete', id => pendingChanges.delete(id));
events.on('minimap:update', updateMinimap);
events.on('toast:show', msg => showUndoToast(msg));
events.on('widget:update', (id, updates) => updateWidget(id, updates));
events.on('undo:snapshot', snapshotForUndo);
events.on('tool:set', setTool);
events.on('canvas:clear', clearCanvas);
events.on('app:start', startCanvas);
events.on('app:load-local', loadLocal);

// ══════════════════════════════════════════
// MODULE BRIDGE — window._appModules
// All cross-module references go through this
// ══════════════════════════════════════════
window._appModules = {
  // State
  get sb() { return sb; },
  get currentCanvasId() { return currentCanvasId; },
  get currentUser() { return currentUser; },
  get undoBlocked() { return undoBlocked; },
  getInstallPrompt: () => triggerInstall,
  hasInstallPrompt: () => !!window._deferredInstallPrompt, 
  pendingChanges,
  // Camera
  drawGrid, applyCamera, startCameraLoop, screenToWorld, worldToScreen,
  // Widgets
  renderWidget, updateWidget, deleteWidget, bringToFront, setSelected, createWidget,
  // Sync
  save, saveLocal, loadLocal, flushToCloud, loadFromCloud, rowToWidget, setSyncState,
  // UI
  buildToolbar, setTool, updateStatusBar, renderConnections, updateMinimap,
  // Undo
  snapshotForUndo, showUndoToast,
  // Canvas
  clearCanvas, startCanvas,
};

// ══════════════════════════════════════════
// EXPOSE TO INLINE onclick IN HTML
// ══════════════════════════════════════════
window.closeCanvasPicker = closeCanvasPicker;
window.createNewCanvas = createNewCanvas;
window.openCanvasPicker = openCanvasPicker;
window.closeShareModal = closeShareModal;
window.copyShareUrl = copyShareUrl;
window.toggleShareEnabled = toggleShareEnabled;
window.closeExportModal = closeExportModal;
window.exportPNG = exportPNG;
window.exportJSON = exportJSON;
window.exportCSV = exportCSV;
window.importJSON = importJSON;
window.closeHelpModal = closeHelpModal;
window.openGuideModal = openGuideModal;
window.closeGuideModal = closeGuideModal;
window.moveGuide = moveGuide;
window.searchNav = searchNav;
window.closeSearch = closeSearch;
window.triggerInstall = triggerInstall;
window.setTool = setTool;
window.createWidgetAtCenter = createWidgetAtCenter;

// ══════════════════════════════════════════
// HELPER: create widget at center (for mobile FAB)
// ══════════════════════════════════════════
function createWidgetAtCenter(type) {
  const w = window.innerWidth, h = window.innerHeight;
  const wp = screenToWorld(w / 2, h / 2);
  const wgt = createWidget(type, wp.x - 100, wp.y - 100);
  state.widgets[wgt.id] = wgt;
  pendingChanges.add(wgt.id);
  renderWidget(wgt);
  setSelected([wgt.id]);
  save();
  const fab = document.querySelector('.mobile-fab');
  if (fab) fab.classList.remove('open');
}

// ══════════════════════════════════════════
// BOOT SEQUENCE
// ══════════════════════════════════════════
function startCanvas() {
  document.getElementById('root').style.display = 'block';
  initInteraction();
  buildToolbar();
  applyCamera();
  updateStatusBar();
}

// Make startCanvas available via bridge
window._appModules.startCanvas = startCanvas;

// Apply theme
document.documentElement.dataset.theme = state.theme;

// Init grid resize listener
initGridResize();

// Init PWA
initPWA();

// Init canvas picker events
initCanvasPickerEvents();

// Init search events
initSearchEvents();

// Init auth UI event listeners
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
});

// Online/offline handlers
window.addEventListener('online', () => setSyncState('syncing', '재연결 중...'));
window.addEventListener('offline', () => setSyncState('offline', '오프라인'));

// Canvas drop handler (images dropped on empty canvas)
document.addEventListener('dragover', e => {
  if (e.target.closest('[data-widget-id]')) return;
  e.preventDefault();
});
document.addEventListener('drop', e => {
  if (e.target.closest('[data-widget-id]')) return;
  const file = e.dataTransfer?.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  e.preventDefault();
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const rect = rootEl.getBoundingClientRect();
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const w = createWidget('image', wp.x - 140, wp.y - 100);
  state.widgets[w.id] = w; pendingChanges.add(w.id); renderWidget(w); setSelected([w.id]);
  const reader = new FileReader();
  reader.onload = ev => {
    let dataUrl = ev.target.result;
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      try {
        const raw = atob(dataUrl.split(',')[1] || '');
        const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
        doc.querySelectorAll('script, foreignObject, iframe, embed, object, link, style').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
          [...el.attributes].forEach(attr => {
            if (attr.name.toLowerCase().startsWith('on') || attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))
              el.removeAttribute(attr.name);
          });
        });
        const clean = new XMLSerializer().serializeToString(doc.documentElement);
        dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clean)));
      } catch { /* safe */ }
    }
    updateWidget(w.id, { src: dataUrl, alt: file.name });
    state.widgets[w.id].src = dataUrl;
    const imgEl = document.getElementById('w-' + w.id);
    if (imgEl) {
      const content = imgEl.querySelector('.img-content');
      if (content) { content.innerHTML = ''; const img = document.createElement('img'); img.src = dataUrl; img.style.cssText = 'width:100%;height:100%;object-fit:contain'; content.appendChild(img); }
    }
    save();
  };
  reader.readAsDataURL(file);
});

// ══════════════════════════════════════════
// MAIN BOOT
// ══════════════════════════════════════════
(async () => {
  const isShare = await checkShareMode();
  if (!isShare) initAuth();
  if (!localStorage.getItem('quillpen_onboarded')) {
    setTimeout(openGuideModal, 1500);
  }
})();
