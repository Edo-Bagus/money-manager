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

### Setelah `db push`

1. Jalankan blok-blok di `supabase/db-tests/verify-remote.sql` di Dashboard →
   SQL Editor (hanya membaca). Hasil yang diharapkan tertulis di tiap blok:
   owner tabel `postgres`, RLS aktif, `anon` tidak punya hak apa pun.
2. Logout lalu login sekali. Login memanggil `ensure_default_accounts()`, yang
   membuat kategori dan akun equity default (SPEC §5). Panggilan ini idempoten.
   Kalau gagal, login tetap jalan dan error-nya ada di log Vercel.

## Tes database

`npm test` tidak menyentuh database. Migrasi, RLS, constraint, dan fungsi SQL
dites terpisah dengan `npm run test:db`. Perintah ini membuat database sekali
pakai di Postgres **lokal**, menjalankan semua migrasi, lalu
`supabase/db-tests/*.test.sql`, dan menghapus database itu lagi. Seluruh suite
jalan dua kali: dengan dan tanpa default grant Supabase untuk tabel baru
(pengaturan "expose new tables" di project), supaya migrasi benar di kedua
kondisi.

Ini bukan Supabase asli: `supabase/db-tests/bootstrap.sql` meniru role `anon`,
`authenticated`, `service_role`, `auth.users`, dan `auth.uid()`. Sisa celahnya
ditutup oleh `verify-remote.sql` di atas.

```bash
# Postgres apa saja ≥ 16 dengan user yang boleh membuat database dan role,
# misalnya lewat Docker:
docker run -d --name mm-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17

PGPASSWORD=postgres npm run test:db     # host default: localhost
PGPASSWORD=postgres npm run gen:types   # + tulis lib/supabase/database.types.ts
```

`run.sh` menolak `PGHOST` selain `localhost`/`127.0.0.1`/`::1`, jadi tidak
mungkin berjalan ke project remote. `gen:types` butuh Docker karena Supabase CLI
menjalankan postgres-meta di container. Tidak perlu akses ke project remote.
Setelah mengubah migrasi, jalankan `gen:types` dan commit hasilnya. Job CI `db`
gagal kalau tipe yang di-commit tertinggal dari migrasi.

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
