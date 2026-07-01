import type { CurrentMatch, ScoreMode, TeamSnapshotEntry } from "./types";

export interface ScorePreset {
  key: string;
  label: string;
  score_mode: ScoreMode;
  target_points: number;
  cap_points: number;
  win_by_two: boolean;
  best_of: number;
}

export const SCORE_PRESETS: ScorePreset[] = [
  {
    key: "rally21",
    label: "Rally 21 (BWF standar)",
    score_mode: "rally",
    target_points: 21,
    cap_points: 30,
    win_by_two: true,
    best_of: 3,
  },
  {
    key: "rally15",
    label: "Rally 15 (short game)",
    score_mode: "rally",
    target_points: 15,
    cap_points: 21,
    win_by_two: true,
    best_of: 3,
  },
  {
    key: "traditional30",
    label: "Klasik 30 (serve-based, double point)",
    score_mode: "traditional",
    target_points: 30,
    cap_points: 30,
    win_by_two: false,
    best_of: 1,
  },
  {
    key: "traditional15",
    label: "Klasik 15 (serve-based, doubles lama)",
    score_mode: "traditional",
    target_points: 15,
    cap_points: 15,
    win_by_two: false,
    best_of: 3,
  },
];

export interface MatchInit {
  id: string;
  team1_ids: string[];
  team2_ids: string[];
  team1_snapshot: TeamSnapshotEntry[];
  team2_snapshot: TeamSnapshotEntry[];
  score_mode: ScoreMode;
  target_points: number;
  cap_points: number;
  win_by_two: boolean;
  best_of: number;
  match_mode?: CurrentMatch["match_mode"];
}

export function createMatchState(init: MatchInit): CurrentMatch {
  return {
    ...init,
    current_game: 1,
    games: [],
    score1: 0,
    score2: 0,
    server_team: init.score_mode === "traditional" ? 1 : null,
    server_number: init.score_mode === "traditional" ? 1 : null,
    started_at: new Date().toISOString(),
  };
}

/**
 * Terapkan hasil rally. Team pemenang rally dikasih ke sini (1 atau 2).
 *
 * Rally mode: winner rally = +1 point ke tim tersebut.
 *
 * Traditional (serve-based):
 *   - Kalau winner = server_team → server dapat 1 point, server tetap (serve number tidak berubah untuk scoring)
 *   - Kalau winner ≠ server_team:
 *       - server_number === 1 → pindah ke serve 2 tim yang sama, POIN TIDAK BERUBAH
 *       - server_number === 2 → pindah ke serve 1 tim lawan, POIN TIDAK BERUBAH
 */
export function applyRally(state: CurrentMatch, winningTeam: 1 | 2): CurrentMatch {
  if (isMatchOver(state)) return state;

  const s: CurrentMatch = { ...state, games: [...state.games] };

  if (s.score_mode === "traditional") {
    if (winningTeam === s.server_team) {
      if (winningTeam === 1) s.score1 += 1;
      else s.score2 += 1;
    } else {
      if (s.server_number === 1) {
        s.server_number = 2;
      } else {
        s.server_team = winningTeam;
        s.server_number = 1;
      }
    }
  } else {
    if (winningTeam === 1) s.score1 += 1;
    else s.score2 += 1;
  }

  return checkGameEnd(s);
}

/**
 * Cek apakah game saat ini selesai. Kalau ya, push ke history + reset skor game
 * (kecuali match sudah menang total).
 */
function checkGameEnd(s: CurrentMatch): CurrentMatch {
  const gw = gameWinner(s);
  if (!gw) return s;

  const games = [...s.games, [s.score1, s.score2]];
  const w1 = games.filter(g => g[0] > g[1]).length;
  const w2 = games.filter(g => g[1] > g[0]).length;
  const need = Math.ceil(s.best_of / 2);

  if (w1 >= need || w2 >= need) {
    return { ...s, games };
  }

  return {
    ...s,
    games,
    current_game: s.current_game + 1,
    score1: 0,
    score2: 0,
    server_team: s.score_mode === "traditional" ? gw : null,
    server_number: s.score_mode === "traditional" ? 1 : null,
  };
}

function gameWinner(s: CurrentMatch): 1 | 2 | null {
  const { score1, score2, target_points, cap_points, win_by_two } = s;

  if (score1 >= cap_points && score1 > score2) return 1;
  if (score2 >= cap_points && score2 > score1) return 2;

  if (win_by_two) {
    if (score1 >= target_points && score1 - score2 >= 2) return 1;
    if (score2 >= target_points && score2 - score1 >= 2) return 2;
  } else {
    if (score1 >= target_points && score1 > score2) return 1;
    if (score2 >= target_points && score2 > score1) return 2;
  }
  return null;
}

export function matchWinner(s: CurrentMatch): 1 | 2 | null {
  const need = Math.ceil(s.best_of / 2);
  const w1 = s.games.filter(g => g[0] > g[1]).length;
  const w2 = s.games.filter(g => g[1] > g[0]).length;
  if (w1 >= need) return 1;
  if (w2 >= need) return 2;
  return null;
}

export function isMatchOver(s: CurrentMatch): boolean {
  return matchWinner(s) !== null;
}

export function gamesWonByTeam(s: CurrentMatch): [number, number] {
  const w1 = s.games.filter(g => g[0] > g[1]).length;
  const w2 = s.games.filter(g => g[1] > g[0]).length;
  return [w1, w2];
}
