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
  }
}

export function getLocalPage(dateStr) {
  const all = readAllLocal();
  return all[dateStr] || null;
}

export function saveLocalPage(dateStr, pageEntry) {
  const all = readAllLocal();
  all[dateStr] = pageEntry;
  writeAllLocal(all);
}

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
    .order('created_at', { ascending: true });
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
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    sortOrder: row.sort_order || 0,
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
    sort_order: block.sortOrder || 0,
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
