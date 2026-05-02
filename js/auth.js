// ══════════════════════════════════════════
// AUTH LAYER
// ══════════════════════════════════════════
import { SUPABASE_URL } from './config.js';
import { state, setCurrentUser, currentCanvasId, setCurrentCanvasId, setCurrentCanvasName, setIsReadOnly } from './state.js';
import { sb, loadSupabase } from './supabase.js';
import { events } from './events.js';
import { setSyncState, loadFromCloud } from './sync.js';

export async function initAuth() {
  const ok = await loadSupabase();
  if (!ok || isDemo()) { startDemo(); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) { setCurrentUser(session.user); await afterLogin(); }
  else { showAuthScreen(); }
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) { setCurrentUser(session.user); await afterLogin(); }
  });
}

export function isDemo() { return SUPABASE_URL.includes('YOUR_PROJECT'); }

export function startDemo() {
  hideAuthScreen();
  setSyncState('offline', '로컬 모드');
  setCurrentCanvasId('local');
  setCurrentCanvasName('로컬 캔버스');
  document.title = 'inkcanvas — 로컬 캔버스';
  events.emit('app:load-local');
  events.emit('app:start');
}

export function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
}

export function hideAuthScreen() {
  const as = document.getElementById('auth-screen');
  as.classList.add('hiding');
  setTimeout(() => { as.style.display = 'none'; as.classList.remove('hiding'); }, 300);
}

async function afterLogin() {
  hideAuthScreen();
  const user = await import('./state.js').then(m => m.currentUser);
  await ensureUserCanvases();
  await openLastCanvas();
  await loadFromCloud();
  events.emit('app:start');
}

async function ensureUserCanvases() {
  const user = (await import('./state.js')).currentUser;
  if (!sb || !user) return;
  const { data } = await sb.from('q_canvases').select('id').eq('user_id', user.id).limit(1);
  if (!data || data.length === 0) {
    await sb.from('q_canvases').insert({ user_id: user.id, name: '첫 번째 캔버스' });
  }
}

async function openLastCanvas() {
  const user = (await import('./state.js')).currentUser;
  if (!sb || !user) return;
  const lastId = localStorage.getItem('inkcanvas_last_canvas_' + user.id);
  if (lastId) {
    const { data } = await sb.from('q_canvases').select('id').eq('id', lastId).eq('user_id', user.id).single();
    if (data) { setCurrentCanvasId(data.id); return; }
  }
  const { data } = await sb.from('q_canvases').select('id').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).single();
  if (data) setCurrentCanvasId(data.id);
}

export function initAuthUI() {
  let authMode = 'login';
  const authEmail = document.getElementById('auth-email');
  const authPw = document.getElementById('auth-pw');
  const authSubmit = document.getElementById('auth-submit');
  const authSwitch = document.getElementById('auth-switch');
  const authError = document.getElementById('auth-error');
  const authMsg = document.getElementById('auth-msg');
  const authSub = document.getElementById('auth-sub');

  authSubmit.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const pw = authPw.value;
    authError.textContent = ''; authMsg.textContent = '';
    if (!email || !pw) { authError.textContent = '이메일과 비밀번호를 입력해주세요.'; return; }
    authSubmit.disabled = true;
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) { authError.textContent = error.message; authSubmit.disabled = false; }
    } else {
      const { error } = await sb.auth.signUp({ email, password: pw });
      if (error) { authError.textContent = error.message; authSubmit.disabled = false; }
      else { authMsg.textContent = '확인 이메일을 발송했습니다. 이메일을 확인해주세요.'; authSubmit.disabled = false; }
    }
  });

  authPw.addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit.click(); });

  authSwitch.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    authSubmit.textContent = authMode === 'login' ? '로그인' : '회원가입';
    authSwitch.textContent = authMode === 'login' ? '회원가입' : '로그인';
    authSwitch.previousSibling.textContent = authMode === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? ';
    authSub.textContent = authMode === 'login' ? '나만의 무한 낙서장 — 어디서든 동기화' : '새 계정을 만들어 시작하세요';
    authError.textContent = '';
  });

  document.getElementById('auth-google').addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  });
}
