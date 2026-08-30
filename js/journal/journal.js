// ══════════════════════════════════════════
// JOURNAL — main orchestrator
// Wires DOM events to storage + render. Fully independent from the
// legacy canvas modules (js/canvas-manager.js, js/interaction.js, js/widgets/*):
// no shared mutable state, no window._appModules dependency.
// ══════════════════════════════════════════
import { isReadOnly, currentUser } from '../state.js';
import { sb } from '../supabase.js';
import { nanoid } from '../utils.js';
import { showUndoToast } from '../undo.js';
import {
  journalState, todayStr, shiftDateStr, getOrCreateLocalPageEntry,
} from './journal-state.js';
import { getLocalPage, saveLocalPage, fetchCloudPage, ensureCloudPage, updateCloudPageTitle, cloudRowToBlock, insertCloudBlock, updateCloudBlock, deleteCloudBlock, uploadJournalImage, migrateLocalJournalToUser } from './journal-storage.js';
import { updateHeader, renderTitle, renderBlocks, scrollBlocksToBottom, attachAutoGrow, resetQuickText, showJournalUndoToast } from './journal-render.js';
import { enableJournalViewportTracking, disableJournalViewportTracking } from './journal-viewport.js';

function isCloudAvailable() {
  return !!(sb && currentUser);
}

const blockHandlers = {
  onTextChange: handleTextChange,
  onDelete: handleDeleteBlock,
};

let titleSaveTimer = null;
let textSaveTimer = null;
let initialized = false;

export function initJournal() {
  if (initialized) return;
  initialized = true;

  document.getElementById('journal-prev-btn')?.addEventListener('click', () => loadDate(shiftDateStr(journalState.selectedDate, -1)));
  document.getElementById('journal-next-btn')?.addEventListener('click', () => loadDate(shiftDateStr(journalState.selectedDate, 1)));
  document.getElementById('journal-today-btn')?.addEventListener('click', () => loadDate(todayStr()));
  document.getElementById('journal-date-label')?.addEventListener('click', openDateModal);

  document.getElementById('journal-date-modal-close')?.addEventListener('click', closeDateModal);
  document.getElementById('journal-date-modal')?.addEventListener('click', e => { if (e.target.id === 'journal-date-modal') closeDateModal(); });
  document.getElementById('journal-date-picker-go')?.addEventListener('click', () => {
    const val = document.getElementById('journal-date-picker-input').value;
    if (val) loadDate(val);
    closeDateModal();
  });

  const titleInput = document.getElementById('journal-title-input');
  titleInput?.addEventListener('input', () => {
    const entry = getOrCreateLocalPageEntry(journalState.selectedDate);
    entry.title = titleInput.value;
    entry.titlePending = true;
    saveLocalPage(journalState.selectedDate, entry);
    clearTimeout(titleSaveTimer);
    titleSaveTimer = setTimeout(() => pushPending(journalState.selectedDate), 500);
  });

  const quickText = document.getElementById('journal-quick-text');
  attachAutoGrow(quickText);
  // Focus fires before the keyboard-open viewport resize lands, so the
  // latest block would otherwise sit under the keyboard for a moment.
  quickText?.addEventListener('focus', () => scrollBlocksToBottom());
  quickText?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuickText();
    }
  });
  document.getElementById('journal-add-text-btn')?.addEventListener('click', submitQuickText);

  const imageInput = document.getElementById('journal-image-input');
  document.getElementById('journal-add-image-btn')?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (file) addImageBlock(file);
    imageInput.value = '';
  });

  document.getElementById('journal-free-pages-btn')?.addEventListener('click', openFreePages);
  document.getElementById('back-to-journal-btn')?.addEventListener('click', showJournalScreen);
}

function submitQuickText() {
  const quickText = document.getElementById('journal-quick-text');
  const text = quickText?.value.trim();
  if (!text) return;
  addTextBlock(text);
  resetQuickText();
}

export function isJournalVisible() {
  return document.getElementById('journal-screen')?.hidden === false;
}

export function showJournalScreen() {
  const screen = document.getElementById('journal-screen');
  if (screen) screen.hidden = false;
  document.getElementById('back-to-journal-btn')?.classList.remove('visible');
  // Undo the free-pages reveal: with #root back at display:none, a canvas
  // widget's z-index (which can grow arbitrarily via bringToFront, and
  // isn't scoped into its own stacking context under #root) can never end
  // up rendering above the journal screen.
  const root = document.getElementById('root');
  if (root) root.style.display = 'none';
  enableJournalViewportTracking(scrollBlocksToBottom);
}

export function hideJournalScreenForFreePages() {
  const screen = document.getElementById('journal-screen');
  if (screen) screen.hidden = true;
  document.getElementById('back-to-journal-btn')?.classList.add('visible');
  disableJournalViewportTracking();
}

function openFreePages() {
  const root = document.getElementById('root');
  if (root) root.style.display = 'block';
  hideJournalScreenForFreePages();
}

function openDateModal() {
  const input = document.getElementById('journal-date-picker-input');
  if (input) input.value = journalState.selectedDate;
  const modal = document.getElementById('journal-date-modal');
  if (modal) modal.style.display = 'flex';
}
function closeDateModal() {
  const modal = document.getElementById('journal-date-modal');
  if (modal) modal.style.display = 'none';
}

export async function loadDate(dateStr) {
  migrateLocalJournalToUser();
  journalState.selectedDate = dateStr;
  const local = getLocalPage(dateStr) || { pageId: null, title: '', blocks: [] };
  journalState.pagesByDate[dateStr] = local;

  updateHeader(dateStr);
  renderTitle(local.title);
  renderBlocks(local.blocks, blockHandlers);
  scrollBlocksToBottom();

  if (!isCloudAvailable()) return;

  try {
    const result = await fetchCloudPage(dateStr);
    if (!result || journalState.selectedDate !== dateStr) return;
    const { page, blocks: cloudRows } = result;
    const cloudBlocks = cloudRows.map(row => { const b = cloudRowToBlock(row); b._cloudExists = true; return b; });

    const localById = new Map((local.blocks || []).map(b => [b.id, b]));
    const merged = [];
    const seen = new Set();
    cloudBlocks.forEach(cb => {
      const lb = localById.get(cb.id);
      // `pending` already means "the newest version of this block hasn't
      // reached the cloud yet" — comparing device-clock updatedAt against the
      // server's now() is comparing two different clocks and can pick the
      // stale cloud row when the device clock lags. Trust the flag instead.
      if (lb && lb.pending) {
        // This row unquestionably exists in the cloud already (we're
        // iterating cloudBlocks) — carry that fact onto the local copy we're
        // keeping, or the next push mistakes it for a fresh insert and hits
        // a duplicate-key error forever instead of updating it.
        lb._cloudExists = true;
        merged.push(lb);
      } else {
        merged.push(cb);
      }
      seen.add(cb.id);
    });
    (local.blocks || []).forEach(lb => { if (!seen.has(lb.id) && lb.pending) merged.push(lb); });
    merged.sort((a, b) => a.createdAt - b.createdAt);

    const entry = {
      pageId: page?.id || local.pageId || null,
      title: local.titlePending ? local.title : (page?.title ?? local.title ?? ''),
      titlePending: !!local.titlePending,
      blocks: merged,
    };
    journalState.pagesByDate[dateStr] = entry;
    saveLocalPage(dateStr, entry);

    if (journalState.selectedDate === dateStr) {
      renderTitle(entry.title);
      renderBlocks(entry.blocks, blockHandlers);
    }
    pushPending(dateStr);
  } catch (e) {
    console.error('journal loadDate cloud sync failed', e);
  }
}

async function pushPending(dateStr) {
  if (!isCloudAvailable()) return;
  const entry = journalState.pagesByDate[dateStr];
  if (!entry) return;
  const pendingBlocks = (entry.blocks || []).filter(b => b.pending);
  if (pendingBlocks.length === 0 && !entry.titlePending) return;

  let pageId = entry.pageId;
  if (!pageId) {
    const page = await ensureCloudPage(dateStr);
    if (!page) return;
    pageId = page.id;
    entry.pageId = pageId;
  }

  if (entry.titlePending) {
    const ok = await updateCloudPageTitle(pageId, entry.title);
    if (ok) entry.titlePending = false;
  }

  for (const b of pendingBlocks) {
    // Capture the version we're about to send: if the block gets edited again
    // while this await is in flight, updatedAt will have moved on by the time
    // we come back, and we must NOT clear pending — that edit still needs to
    // be pushed on the next call, or it's lost silently.
    const sentAt = b.updatedAt;
    const ok = b._cloudExists ? await updateCloudBlock(b.id, b) : await insertCloudBlock(pageId, b);
    if (ok) {
      b._cloudExists = true;
      if (b.updatedAt === sentAt) b.pending = false;
    }
  }
  saveLocalPage(dateStr, entry);
}

export function addTextBlock(text) {
  const dateStr = journalState.selectedDate;
  const entry = getOrCreateLocalPageEntry(dateStr);
  const block = { id: nanoid(), type: 'text', text, createdAt: Date.now(), updatedAt: Date.now(), pending: true, _cloudExists: false };
  entry.blocks.push(block);
  saveLocalPage(dateStr, entry);
  renderBlocks(entry.blocks, blockHandlers);
  scrollBlocksToBottom();
  pushPending(dateStr);
}

async function addImageBlock(file) {
  const dateStr = journalState.selectedDate;
  const entry = getOrCreateLocalPageEntry(dateStr);
  const block = { id: nanoid(), type: 'image', src: '', alt: file.name || '', createdAt: Date.now(), updatedAt: Date.now(), pending: true, _cloudExists: false, uploading: true };
  entry.blocks.push(block);
  saveLocalPage(dateStr, entry);
  renderBlocks(entry.blocks, blockHandlers);
  scrollBlocksToBottom();

  try {
    const url = await uploadJournalImage(file);
    block.src = url;
  } catch (e) {
    console.error('journal image upload failed', e);
    showUndoToast('이미지 업로드에 실패했습니다. 다시 시도해주세요.');
    const idx = entry.blocks.indexOf(block);
    if (idx !== -1) entry.blocks.splice(idx, 1);
    saveLocalPage(dateStr, entry);
    if (journalState.selectedDate === dateStr) renderBlocks(entry.blocks, blockHandlers);
    // A concurrent pushPending (e.g. from the title debounce) may have
    // already inserted this block's empty placeholder before the upload
    // failed — clean up that orphan row instead of leaving a dead image.
    if (isCloudAvailable() && block._cloudExists) {
      deleteCloudBlock(block.id).catch(err => console.error('journal orphan block cleanup failed', err));
    }
    return;
  }
  block.uploading = false;
  // Re-arm pending unconditionally: a concurrent push while the upload was
  // in flight could have already sent (and cleared pending on) the src:''
  // placeholder. Without this the real image src would never get pushed.
  block.pending = true;
  block.updatedAt = Date.now();
  saveLocalPage(dateStr, entry);
  if (journalState.selectedDate === dateStr) renderBlocks(entry.blocks, blockHandlers);
  pushPending(dateStr);
}

function handleTextChange(blockId, text) {
  const dateStr = journalState.selectedDate;
  const entry = journalState.pagesByDate[dateStr];
  if (!entry) return;
  const block = entry.blocks.find(b => b.id === blockId);
  if (!block) return;
  block.text = text;
  block.updatedAt = Date.now();
  block.pending = true;
  saveLocalPage(dateStr, entry);
  clearTimeout(textSaveTimer);
  textSaveTimer = setTimeout(() => pushPending(dateStr), 500);
}

// Delete is immediate and permanent (including the cloud row) — a merge that
// deferred the cloud delete to let undo cancel it would let the block come
// back from the cloud on the next loadDate (the merge has no tombstone
// concept). Undo instead re-creates the block locally as a fresh pending
// insert. Only the most recent delete is undoable; an older one that's
// still "in flight" when a new delete happens has already fully committed,
// so there's nothing left to do but drop its toast reference.
let pendingDeleteUndo = null; // { dateStr, block, index, deletePromise }

function handleDeleteBlock(blockId) {
  if (isReadOnly) return;
  const dateStr = journalState.selectedDate;
  const entry = journalState.pagesByDate[dateStr];
  if (!entry) return;
  const idx = entry.blocks.findIndex(b => b.id === blockId);
  if (idx === -1) return;
  const [removed] = entry.blocks.splice(idx, 1);
  saveLocalPage(dateStr, entry);
  renderBlocks(entry.blocks, blockHandlers);

  // Keep the DELETE's promise around: on a slow connection it can still be
  // in flight when undo fires, and undoDelete's re-insert must wait for it
  // to land first — otherwise a DELETE that resolves after the INSERT wipes
  // the just-restored row right back out, with nothing left locally to
  // notice (pending is already false by then).
  const deletePromise = (isCloudAvailable() && removed._cloudExists)
    ? deleteCloudBlock(blockId).catch(e => console.error('journal delete sync failed', e))
    : Promise.resolve();

  pendingDeleteUndo = { dateStr, block: removed, index: idx, deletePromise };
  showJournalUndoToast('삭제했습니다', undoDelete);
}

async function undoDelete() {
  if (!pendingDeleteUndo) return;
  const { dateStr, block, index, deletePromise } = pendingDeleteUndo;
  pendingDeleteUndo = null;

  await deletePromise;

  // Re-arm as a fresh, unsynced block. The id is safe to reuse — the row
  // was actually deleted, not just hidden, so there's no PK left to collide
  // with. createdAt is left untouched so P2-5's client-time ordering puts it
  // back where it was instead of at the end of the list.
  block.pending = true;
  block._cloudExists = false;
  block.updatedAt = Date.now();

  const entry = getOrCreateLocalPageEntry(dateStr);
  const insertAt = Math.min(index, entry.blocks.length);
  entry.blocks.splice(insertAt, 0, block);
  entry.blocks.sort((a, b) => a.createdAt - b.createdAt);
  saveLocalPage(dateStr, entry);

  if (journalState.selectedDate === dateStr) renderBlocks(entry.blocks, blockHandlers);
  pushPending(dateStr);
}
