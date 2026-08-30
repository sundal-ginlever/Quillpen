// ══════════════════════════════════════════
// JOURNAL STORAGE — localStorage persistence + Supabase sync
// Namespaced entirely apart from canvas storage (js/sync.js) and
// canvas tables (q_canvases / q_widgets). Safe to run with no login
// (pure local mode) or with an authenticated Supabase session.
// ══════════════════════════════════════════
import { journalLocalKey, JOURNAL_BUCKET } from './journal-config.js';
import { currentUser } from '../state.js';
import { sb } from '../supabase.js';
import { nanoid, sanitizeSVG } from '../utils.js';
import { showUndoToast } from '../undo.js';

const localCache = { data: null, userId: undefined };

function readAllLocal() {
  const userId = currentUser?.id || null;
  if (localCache.data && localCache.userId === userId) return localCache.data;
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(journalLocalKey(userId)) || '{}') || {};
  } catch (e) {
    console.error('journal local read failed', e);
    data = {};
  }
  localCache.data = data;
  localCache.userId = userId;
  return data;
}

function writeAllLocal(data) {
  const userId = currentUser?.id || null;
  localCache.data = data;
  localCache.userId = userId;
  try {
    localStorage.setItem(journalLocalKey(userId), JSON.stringify(data));
  } catch (e) {
    console.error('journal local write failed', e);
    showUndoToast('로컬 저장 실패! 기기 저장 공간이 부족합니다.');
  }
}

const MIGRATION_FLAG_PREFIX = 'qp_journal_migrated_';

// One-time move of anonymous-session journal entries (qp_journal_v1_local)
// into the logged-in user's own key (qp_journal_v1_<uid>) the first time
// that user logs in on this browser — otherwise anything written before
// login (offline-first local mode) would be orphaned under the 'local' key
// forever. Only fills in dates the user's own key doesn't already have;
// a date present in both is left alone (the account's own cloud-backed
// data wins) rather than attempting a block-level merge, which is out of
// scope here.
export function migrateLocalJournalToUser() {
  if (!currentUser) return;
  const flagKey = MIGRATION_FLAG_PREFIX + currentUser.id;
  if (localStorage.getItem(flagKey)) return;
  try {
    const anonKey = journalLocalKey(null);
    const anonRaw = localStorage.getItem(anonKey);
    if (anonRaw) {
      const anonData = JSON.parse(anonRaw) || {};
      const userKey = journalLocalKey(currentUser.id);
      const userData = JSON.parse(localStorage.getItem(userKey) || '{}') || {};
      let changed = false;
      Object.keys(anonData).forEach(dateStr => {
        if (!userData[dateStr]) { userData[dateStr] = anonData[dateStr]; changed = true; }
      });
      if (changed) localStorage.setItem(userKey, JSON.stringify(userData));
      localStorage.removeItem(anonKey);
    }
  } catch (e) {
    console.error('journal local->user migration failed', e);
  }
  localStorage.setItem(flagKey, '1');
}

export function getLocalPage(dateStr) {
  const all = readAllLocal();
  return all[dateStr] || null;
}

// Typing into a block re-saves on every keystroke; debouncing the actual
// localStorage.setItem (which JSON.stringifies the whole date, base64
// images included) keeps that cheap the same way js/sync.js's save()
// debounces saveLocal(). The in-memory cache is updated immediately below
// (readAllLocal()'s object is mutated in place), so getLocalPage() always
// sees the latest data even before the debounced write actually lands.
const SAVE_DEBOUNCE_MS = 300;
let saveTimer = null;

export function saveLocalPage(dateStr, pageEntry) {
  const all = readAllLocal();
  all[dateStr] = pageEntry;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeAllLocal(all); }, SAVE_DEBOUNCE_MS);
}

// Bypasses the debounce to persist immediately — call before the page can
// disappear (tab hidden / navigated away) so a pending debounced write is
// never lost.
export function flushLocalPageNow() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  writeAllLocal(readAllLocal());
}

// Mobile Safari does not reliably fire `beforeunload`; `visibilitychange`
// and `pagehide` are the events that actually land there.
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushLocalPageNow();
});
window.addEventListener('pagehide', flushLocalPageNow);

function isCloudAvailable() {
  return !!(sb && currentUser);
}

// ── Cloud: page ──
export async function fetchCloudPage(dateStr) {
  if (!isCloudAvailable()) return null;
  const { data: page, error } = await sb
    .from('q_journal_pages')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('entry_date', dateStr)
    .maybeSingle();
  if (error) { console.error('fetchCloudPage error', error); return null; }
  if (!page) return { page: null, blocks: [] };
  const { data: blocks, error: bErr } = await sb
    .from('q_journal_blocks')
    .select('*')
    .eq('page_id', page.id)
    .order('sort_order', { ascending: true });
  // A failed block fetch must not be treated as "this page has no blocks" —
  // the caller (loadDate) needs to tell "empty" apart from "unknown" so it
  // doesn't merge a truncated cloud result over locally-synced blocks.
  if (bErr) { console.error('fetchCloudBlocks error', bErr); return null; }
  return { page, blocks: blocks || [] };
}

export async function ensureCloudPage(dateStr) {
  if (!isCloudAvailable()) return null;
  // Deliberately omit `title` from the upsert payload: on conflict this would
  // run as an UPDATE and blow away a title already saved from another device.
  // Title changes are only ever pushed through updateCloudPageTitle().
  const { data, error } = await sb
    .from('q_journal_pages')
    .upsert({ user_id: currentUser.id, entry_date: dateStr }, { onConflict: 'user_id,entry_date' })
    .select()
    .single();
  if (error) { console.error('ensureCloudPage error', error); return null; }
  return data;
}

export async function updateCloudPageTitle(pageId, title) {
  if (!isCloudAvailable() || !pageId) return false;
  const { error } = await sb.from('q_journal_pages').update({ title: title || '' }).eq('id', pageId);
  if (error) { console.error('updateCloudPageTitle error', error); return false; }
  return true;
}

// ── Cloud: blocks ──
export function cloudRowToBlock(row) {
  return {
    id: row.id,
    type: row.type,
    // sort_order stores the client-side creation timestamp (see
    // insertCloudBlock) — that's the authoritative ordering, since the
    // server's own created_at reflects when the INSERT reached the DB, which
    // can lag well behind creation time for a block that took a while to
    // upload (e.g. an image). Only legacy rows without it fall back.
    createdAt: row.sort_order || new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    ...row.data,
  };
}

function blockData(block) {
  if (block.type === 'text') return { text: block.text || '' };
  if (block.type === 'image') return { src: block.src || '', alt: block.alt || '' };
  return {};
}

export async function insertCloudBlock(pageId, block) {
  if (!isCloudAvailable() || !pageId) return false;
  const { error } = await sb.from('q_journal_blocks').insert({
    id: block.id,
    page_id: pageId,
    user_id: currentUser.id,
    type: block.type,
    data: blockData(block),
    // Client-side creation time, not insertion order — see cloudRowToBlock.
    sort_order: block.createdAt,
  });
  if (error) { console.error('insertCloudBlock error', error); return false; }
  return true;
}

export async function updateCloudBlock(blockId, block) {
  if (!isCloudAvailable() || !blockId) return false;
  const { error } = await sb.from('q_journal_blocks').update({ data: blockData(block) }).eq('id', blockId);
  if (error) { console.error('updateCloudBlock error', error); return false; }
  return true;
}

export async function deleteCloudBlock(blockId) {
  if (!isCloudAvailable() || !blockId) return false;
  const { error } = await sb.from('q_journal_blocks').delete().eq('id', blockId);
  if (error) { console.error('deleteCloudBlock error', error); return false; }
  return true;
}

// ── Image upload (reuses existing Supabase Storage bucket) ──
export async function uploadJournalImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('이미지 파일이 아닙니다.');

  const readAsBase64 = () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      let dataUrl = e.target.result;
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        dataUrl = sanitizeSVG(dataUrl);
      }
      resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });

  if (!sb || !currentUser) {
    return readAsBase64();
  }

  try {
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `journal-${Date.now()}-${nanoid()}.${ext}`;
    const { error } = await sb.storage.from(JOURNAL_BUCKET).upload(fileName, file);
    if (error) throw error;
    const { data: publicData } = sb.storage.from(JOURNAL_BUCKET).getPublicUrl(fileName);
    return publicData.publicUrl;
  } catch (e) {
    console.error('journal image upload failed, falling back to local', e);
    try {
      return await readAsBase64();
    } catch (e2) {
      throw new Error('이미지 업로드에 실패했습니다. 파일을 다시 확인해주세요.');
    }
  }
}
