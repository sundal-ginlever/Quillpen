// ══════════════════════════════════════════
// CENTRAL STATE
// ══════════════════════════════════════════
import { MIN_ZOOM, MAX_ZOOM } from './config.js';

export const state = {
  widgets: {},
  connections: {},
  selectedIds: new Set(),
  activeTool: 'select',
  showGrid: true,
  snapOn: true,
  nextZ: 1,
  theme: localStorage.getItem('theme') || 'light',
  minimapVisible: false,
  lastMinimapUpdate: 0,
};

export let sketchDrawing = false;
export function setSketchDrawing(v) { sketchDrawing = v; }

export let currentUser = null;
export function setCurrentUser(u) { currentUser = u; }

export let currentCanvasId = null;
export function setCurrentCanvasId(id) { currentCanvasId = id; }

export let currentCanvasName = '캔버스';
export function setCurrentCanvasName(n) { currentCanvasName = n; }

export let isReadOnly = false;
export function setIsReadOnly(v) { isReadOnly = v; }

export const camera = { x: 0, y: 0, zoom: 1 };
export let targetCamera = { x: 0, y: 0, zoom: 1 };
export function setTargetCamera(tc) { targetCamera = tc; }

export let cameraAnimReq = null;
export function setCameraAnimReq(v) { cameraAnimReq = v; }

export function setTheme(t) {
  state.theme = t;
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
}
