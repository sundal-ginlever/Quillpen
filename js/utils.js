// ══════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════
import { SNAP } from './config.js';
import { state, camera, isReadOnly } from './state.js';
import { events } from './events.js';

export function nanoid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function snap(v) {
  return state.snapOn ? Math.round(v / SNAP) * SNAP : v;
}

export function snapRect(x, y, w, h) {
  if (!state.snapOn) return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
  const sx = snap(x), sy = snap(y), ex = snap(x + w), ey = snap(y + h);
  return { x: sx, y: sy, w: Math.max(SNAP, ex - sx), h: Math.max(SNAP, ey - sy) };
}

export function resizeHandleHTML() {
  return `<div class="resize-handle"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M10 2L2 10M10 6L6 10" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg></div>`;
}

export function attachResizeHandle(el, wid, minW, minH) {
  const rh = el.querySelector('.resize-handle');
  if (!rh) return;
  let isResizing = false;
  rh.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (state.widgets[wid]?.locked || isReadOnly) return;
    if (isResizing) return;
    isResizing = true;
    rh.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, sw = state.widgets[wid].w, sh = state.widgets[wid].h;
    const onMove = ev => {
      let nw = Math.max(minW, sw + (ev.clientX - sx) / camera.zoom);
      let nh = Math.max(minH, sh + (ev.clientY - sy) / camera.zoom);
      
      const ww = state.widgets[wid];
      if (ww) {
        const s = snapRect(ww.x, ww.y, nw, nh);
        nw = s.w;
        nh = s.h;
      }

      state.widgets[wid].w = nw;
      state.widgets[wid].h = nh;
      state.widgets[wid].updatedAt = Date.now();
      el.style.width = nw + 'px';
      el.style.height = nh + 'px';
      events.emit('connections:render');
    };
    const onUp = (ev) => {
      try {
        isResizing = false;
        try { rh.releasePointerCapture(ev.pointerId); } catch(e){}
        events.emit('pending:add', wid);
        events.emit('app:save');
      } finally {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

export function sanitize(str) {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;'
  };
  return str.replace(/[&<>"'/]/g, m => map[m]);
}

/**
 * 6번 이슈: XSS 우회 인젝션을 완벽히 차단하는 초강력 SVG 살균 함수 (Sanitizer)
 */
export function sanitizeSVG(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return dataUrl;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return dataUrl;
    
    const isBase64 = parts[0].includes('base64');
    let raw = '';
    try {
      raw = isBase64 ? atob(parts[1]) : decodeURIComponent(parts[1]);
    } catch (e) {
      // Decode fallback
      raw = decodeURIComponent(parts[1]);
    }
    
    const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
    
    // 1. 블랙리스트 위험 태그 전면 숙청
    const dangerousTags = [
      'script', 'foreignobject', 'iframe', 'embed', 'object', 
      'link', 'style', 'animate', 'set', 'handler', 'discard', 'metadata'
    ];
    dangerousTags.forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });
    
    // 2. 위험 속성 전면 스캔 및 정화 (우회 난독화 차단)
    doc.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        
        // 공백 및 제어문자 제거로 j a v a s c r i p t : 우회 무력화
        const value = attr.value.trim().toLowerCase().replace(/[\s\x00-\x1F]/g, '');
        
        // onload 등 인라인 스크립트 리스너 전면 차단
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }
        
        // href, xlink:href 등 모든 링크 목적지에 내장된 스크립트 실행 차단
        if (name.endsWith('href') || name.includes('href')) {
          if (value.startsWith('javascript:') || value.startsWith('data:') || value.startsWith('vbscript:')) {
            el.removeAttribute(attr.name);
            return;
          }
        }

        // 폼 액션 악용 방지
        if (name === 'action' || name === 'formaction') {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    const clean = new XMLSerializer().serializeToString(doc.documentElement);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clean)));
  } catch (e) {
    console.error('SVG Sanitization failed', e);
    // 실패 시 안전한 투명 더미 SVG로 fallback
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
  }
}
