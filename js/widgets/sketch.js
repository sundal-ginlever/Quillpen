// ══════════════════════════════════════════
// SKETCH WIDGET RENDERER
// ══════════════════════════════════════════
import { state, setSketchDrawing } from '../state.js';
import { resizeHandleHTML, attachResizeHandle } from '../utils.js';
import { updateWidget, deleteWidget } from './core.js';
import { events } from '../events.js';

// ── RDP Vector Optimization ──
function getSqSegDist(p, p1, p2) {
  let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;
  if (dx !== 0 || dy !== 0) {
    let t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = p2.x; y = p2.y; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p.x - x; dy = p.y - y;
  return dx * dx + dy * dy;
}

function simplifyStep(points, first, last, sqTolerance, simplified) {
  let maxSqDist = sqTolerance, index;
  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
  }
  if (maxSqDist > sqTolerance) {
    if (index - first > 1) simplifyStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyStep(points, index, last, sqTolerance, simplified);
  }
}

export function simplifyPoints(points, tolerance = 1) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

export function renderSketch(w) {
  const el = document.createElement('div');
  el.id = 'w-' + w.id; el.dataset.widgetId = w.id; el.className = 'widget';
  el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;background:white;border:1px solid var(--border-color);display:flex;flex-direction:column;overflow:hidden;touch-action:none`;

  const SCOLORS = ['#1e293b', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#ffffff'];
  const WIDTHS = [1, 2, 4, 8];
  let curColor = w.strokeColor || '#1e293b', curWidth = w.strokeWidth || 2, tool = 'pen';

  let localRedoStack = [];
  el._cleanupFn = () => { localRedoStack = []; };

  el.innerHTML = `
    <div class="drag-bar" style="height:40px;background:var(--header-bg);border-bottom:1px solid var(--border-dim);display:flex;align-items:center;padding:0 8px;gap:5px;flex-shrink:0;overflow:hidden">
      <span style="font-size:11px;color:var(--app-text-dim);font-family:monospace;flex-shrink:0">sketch</span>
      <div class="cs" style="display:flex;gap:4px"></div>
      <div style="width:1px;height:16px;background:var(--border-color)"></div>
      <div class="wb" style="display:flex;gap:3px"></div>
      <div style="display:flex;gap:2px;margin-left:auto">
        <button class="ub icon-btn" title="Undo (이 위젯만)">↩</button>
        <button class="rb icon-btn" title="Redo (이 위젯만)">↪</button>
        <button class="eb icon-btn" style="padding:2px 6px;font-size:10px">지우개</button>
        <button class="cb icon-btn" style="padding:2px 6px;font-size:10px">전체지우기</button>
      </div>
      <button class="del-btn" style="width:16px;height:16px;border-radius:50%;background:rgba(239,68,68,.25);border:none;font-size:10px;color:#dc2626;margin-left:4px">×</button>
    </div>
    <canvas style="flex:1;display:block;cursor:crosshair;touch-action:none;background:white"></canvas>
    ${resizeHandleHTML()}
  `;

  const cvs = el.querySelector('canvas'), ctx = cvs.getContext('2d');
  const sc = el.querySelector('.cs'), wb = el.querySelector('.wb');

  SCOLORS.forEach(c => {
    const b = document.createElement('button');
    b.dataset.color = c;
    b.style.cssText = `width:13px;height:13px;border-radius:50%;background:${c};border:${c === curColor ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.15)'};padding:0;flex-shrink:0;cursor:pointer`;
    b.onclick = ev => {
      ev.stopPropagation(); curColor = c; tool = 'pen';
      updateWidget(w.id, { strokeColor: c });
      sc.querySelectorAll('button').forEach(x => x.style.border = (x.dataset.color === curColor && tool === 'pen') ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.15)');
    };
    sc.appendChild(b);
  });

  WIDTHS.forEach(ww => {
    const b = document.createElement('button');
    b.dataset.w = ww;
    b.style.cssText = `width:20px;height:20px;border-radius:4px;border:${ww === curWidth ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.1)'};background:white;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer`;
    b.innerHTML = `<div style="width:${ww * 2}px;height:${ww * 2}px;border-radius:50%;background:#1e293b"></div>`;
    b.onclick = ev => {
      ev.stopPropagation(); curWidth = ww;
      wb.querySelectorAll('button').forEach(x => x.style.border = (x.dataset.w == ww ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.1)'));
    };
    wb.appendChild(b);
  });

  const eb = el.querySelector('.eb'), cb = el.querySelector('.cb'), ub = el.querySelector('.ub'), rb = el.querySelector('.rb');

  function redraw() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    (state.widgets[w.id]?.strokes || []).forEach(stroke => {
      if (stroke.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (stroke.points.length === 1) {
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill(); return;
      }
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1], p2 = stroke.points[i];
        ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      }
      ctx.stroke();
    });
  }

  function resizeCvs() {
    ctx.canvas.width = el.clientWidth;
    ctx.canvas.height = el.clientHeight - 40;
    redraw();
  }

  ub.onclick = e => { e.stopPropagation(); const wd = state.widgets[w.id]; if (wd?.strokes.length) { localRedoStack.push(wd.strokes.pop()); redraw(); events.emit('app:save'); } };
  rb.onclick = e => { e.stopPropagation(); const wd = state.widgets[w.id]; if (localRedoStack.length) { wd.strokes.push(localRedoStack.pop()); redraw(); events.emit('app:save'); } };
  eb.onclick = e => { e.stopPropagation(); tool = tool === 'eraser' ? 'pen' : 'eraser'; eb.style.border = tool === 'eraser' ? '2px solid #6366f1' : '1px solid rgba(0,0,0,.1)'; eb.style.background = tool === 'eraser' ? '#eef2ff' : 'white'; cvs.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair'; };
  cb.onclick = e => { e.stopPropagation(); if (confirm('전체 내용을 지우시겠습니까?')) { updateWidget(w.id, { strokes: [] }); redraw(); events.emit('app:save'); } };
  el.querySelector('.del-btn').onpointerdown = e => { e.stopPropagation(); deleteWidget(w.id); };

  let drawing = false, curPts = [], lastPt = null, lastTime = 0;

  cvs.addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: false });
  cvs.addEventListener('touchmove', e => { e.stopPropagation(); }, { passive: false });
  cvs.addEventListener('touchend', e => { e.stopPropagation(); }, { passive: false });

  cvs.onpointerdown = e => {
    e.stopPropagation(); e.preventDefault(); drawing = true; setSketchDrawing(true); curPts = [];
    const r = cvs.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    curPts.push(pt); lastPt = pt; lastTime = Date.now();
    cvs.setPointerCapture(e.pointerId);
    localRedoStack = [];
  };

  cvs.onpointermove = e => {
    if (!drawing) return;
    const r = cvs.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top }, now = Date.now();
    const dist = Math.sqrt(Math.pow(pt.x - lastPt.x, 2) + Math.pow(pt.y - lastPt.y, 2));
    const dt = now - lastTime;
    const speed = dist / (dt || 1);
    const targetWidth = tool === 'eraser' ? curWidth * 6 : Math.max(0.5, curWidth * (1.2 - Math.min(0.8, speed * 0.15)));

    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : curColor;
    ctx.lineWidth = targetWidth;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(lastPt.x, lastPt.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    curPts.push({ ...pt, w: targetWidth });
    lastPt = pt; lastTime = now;
  };

  cvs.onpointerup = () => {
    if (!drawing) return;
    drawing = false; setSketchDrawing(false);
    if (curPts.length > 0) {
      const wd = state.widgets[w.id];
      if (wd) {
        const simplified = simplifyPoints(curPts, 0.5);
        wd.strokes.push({ points: simplified, color: tool === 'eraser' ? 'transparent' : curColor, width: curWidth });
      }
      events.emit('app:save');
      redraw();
    }
  };

  setTimeout(resizeCvs, 0);
  new ResizeObserver(resizeCvs).observe(el);
  attachResizeHandle(el, w.id, 200, 120);
  return el;
}
