import { state } from './state';
import { screenToWorld } from './camera';
import { save, pendingChanges } from './sync';
import { renderConnections, getBezierPath, getAnchorPos } from './connections';
import { renderWidget } from './widgets';
import { nanoid } from 'nanoid';

export function initInteraction(root) {
  if (!root) return;
  
  let drag = null;
  let connStart = null;
  const ghostPath = document.getElementById('ghost-conn');

  // 1. Connection Dragging Start
  window.addEventListener('pointerdown', (e) => {
    const a = e.target.closest('.anchor-point');
    if (a) {
      e.preventDefault(); e.stopPropagation();
      const rect = root.getBoundingClientRect();
      const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      connStart = { wid: a.dataset.wid, side: a.dataset.side, startW: wp };
      if (ghostPath) {
        ghostPath.style.display = 'block';
        ghostPath.setAttribute('d', '');
      }
      drag = { type: 'connect' };
    }
  }, { capture: true }); // Use capture to hit anchors before widgets

  // 2. Main Canvas Interactions (Create & Pan)
  root.addEventListener('pointerdown', (e) => {
    if (drag) return;
    if (e.target.closest('.widget') || e.target.closest('.tool-btn')) return;

    const rect = root.getBoundingClientRect();
    const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // [RESTORED] Click to Create Widget Logic
    if (['memo', 'sketch', 'spreadsheet'].includes(state.activeTool)) {
      const id = nanoid();
      const w = {
        id,
        type: state.activeTool,
        x: Math.round(wp.x - 100),
        y: Math.round(wp.y - 50),
        w: state.activeTool === 'spreadsheet' ? 440 : 200,
        h: state.activeTool === 'spreadsheet' ? 300 : 150,
        zIndex: state.nextZ++,
        content: '',
        cells: {},
        rows: 15, cols: 8,
        color: state.activeTool === 'memo' ? '#fefce8' : 'white'
      };
      state.widgets[id] = w;
      renderWidget(w);
      pendingChanges.add(id);
      save();
      return;
    }

    // Panning
    if (state.activeTool === 'hand' || e.button === 1) {
      drag = { type: 'pan', last: { x: e.clientX, y: e.clientY } };
      root.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = root.getBoundingClientRect();

    if (drag.type === 'connect' && connStart) {
      const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const p1 = getAnchorPos(connStart.wid, connStart.side);
      if (ghostPath) ghostPath.setAttribute('d', getBezierPath(p1, wp, connStart.side, 'auto'));
    } else if (drag.type === 'pan') {
      const dx = e.clientX - drag.last.x;
      const dy = e.clientY - drag.last.y;
      state.cameraX += dx;
      state.cameraY += dy;
      drag.last = { x: e.clientX, y: e.clientY };
      
      const world = document.getElementById('world');
      if (world) world.style.transform = `translate(${state.cameraX}px, ${state.cameraY}px) scale(${state.cameraZoom})`;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!drag) return;

    if (drag.type === 'connect' && connStart) {
      if (ghostPath) ghostPath.style.display = 'none';
      const targetAnchor = document.elementFromPoint(e.clientX, e.clientY)?.closest('.anchor-point');
      
      if (targetAnchor && targetAnchor.dataset.wid !== connStart.wid) {
        const id = nanoid();
        if (!state.connections) state.connections = {};
        state.connections[id] = {
          id,
          fromId: connStart.wid,
          fromSide: connStart.side,
          toId: targetAnchor.dataset.wid,
          toSide: targetAnchor.dataset.side,
        };
        renderConnections();
        save();
      }
      connStart = null;
    }

    drag = null;
    root.style.cursor = '';
  });
}
