// ══════════════════════════════════════════
// EXPORT / IMPORT (PNG, JSON, CSV)
// ══════════════════════════════════════════
import { state, camera, currentCanvasName } from './state.js';
import { events } from './events.js';

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
      state.connections = data.connections || {};
      events.emit('canvas:clear');
      state.nextZ = 1;
      if (data.camera) { camera.x = data.camera.x; camera.y = data.camera.y; camera.zoom = data.camera.zoom; }
      if (data.settings?.showGrid !== undefined) state.showGrid = data.settings.showGrid;
      if (data.settings?.snapOn !== undefined) state.snapOn = data.settings.snapOn;
      data.widgets.forEach(w => {
        if (w.type === 'spreadsheet') {
          w.luckyData = w.luckyData || null;
        }
        state.widgets[w.id] = w; state.nextZ = Math.max(state.nextZ, (w.zIndex || 0) + 1);
        events.emit('widget:render', w);
      });
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
    if (!w.luckyData || !w.luckyData.length) return sheetText;
    
    // Process all tabs in the Luckysheet
    const tabs = w.luckyData.map(sheet => {
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
    if (w.type === 'sketch' && w.strokes) {
      ctx.save(); ctx.beginPath(); roundRect(ctx, sx + 1, sy + 1, sw - 2, sh - 2, 11 * scale); ctx.clip();
      w.strokes.forEach(stroke => {
        if (!stroke.points || stroke.points.length < 2) return;
        ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(sx + stroke.points[0].x * scale, sy + 40 * scale + stroke.points[0].y * scale);
        stroke.points.forEach((pt, i) => {
          if (i === 0) return;
          const pv = stroke.points[i - 1];
          ctx.quadraticCurveTo(sx + pv.x * scale, sy + 40 * scale + pv.y * scale, sx + (pv.x + pt.x) / 2 * scale, sy + 40 * scale + (pv.y + pt.y) / 2 * scale);
        });
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.font = `${10 * scale}px monospace`;
    ctx.fillText(w.type, sx + 10 * scale, sy + 20 * scale);
  });

  cvs.toBlob(blob => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `inkcanvas-${currentCanvasName}-${Date.now()}.png`; a.click(); URL.revokeObjectURL(a.href);
  }, 'image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
