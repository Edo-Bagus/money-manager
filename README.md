# Money Tracker

Pencatat keuangan pribadi semi-otomatis untuk satu pengguna. Spesifikasi lengkap
dan sumber kebenaran proyek: [SPEC.md](./SPEC.md).

Stack: Next.js 16 (App Router, TypeScript) di Vercel · Supabase (Postgres + Auth) ·
Vitest.

## Menjalankan secara lokal

Prasyarat: Node 24 (lihat `.nvmrc`) dan npm.

```bash
npm ci
cp .env.example .env.local   # lalu isi nilainya
npm run dev                  # http://localhost:3000
```

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest, sekali jalan (tanpa koneksi ke Supabase) |
| `npm run test:watch` | Vitest mode watch |

## Migrasi database

Semua perubahan skema lewat file SQL di `supabase/migrations/`, **tidak pernah**
lewat dashboard Supabase (SPEC §9). Supabase CLI sudah terpasang sebagai
devDependency, jadi cukup pakai `npx supabase`.

### Membuat migrasi baru

```bash
npx supabase migration new nama_singkat
# → supabase/migrations/<timestamp>_nama_singkat.sql, lalu isi SQL-nya
```

Migrasi yang sudah di-push ke remote jangan diubah lagi. Kalau ada yang salah,
buat migrasi baru.

### Menjalankan migrasi ke project remote

Sekali per mesin:

```bash
npx supabase login                         # buka browser, atau pakai access token
npx supabase link --project-ref <ref>      # <ref> = ID di URL dashboard; minta password database
```

Setiap ada migrasi baru:

```bash
npx supabase db push --dry-run   # lihat migrasi mana yang akan dijalankan
npx supabase db push             # jalankan
npx supabase migration list      # pastikan kolom Local dan Remote sama
```

`supabase/config.toml` hanya berlaku untuk stack lokal (`npx supabase start`,
butuh Docker). Pengaturan Auth project remote (misalnya sign-up dinonaktifkan)
diatur di dashboard Supabase.

## Ingest email

`POST /api/ingest/email` tidak memakai sesi login. Endpoint ini meminta header
`X-Ingest-Token` yang sama dengan env `INGEST_TOKEN`. Di Fase 0 endpoint ini
hanya stub: token benar → `202`, token salah atau tidak ada → `401`.

```bash
curl -i -X POST http://localhost:3000/api/ingest/email \
  -H "X-Ingest-Token: $INGEST_TOKEN" \
  -H "Content-Type: message/rfc822" \
  --data-binary @contoh.eml
```
