import { supabaseAdmin } from "./supabase/admin";
import type { CurrentMatch, MatchHistory, Player } from "./types";

/**
 * Read-only queries buat Server Components (viewer & admin page).
 * Pakai admin client (bypass RLS) — server-only.
 */

function friendlyError(err: unknown, hint = ""): Error {
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  const msg = e?.message || "Query gagal.";
  const code = e?.code;
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("Could not find")
  ) {
    return new Error(
      `Tabel belum dibuat di Supabase. Jalankan supabase/schema.sql di Supabase SQL Editor dulu. (${msg})`,
    );
  }
  return new Error(hint ? `${hint}: ${msg}` : msg);
}

export async function fetchPlayers(): Promise<Player[]> {
  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("*")
    .order("tier")
    .order("name");
  if (error) throw friendlyError(error, "fetchPlayers");
  return (data as Player[]) ?? [];
}

export async function fetchCurrentMatch(): Promise<CurrentMatch | null> {
  const { data, error } = await supabaseAdmin()
    .from("current_match")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw friendlyError(error, "fetchCurrentMatch");
  return (data as CurrentMatch) ?? null;
}

export async function fetchHistory(limit = 20): Promise<MatchHistory[]> {
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("*")
    .order("finished_at", { ascending: false })
    .limit(limit);
  if (error) throw friendlyError(error, "fetchHistory");
  return (data as MatchHistory[]) ?? [];
}

export async function fetchLastMatchMode(): Promise<MatchHistory["match_mode"] | null> {
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("match_mode")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw friendlyError(error, "fetchLastMatchMode");
  return (data?.match_mode as MatchHistory["match_mode"]) ?? null;
}
