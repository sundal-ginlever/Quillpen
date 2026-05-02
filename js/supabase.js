// ══════════════════════════════════════════
// SUPABASE SDK LOADER
// ══════════════════════════════════════════
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

export let sb = null;

export async function loadSupabase() {
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = () => {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
      resolve(true);
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}
