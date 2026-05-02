import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from './state';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/**
 * Checks if the current setup is using placeholder credentials
 */
export function isDemo() {
  return SUPABASE_URL.includes('YOUR_PROJECT');
}
