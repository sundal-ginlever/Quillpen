// ══════════════════════════════════════════
// IMAGE WIDGET RENDERER
// ══════════════════════════════════════════
import { state, isReadOnly } from '../state.js';
import { resizeHandleHTML, attachResizeHandle, sanitizeSVG } from '../utils.js';
import { events } from '../events.js';
import { updateWidget, deleteWidget } from './core.js';

import { sb } from '../supabase.js';

export async function processImageFile(file, widgetId, onComplete) {
  if (!file.type.startsWith('image/')) return;

  // Function to save as base64 (fallback)
  const saveAsBase64 = () => {
    const reader = new FileReader();
    reader.onload = e => {
      let dataUrl = e.target.result;
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        dataUrl = sanitizeSVG(dataUrl);
      }
      finish(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const finish = (url) => {
    updateWidget(widgetId, { src: url, alt: file.name || 'pasted-image' });
    if (state.widgets[widgetId]) state.widgets[widgetId].src = url;
    if (onComplete) onComplete(url);
    events.emit('app:save');
  };

  // Try to upload to Supabase if available
  if (sb && state.currentCanvasId !== 'local') {
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const { data, error } = await sb.storage.from('quillpen-images').upload(fileName, file);
      if (error) {
        console.error('Image upload failed', error);
        saveAsBase64();
      } else {
        const { data: publicData } = sb.storage.from('quillpen-images').getPublicUrl(fileName);
        finish(publicData.publicUrl);
      }
    } catch (e) {
      console.error('Image upload exception', e);
      saveAsBase64();
    }
  } else {
    saveAsBase64();
  }
}

export function renderImage(w) {
  const el = document.createElement('div');
  el.id = 'w-' + w.id; el.dataset.widgetId = w.id; el.className = 'widget';
  el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;background:var(--surface);border:1px solid var(--border-color);display:flex;flex-direction:column;overflow:hidden`;
  el.tabIndex = 0; // Make focusable for paste events

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
      img.draggable = false;
      img.addEventListener('dragstart', e => e.preventDefault());
      content.appendChild(img);
    } else {
      const dz = document.createElement('div');
      dz.className = 'img-drop-zone';
      dz.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>클릭하거나 이미지를 드래그하세요</span><span style="font-size:10px;opacity:.6">PNG · JPG · GIF · WebP · SVG</span>`;
      dz.addEventListener('click', e => { e.stopPropagation(); if (w.locked || isReadOnly) return; fileInput.click(); });
      dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); if (w.locked || isReadOnly) return; dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', () => { if (w.locked || isReadOnly) return; dz.classList.remove('drag-over'); });
      dz.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over');
        if (w.locked || isReadOnly) return;
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
    if (w.locked || isReadOnly) {
      if (window._appModules?.showUndoToast) window._appModules.showUndoToast('잠긴 위젯은 수정할 수 없습니다 (Ctrl+L)');
      return;
    }
    processImageFile(file, w.id, (src) => renderSrc(src));
  }

  fitSel.addEventListener('change', e => {
    e.stopPropagation();
    if (w.locked || isReadOnly) {
      fitSel.value = w.objectFit || 'contain';
      if (window._appModules?.showUndoToast) window._appModules.showUndoToast('잠긴 위젯은 수정할 수 없습니다 (Ctrl+L)');
      return;
    }
    updateWidget(w.id, { objectFit: fitSel.value });
    const img = content.querySelector('img');
    if (img) img.style.objectFit = fitSel.value;
    events.emit('app:save');
  });

  // 선택박스 조작 시 위젯이 끌려다니는 것 차단
  fitSel.addEventListener('pointerdown', e => e.stopPropagation());

  el.querySelector('.del-btn').addEventListener('pointerdown', e => { e.stopPropagation(); if (isReadOnly) return; if (window._appModules?.snapshotForUndo) window._appModules.snapshotForUndo(); deleteWidget(w.id); });
  el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    if (w.locked || isReadOnly) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });

  // Paste handler
  el.addEventListener('paste', e => {
    if (w.locked || isReadOnly) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        e.stopPropagation();
        const file = item.getAsFile();
        loadFile(file);
      }
    }
  });

  renderSrc(w.src);
  attachResizeHandle(el, w.id, 120, 80);
  return el;
}
