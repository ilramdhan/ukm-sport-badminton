"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "./supabase/admin";
import { requireAdmin } from "./auth/session";
import { pickNextMatch } from "./queue-engine";
import {
  applyRally,
  createMatchState,
  matchWinner,
  SCORE_PRESETS,
} from "./score-engine";
import type {
  CurrentMatch,
  MatchMode,
  ScoreMode,
  Tier,
} from "./types";
import { fetchCurrentMatch, fetchLastMatchMode, fetchPlayers } from "./data";

function bump() {
  revalidatePath("/");
  revalidatePath("/admin");
}

// ============================================================
// PLAYERS
// ============================================================

export async function addPlayer(name: string, tier: Tier): Promise<void> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nama wajib diisi.");
  const { error } = await supabaseAdmin()
    .from("players")
    .insert({ name: trimmed, tier });
  if (error) throw error;
  bump();
}

export async function updatePlayer(
  id: string,
  patch: { name?: string; tier?: Tier },
): Promise<void> {
  await requireAdmin();
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean.name = patch.name.trim();
  if (patch.tier !== undefined) clean.tier = patch.tier;
  const { error } = await supabaseAdmin()
    .from("players")
    .update(clean)
    .eq("id", id);
  if (error) throw error;
  bump();
}

export async function deletePlayer(id: string): Promise<void> {
  await requireAdmin();
  // Cek: pemain tidak sedang di lapangan
  const match = await fetchCurrentMatch();
  if (match && [...match.team1_ids, ...match.team2_ids].includes(id)) {
    throw new Error("Pemain sedang di lapangan — selesaikan match dulu.");
  }
  const { error } = await supabaseAdmin().from("players").delete().eq("id", id);
  if (error) throw error;
  bump();
}

// ============================================================
// ATTENDANCE / QUEUE
// ============================================================

export async function togglePresent(id: string): Promise<void> {
  await requireAdmin();
  const players = await fetchPlayers();
  const p = players.find(x => x.id === id);
  if (!p) throw new Error("Pemain tidak ditemukan.");

  if (p.is_present) {
    // Ubah jadi absen — cek tidak di lapangan
    const match = await fetchCurrentMatch();
    if (match && [...match.team1_ids, ...match.team2_ids].includes(id)) {
      throw new Error("Pemain sedang di lapangan.");
    }
    const { error } = await supabaseAdmin()
      .from("players")
      .update({ is_present: false, queue_joined_at: null })
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin()
      .from("players")
      .update({ is_present: true, queue_joined_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }
  bump();
}

export async function resetSession(): Promise<void> {
  await requireAdmin();
  // Jangan reset kalau ada match berlangsung
  const match = await fetchCurrentMatch();
  if (match) throw new Error("Selesaikan atau batalkan match dulu.");

  const { error: e1 } = await supabaseAdmin()
    .from("players")
    .update({ is_present: false, queue_joined_at: null, games_played: 0 })
    .not("id", "is", null);
  if (e1) throw e1;
  bump();
}

// ============================================================
// MATCH LIFECYCLE
// ============================================================

export async function startMatch(presetKey: string): Promise<void> {
  await requireAdmin();

  const preset = SCORE_PRESETS.find(p => p.key === presetKey);
  if (!preset) throw new Error("Preset skor tidak dikenal.");

  const existing = await fetchCurrentMatch();
  if (existing) throw new Error("Ada match berlangsung. Selesaikan dulu.");

  const players = await fetchPlayers();
  const lastMode = await fetchLastMatchMode();
  const selection = pickNextMatch(players, lastMode as MatchMode | null);
  if (!selection) throw new Error("Antrean kurang dari 4 pemain.");

  const pById = new Map(players.map(p => [p.id, p]));
  const snap = (ids: string[]) =>
    ids.map(id => {
      const p = pById.get(id);
      if (!p) throw new Error("Pemain tidak ditemukan di antrean.");
      return { id: p.id, name: p.name, tier: p.tier };
    });

  const state: CurrentMatch = createMatchState({
    id: crypto.randomUUID(),
    team1_ids: selection.team1,
    team2_ids: selection.team2,
    team1_snapshot: snap(selection.team1),
    team2_snapshot: snap(selection.team2),
    score_mode: preset.score_mode as ScoreMode,
    target_points: preset.target_points,
    cap_points: preset.cap_points,
    win_by_two: preset.win_by_two,
    best_of: preset.best_of,
    match_mode: selection.mode,
  });

  const admin = supabaseAdmin();
  const { error: insErr } = await admin.from("current_match").insert({
    id: state.id,
    team1_ids: state.team1_ids,
    team2_ids: state.team2_ids,
    team1_snapshot: state.team1_snapshot,
    team2_snapshot: state.team2_snapshot,
    score_mode: state.score_mode,
    target_points: state.target_points,
    cap_points: state.cap_points,
    win_by_two: state.win_by_two,
    best_of: state.best_of,
    current_game: state.current_game,
    games: state.games,
    score1: state.score1,
    score2: state.score2,
    server_team: state.server_team,
    server_number: state.server_number,
    started_at: state.started_at,
  });
  if (insErr) throw insErr;

  // Keluarkan 4 pemain dari antrean (queue_joined_at = null)
  // supaya mereka tidak ikut match berikutnya sampai finished
  const onCourt = [...state.team1_ids, ...state.team2_ids];
  const { error: qErr } = await admin
    .from("players")
    .update({ queue_joined_at: null })
    .in("id", onCourt);
  if (qErr) throw qErr;

  bump();
}

export async function applyScore(winningTeam: 1 | 2): Promise<void> {
  await requireAdmin();
  const match = await fetchCurrentMatch();
  if (!match) throw new Error("Tidak ada match berlangsung.");
  if (matchWinner(match)) throw new Error("Match sudah selesai.");

  const admin = supabaseAdmin();

  // Simpan state sebelumnya utk undo
  const { error: evErr } = await admin.from("score_events").insert({
    match_id: match.id,
    prev_state: match,
  });
  if (evErr) throw evErr;

  const next = applyRally(match, winningTeam);
  const { error: uErr } = await admin
    .from("current_match")
    .update({
      current_game: next.current_game,
      games: next.games,
      score1: next.score1,
      score2: next.score2,
      server_team: next.server_team,
      server_number: next.server_number,
    })
    .eq("id", match.id);
  if (uErr) throw uErr;

  bump();
}

export async function undoScore(): Promise<void> {
  await requireAdmin();
  const match = await fetchCurrentMatch();
  if (!match) throw new Error("Tidak ada match berlangsung.");

  const admin = supabaseAdmin();
  const { data: lastEvent, error: fErr } = await admin
    .from("score_events")
    .select("*")
    .eq("match_id", match.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!lastEvent) throw new Error("Tidak ada aksi untuk di-undo.");

  const prev = lastEvent.prev_state as CurrentMatch;
  const { error: uErr } = await admin
    .from("current_match")
    .update({
      current_game: prev.current_game,
      games: prev.games,
      score1: prev.score1,
      score2: prev.score2,
      server_team: prev.server_team,
      server_number: prev.server_number,
    })
    .eq("id", match.id);
  if (uErr) throw uErr;

  const { error: dErr } = await admin
    .from("score_events")
    .delete()
    .eq("id", lastEvent.id);
  if (dErr) throw dErr;

  bump();
}

export async function finishMatch(): Promise<void> {
  await requireAdmin();
  const match = await fetchCurrentMatch();
  if (!match) throw new Error("Tidak ada match berlangsung.");

  const winner = matchWinner(match);

  const admin = supabaseAdmin();
  // Insert ke history
  const { error: hErr } = await admin.from("matches").insert({
    team1_snapshot: match.team1_snapshot,
    team2_snapshot: match.team2_snapshot,
    score_mode: match.score_mode,
    target_points: match.target_points,
    cap_points: match.cap_points,
    win_by_two: match.win_by_two,
    best_of: match.best_of,
    games: match.games,
    winner_team: winner,
    match_mode: match.match_mode ?? null,
  });
  if (hErr) throw hErr;

  // Tambah games_played + push 4 pemain ke belakang antrean
  const onCourt = [...match.team1_ids, ...match.team2_ids];

  const players = await fetchPlayers();
  const now = new Date();
  // Beri offset per posisi supaya urutan konsisten dgn team1 lalu team2
  const updates = onCourt.map((id, idx) => {
    const p = players.find(x => x.id === id);
    return {
      id,
      games_played: (p?.games_played ?? 0) + 1,
      queue_joined_at: p?.is_present
        ? new Date(now.getTime() + idx).toISOString()
        : null,
    };
  });

  // Batch update via upsert
  for (const u of updates) {
    await admin
      .from("players")
      .update({
        games_played: u.games_played,
        queue_joined_at: u.queue_joined_at,
      })
      .eq("id", u.id);
  }

  // Hapus current_match + score_events terkait
  await admin.from("score_events").delete().eq("match_id", match.id);
  await admin.from("current_match").delete().eq("id", match.id);

  bump();
}

export async function cancelMatch(): Promise<void> {
  await requireAdmin();
  const match = await fetchCurrentMatch();
  if (!match) return;

  const admin = supabaseAdmin();
  // Pemain kembali ke antrean (di depan, karena kita kasih timestamp lama)
  const onCourt = [...match.team1_ids, ...match.team2_ids];
  const restoreAt = new Date(new Date(match.started_at).getTime() - 1000).toISOString();
  const players = await fetchPlayers();

  for (let i = 0; i < onCourt.length; i++) {
    const id = onCourt[i];
    const p = players.find(x => x.id === id);
    if (!p?.is_present) continue;
    await admin
      .from("players")
      .update({
        queue_joined_at: new Date(new Date(restoreAt).getTime() + i).toISOString(),
      })
      .eq("id", id);
  }

  await admin.from("score_events").delete().eq("match_id", match.id);
  await admin.from("current_match").delete().eq("id", match.id);
  bump();
}

// ============================================================
// DANGER ZONE
// ============================================================

export async function clearHistory(): Promise<void> {
  await requireAdmin();
  const { error } = await supabaseAdmin()
    .from("matches")
    .delete()
    .not("id", "is", null);
  if (error) throw error;
  bump();
}

export async function clearScoreCurrent(): Promise<void> {
  await requireAdmin();
  const match = await fetchCurrentMatch();
  if (!match) return;
  const admin = supabaseAdmin();
  await admin.from("score_events").delete().eq("match_id", match.id);
  const reset: Partial<CurrentMatch> = {
    current_game: 1,
    games: [],
    score1: 0,
    score2: 0,
    server_team: match.score_mode === "traditional" ? 1 : null,
    server_number: match.score_mode === "traditional" ? 1 : null,
  };
  await admin.from("current_match").update(reset).eq("id", match.id);
  bump();
}

export async function clearAllData(): Promise<void> {
  await requireAdmin();
  const admin = supabaseAdmin();
  await admin.from("score_events").delete().not("id", "is", null);
  await admin.from("current_match").delete().not("id", "is", null);
  await admin.from("matches").delete().not("id", "is", null);
  await admin.from("players").delete().not("id", "is", null);
  bump();
}
