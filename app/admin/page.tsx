import { fetchCurrentMatch, fetchHistory, fetchLastMatchMode, fetchPlayers } from "@/lib/data";
import { pickNextMatch } from "@/lib/queue-engine";
import AdminClient from "./AdminClient";
import type { MatchMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [players, current, history, lastMode] = await Promise.all([
    fetchPlayers(),
    fetchCurrentMatch(),
    fetchHistory(15),
    fetchLastMatchMode(),
  ]);

  const preview = current ? null : pickNextMatch(players, lastMode as MatchMode | null);

  return (
    <AdminClient
      initialPlayers={players}
      initialCurrent={current}
      initialHistory={history}
      initialPreview={preview}
    />
  );
}
