"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { gamesWonByTeam, matchWinner as computeMatchWinner } from "@/lib/score-engine";
import type { QueueSelection } from "@/lib/queue-engine";
import type { CurrentMatch, MatchHistory, Player, Tier } from "@/lib/types";

const TIER_BADGE: Record<Tier, string> = {
  A: "bg-yellow-400/20 text-yellow-300 border-yellow-400/40",
  B: "bg-sky-400/20 text-sky-300 border-sky-400/40",
  C: "bg-emerald-400/20 text-emerald-300 border-emerald-400/40",
};

const TIER_LABEL: Record<Tier, string> = {
  A: "Mahir",
  B: "Menengah",
  C: "Pemula",
};

function fairSort(a: Player, b: Player): number {
  if (a.games_played !== b.games_played) return a.games_played - b.games_played;
  return (a.queue_joined_at ?? "") < (b.queue_joined_at ?? "") ? -1 : 1;
}

interface Props {
  initialPlayers: Player[];
  initialCurrent: CurrentMatch | null;
  initialHistory: MatchHistory[];
  initialPreview: QueueSelection | null;
}

export default function ViewerClient({
  initialPlayers,
  initialCurrent,
  initialHistory,
  initialPreview,
}: Props) {
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel("mabar-viewer-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "current_match" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const players = initialPlayers;
  const current = initialCurrent;
  const history = initialHistory;
  const preview = initialPreview;
  const pById = new Map(players.map(p => [p.id, p]));

  const presentPlayers = players.filter(p => p.is_present);
  const onCourt = current ? [...current.team1_ids, ...current.team2_ids] : [];
  const queueA = presentPlayers
    .filter(p => p.tier === "A" && p.queue_joined_at)
    .sort(fairSort);
  const queueBC = presentPlayers
    .filter(p => (p.tier === "B" || p.tier === "C") && p.queue_joined_at)
    .sort(fairSort);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full font-bold">
          {presentPlayers.length} Hadir
        </span>
        <span className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-3 py-1 rounded-full font-bold">
          {queueA.length} Antrean A
        </span>
        <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 px-3 py-1 rounded-full font-bold">
          {queueBC.length} Antrean B/C
        </span>
        {onCourt.length > 0 && (
          <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-3 py-1 rounded-full font-bold">
            🏟️ {onCourt.length} Di Lapangan
          </span>
        )}
      </div>

      {/* Match */}
      {current ? <ReadOnlyMatch match={current} /> : <ReadOnlyPreview preview={preview} pById={pById} />}

      {/* Next match preview — shown ALWAYS, both idle and during live match */}
      {current && <NextMatchPreview preview={preview} pById={pById} isProjection={true} />}

      {/* Queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReadOnlyQueue label="🏅 Antrean Tier A" list={queueA} />
        <ReadOnlyQueue label="🎯 Antrean Tier B/C" list={queueBC} />
      </div>

      {/* Present players list */}
      <PresentList players={presentPlayers} onCourt={onCourt} />

      {/* History */}
      {history.length > 0 && (
        <div className="bg-slate-900 rounded-2xl border border-white/10 p-4">
          <h2 className="font-bold text-slate-200 text-sm mb-3">📜 5 Match Terakhir</h2>
          <div className="space-y-3">
            {history.map(h => (
              <MatchHistoryCard key={h.id} h={h} />
            ))}
          </div>
        </div>
      )}

      <p className="text-slate-600 text-xs text-center pt-2">
        Halaman ini update otomatis begitu admin ubah state.
      </p>
    </div>
  );
}

// ============================================================
// Present players list — grouped by tier, show who's where
// ============================================================
function PresentList({ players, onCourt }: { players: Player[]; onCourt: string[] }) {
  if (players.length === 0) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-white/10 p-4">
        <h2 className="font-bold text-slate-200 text-sm mb-2">👥 Hadir Hari Ini</h2>
        <p className="text-slate-600 text-xs italic">Belum ada yang tandai hadir.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-slate-200 text-sm">👥 Hadir Hari Ini</h2>
        <span className="text-xs text-slate-500 font-bold">{players.length} orang</span>
      </div>
      <div className="space-y-2.5">
        {(["A", "B", "C"] as Tier[]).map(tier => {
          const group = players.filter(p => p.tier === tier);
          if (group.length === 0) return null;
          return (
            <div key={tier}>
              <p
                className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${
                  tier === "A" ? "text-yellow-400" : tier === "B" ? "text-sky-400" : "text-emerald-400"
                }`}
              >
                Tier {tier} · {TIER_LABEL[tier]} ({group.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group
                  .sort((a, b) => a.games_played - b.games_played)
                  .map(p => {
                    const isCourt = onCourt.includes(p.id);
                    return (
                      <span
                        key={p.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${
                          isCourt
                            ? "bg-orange-500/15 border-orange-400/40 text-orange-200"
                            : "bg-slate-800/80 border-white/10 text-slate-200"
                        }`}
                      >
                        {isCourt && <span className="text-[10px]">🏟️</span>}
                        <span className="font-bold">{p.name}</span>
                        <span className="text-slate-500 text-[10px]">· {p.games_played}×</span>
                      </span>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-slate-600 text-[10px] mt-3 italic">
        Angka setelah nama = jumlah main sesi ini. Sistem prioritas main untuk yang paling sedikit angkanya.
      </p>
    </div>
  );
}

// ============================================================
// Live match display (viewer, read-only)
// ============================================================
function ReadOnlyMatch({ match }: { match: CurrentMatch }) {
  const winner = computeMatchWinner(match);
  const [gw1, gw2] = gamesWonByTeam(match);
  const isTraditional = match.score_mode === "traditional";
  const modeLabel = isTraditional ? "Klasik (Serve-based)" : "Rally";

  const teamPanel = (team: 1 | 2) => {
    const snap = team === 1 ? match.team1_snapshot : match.team2_snapshot;
    const score = team === 1 ? match.score1 : match.score2;
    const isServer = isTraditional && match.server_team === team;
    const isWinner = winner === team;
    const accent = team === 1 ? "blue" : "red";
    return (
      <div
        className={`rounded-2xl p-4 border-2 ${
          isWinner
            ? "bg-yellow-500/20 border-yellow-400"
            : isServer
              ? team === 1 ? "bg-blue-500/20 border-blue-400" : "bg-red-500/20 border-red-400"
              : team === 1 ? "bg-blue-500/5 border-blue-400/20" : "bg-red-500/5 border-red-400/20"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <p className={`text-xs font-black tracking-widest text-${accent}-300`}>TIM {team}</p>
          {isServer && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 font-bold">
              SEDANG SERVICE ({match.server_number})
            </span>
          )}
        </div>
        <div className="space-y-1 mb-3">
          {snap.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <p className="font-black text-white text-sm leading-tight flex-1">{p.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TIER_BADGE[p.tier]}`}>
                {p.tier}
              </span>
            </div>
          ))}
        </div>
        <div className="text-center">
          <div className="font-black text-6xl leading-none font-mono">{score}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-3xl overflow-hidden border border-indigo-500/20 shadow-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="p-4 border-b border-white/5">
        <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">⚡ Sedang Bermain</p>
        <MatchInfoBar
          modeLabel={modeLabel}
          targetPoints={match.target_points}
          winByTwo={match.win_by_two}
          currentGame={match.current_game}
          bestOf={match.best_of}
          gw1={gw1}
          gw2={gw2}
        />
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {teamPanel(1)}
        {teamPanel(2)}
      </div>
      {match.games.length > 0 && (
        <div className="px-4 pb-4">
          <GameProgressStrip
            games={match.games}
            targetPoints={match.target_points}
          />
        </div>
      )}
      {winner && (
        <div className="px-4 pb-4">
          <div className="text-center bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
            <p className="text-yellow-300 font-black text-sm">🏆 Tim {winner} Menang Match</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Preview when no match active
// ============================================================
function ReadOnlyPreview({
  preview,
  pById,
}: {
  preview: QueueSelection | null;
  pById: Map<string, Player>;
}) {
  return (
    <div className="rounded-3xl overflow-hidden border border-indigo-500/20 shadow-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6">
      <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-4">⏸ Lapangan Kosong</p>
      <div className="text-center">
        <div className="text-5xl mb-3">🏸</div>
        {preview ? (
          <>
            <p className="text-slate-400 text-sm mb-4">Menunggu admin mulai match. 4 pemain berikutnya:</p>
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-3">
                <p className="text-blue-300 font-black text-xs mb-2">TIM 1</p>
                {preview.team1.map(id => {
                  const p = pById.get(id);
                  return (
                    <p key={id} className="font-bold text-sm">
                      {p?.name} <span className="text-xs text-slate-500">({p?.tier})</span>
                    </p>
                  );
                })}
              </div>
              <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-3">
                <p className="text-red-300 font-black text-xs mb-2">TIM 2</p>
                {preview.team2.map(id => {
                  const p = pById.get(id);
                  return (
                    <p key={id} className="font-bold text-sm">
                      {p?.name} <span className="text-xs text-slate-500">({p?.tier})</span>
                    </p>
                  );
                })}
              </div>
            </div>
            <p className="text-slate-500 text-xs mt-3 italic">{preview.reason}</p>
          </>
        ) : (
          <p className="text-slate-500 text-sm">Belum cukup pemain di antrean (butuh min. 4 orang).</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Next-match preview card (compact, shown during live match)
// ============================================================
export function NextMatchPreview({
  preview,
  pById,
  isProjection,
}: {
  preview: QueueSelection | null;
  pById: Map<string, Player>;
  isProjection: boolean;
}) {
  if (!preview) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-white/10 p-4">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
          ⏭ Match Berikutnya
        </p>
        <p className="text-slate-500 text-xs italic">
          Butuh minimal 4 pemain tersedia (termasuk yang di lapangan sekarang saat match ini selesai).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-indigo-500/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest">
          ⏭ Match Berikutnya
        </p>
        {isProjection && (
          <span className="text-[10px] text-slate-500 italic">
            proyeksi setelah match ini selesai
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-3">
          <p className="text-blue-300 font-black text-[10px] mb-1.5 tracking-widest">TIM 1</p>
          {preview.team1.map(id => {
            const p = pById.get(id);
            return (
              <div key={id} className="flex items-center gap-2">
                <p className="font-bold text-sm">{p?.name}</p>
                {p?.tier && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${TIER_BADGE[p.tier]}`}>
                    {p.tier}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <span className="text-slate-500 font-black text-xs">VS</span>
        <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-3">
          <p className="text-red-300 font-black text-[10px] mb-1.5 tracking-widest">TIM 2</p>
          {preview.team2.map(id => {
            const p = pById.get(id);
            return (
              <div key={id} className="flex items-center gap-2">
                <p className="font-bold text-sm">{p?.name}</p>
                {p?.tier && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${TIER_BADGE[p.tier]}`}>
                    {p.tier}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-slate-500 text-[11px] mt-2 italic">{preview.reason}</p>
    </div>
  );
}

// ============================================================
// Queue view: shows fair-sort order (games_played, join_time)
// ============================================================
function ReadOnlyQueue({ label, list }: { label: string; list: Player[] }) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-slate-200">{label}</h3>
        <span className="text-xs text-slate-500 font-bold">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-slate-600 text-xs italic">Kosong.</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-800/60 border-transparent"
            >
              <span className="text-xs font-black w-5 text-center text-slate-500">{i + 1}</span>
              <span className="text-sm font-bold flex-1">{p.name}</span>
              <span className="text-[10px] text-slate-500">{p.games_played}× main</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TIER_BADGE[p.tier]}`}>
                {p.tier}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Readable match info bar
// ============================================================
export function MatchInfoBar({
  modeLabel,
  targetPoints,
  winByTwo,
  currentGame,
  bestOf,
  gw1,
  gw2,
}: {
  modeLabel: string;
  targetPoints: number;
  winByTwo: boolean;
  currentGame: number;
  bestOf: number;
  gw1: number;
  gw2: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-white/5">
        <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Mode</p>
        <p className="text-xs font-black text-white">
          {modeLabel} <span className="text-slate-400 font-normal">ke {targetPoints}</span>
        </p>
        {winByTwo && <p className="text-[9px] text-slate-500">win by 2 poin</p>}
      </div>
      <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-white/5">
        <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Game</p>
        <p className="text-xs font-black text-white">
          {currentGame} <span className="text-slate-400 font-normal">/ {bestOf}</span>
        </p>
        <p className="text-[9px] text-slate-500">best of {bestOf}</p>
      </div>
      <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-white/5">
        <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Game Won</p>
        <p className="text-xs font-black text-white font-mono">
          <span className="text-blue-300">{gw1}</span>
          <span className="text-slate-500 mx-1">—</span>
          <span className="text-red-300">{gw2}</span>
        </p>
        <p className="text-[9px] text-slate-500">tim 1 vs 2</p>
      </div>
    </div>
  );
}

// ============================================================
// Live game progress strip: shows finished games clearly
// ============================================================
export function GameProgressStrip({ games }: { games: number[][]; targetPoints?: number }) {
  if (games.length === 0) return null;
  return (
    <div>
      <p className="text-slate-500 text-[10px] uppercase font-bold mb-1.5 tracking-widest">
        Game selesai
      </p>
      <div className="grid grid-cols-1 gap-1">
        {games.map((g, i) => {
          const t1Win = g[0] > g[1];
          return (
            <div
              key={i}
              className="flex items-center gap-2 bg-slate-950/60 rounded-lg px-3 py-1.5 border border-white/5 text-xs"
            >
              <span className="text-slate-500 font-bold">Game {i + 1}</span>
              <span className={`font-mono font-black ${t1Win ? "text-yellow-300" : "text-slate-500"}`}>
                {g[0]}
              </span>
              <span className="text-slate-600">—</span>
              <span className={`font-mono font-black ${!t1Win ? "text-yellow-300" : "text-slate-500"}`}>
                {g[1]}
              </span>
              <span className="text-slate-500 text-[10px] ml-auto">
                Menang: <b>Tim {t1Win ? 1 : 2}</b>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// History card — clear game-by-game breakdown
// ============================================================
export function MatchHistoryCard({ h }: { h: MatchHistory }) {
  const [gw1, gw2] = h.games.reduce(
    (acc, g) => [acc[0] + (g[0] > g[1] ? 1 : 0), acc[1] + (g[1] > g[0] ? 1 : 0)] as [number, number],
    [0, 0] as [number, number],
  );
  const modeLabel = h.score_mode === "traditional" ? "Klasik" : "Rally";
  const dateStr = new Date(h.finished_at).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="bg-slate-800/60 rounded-xl border border-white/5 overflow-hidden">
      {/* Header: winner announcement */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between text-[10px]">
        <span className="text-slate-500 uppercase tracking-widest font-bold">
          {modeLabel} ke {h.target_points} · Best of {h.best_of}
        </span>
        <span className="text-slate-500">{dateStr}</span>
      </div>

      {/* Teams row */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className={h.winner_team === 1 ? "text-yellow-300" : "text-slate-300"}>
          <p className="font-black text-[10px] mb-0.5">
            {h.winner_team === 1 ? "🏆 " : ""}TIM 1
          </p>
          {h.team1_snapshot.map(p => (
            <p key={p.id} className="font-bold text-xs truncate">{p.name}</p>
          ))}
        </div>
        <div className={h.winner_team === 2 ? "text-yellow-300 text-right" : "text-slate-300 text-right"}>
          <p className="font-black text-[10px] mb-0.5">
            TIM 2{h.winner_team === 2 ? " 🏆" : ""}
          </p>
          {h.team2_snapshot.map(p => (
            <p key={p.id} className="font-bold text-xs truncate">{p.name}</p>
          ))}
        </div>
      </div>

      {/* Game-by-game breakdown */}
      <div className="px-3 pb-3 space-y-1">
        {h.games.map((g, i) => {
          const t1Win = g[0] > g[1];
          return (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-2 items-center bg-slate-900/50 rounded-lg px-3 py-1.5 text-xs"
            >
              <span className="text-slate-500 font-bold">Game {i + 1}</span>
              <span className={`text-right font-mono font-black text-base ${t1Win ? "text-yellow-300" : "text-slate-500"}`}>
                {g[0]}
              </span>
              <span className="text-slate-600 font-mono">—</span>
              <span className={`font-mono font-black text-base ${!t1Win ? "text-yellow-300" : "text-slate-500"}`}>
                {g[1]}
              </span>
              <span className="text-slate-500 text-[10px]">
                Tim {t1Win ? 1 : 2} 🏸
              </span>
            </div>
          );
        })}
      </div>

      {/* Final result footer */}
      <div className="bg-slate-900/70 px-3 py-2 flex items-center justify-between text-xs border-t border-white/5">
        <span className="text-slate-500 font-bold">Kemenangan game</span>
        <span className="font-mono font-black">
          <span className={h.winner_team === 1 ? "text-yellow-300" : "text-slate-400"}>{gw1}</span>
          <span className="text-slate-600 mx-1">—</span>
          <span className={h.winner_team === 2 ? "text-yellow-300" : "text-slate-400"}>{gw2}</span>
        </span>
      </div>
    </div>
  );
}
