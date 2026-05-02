import { state } from './state';
import { save, pendingChanges } from './sync';

/**
 * Initializes a sketch canvas inside a widget
 */
export function initSketch(el, w) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;cursor:crosshair;touch-action:none';
  el.querySelector('.widget-content').appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let currentStroke = null;

  // Initialize data if empty
  if (!w.strokes) w.strokes = [];

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = el.clientWidth;
    canvas.height = el.clientHeight;
    redraw();
  };

  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    w.strokes.forEach(s => {
      if (s.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = s.color || '#000';
      ctx.lineWidth = s.width || 2;
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.stroke();
    });
  };

  canvas.onpointerdown = (e) => {
    isDrawing = true;
    currentStroke = {
      color: w.strokeColor || '#000',
      width: w.strokeWidth || 2,
      points: [{ x: e.offsetX, y: e.offsetY }]
    };
    w.strokes.push(currentStroke);
    e.stopPropagation();
  };

  canvas.onpointermove = (e) => {
    if (!isDrawing) return;
    currentStroke.points.push({ x: e.offsetX, y: e.offsetY });
    
    // Quick draw last segment for performance
    const pts = currentStroke.points;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];
    ctx.beginPath();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = currentStroke.width;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  };

  canvas.onpointerup = () => {
    if (isDrawing) {
      isDrawing = false;
      pendingChanges.add(w.id);
      save();
    }
  };

  // Observe resize for redrawing
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  resize(); // initial setup
}
