// ── SUPABASE CONFIG ──
export const SUPABASE_URL = 'https://wxpydmganondhvlwcimz.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cHlkbWdhbm9uZGh2bHdjaW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMTc1ODAsImV4cCI6MjA5MDY5MzU4MH0.jjB0M0Z8KK507_ILXaT9ybSTPfMDyX4Rp3v5gZE5bGM';

// ── GLOBAL STATE ──
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
  cameraZoom: 1
};

export let currentUser = null;
export let currentCanvasId = null;
export let currentCanvasName = '캔버스';
export let sketchDrawing = false;
export const LOCAL_KEY = 'inkcanvas_local_v2';

// ── UTILS FOR STATE ──
export function setTheme(t) {
  state.theme = t;
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  // dispatch event so other modules can react
  window.dispatchEvent(new CustomEvent('themechanged', { detail: t }));
}

export function setCurrentUser(user) {
  currentUser = user;
}

export function setCurrentCanvas(id, name) {
  currentCanvasId = id;
  if (name) currentCanvasName = name;
}

export function setSketchDrawing(val) {
  sketchDrawing = val;
}
