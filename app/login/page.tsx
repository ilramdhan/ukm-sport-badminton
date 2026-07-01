"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal login.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Gagal koneksi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4"
      >
        <div className="text-center mb-2">
          <div className="text-4xl mb-2">🏸</div>
          <h1 className="text-xl font-black bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
            Login Admin
          </h1>
          <p className="text-slate-500 text-xs mt-1">Mabar Kalam Kudus</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label className="text-xs text-slate-400 font-bold">Username</label>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 font-bold">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-indigo-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 font-black py-3 rounded-xl transition-all"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>

        <p className="text-center text-slate-600 text-xs">
          Viewer tidak perlu login. Buka <Link href="/" className="text-indigo-400 hover:underline">halaman utama</Link>.
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginForm />
    </Suspense>
  );
}
