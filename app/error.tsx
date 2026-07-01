"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = error.message || "";
  const isSetupError =
    msg.includes("does not exist") ||
    msg.includes("Could not find") ||
    msg.toLowerCase().includes("schema cache") ||
    msg.includes("relation");

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("App error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4">
        {isSetupError ? (
          <>
            <div className="text-4xl">🛠️</div>
            <h1 className="text-xl font-black text-yellow-300">Setup Supabase Belum Selesai</h1>
            <p className="text-slate-400 text-sm">
              Sepertinya tabel database belum dibuat. Ikuti langkah ini:
            </p>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
              <li>Buka <b>Supabase Dashboard</b> → project Anda.</li>
              <li>Menu kiri: <b>SQL Editor</b> → <b>New query</b>.</li>
              <li>
                Buka file <code className="bg-slate-800 px-1 rounded">supabase/schema.sql</code> di
                repo ini, copy semua isinya, paste ke SQL Editor.
              </li>
              <li>Klik <b>Run</b>. Tunggu sampai selesai (biasanya &lt; 3 detik).</li>
              <li>Refresh halaman ini.</li>
            </ol>
            <details className="text-xs text-slate-500 mt-2">
              <summary className="cursor-pointer">Detail error</summary>
              <pre className="mt-2 bg-slate-950 p-2 rounded overflow-auto">{msg}</pre>
            </details>
          </>
        ) : (
          <>
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-black text-red-300">Terjadi Kesalahan</h1>
            <p className="text-slate-400 text-sm">Coba refresh atau hubungi admin.</p>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Detail</summary>
              <pre className="mt-2 bg-slate-950 p-2 rounded overflow-auto">{msg}</pre>
            </details>
          </>
        )}
        <button
          onClick={reset}
          className="w-full bg-indigo-600 hover:bg-indigo-500 font-bold py-2.5 rounded-xl transition-all text-sm"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
