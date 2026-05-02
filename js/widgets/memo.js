// ══════════════════════════════════════════
// MEMO WIDGET RENDERER
// ══════════════════════════════════════════
import { state } from '../state.js';
import { resizeHandleHTML, attachResizeHandle } from '../utils.js';
import { events } from '../events.js';
import { updateWidget, deleteWidget } from './core.js';

export function renderMemo(w) {
  const el = document.createElement('div');
  el.id = 'w-' + w.id; el.dataset.widgetId = w.id; el.className = 'widget';
  el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;background:${w.color};border:1px solid var(--border-dim);display:flex;flex-direction:column;overflow:hidden`;
  const COLORS = ['#fefce8', '#f0fdf4', '#eff6ff', '#fdf4ff', '#fff1f2', '#f8fafc'];
  let colorOpen = false;
  el.innerHTML = `<div class="drag-bar" style="height:32px;background:var(--header-bg);display:flex;align-items:center;justify-content:space-between;padding:0 10px;border-bottom:1px solid var(--border-dim);flex-shrink:0"><span style="font-size:11px;color:var(--app-text-dim);font-family:monospace">memo</span><div style="display:flex;gap:4px;align-items:center"><button class="color-btn" style="width:14px;height:14px;border-radius:50%;background:var(--app-text-dim);border:none;padding:0"></button><button class="del-btn" style="width:16px;height:16px;border-radius:50%;background:rgba(239,68,68,.28);border:none;font-size:10px;color:#dc2626;line-height:16px;padding:0">×</button></div></div><div class="color-picker" style="display:none;position:absolute;top:34px;right:8px;background:var(--surface);border-radius:8px;padding:8px;box-shadow:var(--shadow-lg);gap:6px;z-index:999"></div><textarea placeholder="메모를 입력하세요..." style="flex:1;resize:none;border:none;outline:none;background:transparent;padding:10px 12px;font-size:14px;color:#1e293b;line-height:1.6"></textarea>${resizeHandleHTML()}`;
  const picker = el.querySelector('.color-picker');
  COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = `width:18px;height:18px;border-radius:50%;background:${c};border:1.5px solid rgba(0,0,0,.12);cursor:pointer;padding:0`;
    btn.addEventListener('click', ev => { ev.stopPropagation(); el.style.background = c; updateWidget(w.id, { color: c }); picker.style.display = 'none'; colorOpen = false; events.emit('app:save'); });
    picker.appendChild(btn);
  });
  el.querySelector('.color-btn').addEventListener('pointerdown', e => { e.stopPropagation(); colorOpen = !colorOpen; picker.style.display = colorOpen ? 'flex' : 'none'; });
  el.querySelector('.del-btn').addEventListener('pointerdown', e => { e.stopPropagation(); deleteWidget(w.id); });
  const ta = el.querySelector('textarea');
  ta.value = w.content || '';
  ta.addEventListener('input', () => { updateWidget(w.id, { content: ta.value }); events.emit('app:save'); });
  ta.addEventListener('pointerdown', e => e.stopPropagation());
  attachResizeHandle(el, w.id, 160, 80);
  return el;
}
