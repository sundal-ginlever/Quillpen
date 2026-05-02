import { state } from './state';
import { save, pendingChanges } from './sync';
import { snap } from './camera';
import { initSketch } from './sketch';
import { createSpreadsheet } from '../components/Spreadsheet';
import { renderConnections } from './connections';

/**
 * Renders a widget into the world
 */
export function renderWidget(w) {
  const world = document.getElementById('world');
  if (!world) return;
  
  // Prevent duplicate rendering
  const existing = document.getElementById('w-' + w.id);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'w-' + w.id;
  el.dataset.widgetId = w.id;
  el.className = 'widget';
  el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;z-index:${w.zIndex};`;
  
  if (w.locked) el.classList.add('locked');

  // 1. Drag Bar
  const dragBar = document.createElement('div');
  dragBar.className = 'drag-bar';
  const typeLabel = w.type === 'spreadsheet' ? 'table' : w.type;
  dragBar.innerHTML = `<span style="font-size:10px;font-family:Outfit;font-weight:700;color:var(--app-text-dim);padding-left:12px;line-height:32px;text-transform:uppercase;letter-spacing:0.05em">${typeLabel}</span>`;
  el.appendChild(dragBar);

  // 2. Delete Button
  const delBtn = document.createElement('button');
  delBtn.innerHTML = '×';
  delBtn.className = 'del-btn';
  delBtn.onclick = (e) => { e.stopPropagation(); deleteWidget(w.id); };
  el.appendChild(delBtn);

  // 3. Content Area
  const content = document.createElement('div');
  content.className = 'widget-content';
  content.style.cssText = 'width:100%;height:calc(100% - 32px);overflow:hidden;border-radius:0 0 16px 16px';
  el.appendChild(content);

  if (w.type === 'memo') {
    el.style.background = w.color || '#fefce8';
    const ta = document.createElement('textarea');
    ta.style.cssText = 'width:100%;height:100%;background:transparent;border:none;resize:none;padding:8px 16px;font-size:14px;outline:none;line-height:1.6;color:#1e293b';
    ta.value = w.content || '';
    ta.oninput = () => { w.content = ta.value; pendingChanges.add(w.id); save(); };
    ta.onpointerdown = (e) => e.stopPropagation();
    content.appendChild(ta);
  } else if (w.type === 'image') {
    const img = document.createElement('img');
    img.src = w.src || 'https://via.placeholder.com/300?text=Image+Missing';
    img.style.cssText = `width:100%;height:100%;object-fit:${w.objectFit || 'contain'};pointer-events:none`;
    content.appendChild(img);
  } else if (w.type === 'sketch') {
    initSketch(el, w);
  } else if (w.type === 'spreadsheet') {
    createSpreadsheet(el, w);
  }

  // 4. Resize Handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  el.appendChild(resizeHandle);

  // 5. Anchor Points
  ['n', 's', 'e', 'w'].forEach(side => {
    const a = document.createElement('div');
    a.className = `anchor-point anchor-${side}`;
    a.dataset.side = side;
    a.dataset.wid = w.id;
    el.appendChild(a);
  });

  world.appendChild(el);
  bindWidgetEvents(el, w);
}

function bindWidgetEvents(el, w) {
  let isDragging = false;
  let isResizing = false;
  let startX, startY, startW, startH, startLeft, startTop;

  const dragBar = el.querySelector('.drag-bar');
  const resizeHandle = el.querySelector('.resize-handle');

  dragBar.onpointerdown = (e) => {
    if (w.locked || state.activeTool !== 'select') return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    startLeft = w.x; startTop = w.y;
    el.setPointerCapture(e.pointerId);
    el.classList.add('selected');
    e.stopPropagation();
  };

  resizeHandle.onpointerdown = (e) => {
    if (w.locked) return;
    isResizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = w.w; startH = w.h;
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  el.onpointermove = (e) => {
    if (!isDragging && !isResizing) return;
    e.stopPropagation();
    
    const zoom = state.cameraZoom || 1;
    if (isDragging) {
      w.x = snap(startLeft + (e.clientX - startX) / zoom);
      w.y = snap(startTop + (e.clientY - startY) / zoom);
      el.style.left = w.x + 'px';
      el.style.top = w.y + 'px';
      renderConnections(); // Update lines while dragging
    } else if (isResizing) {
      w.w = Math.max(120, snap(startW + (e.clientX - startX) / zoom));
      w.h = Math.max(80, snap(startH + (e.clientY - startY) / zoom));
      el.style.width = w.w + 'px';
      el.style.height = w.h + 'px';
      renderConnections();
    }
  };

  el.onpointerup = (e) => {
    if (isDragging || isResizing) {
      isDragging = false; isResizing = false;
      el.releasePointerCapture(e.pointerId);
      el.classList.remove('selected');
      pendingChanges.add(w.id);
      save();
    }
  };
}

export function deleteWidget(id) {
  const el = document.getElementById('w-' + id);
  if (el) el.remove();
  delete state.widgets[id];
  renderConnections();
  save();
}
