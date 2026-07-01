# Deploy Guide — Mabar Kalam Kudus

## 1. Setup Supabase (WAJIB pertama kali)

Tanpa langkah ini, app akan error karena tabel belum ada.

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → project Anda.
2. Menu kiri: **SQL Editor** → klik **+ New query**.
3. Buka file [`supabase/schema.sql`](./supabase/schema.sql) di repo ini. Copy semua isinya.
4. Paste ke SQL Editor → klik **Run** (Ctrl/Cmd+Enter).
5. Verifikasi: menu **Table Editor** harus muncul tabel `players`, `current_match`, `matches`, `score_events`.

Setelah itu:

- **Realtime**: buka **Database → Replication → supabase_realtime** — pastikan 3 tabel (`players`, `current_match`, `matches`) sudah tercentang. Script SQL sudah otomatis add publication, tapi kalau tidak muncul, add manual.

## 2. Dev Lokal

```bash
npm install
npm run dev
```

Buka:

- `http://localhost:3000/` → viewer publik (read-only)
- `http://localhost:3000/login` → login admin
  - Username: `Admin`
  - Password: `RPwdfmgtADM@255`
- `http://localhost:3000/admin` → admin panel (auto-redirect ke `/login` kalau belum masuk)

## 3. Deploy ke Vercel

### A. Push repo ke GitHub

```bash
git add .
git commit -m "Setup mabar app"
git push
```

### B. Import di Vercel

1. https://vercel.com/new → pilih repo `mabar-kalam-kudus`.
2. Framework: **Next.js** (auto-detect).
3. **Environment Variables** — tambah semua ini (copy dari `.env.local`):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mrijgpceedtunykogzud.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `SUPABASE_URL` | (sama dgn NEXT_PUBLIC_SUPABASE_URL) |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` |
| `ADMIN_USERNAME` | `Admin` |
| `ADMIN_PASSWORD_HASH` | (bcrypt hash — lihat `.env.local`) |
| `JWT_SECRET` | (random string — lihat `.env.local`) |

4. **Deploy** → tunggu ~1 menit.
5. Buka URL Vercel Anda. Share URL utama ke anggota komunitas.

### C. Rotate Secrets Setelah Deploy

Setelah tahu deploy berjalan, di **Supabase Dashboard → Project Settings → API**:

- Klik **Reset service role key** → paste key baru ke Vercel Env Var `SUPABASE_SECRET_KEY` → redeploy.
- Alasan: key lama pernah tersimpan di `.env.local` lokal — safer untuk rotate.

## 4. Ganti Password Admin

Ganti password:

```bash
node -e "console.log(require('bcryptjs').hashSync('PASSWORD_BARU', 12))"
```

Copy output → paste ke `ADMIN_PASSWORD_HASH` (di `.env.local` untuk local, di Vercel Env Var untuk prod). Redeploy Vercel.

## 5. Rotate JWT Secret (kalau perlu)

```bash
openssl rand -base64 48
```

Copy → paste ke `JWT_SECRET`. Semua session admin yang aktif akan langsung expired (harus login ulang).

## 6. Konvensi App

- Hanya satu match aktif dalam satu waktu (satu lapangan).
- Antrean dipisah per tier: A vs (B+C).
- Sistem tarik 2 dari A + 2 dari B/C bila memungkinkan. Kalau timpang (salah satu antrean tipis), alternate dengan single-tier game supaya semua istirahat adil.
- Score modes: Rally 21 / Rally 15 / Klasik 30 (serve-based) / Klasik 15.
- Undo score: pop event terakhir dari `score_events` — bisa berkali-kali sampai skor awal.
- Selesai match: 4 pemain masuk kembali ke belakang antrean tier masing-masing.

## 7. Troubleshooting

**Error `does not exist` / `Could not find the table`**: Jalankan `supabase/schema.sql` di Supabase SQL Editor (lihat step 1).

**Login gagal walau password benar**: Cek `ADMIN_PASSWORD_HASH` di env — biasanya salah copy hash (harus `$2b$12$...` lengkap).

**Realtime tidak update**: Cek Supabase → Database → Replication → pastikan tabel `players`, `current_match`, `matches` masuk publication `supabase_realtime`.

**Cookie tidak persist di production**: pastikan Vercel serve via HTTPS. Cookie di-set dengan `secure: true` di production.
