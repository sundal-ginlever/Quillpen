import { sb } from './supabase';
import { setCurrentUser } from './state';
import { isDemo } from './supabase';

export async function initAuth() {
  if (isDemo()) {
    // Demo mode handles auth differently or skips it
    return { mode: 'demo' };
  }

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    setCurrentUser(session.user);
    return { mode: 'auth', user: session.user };
  }

  return { mode: 'none' };
}

export function setupAuthUI(onSuccess) {
  const authSubmit = document.getElementById('auth-submit');
  const authEmail = document.getElementById('auth-email');
  const authPw = document.getElementById('auth-pw');
  const authError = document.getElementById('auth-error');
  const authMsg = document.getElementById('auth-msg');
  const authSwitch = document.getElementById('auth-switch');
  const authSub = document.getElementById('auth-sub');

  let authMode = 'login';

  if (!authSubmit) return;

  authSwitch.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    authSubmit.textContent = authMode === 'login' ? '로그인' : '회원가입';
    authSwitch.textContent = authMode === 'login' ? '회원가입' : '로그인';
    authSub.textContent = authMode === 'login' ? '나만의 무한 낙서장 — 어디서든 동기화' : '새 계정을 만들어 시작하세요';
    authError.textContent = '';
  });

  authSubmit.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const pw = authPw.value;
    authError.textContent = '';
    authMsg.textContent = '';

    if (!email || !pw) {
      authError.textContent = '이메일과 비밀번호를 입력해주세요.';
      return;
    }
    authSubmit.disabled = true;

    try {
      let result;
      if (authMode === 'login') {
        result = await sb.auth.signInWithPassword({ email, password: pw });
      } else {
        result = await sb.auth.signUp({ email, password: pw });
        if (!result.error) authMsg.textContent = '확인 이메일을 발송했습니다.';
      }
      
      if (result.error) throw result.error;
      if (result.data?.user && authMode === 'login') {
        setCurrentUser(result.data.user);
        onSuccess();
      }
    } catch (err) {
      authError.textContent = err.message;
    } finally {
      authSubmit.disabled = false;
    }
  });

  document.getElementById('auth-google')?.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  });
}

export function listenAuthChanges(callback) {
  sb.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      setCurrentUser(session.user);
      callback(event, session.user);
    }
  });
}

export function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'flex';
}

export function hideAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  if (!authScreen) return;
  authScreen.classList.add('hiding');
  setTimeout(() => {
    authScreen.style.display = 'none';
    authScreen.classList.remove('hiding');
  }, 300);
}
