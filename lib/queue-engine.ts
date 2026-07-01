import type { CurrentMatch, Player, Tier, MatchMode } from "./types";

export interface QueueSelection {
  team1: string[];
  team2: string[];
  mode: MatchMode;
  reason: string;
}

/** Skor tier untuk balancing dalam 4 pemain. A=3, B=2, C=1. */
function tierScore(tier: Tier): number {
  return tier === "A" ? 3 : tier === "B" ? 2 : 1;
}

/**
 * Cross-pair 4 pemain: terkuat + terlemah vs 2 tengah.
 * Menghasilkan pertandingan paling seimbang secara skill dalam 4 orang tsb.
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

interface Candidate {
  mode: MatchMode;
  picked: Player[];
  totalGames: number;
}

/**
 * Algoritma matchmaking BALANCED-FIRST.
 *
 * Setiap round, enumerate opsi feasible dan pilih yang paling adil:
 *   - `balanced` (2A + 2BC) : perlu qA≥2 dan qBC≥2 — dari tiap tier ambil yang paling jarang main
 *   - `a-only`   (4A)       : perlu qA≥4 — 4 A yang paling jarang main
 *   - `bc-only`  (4BC)      : perlu qBC≥4 — 4 BC yang paling jarang main
 *
 * TIDAK PERNAH menghasilkan 3A+1BC atau 1A+3BC — kedua komposisi itu selalu timpang.
 *
 * Pilih kandidat dengan `totalGames` (jumlah games_played 4 orang tsb) terkecil.
 * Ini otomatis:
 *   1. Prioritaskan pemain paling jarang main (equal opportunity)
 *   2. Selama masih bisa balanced, dia dipilih (karena ties broken toward "balanced" first)
 *   3. Kalau salah satu tier "kelebihan main" relatif, single-tier match yang cocok naik prioritas
 *
 * Return null hanya kalau memang tidak ada kombinasi 4 orang yang bisa membentuk tim seimbang.
 */
export function pickNextMatch(
  present: Player[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lastMode: MatchMode | null = null,
): QueueSelection | null {
  const fair = fairSortedQueue(present);
  if (fair.length < 4) return null;

  const { qA, qBC } = splitTiers(fair);

  const candidates: Candidate[] = [];

  if (qA.length >= 2 && qBC.length >= 2) {
    const picked = [qA[0], qA[1], qBC[0], qBC[1]];
    candidates.push({
      mode: "balanced",
      picked,
      totalGames: picked.reduce((s, p) => s + p.games_played, 0),
    });
  }
  if (qA.length >= 4) {
    const picked = qA.slice(0, 4);
    candidates.push({
      mode: "a-only",
      picked,
      totalGames: picked.reduce((s, p) => s + p.games_played, 0),
    });
  }
  if (qBC.length >= 4) {
    const picked = qBC.slice(0, 4);
    candidates.push({
      mode: "bc-only",
      picked,
      totalGames: picked.reduce((s, p) => s + p.games_played, 0),
    });
  }

  if (candidates.length === 0) return null;

  // Sort by totalGames ASC; stable order preserves preference: balanced > a-only > bc-only when tied.
  // Balanced first because it uses BOTH tier queues → paling variatif, paling representatif.
  candidates.sort((a, b) => a.totalGames - b.totalGames);
  const chosen = candidates[0];
  const { team1, team2 } = balanceFour(chosen.picked);

  const reasonMap: Record<MatchMode, string> = {
    balanced: "Formasi seimbang: 2 Tier A + 2 Tier B/C (dari pemain paling jarang main).",
    "a-only": "Semua Tier A yang paling jarang main. Tier B/C istirahat game ini supaya semua adil.",
    "bc-only": "Semua Tier B/C yang paling jarang main. Tier A istirahat game ini supaya semua adil.",
    mixed: "Komposisi terbatas.",
  };

  return {
    team1,
    team2,
    mode: chosen.mode,
    reason: reasonMap[chosen.mode],
  };
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
