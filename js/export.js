// ══════════════════════════════════════════
// EXPORT / IMPORT (PNG, JSON, CSV)
// ══════════════════════════════════════════
import { state, camera, currentCanvasName } from './state.js';
import { events } from './events.js';
import { nanoid } from './utils.js';
import { getAnchorPos } from './connections.js';


export function openExportModal() { document.getElementById('export-modal').style.display = 'flex'; }
export function closeExportModal() { document.getElementById('export-modal').style.display = 'none'; }

export function exportJSON() {
  const data = {
    version: 3, exportedAt: new Date().toISOString(), canvasName: currentCanvasName,
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    settings: { showGrid: state.showGrid, snapOn: state.snapOn },
    widgets: Object.values(state.widgets).map(w => {
      const copy = { ...w };
      if (w.type === 'spreadsheet') {
        copy.luckyData = w.luckyData || null;
        copy.jdata = w.jdata || null;
        copy.jwidths = w.jwidths || null;
        copy.jstyle = w.jstyle || null;
        copy.jmerge = w.jmerge || null;
      }
      return copy;
    }),
    connections: state.connections
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `inkcanvas-${currentCanvasName}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  closeExportModal();
}

export function importJSON(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.widgets) throw new Error('invalid format');
      if (!confirm(`"${data.canvasName || '가져오기'}" 캔버스를 불러올까요?\n현재 캔버스 내용이 교체됩니다.`)) return;
      
      events.emit('canvas:clear');
      state.nextZ = 1;
      if (data.camera) { camera.x = data.camera.x; camera.y = data.camera.y; camera.zoom = data.camera.zoom; }
      if (data.settings?.showGrid !== undefined) state.showGrid = data.settings.showGrid;
      if (data.settings?.snapOn !== undefined) state.snapOn = data.settings.snapOn;

      const idMap = new Map();
      data.widgets.forEach(w => {
        const oldId = w.id;
        const newId = nanoid();
        idMap.set(oldId, newId);
        w.id = newId;

        if (w.type === 'spreadsheet') {
          w.luckyData = w.luckyData || null;
          w.jdata = w.jdata || null;
          w.jwidths = w.jwidths || null;
          w.jstyle = w.jstyle || null;
          w.jmerge = w.jmerge || null;
        }
        state.widgets[w.id] = w; state.nextZ = Math.max(state.nextZ, (w.zIndex || 0) + 1);
        events.emit('widget:render', w);
      });

      // 연결선 ID 매핑 치환 및 정제
      const importedConnections = data.connections || {};
      const cleanConnections = {};
      Object.keys(importedConnections).forEach(cid => {
        const conn = importedConnections[cid];
        const newFromId = idMap.get(conn.fromId);
        const newToId = idMap.get(conn.toId);
        if (newFromId && newToId) {
          const newCid = nanoid();
          cleanConnections[newCid] = {
            ...conn,
            id: newCid,
            fromId: newFromId,
            toId: newToId
          };
        }
      });
      state.connections = cleanConnections;

      events.emit('camera:apply');
      events.emit('ui:update');
      events.emit('app:save');
      closeExportModal();
    } catch (err) { alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message); }
  };
  reader.readAsText(file); input.value = '';
}

export function exportCSV() {
  const sheets = Object.values(state.widgets).filter(w => w.type === 'spreadsheet');
  if (!sheets.length) { alert('스프레드시트 블록이 없습니다.'); return; }
  const parts = sheets.map((w, idx) => {
    let sheetText = `# Spreadsheet ${idx + 1}\n`;
    let tabs = [];
    
    if (w.jdata && w.jdata.length) {
      const csv = `## Sheet1\n`;
      const data = w.jdata || [];
      const rows = data.map(row => {
        if (!row) return '';
        return row.map(cell => {
          return `"${String(cell || '').replace(/"/g, '""')}"`;
        }).join(',');
      });
      tabs.push(csv + rows.join('\n'));
    } else if (w.luckyData && w.luckyData.length) {
      tabs = w.luckyData.map(sheet => {
        let csv = `## ${sheet.name}\n`;
        const data = sheet.data || [];
        const rows = data.map(row => {
          if (!row) return '';
          return row.map(cell => {
            const val = cell && cell.m !== undefined ? cell.m : (cell && cell.v !== undefined ? cell.v : '');
            return `"${String(val).replace(/"/g, '""')}"`;
          }).join(',');
        });
        return csv + rows.join('\n');
      });
    } else {
      return sheetText;
    }
    
    return sheetText + tabs.join('\n\n');
  });
  const blob = new Blob([parts.join('\n\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `inkcanvas-${currentCanvasName}-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  closeExportModal();
}

export function exportPNG() {
  closeExportModal();
  const widgets = Object.values(state.widgets);
  if (!widgets.length) { alert('캔버스에 위젯이 없습니다.'); return; }
  
  if (window._appModules?.showUndoToast) window._appModules.showUndoToast('PNG 렌더링 중...');
  
  Promise.all(widgets.map(w => {
    if (w.type === 'image' && w.src) {
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { w._cachedImg = img; resolve(); };
        img.onerror = () => resolve();
        img.src = w.src;
      });
    }
    return Promise.resolve();
  })).then(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    widgets.forEach(w => { minX = Math.min(minX, w.x); minY = Math.min(minY, w.y); maxX = Math.max(maxX, w.x + w.w); maxY = Math.max(maxY, w.y + w.h); });
    const PAD = 40, ww = maxX - minX + PAD * 2, wh = maxY - minY + PAD * 2;
    const scale = Math.min(2, 2000 / Math.max(ww, wh));
    const cvs = document.createElement('canvas'); cvs.width = Math.ceil(ww * scale); cvs.height = Math.ceil(wh * scale);
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = 'rgba(148,163,184,0.3)';
    const gs = 20 * scale;
    const ox = (((-minX + PAD) * scale) % gs + gs) % gs, oy = (((-minY + PAD) * scale) % gs + gs) % gs;
    for (let x = ox; x < cvs.width; x += gs) for (let y = oy; y < cvs.height; y += gs) ctx.fillRect(x - 1, y - 1, 2, 2);

    widgets.sort((a, b) => a.zIndex - b.zIndex).forEach(w => {
      const sx = (w.x - minX + PAD) * scale, sy = (w.y - minY + PAD) * scale, sw = w.w * scale, sh = w.h * scale;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 8 * scale;
      ctx.fillStyle = w.type === 'memo' ? (w.color || '#fefce8') : 'white';
      roundRect(ctx, sx, sy, sw, sh, 12 * scale); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = scale;
      roundRect(ctx, sx, sy, sw, sh, 12 * scale); ctx.stroke();

      ctx.save(); ctx.beginPath(); roundRect(ctx, sx + 1, sy + 1, sw - 2, sh - 2, 11 * scale); ctx.clip();
      
      if (w.type === 'image' && w._cachedImg) {
        drawImageWithFit(ctx, w._cachedImg, sx, sy + 32 * scale, sw, sh - 32 * scale, w.objectFit || 'contain');
      } else if (w.type === 'sketch' && w.strokes) {
        w.strokes.forEach(stroke => {
          if (!stroke.points || stroke.points.length < 2) return;
          ctx.beginPath();
          const isEraser = stroke.color === 'transparent';
          ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
          ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
          ctx.lineWidth = stroke.width * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.moveTo(sx + stroke.points[0].x * scale, sy + 40 * scale + stroke.points[0].y * scale);
          stroke.points.forEach((pt, i) => {
            if (i === 0) return;
            const pv = stroke.points[i - 1];
            ctx.quadraticCurveTo(sx + pv.x * scale, sy + 40 * scale + pv.y * scale, sx + (pv.x + pt.x) / 2 * scale, sy + 40 * scale + (pv.y + pt.y) / 2 * scale);
          });
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        });

      } else if (w.type === 'spreadsheet' && w.jdata) {
        ctx.fillStyle = '#f1f5f9'; ctx.fillRect(sx, sy + 32 * scale, sw, sh - 32 * scale);
        const cellH = 24 * scale;
        const colWidths = [];
        const numCols = (w.jdata[0] || []).length;
        for (let c = 0; c < numCols; c++) {
          const originalW = (w.jwidths && w.jwidths[c]) ? Number(w.jwidths[c]) : 80;
          colWidths.push(originalW * scale);
        }
        const numRows = w.jdata.length;
        ctx.fillStyle = '#0f172a'; ctx.font = `${11 * scale}px sans-serif`; ctx.textBaseline = 'middle';
        
        let currentY = sy + 32 * scale;
        for (let r = 0; r < numRows; r++) {
          if (currentY + cellH > sy + sh) break;
          let currentX = sx;
          for (let c = 0; c < numCols; c++) {
            const cellW = colWidths[c];
            if (currentX + cellW > sx + sw) break;
            
            ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1 * scale;
            ctx.strokeRect(currentX, currentY, cellW, cellH);
            
            const val = w.jdata[r][c];
            if (val !== undefined && val !== null && val !== '') {
              ctx.save();
              ctx.beginPath();
              ctx.rect(currentX + 1, currentY + 1, cellW - 2, cellH - 2);
              ctx.clip();
              ctx.fillText(String(val), currentX + 4 * scale, currentY + cellH / 2);
              ctx.restore();
            }
            currentX += cellW;
          }
          currentY += cellH;
        }
      } else if (w.type === 'memo') {
        ctx.fillStyle = '#0f172a';
        const fSize = w.fontSize || 14;
        ctx.font = `${fSize * scale}px sans-serif`;
        ctx.textBaseline = 'top';
        wrapText(ctx, w.content || '', sx + 12 * scale, sy + 40 * scale, sw - 24 * scale, (fSize * 1.4) * scale, sh - 52 * scale);
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.font = `${10 * scale}px monospace`;
      ctx.fillText(w.type + (w.title ? ` - ${w.title}` : ''), sx + 10 * scale, sy + 20 * scale);
    });

    // ──────────────────────────────────────────
    // Render Connection Lines on PNG Canvas
    // ──────────────────────────────────────────
    Object.values(state.connections).forEach(c => {
      const fromW = state.widgets[c.fromId];
      const toW = state.widgets[c.toId];
      if (!fromW || !toW) return;

      const p1 = getAnchorPos(c.fromId, c.fromSide);
      const p2 = getAnchorPos(c.toId, c.toSide);

      const sx1 = (p1.x - minX + PAD) * scale;
      const sy1 = (p1.y - minY + PAD) * scale;
      const sx2 = (p2.x - minX + PAD) * scale;
      const sy2 = (p2.y - minY + PAD) * scale;

      const dx = Math.abs(p1.x - p2.x), dy = Math.abs(p1.y - p2.y);
      const dist = Math.max(50, Math.min(200, Math.sqrt(dx * dx + dy * dy) * 0.4));
      
      let cp1 = { x: p1.x, y: p1.y }, cp2 = { x: p2.x, y: p2.y };
      if (c.fromSide === 'e') cp1.x += dist;
      else if (c.fromSide === 'w') cp1.x -= dist;
      else if (c.fromSide === 'n') cp1.y -= dist;
      else if (c.fromSide === 's') cp1.y += dist;

      if (c.toSide === 'e') cp2.x += dist;
      else if (c.toSide === 'w') cp2.x -= dist;
      else if (c.toSide === 'n') cp2.y -= dist;
      else if (c.toSide === 's') cp2.y += dist;

      const scp1x = (cp1.x - minX + PAD) * scale;
      const scp1y = (cp1.y - minY + PAD) * scale;
      const scp2x = (cp2.x - minX + PAD) * scale;
      const scp2y = (cp2.y - minY + PAD) * scale;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.bezierCurveTo(scp1x, scp1y, scp2x, scp2y, sx2, sy2);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      const angle = Math.atan2(sy2 - scp2y, sx2 - scp2x);
      ctx.beginPath();
      ctx.moveTo(sx2, sy2);
      const arrowLength = 10 * scale;
      const arrowAngle = Math.PI / 6;
      ctx.lineTo(
        sx2 - arrowLength * Math.cos(angle - arrowAngle),
        sy2 - arrowLength * Math.sin(angle - arrowAngle)
      );
      ctx.lineTo(
        sx2 - arrowLength * Math.cos(angle + arrowAngle),
        sy2 - arrowLength * Math.sin(angle + arrowAngle)
      );
      ctx.closePath();
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.restore();
    });

    cvs.toBlob(blob => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `inkcanvas-${currentCanvasName}-${Date.now()}.png`; a.click(); URL.revokeObjectURL(a.href);
      widgets.forEach(w => delete w._cachedImg);
      if (window._appModules?.showUndoToast) window._appModules.showUndoToast('PNG 내보내기 완료');
    }, 'image/png');
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
  const lines = text.split('\n');
  let currentY = y;
  for (let i = 0; i < lines.length; i++) {
    let line = '';
    const chars = lines[i].split('');
    for (let n = 0; n < chars.length; n++) {
      let testLine = line + chars[n];
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        if (currentY + lineHeight > y + maxHeight) {
          ctx.fillText(line.substring(0, Math.max(0, line.length - 2)) + '...', x, currentY);
          return;
        }
        ctx.fillText(line, x, currentY);
        line = chars[n];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (currentY + lineHeight > y + maxHeight) {
      ctx.fillText(line.substring(0, Math.max(0, line.length - 2)) + '...', x, currentY);
      return;
    }
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
}

function drawImageWithFit(ctx, img, dx, dy, dw, dh, fit) {
  if (fit === 'fill') {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  const imgRatio = imgW / imgH;
  const containerRatio = dw / dh;
  
  let sx = 0, sy = 0, sw = imgW, sh = imgH;
  let destX = dx, destY = dy, destW = dw, destH = dh;
  
  if (fit === 'cover') {
    if (imgRatio > containerRatio) {
      // Image is wider than container: crop sides
      sw = imgH * containerRatio;
      sx = (imgW - sw) / 2;
    } else {
      // Image is taller than container: crop top/bottom
      sh = imgW / containerRatio;
      sy = (imgH - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, destX, destY, destW, destH);
  } else { // contain
    if (imgRatio > containerRatio) {
      // Image is wider than container: letterbox top/bottom
      destH = dw / imgRatio;
      destY = dy + (dh - destH) / 2;
    } else {
      // Image is taller than container: letterbox sides
      destW = dh * imgRatio;
      destX = dx + (dw - destW) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, destX, destY, destW, destH);
  }
}
