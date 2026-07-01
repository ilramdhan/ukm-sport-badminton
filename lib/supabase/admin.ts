import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client. Pakai secret key (bypass RLS).
 * JANGAN pernah import file ini di komponen client / bundle browser.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY tidak diset di environment.",
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
