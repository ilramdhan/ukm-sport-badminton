import type { CurrentMatch, Player, Tier, MatchMode } from "./types";

export interface QueueSelection {
  team1: string[];
  team2: string[];
  mode: MatchMode;
  reason: string;
}

/**
 * Skor tier untuk balancing dalam 4 pemain.
 * A=3, B=2, C=1.
 */
function tierScore(tier: Tier): number {
  return tier === "A" ? 3 : tier === "B" ? 2 : 1;
}

/**
 * Cross-pair 4 pemain: terkuat + terlemah vs 2 tengah.
 * Menghasilkan pertandingan paling seimbang secara skill.
 */
export function balanceFour(four: Player[]): { team1: string[]; team2: string[] } {
  const sorted = [...four].sort((a, b) => tierScore(b.tier) - tierScore(a.tier));
  return {
    team1: [sorted[0].id, sorted[3].id],
    team2: [sorted[1].id, sorted[2].id],
  };
}

/**
 * Pemain di antrean, urut fairness: paling sedikit main dulu, tie-break by wait time.
 * Ini pusat algoritma keadilan: pemain yang sudah banyak main otomatis
 * dilewati, dan yang jarang main naik ke depan — mencegah "1-2 orang main terus".
 */
function fairSortedQueue(present: Player[]): Player[] {
  return present
    .filter(p => p.is_present && p.queue_joined_at)
    .sort((a, b) => {
      if (a.games_played !== b.games_played) return a.games_played - b.games_played;
      return a.queue_joined_at! < b.queue_joined_at! ? -1 : 1;
    });
}

function splitTiers(queue: Player[]): { qA: Player[]; qBC: Player[] } {
  return {
    qA: queue.filter(p => p.tier === "A"),
    qBC: queue.filter(p => p.tier === "B" || p.tier === "C"),
  };
}

/**
 * Deteksi komposisi tim yang terpilih untuk label mode.
 */
function detectMode(picked: Player[]): MatchMode {
  const a = picked.filter(p => p.tier === "A").length;
  const bc = picked.filter(p => p.tier === "B" || p.tier === "C").length;
  if (a === 2 && bc === 2) return "balanced";
  if (a === 4) return "a-only";
  if (bc === 4) return "bc-only";
  return "mixed";
}

/**
 * Algoritma matchmaking berbasis FAIRNESS (games_played) + balancing tier.
 *
 * Aturan:
 * 1. Kalau kedua antrean tier (A vs B+C) punya ≥ 3 orang: default 2A + 2BC,
 *    di mana yang dipilih adalah pemain paling sedikit main (FIFO tie-break).
 * 2. Kalau salah satu antrean tipis (< 3): pakai fairness ranking global.
 *    Pilih 4 pemain dengan games_played terkecil (ties by wait time).
 *    Ini otomatis alternate 2A+2BC ↔ 4BC saat 1 tier sedikit orangnya.
 * 3. Kurang dari 4 pemain di antrean: null.
 *
 * `lastMode` parameter di-preserve untuk compatibility, tapi tidak dipakai —
 * fairness by games_played sudah handle alternation secara natural.
 */
export function pickNextMatch(
  present: Player[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lastMode: MatchMode | null = null,
): QueueSelection | null {
  const fairSorted = fairSortedQueue(present);
  if (fairSorted.length < 4) return null;

  const { qA, qBC } = splitTiers(fairSorted);

  // Kasus ideal: kedua antrean punya ≥ 3 orang. Default 2A + 2BC dari yang paling
  // sedikit main. Ini menghasilkan variasi pasangan yang maksimal.
  if (qA.length >= 3 && qBC.length >= 3) {
    const picked = [qA[0], qA[1], qBC[0], qBC[1]];
    const { team1, team2 } = balanceFour(picked);
    return {
      team1,
      team2,
      mode: "balanced",
      reason: "Formasi seimbang: 2 Tier A + 2 Tier B/C (pilih yang paling sedikit main).",
    };
  }

  // Fallback: fairness murni. Ambil 4 pemain paling sedikit main.
  // Ini otomatis alternate saat salah satu tier tipis:
  //   Contoh 2A + 6BC (semua games=0):
  //   - Round 1: pilih 2A+2BC (semua games=0, ambil by wait)
  //   - Round 2: 4 BC yang belum main (games=0) menang priority → all-BC game
  //   - Round 3: sisanya (games=1) equal → default kembali ke 2A+2BC by wait
  // Hasil: A player istirahat setiap 2 game sekali, BC player rotate merata.
  const picked = fairSorted.slice(0, 4);
  const { team1, team2 } = balanceFour(picked);
  const mode = detectMode(picked);

  let reason: string;
  if (mode === "a-only") {
    reason = "Antrean B/C kosong/tipis — 4 pemain Tier A yang paling jarang main.";
  } else if (mode === "bc-only") {
    reason = "Antrean A tipis — 4 pemain B/C yang paling jarang main. A players istirahat game ini.";
  } else if (mode === "balanced") {
    reason = "2 Tier A + 2 Tier B/C (dipilih dari pemain paling jarang main).";
  } else {
    reason = "Komposisi campur — pilih 4 pemain paling jarang main.";
  }

  return { team1, team2, mode, reason };
}

/**
 * Proyeksi match berikutnya. Kalau tidak ada match aktif, sama dengan pickNextMatch.
 * Kalau ada match aktif: simulasikan 4 pemain di lapangan sudah selesai (games+1,
 * queue_joined_at = sekarang) — mereka jadi paling belakang. Return preview siapa
 * yang akan main setelah match ini kelar.
 */
export function projectNextMatch(
  players: Player[],
  current: CurrentMatch | null,
): QueueSelection | null {
  if (!current) return pickNextMatch(players);

  const onCourtOrder = [...current.team1_ids, ...current.team2_ids];
  const now = Date.now();
  const projected: Player[] = players.map(p => {
    const idx = onCourtOrder.indexOf(p.id);
    if (idx === -1) return p;
    return {
      ...p,
      games_played: p.games_played + 1,
      queue_joined_at: p.is_present ? new Date(now + idx).toISOString() : null,
    };
  });
  return pickNextMatch(projected);
}
