import { state } from './state';

/**
 * Calculates the center position of an anchor point on a widget (Restored from Original)
 */
export function getAnchorPos(wid, side) {
  const w = state.widgets[wid];
  if (!w) return { x: 0, y: 0 };
  if (side === 'n') return { x: w.x + w.w / 2, y: w.y };
  if (side === 's') return { x: w.x + w.w / 2, y: w.y + w.h };
  if (side === 'e') return { x: w.x + w.w, y: w.y + w.h / 2 };
  if (side === 'w') return { x: w.x, y: w.y + w.h / 2 };
  return { x: w.x + w.w / 2, y: w.y + w.h / 2 }; // fallback center
}

/**
 * Generates a smooth Bezier path string between two points (Restored from Original)
 */
export function getBezierPath(p1, p2, side1, side2) {
  const dx = Math.abs(p1.x - p2.x), dy = Math.abs(p1.y - p2.y);
  const dist = Math.max(50, Math.min(200, Math.sqrt(dx * dx + dy * dy) * 0.4));
  let cp1 = { x: p1.x, y: p1.y }, cp2 = { x: p2.x, y: p2.y };

  if (side1 === 'e') cp1.x += dist;
  else if (side1 === 'w') cp1.x -= dist;
  else if (side1 === 'n') cp1.y -= dist;
  else if (side1 === 's') cp1.y += dist;

  if (side2 === 'e') cp2.x += dist;
  else if (side2 === 'w') cp2.x -= dist;
  else if (side2 === 'n') cp2.y -= dist;
  else if (side2 === 's') cp2.y += dist;

  return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
}

/**
 * Renders all connections in the state
 */
export function renderConnections() {
  const group = document.getElementById('conn-group');
  if (!group) return;
  group.innerHTML = '';

  Object.entries(state.connections || {}).forEach(([id, c]) => {
    const p1 = getAnchorPos(c.fromId, c.fromSide);
    const p2 = getAnchorPos(c.toId, c.toSide);
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', getBezierPath(p1, p2, c.fromSide, c.toSide));
    path.setAttribute('class', 'conn-path');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    
    // Right click to delete connection
    path.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      if (confirm('이 연결선을 삭제하시겠습니까?')) {
        delete state.connections[id];
        renderConnections();
        // save() would be called here if imported
      }
    });
    group.appendChild(path);
  });
}
