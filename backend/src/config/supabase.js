import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

let client = null;

/**
 * Service-role client for server-only Storage operations (upload/remove).
 * Never import this in code that can run in a browser.
 */
export function getSupabaseServiceClient() {
  if (client) {
    return client;
  }
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return null;
  }
  client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function isSupabasePdfStorageConfigured() {
  return Boolean(
    env.supabaseUrl && env.supabaseServiceRoleKey && env.supabaseStorageBucket
  );
}
