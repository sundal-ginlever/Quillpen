// ══════════════════════════════════════════
// JOURNAL STATE — in-memory, separate from canvas `state`
// ══════════════════════════════════════════
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

export const journalState = {
  selectedDate: todayStr(),
  // dateStr -> { pageId: string|null, title: string, blocks: [...] }
  pagesByDate: {},
};

export function getOrCreateLocalPageEntry(dateStr) {
  if (!journalState.pagesByDate[dateStr]) {
    journalState.pagesByDate[dateStr] = { pageId: null, title: '', blocks: [] };
  }
  return journalState.pagesByDate[dateStr];
}
