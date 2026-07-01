import { fetchCurrentMatch, fetchHistory, fetchPlayers } from "@/lib/data";
import { projectNextMatch } from "@/lib/queue-engine";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [players, current, history] = await Promise.all([
    fetchPlayers(),
    fetchCurrentMatch(),
    fetchHistory(100),
  ]);

  const preview = projectNextMatch(players, current);

  return (
    <AdminClient
      initialPlayers={players}
      initialCurrent={current}
      initialHistory={history}
      initialPreview={preview}
    />
  );
}
