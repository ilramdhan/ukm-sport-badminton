"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SCORE_PRESETS } from "@/lib/score-engine";
import type { QueueSelection } from "@/lib/queue-engine";
import type {
  CurrentMatch,
  MatchHistory,
  Player,
  Tier,
} from "@/lib/types";
import {
  addPlayer,
  applyScore,
  cancelMatch,
  clearAllData,
  clearHistory,
  clearScoreCurrent,
  deletePlayer,
  finishMatch,
  resetSession,
  startMatch,
  togglePresent,
  undoScore,
  updatePlayer,
} from "@/lib/actions";
import { matchWinner as computeMatchWinner, gamesWonByTeam } from "@/lib/score-engine";
import {
  GameProgressStrip,
  MatchHistoryCard,
  MatchInfoBar,
} from "../ViewerClient";

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

type Tab = "court" | "members" | "history";

interface Props {
  initialPlayers: Player[];
  initialCurrent: CurrentMatch | null;
  initialHistory: MatchHistory[];
  initialPreview: QueueSelection | null;
}

export default function AdminClient({
  initialPlayers,
  initialCurrent,
  initialHistory,
  initialPreview,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("court");
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Realtime: refresh from server when tables change
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel("mabar-admin-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "current_match" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Wrap action calls: transition + error catch
  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Terjadi kesalahan.");
      }
    });
  }

  const players = initialPlayers;
  const current = initialCurrent;
  const history = initialHistory;
  const preview = initialPreview;

  const fairSort = (a: Player, b: Player) => {
    if (a.games_played !== b.games_played) return a.games_played - b.games_played;
    return (a.queue_joined_at ?? "") < (b.queue_joined_at ?? "") ? -1 : 1;
  };
  const presentPlayers = players.filter(p => p.is_present);
  const queueA = presentPlayers
    .filter(p => p.tier === "A" && p.queue_joined_at)
    .sort(fairSort);
  const queueBC = presentPlayers
    .filter(p => (p.tier === "B" || p.tier === "C") && p.queue_joined_at)
    .sort(fairSort);
  const onCourt = current ? [...current.team1_ids, ...current.team2_ids] : [];
  const matchDone = current ? computeMatchWinner(current) : null;

  return (
    <div className="text-white">
      {/* STATS BAR */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full font-bold">
            {presentPlayers.length} Hadir
          </span>
          <span className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-3 py-1 rounded-full font-bold">
            {queueA.length} Antrean A
          </span>
          <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 px-3 py-1 rounded-full font-bold">
            {queueBC.length} Antrean B/C
          </span>
        </div>
      </div>

      {/* TAB NAV */}
      <div className="max-w-3xl mx-auto px-4 pt-3">
        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-white/10 w-fit">
          {([
            ["court", "🏟️ Lapangan"],
            ["members", "👥 Anggota"],
            ["history", "📜 Riwayat"],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === t ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="max-w-3xl mx-auto px-4 mt-3">
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-3 py-2 flex justify-between">
            <span>{err}</span>
            <button onClick={() => setErr(null)} className="text-red-400 font-black">×</button>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* ============ TAB: LAPANGAN ============ */}
        {tab === "court" && (
          <>
            {current ? (
              <LiveMatch
                match={current}
                matchDone={matchDone}
                isPending={isPending}
                onApply={t => run(() => applyScore(t))}
                onUndo={() => run(() => undoScore())}
                onFinish={() => run(() => finishMatch())}
                onCancel={() => run(() => cancelMatch())}
                onClearScore={() => run(() => clearScoreCurrent())}
              />
            ) : (
              <EmptyCourt
                preview={preview}
                players={players}
                isPending={isPending}
                onStart={key => run(() => startMatch(key))}
              />
            )}

            <QueueView queueA={queueA} queueBC={queueBC} onCourt={onCourt} />
          </>
        )}

        {/* ============ TAB: ANGGOTA ============ */}
        {tab === "members" && (
          <MembersTab
            players={players}
            onCourt={onCourt}
            isPending={isPending}
            onAdd={(name, tier) => run(() => addPlayer(name, tier))}
            onUpdate={(id, patch) => run(() => updatePlayer(id, patch))}
            onDelete={id => run(() => deletePlayer(id))}
            onToggle={id => run(() => togglePresent(id))}
            onResetSession={() => {
              if (confirm("Reset sesi? Semua kehadiran + antrean di-clear, games_played reset ke 0.")) {
                run(() => resetSession());
              }
            }}
            onClearAll={() => {
              if (confirm("HAPUS SEMUA DATA (pemain, match aktif, riwayat)? Tidak bisa di-undo.")) {
                run(() => clearAllData());
              }
            }}
          />
        )}

        {/* ============ TAB: RIWAYAT ============ */}
        {tab === "history" && (
          <HistoryTab
            history={history}
            isPending={isPending}
            onClear={() => {
              if (confirm("Hapus semua riwayat match? Statistik hilang.")) {
                run(() => clearHistory());
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Empty court: preview + preset selector + start button
// ============================================================
function EmptyCourt({
  preview,
  players,
  isPending,
  onStart,
}: {
  preview: QueueSelection | null;
  players: Player[];
  isPending: boolean;
  onStart: (presetKey: string) => void;
}) {
  const [presetKey, setPresetKey] = useState(SCORE_PRESETS[0].key);
  const pById = new Map(players.map(p => [p.id, p]));
  const selectedPreset = SCORE_PRESETS.find(p => p.key === presetKey)!;

  return (
    <div className="rounded-3xl overflow-hidden border border-indigo-500/20 shadow-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6">
      <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-4">⚡ Live Lapangan</p>
      <div className="text-center">
        <div className="text-5xl mb-3">🏸</div>
        <p className="text-slate-400 text-sm mb-4">Lapangan kosong. Siap mulai pertandingan berikutnya.</p>

        <div className="space-y-3">
          <div className="text-left">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-widest">Mode Skor</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {SCORE_PRESETS.map(p => {
                const active = p.key === presetKey;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPresetKey(p.key)}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      active
                        ? "bg-indigo-500/20 border-indigo-400 shadow-lg shadow-indigo-500/20"
                        : "bg-slate-800/60 border-white/10 hover:border-white/30"
                    }`}
                  >
                    <p className={`text-sm font-black ${active ? "text-white" : "text-slate-200"}`}>
                      {p.label}
                    </p>
                    <p className={`text-[11px] mt-1 leading-snug ${active ? "text-indigo-200" : "text-slate-500"}`}>
                      {p.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-600 mt-2 italic">
              Terpilih: <b className="text-slate-400">{selectedPreset.label}</b>
            </p>
          </div>

          {preview ? (
            <div className="text-left bg-slate-950/60 rounded-xl p-3 border border-indigo-500/20">
              <p className="text-indigo-300 text-xs font-bold mb-2">Preview 4 pemain berikutnya:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-blue-300 font-black text-xs mb-1">TIM 1</p>
                  {preview.team1.map(id => {
                    const p = pById.get(id);
                    return (
                      <p key={id} className="font-bold">
                        {p?.name} <span className="text-xs text-slate-500">({p?.tier})</span>
                      </p>
                    );
                  })}
                </div>
                <div>
                  <p className="text-red-300 font-black text-xs mb-1">TIM 2</p>
                  {preview.team2.map(id => {
                    const p = pById.get(id);
                    return (
                      <p key={id} className="font-bold">
                        {p?.name} <span className="text-xs text-slate-500">({p?.tier})</span>
                      </p>
                    );
                  })}
                </div>
              </div>
              <p className="text-slate-500 text-xs mt-2 italic">{preview.reason}</p>
            </div>
          ) : (
            <div className="text-left bg-slate-950/60 rounded-xl p-3 border border-orange-500/20">
              <p className="text-orange-300 text-xs">
                ⚠️ Butuh minimal 4 pemain di antrean. Toggle kehadiran di tab <b>Anggota</b>.
              </p>
            </div>
          )}

          <button
            onClick={() => onStart(presetKey)}
            disabled={!preview || isPending}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-black py-4 rounded-2xl shadow-xl transition-all text-base"
          >
            🎮 Mulai Pertandingan
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Live match with score input
// ============================================================
function LiveMatch({
  match,
  matchDone,
  isPending,
  onApply,
  onUndo,
  onFinish,
  onCancel,
  onClearScore,
}: {
  match: CurrentMatch;
  matchDone: 1 | 2 | null;
  isPending: boolean;
  onApply: (team: 1 | 2) => void;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onClearScore: () => void;
}) {
  const [gw1, gw2] = gamesWonByTeam(match);
  const isTraditional = match.score_mode === "traditional";
  const modeLabel = isTraditional ? "Klasik (Serve-based)" : "Rally";

  const teamPanel = (team: 1 | 2) => {
    const snap = team === 1 ? match.team1_snapshot : match.team2_snapshot;
    const score = team === 1 ? match.score1 : match.score2;
    const isServer = isTraditional && match.server_team === team;
    const isWinner = matchDone === team;
    const accent = team === 1 ? "blue" : "red";
    return (
      <div
        className={`relative rounded-2xl p-4 border-2 transition-all ${
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
        <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">⚡ Live Lapangan</p>
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
        <div className="px-4 pb-3">
          <GameProgressStrip games={match.games} targetPoints={match.target_points} />
        </div>
      )}

      {/* Score action buttons */}
      {matchDone ? (
        <div className="p-4 border-t border-white/5 bg-slate-900/60">
          <div className="text-center mb-3">
            <div className="text-4xl mb-1">🏆</div>
            <p className="text-yellow-300 font-black text-lg">Tim {matchDone} Menang Match!</p>
            <p className="text-slate-400 text-xs">
              {(matchDone === 1 ? match.team1_snapshot : match.team2_snapshot).map(p => p.name).join(" & ")}
            </p>
          </div>
          <button
            onClick={onFinish}
            disabled={isPending}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-40 font-black py-4 rounded-2xl transition-all text-base"
          >
            ✅ Simpan & Selesai — 4 pemain kembali ke belakang antrean
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-white/5 bg-slate-900/60 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onApply(1)}
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 font-black py-5 rounded-2xl text-lg transition-all"
            >
              {isTraditional && match.server_team === 1 ? "+1 Serve" : match.score_mode === "rally" ? "+1 Tim 1" : "Tim 1 menang rally"}
            </button>
            <button
              onClick={() => onApply(2)}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 font-black py-5 rounded-2xl text-lg transition-all"
            >
              {isTraditional && match.server_team === 2 ? "+1 Serve" : match.score_mode === "rally" ? "+1 Tim 2" : "Tim 2 menang rally"}
            </button>
          </div>
          {isTraditional && (
            <p className="text-slate-500 text-[11px] text-center italic">
              Klik pada tim yang <b>menang rally</b>. Kalau bukan tim server → serve pindah (tanpa point).
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onUndo}
              disabled={isPending}
              className="bg-slate-800 hover:bg-slate-700 border border-white/10 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40"
            >
              ↶ Undo
            </button>
            <button
              onClick={() => {
                if (confirm("Clear skor match ini (kembalikan ke 0-0, hapus game history)?")) onClearScore();
              }}
              disabled={isPending}
              className="bg-slate-800 hover:bg-slate-700 border border-white/10 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40"
            >
              Clear Skor
            </button>
            <button
              onClick={() => {
                if (confirm("Batalkan match ini? Pemain kembali ke depan antrean. Skor tidak tersimpan.")) onCancel();
              }}
              disabled={isPending}
              className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40"
            >
              Batal
            </button>
          </div>
          <button
            onClick={() => {
              if (confirm("Selesaikan match sekarang tanpa capai target?")) onFinish();
            }}
            disabled={isPending}
            className="w-full bg-green-600/70 hover:bg-green-500/80 border border-green-400/30 font-bold py-3 rounded-xl text-sm disabled:opacity-40"
          >
            Selesai Sekarang (skor apa adanya)
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Queue view: dual FIFO
// ============================================================
function QueueView({
  queueA,
  queueBC,
  onCourt,
}: {
  queueA: Player[];
  queueBC: Player[];
  onCourt: string[];
}) {
  const renderQueue = (label: string, list: Player[]) => (
    <div className="bg-slate-900 rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-slate-200">{label}</h3>
        <span className="text-xs text-slate-500 font-bold">{list.length} orang</span>
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

  return (
    <>
      {onCourt.length > 0 && (
        <p className="text-slate-500 text-xs italic px-1">
          🏟️ {onCourt.length} pemain sedang di lapangan (di luar antrean).
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderQueue("🏅 Antrean Tier A", queueA)}
        {renderQueue("🎯 Antrean Tier B/C", queueBC)}
      </div>
      <p className="text-slate-500 text-[11px] italic px-1">
        Urut dari yang <b>paling sedikit main</b>. Ties di-break berdasar waktu tunggu.
      </p>
    </>
  );
}

// ============================================================
// Members tab
// ============================================================
function MembersTab({
  players,
  onCourt,
  isPending,
  onAdd,
  onUpdate,
  onDelete,
  onToggle,
  onResetSession,
  onClearAll,
}: {
  players: Player[];
  onCourt: string[];
  isPending: boolean;
  onAdd: (name: string, tier: Tier) => void;
  onUpdate: (id: string, patch: { name?: string; tier?: Tier }) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onResetSession: () => void;
  onClearAll: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<Tier>("B");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTier, setEditTier] = useState<Tier>("B");

  return (
    <>
      {/* Add player */}
      <div className="bg-slate-900 rounded-2xl border border-white/10 p-5">
        <h2 className="font-bold mb-3 text-slate-200 text-sm">➕ Tambah Anggota</h2>
        <div className="flex gap-2 flex-col sm:flex-row">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && newName.trim()) {
                onAdd(newName.trim(), newTier);
                setNewName("");
              }
            }}
            placeholder="Nama pemain..."
            className="flex-1 min-w-0 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-indigo-500"
          />
          <select
            value={newTier}
            onChange={e => setNewTier(e.target.value as Tier)}
            className="bg-slate-800 border border-white/10 rounded-xl px-3 py-3 text-base outline-none focus:border-indigo-500"
          >
            <option value="A">Tier A – Mahir</option>
            <option value="B">Tier B – Menengah</option>
            <option value="C">Tier C – Pemula</option>
          </select>
          <button
            onClick={() => {
              if (!newName.trim()) return;
              onAdd(newName.trim(), newTier);
              setNewName("");
            }}
            disabled={isPending || !newName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-bold px-5 py-3 rounded-xl transition-all"
          >
            Tambah
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-slate-900 rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-slate-200 text-sm">👥 Anggota ({players.length})</h2>
        </div>
        <p className="text-slate-500 text-xs mb-4">
          Toggle hadir/absen. Yang hadir masuk antrean (tier-nya) otomatis.
        </p>

        {players.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-8">Belum ada anggota.</p>
        ) : (
          <div className="space-y-3">
            {(["A", "B", "C"] as Tier[]).map(tier => {
              const group = players.filter(p => p.tier === tier);
              if (group.length === 0) return null;
              return (
                <div key={tier}>
                  <p
                    className={`text-xs font-black mb-1.5 ${
                      tier === "A" ? "text-yellow-400" : tier === "B" ? "text-sky-400" : "text-emerald-400"
                    }`}
                  >
                    TIER {tier} · {TIER_LABEL[tier]} ({group.length})
                  </p>
                  {group.map(p => {
                    const isCourt = onCourt.includes(p.id);
                    const isEditing = editingId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-1.5 ${
                          isCourt
                            ? "bg-yellow-500/10 border-yellow-500/30"
                            : p.is_present
                              ? "bg-indigo-500/10 border-indigo-500/20"
                              : "bg-slate-800/60 border-transparent"
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isCourt ? "bg-yellow-400" : p.is_present ? "bg-green-400" : "bg-slate-700"
                          }`}
                        />
                        {isEditing ? (
                          <>
                            <input
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="flex-1 min-w-0 bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                            />
                            <select
                              value={editTier}
                              onChange={e => setEditTier(e.target.value as Tier)}
                              className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none"
                            >
                              <option value="A">A</option>
                              <option value="B">B</option>
                              <option value="C">C</option>
                            </select>
                            <button
                              onClick={() => {
                                onUpdate(p.id, { name: editName, tier: editTier });
                                setEditingId(null);
                              }}
                              className="text-green-400 text-xs font-bold px-2"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-slate-500 text-xs font-bold px-1"
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm">{p.name}</p>
                              <p className="text-slate-600 text-[10px]">{p.games_played}× main sesi ini</p>
                            </div>
                            {isCourt && <span className="text-yellow-400 text-[10px] font-bold">🏟️ Court</span>}
                            {!isCourt && (
                              <button
                                onClick={() => onToggle(p.id)}
                                disabled={isPending}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${
                                  p.is_present
                                    ? "bg-green-500 text-white"
                                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                }`}
                              >
                                {p.is_present ? "✓ Hadir" : "Absen"}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEditingId(p.id);
                                setEditName(p.name);
                                setEditTier(p.tier);
                              }}
                              className="text-slate-500 hover:text-indigo-300 text-xs px-1"
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Hapus ${p.name}?`)) onDelete(p.id);
                              }}
                              disabled={isPending}
                              className="text-slate-700 hover:text-red-400 text-lg leading-none px-1 disabled:opacity-40"
                              title="Hapus"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Danger */}
      <div className="bg-slate-900 rounded-2xl border border-red-500/20 p-5">
        <h2 className="font-bold mb-2 text-red-300 text-sm">⚠️ Zona Bahaya</h2>
        <p className="text-slate-500 text-xs mb-3">Aksi berikut tidak bisa di-undo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={onResetSession}
            disabled={isPending}
            className="bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40"
          >
            Reset Sesi Hari Ini
          </button>
          <button
            onClick={onClearAll}
            disabled={isPending}
            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40"
          >
            Hapus SEMUA Data
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// History tab
// ============================================================
function HistoryTab({
  history,
  isPending,
  onClear,
}: {
  history: MatchHistory[];
  isPending: boolean;
  onClear: () => void;
}) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-200 text-sm">📜 Riwayat ({history.length})</h2>
        {history.length > 0 && (
          <button
            onClick={onClear}
            disabled={isPending}
            className="text-xs text-red-400 hover:text-red-300 border border-red-400/20 px-3 py-1 rounded-lg disabled:opacity-40"
          >
            Clear Riwayat
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className="text-slate-600 text-sm text-center py-6">Belum ada match selesai.</p>
      ) : (
        <div className="space-y-3">
          {history.map(h => <MatchHistoryCard key={h.id} h={h} />)}
        </div>
      )}
    </div>
  );
}
