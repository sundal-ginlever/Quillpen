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

// Header display drops the year when it's the current one — at 390px, with
// the free-pages/memo-board icon buttons on the left, the full label
// (formatDateLabel) truncates mid day-number and becomes ambiguous (e.g.
// "2026년 8월 3…"), and a `title` tooltip can't be reached on a touch
// screen, so the year can't just be hidden outright when browsing into a
// past year — that's exactly the case where knowing the year matters most.
// Falls back to a compact numeric year form (still narrower than the full
// Korean label) only when the date isn't in the current year.
export function formatDateLabelShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  if (y === new Date().getFullYear()) return `${m}월 ${d}일 (${weekday})`;
  return `${y}.${m}.${d} (${weekday})`;
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
