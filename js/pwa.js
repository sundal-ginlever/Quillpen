// ══════════════════════════════════════════
// PWA INSTALL
// ══════════════════════════════════════════
export let deferredInstallPrompt = null;

export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed: ', err));
    });
  }
  
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    window._deferredInstallPrompt = e;
    const btn = document.getElementById('install-btn');
    if (btn) btn.classList.add('visible');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('install-btn');
    if (btn) btn.classList.remove('visible');
  });
}

export function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
}
