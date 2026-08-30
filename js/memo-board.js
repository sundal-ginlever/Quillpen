// ══════════════════════════════════════════
// MEMO BOARD — read-only index over existing Memo widgets
//
// This is NOT a new memo store. It queries the existing q_widgets
// (type='memo') / q_canvases tables read-only and renders cards. Editing,
// deleting, or moving memos here is explicitly out of scope — the local
// save/undo/sync queues in js/sync.js and js/canvas-manager.js own that,
// and mutating a memo through a second code path here would race them and
// risk overwriting a newer edit. That includes bringToFront(): it looks
// read-only but it bumps zIndex, queues a pending change, and (via the
// updated_at trigger) would silently turn this board's "most recently
// modified" sort into "most recently opened" — so it's deliberately not
// used, see focusMemoWidget(). This module only ever reads state.widgets
// and the DB, plus calls the existing switchCanvas()/setSelected()/
// zoomToRect() to jump to the real widget for editing.
// ══════════════════════════════════════════
import { state, currentUser, currentCanvasId, currentCanvasName, isReadOnly } from './state.js';
import { sb } from './supabase.js';
import { switchCanvas } from './canvas-manager.js';
import { setSelected } from './widgets/core.js';
import { zoomToRect } from './camera.js';
import { showUndoToast } from './undo.js';
import { hideJournalScreenForFreePages } from './journal/journal.js';

function isCloudAvailable() {
  return !!(sb && currentUser);
}

let cachedMemos = [];
let searchQuery = '';
let initialized = false;
let detailMemo = null;
let detailReturnFocusEl = null;

export function initMemoBoard() {
  if (initialized) return;
  initialized = true;

  document.getElementById('journal-memo-board-btn')?.addEventListener('click', openMemoBoard);
  document.getElementById('mb-back-btn')?.addEventListener('click', closeMemoBoard);
  document.getElementById('mb-refresh-btn')?.addEventListener('click', () => loadMemos());
  document.getElementById('mb-retry-btn')?.addEventListener('click', () => loadMemos());
  // Search text and #mb-list's scroll position live only in the DOM (the
  // input's value, the list container's scrollTop) — the detail screen
  // never touches either, so re-showing the board after closing detail
  // restores both for free.
  document.getElementById('mb-search-input')?.addEventListener('input', e => {
    searchQuery = e.target.value;
    renderList();
  });

  document.getElementById('mb-detail-close-btn')?.addEventListener('click', closeMemoDetail);
  document.getElementById('mb-detail-copy-btn')?.addEventListener('click', copyMemoDetail);
  document.getElementById('mb-detail-open-btn')?.addEventListener('click', () => {
    const memo = detailMemo;
    closeMemoDetail();
    if (memo) openMemoInCanvas(memo);
  });
  document.addEventListener('keydown', e => {
    if (!isMemoDetailVisible()) return;
    if (e.key === 'Escape') { closeMemoDetail(); return; }
    // aria-modal="true" implies focus stays inside — otherwise Tab leaks
    // out to the board's search input/cards sitting underneath. Only 3
    // focusable elements ever exist in this screen, so a plain wrap is enough.
    if (e.key === 'Tab') {
      const focusables = [
        document.getElementById('mb-detail-close-btn'),
        document.getElementById('mb-detail-copy-btn'),
        document.getElementById('mb-detail-open-btn'),
      ].filter(Boolean);
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      const atEdge = e.shiftKey
        ? (document.activeElement === first || !focusables.includes(document.activeElement))
        : (document.activeElement === last || !focusables.includes(document.activeElement));
      if (atEdge) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    }
  });
}

export function openMemoBoard() {
  if (isReadOnly) return; // never reachable in shared read-only mode anyway
  const screen = document.getElementById('memo-board-screen');
  if (screen) screen.hidden = false;
  loadMemos();
}

export function closeMemoBoard() {
  closeMemoDetail(); // defensive: nothing currently reaches this with detail open, but never leave it dangling
  const screen = document.getElementById('memo-board-screen');
  if (screen) screen.hidden = true;
}

export function isMemoBoardVisible() {
  return document.getElementById('memo-board-screen')?.hidden === false;
}

async function loadMemos() {
  renderState('loading');
  try {
    cachedMemos = isCloudAvailable() ? await fetchCloudMemos() : fetchLocalMemos();
    renderList();
  } catch (e) {
    console.error('memo board load failed', e);
    renderState('error');
  }
}

async function fetchCloudMemos() {
  // Embedding q_canvases via the canvas_id FK gets the page name in one
  // round trip; RLS on q_canvases still applies to the embedded rows, so
  // this can never leak another user's canvas name.
  const { data, error } = await sb
    .from('q_widgets')
    .select('id, canvas_id, data, updated_at, canvas:q_canvases(name)')
    .eq('user_id', currentUser.id)
    .eq('type', 'memo')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    canvasId: row.canvas_id,
    canvasName: row.canvas?.name || '이름 없는 페이지',
    title: row.data?.title || '',
    content: row.data?.content || '',
    color: row.data?.color || '#fefce8',
    updatedAt: row.updated_at,
  }));
}

// Local/demo mode has no cross-canvas index to query — only the currently
// loaded free page's widgets are in memory. Deliberately not attempting to
// enumerate other local canvases here (out of scope; see spec).
function fetchLocalMemos() {
  return Object.values(state.widgets)
    .filter(w => w.type === 'memo')
    .map(w => ({
      id: w.id,
      canvasId: currentCanvasId,
      canvasName: currentCanvasName,
      title: w.title || '',
      content: w.content || '',
      color: w.color || '#fefce8',
      updatedAt: new Date(w.updatedAt || w.createdAt || Date.now()).toISOString(),
    }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function formatUpdatedAt(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0'), min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function matchesSearch(memo, q) {
  return memo.title.toLowerCase().includes(q)
    || memo.content.toLowerCase().includes(q)
    || memo.canvasName.toLowerCase().includes(q);
}

function renderState(mode) {
  const listEl = document.getElementById('mb-list');
  const emptyEl = document.getElementById('mb-empty');
  const emptyText = document.getElementById('mb-empty-text');
  const retryBtn = document.getElementById('mb-retry-btn');
  if (!listEl || !emptyEl || !emptyText || !retryBtn) return;

  listEl.textContent = '';
  emptyEl.hidden = false;
  retryBtn.hidden = mode !== 'error';
  emptyText.textContent = mode === 'loading' ? '불러오는 중...' : '메모를 불러오지 못했습니다. 네트워크를 확인해주세요.';
}

function renderList() {
  const listEl = document.getElementById('mb-list');
  const emptyEl = document.getElementById('mb-empty');
  const emptyText = document.getElementById('mb-empty-text');
  const retryBtn = document.getElementById('mb-retry-btn');
  const banner = document.getElementById('mb-local-banner');
  if (!listEl || !emptyEl || !emptyText || !retryBtn || !banner) return;

  banner.hidden = isCloudAvailable();
  retryBtn.hidden = true;

  const q = searchQuery.trim().toLowerCase();
  const filtered = q ? cachedMemos.filter(m => matchesSearch(m, q)) : cachedMemos;

  listEl.textContent = '';

  if (filtered.length === 0) {
    emptyEl.hidden = false;
    emptyText.textContent = cachedMemos.length === 0 ? '표시할 메모가 없습니다.' : '검색 결과가 없습니다.';
    return;
  }
  emptyEl.hidden = true;
  filtered.forEach(m => listEl.appendChild(buildCard(m)));
}

function buildCard(memo) {
  const card = document.createElement('div');
  card.className = 'mb-card';
  card.style.setProperty('--mb-card-color', memo.color);

  // Meta/title/preview live inside their own <button>, separate from the
  // "원본에서 열기" button below — a real button gets Enter/Space handling
  // and focus styling for free, and being a sibling (not a wrapper) means
  // the two tap targets can never overlap.
  const touchArea = document.createElement('button');
  touchArea.type = 'button';
  touchArea.className = 'mb-card-touch';
  touchArea.setAttribute('aria-label', '메모 전체 보기: ' + (memo.title || '제목 없는 메모'));
  touchArea.addEventListener('click', () => openMemoDetail(memo));

  const meta = document.createElement('div');
  meta.className = 'mb-card-meta';
  const pageName = document.createElement('span');
  pageName.className = 'mb-card-page';
  pageName.textContent = memo.canvasName; // textContent only — never innerHTML with user data
  const time = document.createElement('span');
  time.className = 'mb-card-time';
  time.textContent = formatUpdatedAt(memo.updatedAt);
  meta.appendChild(pageName);
  meta.appendChild(time);
  touchArea.appendChild(meta);

  if (memo.title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'mb-card-title';
    titleEl.textContent = memo.title;
    touchArea.appendChild(titleEl);
  }

  const preview = document.createElement('div');
  preview.className = 'mb-card-preview';
  preview.textContent = memo.content || '(내용 없음)';
  touchArea.appendChild(preview);

  card.appendChild(touchArea);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'mb-card-open-btn';
  openBtn.textContent = '원본에서 열기';
  openBtn.addEventListener('click', () => openMemoInCanvas(memo));
  card.appendChild(openBtn);

  return card;
}

function openMemoDetail(memo) {
  const screen = document.getElementById('mb-detail-screen');
  const pageEl = document.getElementById('mb-detail-page');
  const timeEl = document.getElementById('mb-detail-time');
  const titleEl = document.getElementById('mb-detail-title');
  const contentEl = document.getElementById('mb-detail-content');
  if (!screen || !pageEl || !timeEl || !titleEl || !contentEl) return;

  detailMemo = memo;
  // All user-authored fields go through textContent — same rule as the
  // card. No length/line clamp here: this screen exists specifically to
  // show the full body the card's 4-line preview cuts off.
  pageEl.textContent = memo.canvasName;
  timeEl.textContent = formatUpdatedAt(memo.updatedAt);
  titleEl.textContent = memo.title || '제목 없는 메모';
  contentEl.textContent = memo.content || '(내용 없음)';
  screen.style.setProperty('--mb-card-color', memo.color);

  detailReturnFocusEl = document.activeElement;
  screen.hidden = false;
  const bodyEl = document.getElementById('mb-detail-body');
  if (bodyEl) bodyEl.scrollTop = 0;
  document.getElementById('mb-detail-close-btn')?.focus();
}

function closeMemoDetail() {
  const screen = document.getElementById('mb-detail-screen');
  if (screen) screen.hidden = true;
  detailMemo = null;
  if (detailReturnFocusEl && document.contains(detailReturnFocusEl)) {
    detailReturnFocusEl.focus();
  }
  detailReturnFocusEl = null;
}

export function isMemoDetailVisible() {
  return document.getElementById('mb-detail-screen')?.hidden === false;
}

// Copy is read-only: it only ever reads detailMemo's own title/content
// (the original strings held in cachedMemos, not anything re-derived from
// the DOM — the card/detail rendering clamps and reflows text, so reading
// back from an element could hand back something subtly different from
// what's actually stored) and calls the Clipboard API. No DB call, no
// state.widgets write, nothing that could affect updated_at or sort order.
function copyMemoDetail() {
  if (!detailMemo) return;
  const text = detailMemo.title ? `${detailMemo.title}\n\n${detailMemo.content}` : detailMemo.content;

  // An empty memo would otherwise call writeText('') — that "succeeds",
  // showing "복사했습니다" while actually wiping out whatever the user
  // already had on their clipboard, with no way to undo it.
  if (!text) {
    showUndoToast('복사할 내용이 없습니다.');
    return;
  }

  // navigator.clipboard only exists in a secure context (https/localhost).
  // No execCommand('copy') fallback: it needs a live off-screen textarea
  // with select()/setSelectionRange() and behaves inconsistently on iOS,
  // and this app is served over https in production — not worth the
  // complexity for the one non-secure-context edge case.
  if (!navigator.clipboard?.writeText) {
    showUndoToast('이 브라우저에서는 복사를 지원하지 않습니다.');
    return;
  }
  // Called synchronously inside the click handler, with nothing awaited
  // first — iOS Safari only allows writeText() within the user-gesture
  // call stack itself; an earlier await breaks that and it fails silently.
  navigator.clipboard.writeText(text)
    .then(() => showUndoToast('메모를 복사했습니다.'))
    .catch(() => showUndoToast('복사에 실패했습니다.'));
}

async function openMemoInCanvas(memo) {
  closeMemoBoard();
  try {
    if (currentCanvasId !== memo.canvasId) {
      // switchCanvas already saves/flushes the current page and confirms
      // with the user if anything is still unsynced — unchanged safety net.
      // It resolves normally (not a throw) if the user cancels that confirm,
      // so we have to check whether the switch actually happened.
      await switchCanvas(memo.canvasId, memo.canvasName);
      if (currentCanvasId !== memo.canvasId) {
        openMemoBoard();
        showUndoToast('페이지 전환이 취소되었습니다.');
        return;
      }
    }
    const root = document.getElementById('root');
    if (root) root.style.display = 'block';
    hideJournalScreenForFreePages();
    focusMemoWidget(memo.id);
  } catch (e) {
    console.error('open memo in canvas failed', e);
    showUndoToast('원본 페이지를 여는 데 실패했습니다.');
  }
}

function focusMemoWidget(widgetId) {
  const w = state.widgets[widgetId];
  if (!w) {
    showUndoToast('메모를 찾을 수 없습니다. 삭제되었을 수 있습니다.');
    return;
  }
  // Deliberately not calling bringToFront() here: opening a memo to look at
  // it is a read, not an edit, but bringToFront bumps zIndex, marks the
  // widget pending, and touches its updated_at via the DB trigger. That
  // would make the board's "most recently modified" sort silently drift
  // into "most recently opened", and could trip canvas-manager.js's
  // unsynced-changes confirm on the next switch for a memo nobody actually
  // edited. setSelected + zoomToRect already bring it to the center of the
  // screen with a selection outline, which is all this needs to do.
  setSelected([widgetId]);
  zoomToRect({ x: w.x, y: w.y, w: w.w, h: w.h });
  // Give the DOM element (and the camera pan) a beat to settle before
  // stealing focus into its textarea.
  setTimeout(() => {
    document.getElementById('w-' + widgetId)?.querySelector('textarea')?.focus();
  }, 120);
}
