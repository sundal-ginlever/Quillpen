// ══════════════════════════════════════════
// APP.JS — Entry Point & Module Orchestration
// ══════════════════════════════════════════
import { state, camera, setTheme, currentUser, currentCanvasId, currentCanvasName, isReadOnly } from './state.js';
import { sb } from './supabase.js';
import { drawGrid, initGridResize } from './grid.js';
import { applyCamera, startCameraLoop, screenToWorld, worldToScreen, pan, zoomAt, fitToAll, fitToSelection } from './camera.js';
import { toggleMinimap, updateMinimap } from './minimap.js';
import { renderConnections, getAnchorPos, getBezierPath } from './connections.js';
import { createWidget, renderWidget, updateWidget, deleteWidget, bringToFront, setSelected } from './widgets/core.js';
import { save, saveLocal, loadLocal, pendingChanges, setSyncState, flushToCloud, loadFromCloud, rowToWidget, restoreFromBackup, discardBackup, checkLocalVersionConflict, schedulePush } from './sync.js';
import { processImageFile } from './widgets/image.js';
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
import { initJournal, showJournalScreen, loadDate, isJournalVisible } from './journal/journal.js';
import { journalState } from './journal/journal-state.js';
import { initMemoBoard, isMemoBoardVisible } from './memo-board.js';

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
events.on('app:start', startJournalIfNeeded);
events.on('app:load-local', loadLocal);
events.on('app:schedule-push', schedulePush);

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
  restoreFromBackup, discardBackup,
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
  if (isReadOnly) return;
  const w = window.innerWidth, h = window.innerHeight;
  const wp = screenToWorld(w / 2, h / 2);
  snapshotForUndo();
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
  checkLocalVersionConflict();
  initInteraction();
  buildToolbar();
  applyCamera();
  updateStatusBar();
  // 로드 직후의 상태를 Undo 기준선으로 저장 (첫 번째 동작도 Ctrl+Z로 되돌릴 수 있게 함)
  if (!isReadOnly) snapshotForUndo();
}

// Make startCanvas available via bridge
window._appModules.startCanvas = startCanvas;

// ══════════════════════════════════════════
// DAILY JOURNAL — new default entry screen.
// Fully independent of the canvas boot path above; only decides
// whether to show itself once auth/demo boot reaches 'app:start'.
// Share-link (read-only) mode never shows the journal.
// ══════════════════════════════════════════
// Wrapped defensively: a DOM/markup mismatch here (e.g. a stale service-worker
// cache serving an old index.html alongside a new app.js) must never abort
// this module's evaluation — that would also skip the boot IIFE below and
// take down login/canvas along with the journal.
try { initJournal(); } catch (e) { console.error('journal init failed', e); }
try { initMemoBoard(); } catch (e) { console.error('memo board init failed', e); }

function startJournalIfNeeded() {
  try {
    if (isReadOnly) {
      const screen = document.getElementById('journal-screen');
      if (screen) screen.hidden = true;
      // Memo board is only reachable from the journal header, but hide it
      // defensively too — it must never be reachable on a shared read-only link.
      const board = document.getElementById('memo-board-screen');
      if (board) board.hidden = true;
      return;
    }
    showJournalScreen();
    loadDate(journalState.selectedDate);
  } catch (e) {
    console.error('journal start failed', e);
  }
}

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

// Global Keyboard Shortcuts
document.addEventListener('keydown', e => {
  // Ctrl + S: Manual Sync
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    flushToCloud();
  }
});

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
  if (isReadOnly) return;
  if (isJournalVisible() || isMemoBoardVisible()) return; // canvas is hidden behind the journal/memo-board screen
  if (e.target.closest('[data-widget-id]')) return;
  const file = e.dataTransfer?.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  e.preventDefault();
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const rect = rootEl.getBoundingClientRect();
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  snapshotForUndo();
  const w = createWidget('image', wp.x - 140, wp.y - 100);
  state.widgets[w.id] = w; pendingChanges.add(w.id); renderWidget(w); setSelected([w.id]);
  processImageFile(file, w.id, (src) => {
    const imgEl = document.getElementById('w-' + w.id);
    if (imgEl) {
      const content = imgEl.querySelector('.img-content');
      if (content) { content.innerHTML = ''; const img = document.createElement('img'); img.src = src; img.style.cssText = 'width:100%;height:100%;object-fit:contain'; img.draggable = false; content.appendChild(img); }
    }
  });
});

// Clipboard paste handler
document.addEventListener('paste', e => {
  if (isReadOnly) return;
  if (isJournalVisible() || isMemoBoardVisible()) return; // canvas is hidden behind the journal/memo-board screen
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      const rootEl = document.getElementById('root');
      if (!rootEl) return;
      const x = window._lastMouseX !== undefined ? window._lastMouseX : window.innerWidth / 2;
      const y = window._lastMouseY !== undefined ? window._lastMouseY : window.innerHeight / 2;
      const wp = screenToWorld(x, y);
      snapshotForUndo();
      const w = createWidget('image', wp.x - 140, wp.y - 100);
      state.widgets[w.id] = w; pendingChanges.add(w.id); renderWidget(w); setSelected([w.id]);
      processImageFile(file, w.id, (src) => {
        const imgEl = document.getElementById('w-' + w.id);
        if (imgEl) {
          const content = imgEl.querySelector('.img-content');
          if (content) {
            content.innerHTML = '';
            const img = document.createElement('img');
            img.src = src;
            img.style.cssText = 'width:100%;height:100%;object-fit:contain';
            content.appendChild(img);
          }
        }
      });
    }
  }
});

// Track mouse for paste position
window.addEventListener('mousemove', e => {
  window._lastMouseX = e.clientX;
  window._lastMouseY = e.clientY;
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
