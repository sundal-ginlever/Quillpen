// ══════════════════════════════════════════
// SEARCH (Ctrl+F)
// ══════════════════════════════════════════
import { state, camera } from './state.js';
import { applyCamera } from './camera.js';

let searchResults = [];
let searchIdx = -1;

export function openSearch() {
  const bar = document.getElementById('search-bar');
  if (!bar) return;
  bar.classList.add('open');
  const inp = document.getElementById('search-input');
  inp.focus(); inp.select();
}

export function closeSearch() {
  const bar = document.getElementById('search-bar');
  if (bar) bar.classList.remove('open');
  clearSearchHighlights();
  searchResults = []; searchIdx = -1;
  document.getElementById('search-count').textContent = '';
}

export function runSearch(q) {
  clearSearchHighlights();
  searchResults = []; searchIdx = -1;
  if (!q.trim()) { document.getElementById('search-count').textContent = ''; return; }
  const lower = q.toLowerCase();
  Object.values(state.widgets).forEach(w => {
    let hit = false;
    if (w.type === 'memo' && w.content?.toLowerCase().includes(lower)) hit = true;
    if (w.type === 'spreadsheet') { Object.values(w.cells || {}).forEach(v => { if (String(v).toLowerCase().includes(lower)) hit = true; }); }
    if (w.type === 'image' && w.alt?.toLowerCase().includes(lower)) hit = true;
    if (hit) searchResults.push(w.id);
  });
  document.getElementById('search-count').textContent = searchResults.length ? `${searchResults.length}개` : '없음';
  if (searchResults.length) { searchIdx = 0; jumpToSearch(0); }
}

export function searchNav(dir) {
  if (!searchResults.length) return;
  searchIdx = (searchIdx + dir + searchResults.length) % searchResults.length;
  jumpToSearch(searchIdx);
}

function jumpToSearch(idx) {
  clearSearchHighlights();
  const id = searchResults[idx];
  const w = state.widgets[id]; if (!w) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  camera.x = vw / 2 - (w.x + w.w / 2) * camera.zoom;
  camera.y = vh / 2 - (w.y + w.h / 2) * camera.zoom;
  applyCamera();
  const el = document.getElementById('w-' + id);
  if (el) el.classList.add('search-highlight');
  document.getElementById('search-count').textContent = `${idx + 1} / ${searchResults.length}`;
}

function clearSearchHighlights() {
  document.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
}

export function initSearchEvents() {
  const inp = document.getElementById('search-input');
  if (inp) {
    inp.addEventListener('input', e => runSearch(e.target.value));
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') searchNav(e.shiftKey ? -1 : 1);
      if (e.key === 'Escape') closeSearch();
    });
  }
}
