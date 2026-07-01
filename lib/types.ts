export type Tier = "A" | "B" | "C";

export type ScoreMode = "rally" | "traditional";

export type MatchMode = "balanced" | "a-only" | "bc-only" | "mixed";

export interface Player {
  id: string;
  name: string;
  tier: Tier;
  is_present: boolean;
  queue_joined_at: string | null;
  games_played: number;
  created_at: string;
}

export interface TeamSnapshotEntry {
  id: string;
  name: string;
  tier: Tier;
}

export interface CurrentMatch {
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
  current_game: number;
  games: number[][];
  score1: number;
  score2: number;
  server_team: number | null;
  server_number: number | null;
  started_at: string;
  match_mode?: MatchMode;
}

export interface MatchHistory {
  id: string;
  team1_snapshot: TeamSnapshotEntry[];
  team2_snapshot: TeamSnapshotEntry[];
  score_mode: ScoreMode;
  target_points: number;
  cap_points: number;
  win_by_two: boolean;
  best_of: number;
  games: number[][];
  winner_team: number | null;
  match_mode: MatchMode | null;
  finished_at: string;
}
