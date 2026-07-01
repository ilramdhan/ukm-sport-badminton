import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login?next=/admin");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-xl">🏸</span>
            <div>
              <div className="text-sm font-black bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                Mabar Kalam Kudus
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Admin Panel</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-slate-900"
            >
              👁 Viewer
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
