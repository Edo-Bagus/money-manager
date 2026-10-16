# CLAUDE.md

**Selalu baca [SPEC.md](./SPEC.md) sampai habis sebelum mengubah kode.** SPEC.md adalah
sumber kebenaran proyek. Kalau kode, permintaan, dan SPEC saling bertentangan, tanyakan
dulu. Jangan diam-diam memilih salah satu.

Status: Fase 0 (setup) selesai. Fase 1 bagian 1 (skema, RLS, RPC transaksi, seed akun default)
dan bagian 2 (mesin posting 12 template, tanggal WIB, rupiah) selesai; berikutnya UI Fase 1
(SPEC §11). Baca pertanyaan terbuka untuk UI di SPEC §12 dulu.

## Perintah

```bash
npm run dev          # server pengembangan, http://localhost:3000
npm run build        # build produksi
npm run lint         # ESLint (CLI langsung; `next lint` sudah tidak ada di Next 16)
npm run typecheck    # next typegen + tsc --noEmit
npm test             # Vitest sekali jalan (tanpa jaringan, tanpa Supabase)
npm run test:watch   # Vitest mode watch
npm run test:db      # migrasi + tes SQL di Postgres LOKAL sekali pakai (lihat README)
npm run gen:types    # test:db + tulis lib/supabase/database.types.ts (butuh Docker)

npx supabase migration new <nama>   # buat file migrasi baru
npx supabase db push --dry-run      # pratinjau migrasi ke project remote (setelah `supabase link`)
```

CI (`.github/workflows/ci.yml`) menjalankan lint, typecheck, dan test di setiap push dan PR,
plus job terpisah `db` (Postgres 17): `gen:types`, lalu gagal kalau tipe yang di-commit beda.
Jalankan lint, typecheck, dan test sebelum commit; `test:db` juga kalau menyentuh SQL.

## Struktur folder

```
app/                      Next.js App Router
  page.tsx                Tutup Hari (halaman utama)
  login/                  halaman login + server action (tidak ada sign-up)
  auth/actions.ts         sign out
  api/ingest/email/       POST dari Apps Script, auth via header X-Ingest-Token
lib/
  auth/                   isAllowedEmail, requireUser
  supabase/               client server (server.ts), helper proxy (proxy.ts),
                          database.types.ts (hasil gen:types, jangan diedit tangan)
  security/               safeEqual (perbandingan constant-time)
  money/rupiah.ts         parseRupiah / formatRupiah (teks ↔ sen, format Indonesia saja)
  date/wib.ts             tanggal WIB: todayWib, wibDayRange, wibMonthRange, toOccurredAt, ...
  posting/                templates.ts: buildPostings (template §6 → posting untuk RPC);
                          posting.ts: tipe Posting/AccountRef, assertBalanced
  email/parsers/          satu file per template email (Fase 2)
  env.ts                  akses env var
proxy.ts                  "middleware" versi Next 16: kunci semua route kecuali /login & /api/ingest/*
supabase/migrations/      SATU-SATUNYA tempat perubahan skema
supabase/db-tests/        tes SQL (*.test.sql), tiruan Supabase (bootstrap.sql), run.sh,
                          verify-remote.sql (query cek setelah db push)
fixtures/email/<sumber>/  fixture .eml yang SUDAH dianonimkan
private/                  di-.gitignore: data asli, jangan pernah di-commit
```

Test diletakkan di samping file yang dites (`*.test.ts`).

## Aturan wajib (dari SPEC)

- **Nominal uang dalam sen, tipe `bigint` di Postgres** (kolom berakhiran `_sen`). Tidak boleh
  float, `real`, `double precision`, atau `numeric`. Di TypeScript, nominal adalah `number`
  bulat (`Number.isSafeInteger`), bukan `BigInt`. Jangan pernah menghitung rupiah dengan desimal.
- **Zona waktu `Asia/Jakarta`** untuk semua konsep tanggal (hari ini, Tutup Hari, laporan
  bulanan, ±1 hari). Jangan pernah memakai zona waktu server. Pakai `lib/date/wib.ts`, jangan
  `new Date().getDate()`/`toLocaleDateString()` dan sejenisnya.
- **Transaksi + posting hanya ditulis lewat RPC** `create_transaction` / `update_transaction` /
  `delete_transaction`, supaya atomik. Jangan insert/update posting langsung dari aplikasi.
  Perhitungan template → posting ada di TypeScript murni (`buildPostings` di
  `lib/posting/templates.ts`, dites dengan Vitest); RPC hanya memvalidasi dan menyimpan.
  Trigger deferred menolak transaksi yang jumlah posting-nya ≠ 0 atau kurang dari 2 posting,
  **termasuk draft**.
- **Akun yang dicari oleh kode** (kategori default, equity) dicari lewat `accounts.system_key`
  (mis. `expense.biaya_bank_admin`), bukan lewat nama. Akun default dibuat oleh
  `ensure_default_accounts()` saat login.
- **Nomor referensi (No. Referensi, BI Fast, dsb.) selalu string.** Jangan dikonversi ke
  angka: bisa alfanumerik, bisa diawali nol, bisa melebihi batas angka aman JS.
- **Fixture wajib dianonimkan** sebelum masuk `fixtures/`: nama → `NAMA TES`, digit
  rekening/PAN/no. HP diganti acak dengan panjang sama, saldo diganti. Nominal transaksi
  boleh dipertahankan. Email asli hanya boleh ada di `private/`.
- **Semua perubahan skema lewat migrasi** di `supabase/migrations/`, tidak pernah lewat
  dashboard. Migrasi yang sudah di-push tidak boleh diubah; buat migrasi baru.
- **Setiap tabel: `enable row level security`, kolom `owner_id uuid not null default auth.uid()`,
  dan policy `owner_id = auth.uid()`** untuk select/insert/update/delete. `to authenticated` saja
  tidak cukup. Constraint unik selalu menyertakan `owner_id`. Relasi antartabel memakai FK
  komposit `(owner_id, x_id) → x(owner_id, id)` (pengecekan FK tidak lewat RLS). Grant ke
  `authenticated` ditulis eksplisit di migrasi. Role `anon` tidak boleh bisa
  membaca tabel apa pun. Migrasi awal sudah mencabut default grant untuk `anon`; itu lapisan
  tambahan, bukan pengganti RLS. `supabase/db-tests/security.test.sql` mengecek aturan ini
  untuk setiap tabel dan fungsi di `public`. Setelah tabel baru di-push, cek bahwa owner-nya
  `postgres` (`verify-remote.sql`).
- **Setelah mengubah migrasi:** `npm run gen:types` dan commit `database.types.ts`.
- **Jangan pernah commit secret.** Secret hanya di env var (`.env.local`, Vercel, Apps Script
  Properties). File `.env*` di-ignore kecuali `.env.example`, yang hanya berisi nama variabel
  tanpa nilai. Claude tidak memakai service-role key produksi dan tidak mengubah data lewat
  query langsung.
- **`npm test` harus jalan tanpa koneksi ke Supabase.** `vitest.setup.ts` memblokir `fetch`.
  Parser adalah fungsi murni tanpa I/O.
- **Logika parsing ada di repo**, bukan di Apps Script. Apps Script hanya meneruskan email.

## Konvensi kode

- Setiap halaman, Server Action, dan Route Handler yang butuh login memanggil
  `requireUser()` dari `lib/auth/require-user.ts`. `proxy.ts` saja tidak cukup.
- Endpoint `/api/ingest/*` memakai `X-Ingest-Token` + `safeEqual`, bukan sesi login.
- Jangan menambah library baru tanpa bertanya ke pemilik repo.
- UI mobile-first (dipakai dari iPhone). Teks UI dalam Bahasa Indonesia. Input minimal
  `text-base` supaya Safari iOS tidak zoom.
- Next.js 16: `params`, `searchParams`, dan `cookies()` bersifat async; konvensi `proxy.ts`
  menggantikan `middleware.ts`.
- Commit kecil-kecil dengan pesan yang jelas.
