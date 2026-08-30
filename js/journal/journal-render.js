// ══════════════════════════════════════════
// JOURNAL RENDER — DOM building for the today screen
// No innerHTML is ever used with user-authored text; all user text
// goes through textContent / .value so it can never be interpreted as HTML.
// ══════════════════════════════════════════
import { formatDateLabel, todayStr } from './journal-state.js';
import { DELETE_UNDO_MS } from './journal-config.js';

function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 400) + 'px';
}

export function updateHeader(dateStr) {
  const label = document.getElementById('journal-date-label');
  if (label) label.textContent = formatDateLabel(dateStr);
  const todayBtn = document.getElementById('journal-today-btn');
  if (todayBtn) todayBtn.hidden = dateStr === todayStr();
}

export function renderTitle(title) {
  const input = document.getElementById('journal-title-input');
  if (input && document.activeElement !== input) input.value = title || '';
}

function timeLabel(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function buildTextBlockEl(block, handlers) {
  const el = document.createElement('div');
  el.className = 'journal-block journal-block-text';
  el.dataset.blockId = block.id;

  const meta = document.createElement('div');
  meta.className = 'journal-block-meta';
  meta.textContent = timeLabel(block.createdAt);
  el.appendChild(meta);

  const delBtn = document.createElement('button');
  delBtn.className = 'journal-block-delete';
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', '삭제');
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => handlers.onDelete(block.id));
  el.appendChild(delBtn);

  const textarea = document.createElement('textarea');
  textarea.className = 'journal-block-text-area';
  textarea.value = block.text || '';
  textarea.rows = 1;
  textarea.addEventListener('input', () => {
    autoGrow(textarea);
    handlers.onTextChange(block.id, textarea.value);
  });
  // Card is not draggable at all (plain flow item), so touch/scroll/typing
  // never has to compete with a move gesture here.
  el.appendChild(textarea);
  requestAnimationFrame(() => autoGrow(textarea));

  return el;
}

function buildImageBlockEl(block, handlers) {
  const el = document.createElement('div');
  el.className = 'journal-block journal-block-image';
  el.dataset.blockId = block.id;
  if (block.uploading) el.classList.add('uploading');

  const meta = document.createElement('div');
  meta.className = 'journal-block-meta';
  meta.textContent = timeLabel(block.createdAt);
  el.appendChild(meta);

  const delBtn = document.createElement('button');
  delBtn.className = 'journal-block-delete';
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', '삭제');
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => handlers.onDelete(block.id));
  el.appendChild(delBtn);

  if (block.src) {
    const img = document.createElement('img');
    img.src = block.src;
    img.alt = block.alt || '';
    img.draggable = false;
    el.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.textContent = '이미지 업로드 중...';
    placeholder.style.cssText = 'padding:24px;text-align:center;color:var(--app-text-dim);font-size:12px';
    el.appendChild(placeholder);
  }

  return el;
}

// Reserved for future block types — not wired to any UI yet.
function buildAudioBlockEl(block) {
  const el = document.createElement('div');
  el.className = 'journal-block journal-block-audio';
  el.dataset.blockId = block.id;
  el.textContent = '(오디오 블록은 아직 지원되지 않습니다)';
  return el;
}

const RENDERERS = {
  text: buildTextBlockEl,
  image: buildImageBlockEl,
  audio: buildAudioBlockEl,
};

export function renderBlocks(blocks, handlers) {
  const container = document.getElementById('journal-blocks');
  const emptyEl = document.getElementById('journal-empty');
  if (!container) return;

  const activeId = document.activeElement?.closest?.('.journal-block')?.dataset.blockId;
  container.textContent = '';

  if (!blocks || blocks.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  blocks.forEach(block => {
    const build = RENDERERS[block.type];
    if (!build) return;
    const el = build(block, handlers);
    container.appendChild(el);
    if (block.id === activeId) {
      const ta = el.querySelector('textarea');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  });
}

export function scrollBlocksToBottom() {
  const container = document.getElementById('journal-blocks');
  if (container) container.scrollTop = container.scrollHeight;
}

export function attachAutoGrow(textarea) {
  if (!textarea) return;
  autoGrow(textarea);
  textarea.addEventListener('input', () => autoGrow(textarea));
}

let undoToastHideTimer = null;

// A journal-only toast with an actionable button — deliberately not the
// shared #undo-toast (js/undo.js): that one is `pointer-events:none` and
// used by ~17 canvas call sites, so bolting a button onto it would change
// shared behavior. This is a plain flex item in the journal layout (sits
// above the composer in normal document flow), not a floating overlay, so
// it can never cover the composer or get hidden behind the keyboard.
export function showJournalUndoToast(msg, onUndo) {
  const toast = document.getElementById('journal-undo-toast');
  const msgEl = document.getElementById('journal-undo-toast-msg');
  const btn = document.getElementById('journal-undo-toast-btn');
  if (!toast || !msgEl || !btn) return;

  msgEl.textContent = msg;
  toast.hidden = false;

  const cleanup = () => { toast.hidden = true; btn.onclick = null; };
  btn.onclick = () => { clearTimeout(undoToastHideTimer); cleanup(); onUndo(); };

  clearTimeout(undoToastHideTimer);
  undoToastHideTimer = setTimeout(cleanup, DELETE_UNDO_MS);
}

export function hideJournalUndoToast() {
  clearTimeout(undoToastHideTimer);
  const toast = document.getElementById('journal-undo-toast');
  const btn = document.getElementById('journal-undo-toast-btn');
  if (toast) toast.hidden = true;
  if (btn) btn.onclick = null;
}

export function resetQuickText() {
  const ta = document.getElementById('journal-quick-text');
  if (ta) { ta.value = ''; autoGrow(ta); }
}
