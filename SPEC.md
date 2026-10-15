# SPEC — Personal Money Tracker

Dokumen konteks proyek untuk Claude Code. Baca seluruhnya sebelum mengubah kode.

## 1. Tujuan

Pencatat keuangan pribadi **semi-otomatis** untuk satu pengguna.

Pertanyaan yang harus bisa dijawab aplikasi:
1. **Komposisi pengeluaran:** per bulan, per kategori (prioritas utama).
2. **Utang-piutang:** siapa berutang ke saya, saya berutang ke siapa, berapa, sejak kapan.

Bukan tujuan (jangan dibangun di MVP): budgeting, forecast, multi-currency, multi-user, import data historis.

## 2. Prinsip

- **Tidak full otomatis.** Data dari email masuk sebagai **draft**. Pengguna yang mengonfirmasi.
- **Input manual adalah warga kelas satu.** Semua uang masuk dan transaksi tanpa email dicatat manual.
- **Rekonsiliasi harian ("Tutup Hari")** setiap malam, dengan saldo asli dimasukkan manual dan dibantu sistem.
- **Bisa diperbaiki lewat Claude Code.** Setiap bug atau edge case harus bisa direproduksi sebagai test dari data di repo.

## 3. Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Web app + API | Next.js (TypeScript) di **Vercel Hobby** | Gratis, auto-deploy dari GitHub, preview per branch |
| Database + Auth | **Supabase Free** (Postgres + Supabase Auth) | Gratis, auth siap pakai, migrasi SQL di repo |
| Pengambil email | **Google Apps Script** (trigger tiap 10 menit) | Gratis, akses Gmail tanpa server sendiri |
| Test | Vitest | Fixture email dan unit test parser |

Batasan yang diketahui:
- Supabase Free **pause setelah 7 hari tidak aktif** (bisa di-restore dari dashboard). Pemakaian harian mencegah ini.
- Supabase Free **tidak menyertakan backup** (lihat §10).
- Vercel Hobby hanya untuk penggunaan pribadi/non-komersial.

## 4. Autentikasi & keamanan

- Supabase Auth, **satu pengguna**. **Sign-up publik dinonaktifkan.** Akun dibuat manual di dashboard.
- **Row Level Security aktif di semua tabel.** Tidak ada tabel yang bisa dibaca oleh role `anon`.
- **RLS per pemilik, bukan sekadar "sudah login".** Setiap tabel punya kolom `owner_id uuid not null default auth.uid()`, dan policy untuk `select`/`insert`/`update`/`delete` mensyaratkan `owner_id = auth.uid()`. Alasannya: publishable key memang publik, jadi akun lain (kalau sign-up pernah aktif tanpa sengaja) bisa memanggil API Supabase langsung tanpa melewati pengecekan `ALLOWED_EMAIL` di aplikasi.
- Constraint unik selalu menyertakan `owner_id` (mis. `unique (owner_id, date)`), supaya baris milik akun lain tidak bisa memblokir data pemilik.
- Endpoint ingest email (`POST /api/ingest/email`) memakai **shared secret** di header (`X-Ingest-Token`), bukan sesi login. Bandingkan dengan constant-time compare.
- Hanya email yang **lolos DKIM untuk domain pengirim yang terdaftar** yang diparse. Selain itu: `parse_status = rejected`.
- Secret hanya di environment variable (Vercel, Apps Script Properties, `.env.local`). **Tidak pernah di repo.**
- Claude Code **tidak diberi** service-role key produksi. Perubahan data dilakukan lewat migrasi atau UI, bukan query langsung.
- Fixture di `fixtures/` **wajib dianonimkan** (nama, nomor rekening, PAN, saldo). Folder `private/` di-`.gitignore`.

## 5. Model data

Double-entry sederhana. Setiap transaksi punya ≥2 posting yang jumlahnya **nol**.
Konvensi tanda: **positif = aset/pengeluaran bertambah**, negatif = pemasukan/sumber dana.
**Semua nominal dalam sen, tipe `bigint`.** Tidak boleh float.
Di TypeScript, nominal sen bertipe `number` yang selalu bilangan bulat (dicek dengan `Number.isSafeInteger`), **bukan** `BigInt` JS: `BigInt` tidak bisa diserialisasi ke JSON, dan PostgREST mengembalikan `bigint` sebagai angka JSON. Batas amannya ±9×10¹⁵ sen (±90 triliun rupiah).

**Zona waktu: `Asia/Jakarta` (WIB).** Waktu disimpan sebagai `timestamptz`. Semua konsep tanggal (hari ini, Tutup Hari, `check_date`, `day_closures.date`, laporan per bulan, peringatan duplikat ±1 hari) dihitung dalam WIB, tidak pernah memakai zona waktu server (Vercel berjalan di UTC).

**Penulisan transaksi selalu atomik lewat fungsi Postgres (RPC).** Membuat, mengubah, atau menghapus transaksi beserta posting-nya dilakukan dalam satu fungsi (mis. `create_transaction`), bukan lewat insert/update terpisah dari aplikasi. Setiap request ke API Supabase adalah transaksi database tersendiri, sehingga constraint "jumlah posting = 0" yang deferred akan gagal kalau transaksi dan posting-nya dikirim terpisah.
Pembagian kerja: **perhitungan template → posting ada di TypeScript murni** (bisa dites dengan `npm test` tanpa Supabase); fungsi RPC hanya memvalidasi (jumlah = 0, akun milik pemilik) lalu menyimpan secara atomik.

### Tabel

**accounts**
- `id`, `name`, `kind`: `asset | person | expense | income | equity`
- `subtype` (untuk asset): `bank | ewallet | investment | cash`
- `identifiers jsonb`: untuk deteksi otomatis, mis. `{"last4": "3302"}`, `{"phone": "08xx"}`, `{"account_no": "..."}`
- `is_own boolean`: akun milik sendiri, dipakai untuk mendeteksi transfer internal
- `check_policy`: `daily_if_active | monthly | never`
- `archived_at`

**Akun `person`**: satu akun per orang (mis. "Budi"). **Saldo positif = dia berutang ke saya, negatif = saya berutang ke dia.** Tidak perlu memisahkan akun piutang dan utang.
Ada juga akun khusus `person` bernama **"Reimburse: <kegiatan>"** untuk biaya yang akan diganti (mis. konferensi).

**transactions**
- `id`, `occurred_at timestamptz`, `description`, `notes`
- `status`: `draft | confirmed`
- `source`: `email | manual | reconcile`
- `external_ref` (string) + `source_key`; unik bersama untuk mencegah duplikat
- `raw_email_id` (nullable), `tags text[]`

**postings**
- `id`, `transaction_id`, `account_id`, `amount_sen bigint`
- Constraint: jumlah posting per transaksi = 0 (deferred constraint trigger)

**raw_emails**
- `gmail_message_id` (unik), `from_addr`, `subject`, `received_at`, `dkim_pass`, `body_html`
- `parse_status`: `parsed | unknown | error | rejected | ignored`
- `parser_name`, `parser_version`, `error`

**merchant_rules**: `match_type` (`merchant_pan | name_contains | account_no | phone`), `pattern`, `account_id`, `priority`

**balance_checks**: `account_id`, `check_date`, `expected_sen`, `actual_sen`, `diff_sen`, `resolution` (`ok | added_txn | fee_interest | carried_over`)

**day_closures**: `date` (unik per `owner_id`), `closed_at`

### Kategori (akun `expense`)
1. Makan & Minum
2. Belanja Harian (minimarket, kebutuhan rumah)
3. Transportasi
4. Tagihan & Utilitas (listrik, pulsa, internet)
5. Belanja Pribadi (pakaian, barang)
6. Hiburan & Hobi
7. Langganan Digital
8. Kesehatan
9. Pendidikan & Pengembangan Diri
10. Perjalanan (tiket, penginapan)
11. Hadiah & Donasi (termasuk piutang yang diikhlaskan)
12. Biaya Bank & Admin
13. Lainnya

### Kategori (akun `income`)
Uang Saku/Kiriman · Gaji/Honor · Hasil Investasi (bunga, kupon, dividen) · Lainnya

`equity`:
- **Saldo Awal**: untuk mencatat saldo pembuka.
- **Penyesuaian Nilai Investasi**: akun lawan saat nilai investasi diperbarui (lihat §8). Karena bukan `income`/`expense`, akun ini tidak ikut laporan komposisi pengeluaran.

## 6. Jenis transaksi (template input manual)

| Template | Posting |
|---|---|
| Pengeluaran | akun sumber −, kategori + |
| Pemasukan | akun tujuan +, kategori income − |
| Transfer antarakun sendiri | sumber −, tujuan + (+ biaya ke "Biaya Bank & Admin") |
| Pinjamkan ke orang | sumber −, person + |
| Dipinjami orang | tujuan +, person − |
| **Dibayari orang** (orang lain membayar bagian saya) | kategori +, person − |
| Terima pelunasan | tujuan +, person − |
| Bayar utang | sumber −, person + |
| **Patungan** | sumber − total; kategori + bagian sendiri; tiap person + bagiannya. Sisa pembulatan sen masuk ke bagian sendiri. |
| Ikhlaskan piutang | person −, "Hadiah & Donasi" + |
| Biaya reimburse | sumber −, person "Reimburse: X" + |
| Refund/cashback | akun +, kategori pengeluaran asal − |

Form input manual harus menyediakan semua template di atas, dan harus bisa dipakai cepat dari iPhone (mobile-first).

**Peringatan duplikat:** saat menyimpan, jika ada transaksi lain dengan nominal sama pada akun yang sama dalam ±1 hari, tampilkan peringatan.

## 7. Ingest email

### Alur
1. Gmail filter memberi label `finance` pada email dari pengirim terdaftar.
2. Apps Script (tiap 10 menit) mengambil email berlabel `finance` yang belum diproses, lalu `POST` raw message (RFC 822) ke `/api/ingest/email`, kemudian memberi label `finance/sent`.
3. Server: simpan ke `raw_emails` → verifikasi DKIM → pilih parser → buat transaksi **draft**.
4. Email yang tidak dikenali → `parse_status = unknown`, tampil di halaman "Email belum dikenali" (bisa diubah jadi transaksi manual dengan sekali klik, isi email ditampilkan di samping).

**Logika parsing ada di server (repo), bukan di Apps Script.** Apps Script hanya meneruskan email, supaya semua parser bisa dites.

### Arsitektur parser
- `lib/email/decode.ts`: decode MIME/quoted-printable, ekstrak HTML.
- `lib/email/fields.ts`: ekstrak pasangan label → nilai dari `<td>Label</td><td>Nilai</td>`, trim spasi, toleran HTML rusak.
- `lib/email/parsers/<sumber>-<jenis>.ts`: satu file per template. Setiap parser mengekspor `canParse(email)` dan `parse(email)`.
- Routing berdasarkan **pengirim + subject yang dinormalisasi** (lowercase, tanda baca dibuang).
- Util umum: `parseRupiah("Rp 1.116.250,00") → 111625000` (sen), `parseIndoDate("15 Okt 2026", "10:17:02 WIB")` dengan mapping bulan manual (Jan Feb Mar Apr Mei Jun Jul Agu Sep Okt Nov Des), tanpa bergantung pada locale.

### Parser awal (Livin' by Mandiri, `noreply.livin@bankmandiri.co.id`)
| Subject | Field penting | Draft yang dihasilkan |
|---|---|---|
| Pembayaran Berhasil(!) | Penerima (h4), lokasi, Nominal Transaksi, No. Referensi, Merchant PAN, Sumber Dana (last4) | Mandiri −, kategori dari `merchant_rules` (jika tak ada: "Lainnya" + perlu review) |
| Top-up Berhasil | Penyedia Jasa, last4 tujuan, Nominal Top-up, Biaya Transaksi, Total Transaksi, No. Referensi, Rekening Sumber | Jika tujuan `is_own`: Mandiri −total, e-wallet +nominal, biaya +. Jika bukan: tujuan dibiarkan kosong, wajib review |
| Transfer dengan BI Fast Berhasil | Penerima (nama, bank − no. rek, split pada " - " terakhir), Nominal Transfer, Biaya Transfer, Total, Tujuan Transaksi, No. Referensi BI Fast (alfanumerik), Keterangan, Rekening Sumber | Jika no. rek `is_own`: transfer internal. Jika bukan: wajib review. Hashtag di Keterangan → `tags` |

Semua nomor referensi disimpan sebagai **string**.

**Hashtag di Keterangan** (`#pinjam`, `#patungan`, `#bayarutang`, `#kasih`, `#reimburse`) dipakai untuk mengusulkan template saat review.

Sumber lain (Jago, Seabank, e-wallet, investasi): **menunggu inventaris email**. Tambah satu parser per template, masing-masing dengan fixture.

## 8. Halaman

1. **Login**
2. **Tutup Hari** (halaman utama malam hari)
   - Bagian A: draft hari ini → konfirmasi / ubah kategori / pilih template.
   - Bagian B: akun yang perlu dicek = akun `daily_if_active` yang ada transaksinya hari ini + akun yang >7 hari tidak dicek. Tampilkan saldo menurut catatan, input saldo asli.
   - Selisih ≠ 0 → pilihan: **Tambah transaksi terlewat** (form terisi nominal selisih), **Biaya/bunga** (sekali klik), **Cek besok** (dibawa ke hari berikutnya).
   - **Biaya/bunga**: selisih = saldo asli − saldo catatan. Selisih negatif → akun −, "Biaya Bank & Admin" +. Selisih positif → akun +, income "Hasil Investasi" −.
   - Tombol **Tutup hari**. Hari yang belum ditutup terlihat di bagian atas halaman Tutup Hari (tidak ada halaman dashboard terpisah).
3. **Input manual** (template §6)
4. **Email belum dikenali**
5. **Laporan**
   - Komposisi pengeluaran per bulan per kategori (hanya akun `expense`; transfer dan piutang otomatis tidak terhitung).
   - Daftar utang-piutang per orang: saldo, transaksi terakhir, umur piutang.
6. **Pengaturan**: akun & identifiers, merchant rules, saldo awal.

**Investasi** (`check_policy = monthly`): update nilai bulanan dicatat sebagai penyesuaian nilai, **bukan** pemasukan/pengeluaran. Posting: akun investasi ± selisih, equity "Penyesuaian Nilai Investasi" ∓ selisih. Bunga, kupon, dan dividen yang benar-benar diterima tetap dicatat sebagai income "Hasil Investasi".

## 9. Alur perbaikan via Claude Code

- Repo GitHub, branch `main` auto-deploy ke Vercel. Branch lain = preview deploy.
- Migrasi skema di `supabase/migrations/*.sql`. Tidak ada perubahan skema manual di dashboard.
- **Siklus perbaikan parser:**
  1. Email gagal muncul di "Email belum dikenali" / `error`.
  2. Tombol **"Unduh sebagai fixture"** mengekspor raw email yang sudah **dianonimkan** otomatis (nama → `NAMA TES`, digit rekening/PAN diganti acak dengan panjang sama, nominal dipertahankan).
  3. Simpan ke `fixtures/email/<sumber>/<nama>.eml`, tulis test yang gagal, perbaiki parser, test hijau, push.
  4. Tombol **"Proses ulang"** di halaman email menjalankan ulang parser versi terbaru.
- `npm test` harus bisa jalan **tanpa koneksi ke Supabase** (parser murni, tanpa I/O).
- Log error ingest disimpan di `raw_emails.error`, bukan hanya di console.

## 10. Backup

Ditunda oleh pengguna. Minimal yang direkomendasikan sejak fase 1: tombol **Export JSON** (semua tabel) di Pengaturan.

## 11. Fase pengerjaan

**Fase 0: Setup**
Repo, Next.js, Supabase project, Vercel, auth satu pengguna, RLS, CLAUDE.md.

**Fase 1: Bisa dipakai tanpa otomasi**
Skema, akun & saldo awal, input manual semua template, Tutup Hari, laporan, export JSON.
*Selesai jika:* dipakai 14 malam, Tutup Hari selesai ≥12 malam.

**Fase 2: Email Mandiri**
Apps Script forwarder, endpoint ingest, DKIM, 3 parser Mandiri + fixture + test, merchant rules, halaman email belum dikenali, fixture export.

**Fase 3: Sumber lain**
Berdasarkan hasil inventaris email. Opsional: parser fallback LLM untuk template tak dikenal (output tetap draft).

## 12. Masih terbuka

- [ ] Inventaris email sumber lain (Jago, Seabank, GoPay, OVO, DANA, ShopeePay, Bibit, Ajaib, Tring): ada/tidak, jenis transaksi apa.
- [ ] Bersedia/tidak mengirim isi email keuangan ke API LLM (Fase 3).
- [ ] Rencana backup setelah Fase 1.

Untuk Fase 2 (dari review Fase 0):
- [ ] Jalur tulis ingest tanpa sesi login. Rekomendasi: Supabase secret key hanya di env Vercel (server-only), `owner_id` diisi eksplisit karena secret key melewati RLS.
- [ ] `raw_emails` perlu menyimpan pesan RFC 822 utuh (untuk DKIM, "Proses ulang", "Unduh sebagai fixture"), bukan hanya `body_html`.
- [ ] Verifikasi DKIM butuh library baru dan lookup DNS (bertentangan dengan test offline), kunci DKIM bisa dirotasi saat proses ulang, dan fixture yang dianonimkan pasti gagal DKIM. Alternatif: simpan `dkim_pass` sekali saat ingest, atau pakai header `Authentication-Results` dari Gmail.
- [ ] Definisi `source_key`; perilaku unik `(external_ref, source_key)` saat bernilai NULL; kapan `parse_status = ignored`.
- [ ] Batas ukuran: body request Vercel 4,5 MB (email berlampiran bisa lebih besar); database Supabase Free 500 MB.
- [ ] Apps Script hanya memberi label `finance/sent` setelah respons 2xx; endpoint idempoten terhadap `gmail_message_id`.

## 13. Riwayat keputusan

**2026-10-15**, sebelum Fase 1:
- §4: RLS per pemilik (`owner_id = auth.uid()`); constraint unik menyertakan `owner_id`.
- §5: nominal di TypeScript = `number` bulat; zona waktu `Asia/Jakarta`; penulisan transaksi lewat fungsi Postgres (RPC), dengan perhitungan posting di TypeScript murni; akun equity "Penyesuaian Nilai Investasi".
- §6: template "Dibayari orang"; sisa pembulatan patungan masuk ke bagian sendiri.
- §8: aturan tombol "Biaya/bunga"; posting penyesuaian nilai investasi; hari yang belum ditutup tampil di halaman Tutup Hari.
- §12: pertanyaan Fase 2 dari review Fase 0 dicatat sebagai item terbuka.
