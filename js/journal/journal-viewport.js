// ══════════════════════════════════════════
// JOURNAL VIEWPORT — mobile on-screen-keyboard handling
//
// `100dvh` cannot solve this: #journal-screen is `position:fixed; inset:0`,
// which sizes off the LAYOUT viewport, and dvh only tracks browser-chrome
// (address bar) collapsing, not the keyboard — iOS in particular does not
// shrink the layout viewport when the keyboard opens, only the *visual*
// viewport. window.visualViewport is the only API that actually observes
// this, so it's the real fix; dvh/vh stay as the CSS fallback for browsers
// without it (very old, at this point).
// ══════════════════════════════════════════
let active = false;
let rafId = null;
let onChangeCb = null;

function applyViewport() {
  rafId = null;
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  root.style.setProperty('--journal-height', vv.height + 'px');
  // iOS scrolls the visual viewport down (offsetTop > 0) when a bottom input
  // is focused, instead of shrinking height alone — without tracking this
  // too the whole screen appears to shift up out of view.
  root.style.setProperty('--journal-top', vv.offsetTop + 'px');
  if (onChangeCb) onChangeCb();
}

function scheduleApply() {
  if (rafId) return;
  rafId = requestAnimationFrame(applyViewport);
}

// Only active while the journal screen is actually visible — must be
// disabled when switching to the free-pages canvas so it never touches
// canvas layout.
export function enableJournalViewportTracking(onChange) {
  onChangeCb = onChange || null;
  if (active || !window.visualViewport) return;
  active = true;
  window.visualViewport.addEventListener('resize', scheduleApply);
  window.visualViewport.addEventListener('scroll', scheduleApply);
  applyViewport();
}

export function disableJournalViewportTracking() {
  if (!active) return;
  active = false;
  window.visualViewport.removeEventListener('resize', scheduleApply);
  window.visualViewport.removeEventListener('scroll', scheduleApply);
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  document.documentElement.style.removeProperty('--journal-height');
  document.documentElement.style.removeProperty('--journal-top');
}
