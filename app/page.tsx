import Link from "next/link";
import { fetchCurrentMatch, fetchHistory, fetchPlayers } from "@/lib/data";
import { projectNextMatch } from "@/lib/queue-engine";
import ViewerClient from "./ViewerClient";

export const dynamic = "force-dynamic";

export default async function ViewerPage() {
  const [players, current, history] = await Promise.all([
    fetchPlayers(),
    fetchCurrentMatch(),
    fetchHistory(5),
  ]);

  const preview = projectNextMatch(players, current);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏸</span>
            <div>
              <div className="text-sm font-black bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                Mabar Kalam Kudus
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Live Board · read-only</div>
            </div>
          </div>
          <Link
            href="/admin"
            className="text-xs px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
          >
            🔐 Admin
          </Link>
        </div>
      </header>

      <ViewerClient
        initialPlayers={players}
        initialCurrent={current}
        initialHistory={history}
        initialPreview={preview}
      />
    </div>
  );
}
