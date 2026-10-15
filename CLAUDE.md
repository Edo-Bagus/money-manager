# CLAUDE.md

**Selalu baca [SPEC.md](./SPEC.md) sampai habis sebelum mengubah kode.** SPEC.md adalah
sumber kebenaran proyek. Kalau kode, permintaan, dan SPEC saling bertentangan, tanyakan
dulu. Jangan diam-diam memilih salah satu.

Status: Fase 0 (setup) selesai. Fase berikutnya mengikuti SPEC §11.

## Perintah

```bash
npm run dev          # server pengembangan, http://localhost:3000
npm run build        # build produksi
npm run lint         # ESLint (CLI langsung; `next lint` sudah tidak ada di Next 16)
npm run typecheck    # next typegen + tsc --noEmit
npm test             # Vitest sekali jalan (tanpa jaringan, tanpa Supabase)
npm run test:watch   # Vitest mode watch

npx supabase migration new <nama>   # buat file migrasi baru
npx supabase db push --dry-run      # pratinjau migrasi ke project remote (setelah `supabase link`)
```

CI (`.github/workflows/ci.yml`) menjalankan lint, typecheck, dan test di setiap push dan PR.
Jalankan ketiganya sebelum commit.

## Struktur folder

```
app/                      Next.js App Router
  page.tsx                Tutup Hari (halaman utama)
  login/                  halaman login + server action (tidak ada sign-up)
  auth/actions.ts         sign out
  api/ingest/email/       POST dari Apps Script, auth via header X-Ingest-Token
lib/
  auth/                   isAllowedEmail, requireUser
  supabase/               client server (server.ts) dan helper proxy (proxy.ts)
  security/               safeEqual (perbandingan constant-time)
  email/parsers/          satu file per template email (Fase 2)
  env.ts                  akses env var
proxy.ts                  "middleware" versi Next 16: kunci semua route kecuali /login & /api/ingest/*
supabase/migrations/      SATU-SATUNYA tempat perubahan skema
fixtures/email/<sumber>/  fixture .eml yang SUDAH dianonimkan
private/                  di-.gitignore: data asli, jangan pernah di-commit
```

Test diletakkan di samping file yang dites (`*.test.ts`).

## Aturan wajib (dari SPEC)

- **Nominal uang dalam sen, tipe `bigint` di Postgres** (kolom berakhiran `_sen`). Tidak boleh
  float, `real`, `double precision`, atau `numeric`. Di kode, nominal selalu bilangan bulat
  sen. Jangan pernah menghitung rupiah dengan desimal.
- **Nomor referensi (No. Referensi, BI Fast, dsb.) selalu string.** Jangan dikonversi ke
  angka: bisa alfanumerik, bisa diawali nol, bisa melebihi batas angka aman JS.
- **Fixture wajib dianonimkan** sebelum masuk `fixtures/`: nama → `NAMA TES`, digit
  rekening/PAN/no. HP diganti acak dengan panjang sama, saldo diganti. Nominal transaksi
  boleh dipertahankan. Email asli hanya boleh ada di `private/`.
- **Semua perubahan skema lewat migrasi** di `supabase/migrations/`, tidak pernah lewat
  dashboard. Migrasi yang sudah di-push tidak boleh diubah; buat migrasi baru.
- **Setiap tabel: `enable row level security` + policy eksplisit.** Role `anon` tidak boleh
  bisa membaca tabel apa pun. Migrasi awal sudah mencabut default grant untuk `anon`; itu
  lapisan tambahan, bukan pengganti RLS.
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
