console.log('--- Quillpen Modular Boot Start ---');
import './styles/main.css';

import { state, setTheme, setCurrentCanvas } from './js/core/state';
import { sb } from './js/core/supabase';
import { initAuth, listenAuthChanges, showAuthScreen, hideAuthScreen } from './js/core/auth';
import { initCamera, applyCamera } from './js/core/camera';
import { setSyncState, loadFromCloud } from './js/core/sync';
import { initInteraction } from './js/core/interaction';
import { renderConnections } from './js/core/connections';
import { renderToolbar } from './js/components/Toolbar';
import { initShortcuts } from './js/core/shortcuts';
import { initGlobalUI } from './js/core/ui';

async function init() {
  console.log('🚀 Initializing App...');
  initGlobalUI();
  
  // 1. Hide root by default until auth is confirmed
  const root = document.getElementById('root');
  if (root) root.style.display = 'none';

  // 2. Initial Setup (Non-UI dependent)
  setTheme(state.theme);
  initCamera();

  // 3. Auth Listener
  listenAuthChanges(async (event) => {
    console.log('[Auth] Event:', event);
    if (event === 'SIGNED_IN') {
      await bootCanvas();
    } else if (event === 'SIGNED_OUT') {
      if (root) root.style.display = 'none';
      showAuthScreen();
    }
  });

  // 4. Check Current Session
  const authStatus = await initAuth();
  if (authStatus.mode === 'auth') {
    await bootCanvas();
  } else {
    showAuthScreen();
  }

  // 5. Remove loading screen
  setTimeout(() => {
    const loader = document.getElementById('loading-screen');
    if (loader) loader.style.opacity = '0';
    setTimeout(() => loader?.remove(), 400);
  }, 500);
}

async function bootCanvas() {
  console.log('🏗️ Booting Canvas UI...');
  hideAuthScreen();
  
  const root = document.getElementById('root');
  if (root) root.style.display = 'block';

  try {
    const { data: canvases } = await sb.from('q_canvases').select('id').limit(1);
    let canvasId = canvases?.[0]?.id;
    
    if (!canvasId) {
      const { data: newCanvas } = await sb.from('q_canvases').insert({ name: '첫 번째 캔버스' }).select().single();
      canvasId = newCanvas.id;
    }

    if (!canvasId) throw new Error('Canvas ID missing');

    setCurrentCanvas(canvasId);
    
    // Core Engine Init (Only after root is visible)
    initInteraction(root);
    initShortcuts();
    
    // Data & UI Rendering
    await loadFromCloud(canvasId);
    renderToolbar();
    renderConnections();
    applyCamera();
    
    setSyncState('synced', '준비됨');
  } catch (err) {
    console.error('Boot canvas error:', err);
    setSyncState('error', '로딩 실패');
  }
}

init();
