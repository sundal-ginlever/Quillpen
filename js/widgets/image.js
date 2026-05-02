// ══════════════════════════════════════════
// IMAGE WIDGET RENDERER
// ══════════════════════════════════════════
import { state } from '../state.js';
import { resizeHandleHTML, attachResizeHandle } from '../utils.js';
import { events } from '../events.js';
import { updateWidget, deleteWidget } from './core.js';

export function renderImage(w) {
  const el = document.createElement('div');
  el.id = 'w-' + w.id; el.dataset.widgetId = w.id; el.className = 'widget';
  el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;background:var(--surface);border:1px solid var(--border-color);display:flex;flex-direction:column;overflow:hidden`;

  el.innerHTML = `
    <div class="drag-bar" style="height:32px;background:var(--header-bg);display:flex;align-items:center;justify-content:space-between;padding:0 10px;border-bottom:1px solid var(--border-dim);flex-shrink:0">
      <span style="font-size:11px;color:var(--app-text-dim);font-family:monospace">image</span>
      <div style="display:flex;gap:4px;align-items:center">
        <select class="fit-select" style="font-size:10px;border:1px solid var(--border-color);border-radius:4px;padding:1px 4px;background:var(--surface);color:var(--app-text-muted)">
          <option value="contain">contain</option>
          <option value="cover">cover</option>
          <option value="fill">fill</option>
        </select>
        <button class="del-btn" style="width:16px;height:16px;border-radius:50%;background:rgba(239,68,68,.28);border:none;font-size:10px;color:#dc2626;line-height:16px;padding:0">×</button>
      </div>
    </div>
    <div class="img-content" style="flex:1;position:relative;overflow:hidden"></div>
    ${resizeHandleHTML()}`;

  const content = el.querySelector('.img-content');
  const fitSel = el.querySelector('.fit-select');
  fitSel.value = w.objectFit || 'contain';

  function renderSrc(src) {
    content.innerHTML = '';
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.style.cssText = `width:100%;height:100%;object-fit:${fitSel.value}`;
      content.appendChild(img);
    } else {
      const dz = document.createElement('div');
      dz.className = 'img-drop-zone';
      dz.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>클릭하거나 이미지를 드래그하세요</span><span style="font-size:10px;opacity:.6">PNG · JPG · GIF · WebP · SVG</span>`;
      dz.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
      dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
      dz.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadFile(file);
      });
      content.appendChild(dz);
    }
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
  el.appendChild(fileInput);

  function loadFile(file) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      let dataUrl = e.target.result;
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        try {
          const raw = atob(dataUrl.split(',')[1] || '');
          const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
          doc.querySelectorAll('script, foreignObject, iframe, embed, object, link, style').forEach(el => el.remove());
          doc.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
              if (attr.name.toLowerCase().startsWith('on') || attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))
                el.removeAttribute(attr.name);
            });
          });
          const clean = new XMLSerializer().serializeToString(doc.documentElement);
          dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clean)));
        } catch { /* safe via <img> sandbox */ }
      }
      updateWidget(w.id, { src: dataUrl, alt: file.name });
      state.widgets[w.id].src = dataUrl;
      renderSrc(dataUrl);
      events.emit('app:save');
    };
    reader.readAsDataURL(file);
  }

  fitSel.addEventListener('change', e => {
    e.stopPropagation();
    updateWidget(w.id, { objectFit: fitSel.value });
    const img = content.querySelector('img');
    if (img) img.style.objectFit = fitSel.value;
    events.emit('app:save');
  });

  el.querySelector('.del-btn').addEventListener('pointerdown', e => { e.stopPropagation(); deleteWidget(w.id); });
  el.querySelector('.drag-bar').addEventListener('pointerdown', e => e.stopPropagation());
  content.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });

  renderSrc(w.src);
  attachResizeHandle(el, w.id, 120, 80);
  return el;
}
