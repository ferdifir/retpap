# Rencana migrasi RetPAP ke Vercel + Supabase

Status: **preview paralel disiapkan; belum siap melayani pengguna**. VPS,
domain, webhook Telegram, dan data produksi tidak diubah. Source ada di branch
`codex/vercel-supabase-preview`; perubahan belum digabung ke `main`.

Dokumen ini menggantikan rancangan migrasi sebelumnya. Rencana mengikuti alur
aplikasi yang sekarang: upload melalui bot, jadwal posting owner disimpan di
DB, dan pengiriman post terjadwal dipicu request aplikasi berikutnya. Tidak
ada cron untuk upload terjadwal.

## 1. Kondisi saat ini

Pemeriksaan read-only pada 2026-11-03:

| Bagian | Kondisi |
|---|---|
| Aplikasi | Next.js 16 di VPS, dijalankan PM2 |
| Database produksi | PostgreSQL di VPS, sekitar 18 MB |
| Isi `photos` | 173 baris: 145 foto dan 28 video |
| Status kirim channel | 21 `pending`, 3 `sent`, 149 `idle` |
| Media di disk | 203 file, sekitar 138 MB; termasuk poster video |
| Target Supabase | Project `RetPAP`, region `ap-northeast-1` (Tokyo); 25 migrasi Drizzle dan bucket private `retpap-media` sudah diterapkan, belum ada data aplikasi |
| Target Vercel | Team personal `ferdifirdev-6510`, plan Hobby; project `retpap-supabase-preview` sudah dibuat tanpa domain, tetapi GitHub integration belum terpasang sehingga repo/branch belum dapat dikaitkan atau dideploy |
| Build preview | `npm run build` berhasil di lingkungan lokal |
| Kredensial Preview | URL dan nama bucket sudah diisi; koneksi DB, service role, session, dan kredensial bot belum tersedia |
| Keamanan Supabase | Advisor menemukan RLS nonaktif pada 17 tabel `public`; jangan buka preview/API sampai kebijakan akses ditetapkan |

Angka VPS adalah baseline untuk rekonsiliasi, bukan hasil migrasi. Sebelum
cutover, hitung ulang dan cocokkan setiap file ke slug/jenis media di DB.

## 2. Arsitektur target

| Komponen | Target | Catatan |
|---|---|---|
| Next.js, API, Mini App, Telegram webhook | Vercel Node.js Functions | Gunakan region yang dekat dengan database; target awal `hnd1` (Tokyo) karena project Supabase berada di Tokyo, lalu ukur latency dari pengguna Indonesia |
| PostgreSQL | Project Supabase `RetPAP` yang sudah tersedia | Pertahankan skema dan ID yang sekarang; koneksi runtime lewat Supavisor transaction pooler |
| Foto/video dan poster | Supabase Storage, bucket **private** | Baseline 138 MB cocok untuk migrasi awal; private supaya URL object tidak melewati pemeriksaan jadwal dan 18+ |
| Bot Telegram | Bot yang sama | Webhook dipindah satu kali saat cutover; jangan aktifkan dua consumer untuk bot yang sama |
| Recap leaderboard | `/api/cron/notify` | Satu jadwal harian saja; cron bukan pemicu scheduled upload |
| Scheduled channel post | `photos.scheduled_at` + status/claim di DB | Diproses paling banyak satu post saat request API terautentikasi berikutnya; tidak menambah cron upload |

**Batas media:** paket Supabase Free saat ini mencakup 1 GB Storage dan batas
50 MB per file; upload aplikasi dibatasi 20 MB. Egress Storage memakai kuota
cached dan uncached terpisah. Pantau pemakaian setelah cutover; pindahkan bucket
ke R2 bila trafik melampaui kuota atau biaya Supabase Storage menjadi tidak
sesuai. Bucket tetap private pada kedua pilihan.

**Batas serverless:** Vercel Functions berjalan terbatas waktu dan batas cron
Hobby hanya sekali sehari. Karena scheduled upload memang tidak memakai cron,
Hobby masih dapat menjalankan recap harian; verifikasi plan, penggunaan, dan
ketentuan pemakaian akun sebelum memilih target produksi.

## 3. Fase migrasi

### Fase 0 — Verifikasi target dan persiapan

1. Project Vercel terpisah sudah dibuat. Hubungkan GitHub integration, lalu
   set production branch project ini ke `codex/vercel-supabase-preview`; jangan
   menautkan domain produksi.
2. Project `RetPAP` di Tokyo sudah berisi skema hasil migrasi, tanpa data
   produksi. Periksa plan, compute, kuota, backup, dan siapkan connection string
   runtime/direct.
3. Pastikan DNS dan kepemilikan `bot.linkviu.my.id`; catat konfigurasi webhook
   Telegram sekarang tanpa mengubahnya.
4. Buat manifest sumber: daftar semua slug, ekstensi, ukuran, checksum, dan
   relasi foto/video/poster. Jangan mengandalkan jumlah file saja.
5. Simpan dump PostgreSQL terenkripsi di luar VPS dan salinan media terverifikasi
   sebelum migrasi.

**Gerbang lanjut:** GitHub integration terpasang, RLS/policies ditetapkan,
kredensial Preview aman, biaya/plan diketahui, backup bisa dibaca, dan manifest
file cocok.

### Fase 1 — Siapkan Supabase Database

1. Selesai: 25 migrasi Drizzle diterapkan ke project Supabase kosong.
2. Ubah koneksi migrasi agar memakai koneksi direct Supabase. Jangan menjalankan
   DDL melalui transaction pooler.
3. Uji koneksi runtime melalui Supavisor transaction pooler. Turunkan pool
   per-instance di `src/db/client.ts` dari 10 menjadi 1 terlebih dahulu; naikkan
   hanya jika pengukuran menunjukkan antrean koneksi. Pastikan tidak ada fitur
   yang bergantung pada session state atau prepared statement bernama.
4. Impor data dari dump PostgreSQL VPS ke skema hasil migrasi. Pertahankan
   urutan ID, sequence, foreign key, timestamp, riwayat rating, sesi upload,
   status channel, `scheduled_at`, dan `channel_message_id`.
5. Cocokkan jumlah baris per tabel, sequence ID, foto aktif, status antrean,
   ranking, dan sampel relasi `spots`/`comments`/`reactions`.

**Rollback:** sebelum cutover, aplikasi tetap memakai database VPS. Jika validasi
gagal, kosongkan target yang masih non-produksi dan ulangi restore.

### Fase 2 — Pindahkan media dan hilangkan ketergantungan disk lokal

1. Selesai: bucket private `retpap-media` dibuat; batas 50 MB dan tipe JPEG/MP4.
2. Salin semua object dengan key deterministik `<slug>.jpg` atau `<slug>.mp4`;
   poster video disimpan sebagai `<slug>.jpg`. Simpan manifest sumber dan hasil.
3. Verifikasi jumlah, ukuran total, checksum unduh, semua path yang dirujuk DB,
   dan tidak adanya object yatim. Jangan hapus `/var/lib/retpap/uploads`.
4. Selesai di branch preview: adapter media berbasis object storage mengganti
   pemakaian filesystem
   produksi pada `media.ts`, route `/media/[slug]`, repost admin, scheduled
   channel post, gambar drawing/channel, dan admin actions.
5. Pertahankan `/media/<slug>` sebagai pemeriksaan akses server-side: cek bahwa
   foto sudah melewati `scheduled_at`, lalu stream object beserta dukungan HTTP
   Range untuk video. Jangan mengembalikan URL permanen bucket private ke
   browser.
6. Gunakan `/tmp` hanya untuk file sementara `ffmpeg`/`ffprobe`; hapus file
   sementara pada jalur sukses maupun gagal.

**Rollback:** object dan file VPS dibiarkan hidup berdampingan. Sebelum cutover,
adapter VPS dan Vercel harus bisa membaca object yang sama agar rollback host
tidak kehilangan akses media.

### Fase 3 — Siapkan kompatibilitas Vercel

1. Set environment Preview terpisah dari Production. Server-only: `DATABASE_URL`,
   URL/key Supabase Storage, token Telegram, secret webhook, secret sesi, ID
   owner/channel, URL aplikasi, dan secret recap. Jangan memasukkan service-role
   key ke `NEXT_PUBLIC_*` atau menyimpan secret dalam repo.
2. Set runtime database ke Node.js Functions dan region dekat Supabase. Uji
   koneksi dari function, termasuk jumlah koneksi saat request paralel.
3. Build lokal Vercel-compatible berhasil; `ffmpeg-static` ditambahkan untuk
   runtime. Tetap verifikasi ekstraksi video setelah deploy preview.
4. Periksa jalur webhook yang sekarang memproses update secara inline. Tambahkan
   idempotensi `update_id` dan pastikan pekerjaan berat tidak membuat Telegram
   mengirim update berulang atau pekerjaan terputus saat Function berakhir.
5. Ganti pemicu `void processDueScheduledPost()` dengan mekanisme pasca-response
   yang didukung Next/Vercel, tetap memakai klaim DB dan retry yang ada. Satu
   request hanya mengklaim satu item. Jika function mati, item harus tetap bisa
   dicoba pada request berikutnya.
6. Pertahankan status/rule media terjadwal: row dan object tersimpan saat owner
   menjadwalkan, tetapi belum masuk feed/leaderboard atau bisa dibuka melalui
   route media sebelum waktunya. Pengguna biasa tetap tidak mendapat opsi jadwal.
7. Tinjau `setTimeout` flush analytics di client untuk kehilangan event saat
   function/browser ditutup; ini bukan blocker cutover jika tidak mengubah
   akurasi metrik yang dianggap penting.

**Gerbang lanjut:** preview lolos alur upload foto/video, crop/poster, scheduled
owner, pembatasan waktu media, interaksi feed, repost admin, dan pengiriman
channel menggunakan object storage.

### Fase 4 — Cron recap saja

1. Tambahkan satu cron harian untuk `/api/cron/notify`; jadwal Vercel ditulis
   dalam UTC. `21:05 WIB` = `14:05 UTC`.
2. Pertahankan validasi `CRON_SECRET` dan idempotensi `leaderboard_announcements`.
3. Uji dengan dry-run pada preview; pastikan cron hanya menjalankan recap.
4. Jangan menambahkan cron atau polling berkala untuk `photos.scheduled_at`.

**Rollback:** aktifkan kembali cron recap VPS jika fungsi Vercel gagal. Upload
terjadwal tetap mengikuti pemicu request aplikasi.

### Fase 5 — Cutover produksi

1. Deploy Production Vercel dengan domain sementara, Supabase, dan bucket yang
   sudah tervalidasi. Jalankan smoke test tanpa mengubah webhook bot utama.
2. Masuk jendela cutover: hentikan sementara upload/perubahan di VPS, buat dump
   final DB dan manifest media final, salin delta, lalu verifikasi ulang.
3. Arahkan konfigurasi Vercel Production ke database dan media final. Pastikan
   user API/feed bekerja dan data queue cocok sebelum mengalihkan trafik.
4. Ubah Telegram webhook ke URL Vercel satu kali dan validasi update bot.
5. Alihkan domain ke Vercel. Pertahankan VPS hidup dan jangan hapus upload,
   database, cron, atau konfigurasi lama selama masa observasi.
6. Verifikasi end-to-end: login Mini App, feed, media Range video, komentar,
   rating, owner schedule, scheduled post yang sudah jatuh tempo, `message_id`,
   notifikasi, admin, recap harian, log error, DB connections, Storage egress.

### Fase 6 — Masa observasi dan pensiun VPS

1. Observasi minimal 7 hari, termasuk satu recap harian dan semua status post
   terjadwal yang jatuh tempo.
2. Ambil dump DB dan snapshot manifest media setelah stabil.
3. Pensiunkan cron recap VPS setelah cron Vercel terbukti. Pastikan tidak ada
   cron `scheduled-upload.ts` (alur itu sudah dihapus).
4. Setelah rollback tidak lagi diperlukan, hentikan PM2/Nginx dan baru hapus
   database/file VPS melalui aksi produksi yang disetujui terpisah.

## 4. Environment yang perlu dipetakan

| Variabel | Tujuan |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler untuk runtime |
| Koneksi direct Supabase | Hanya untuk Drizzle migration/maintenance; simpan sebagai env terpisah bila perlu |
| `SUPABASE_URL` + service credential | Akses Storage dari server saja |
| `APP_URL` | URL Production Vercel dan callback/link bot |
| `TELEGRAM_BOT_TOKEN` | Kirim pesan/media lewat Bot API |
| `TELEGRAM_WEBHOOK_SECRET` | Validasi webhook Telegram |
| `TELEGRAM_CHANNEL_ID`, `TELEGRAM_CHANNEL_URL` | Tujuan post dan link channel |
| `OWNER_TELEGRAM_ID` | Hak owner untuk jadwal upload |
| `SESSION_SECRET` | Penandatanganan sesi aplikasi |
| `CRON_SECRET` | Proteksi recap harian |
| `LEADERBOARD_*` | Konfigurasi recap, bila berbeda dari default |

Nama/URL connection string Supabase final dan plan Vercel harus dikonfirmasi di
dashboard masing-masing saat fase persiapan. Jangan menyalin nilai secret ke
file plan ini.

## 5. Kriteria selesai

- Semua baris DB dan sequence tervalidasi terhadap snapshot VPS.
- Semua media yang direferensikan DB punya object dengan checksum yang cocok.
- Foto terjadwal tidak terlihat/dapat diakses lebih awal, dan queue tetap
  menyimpan `channel_message_id` setelah berhasil diposting.
- Tidak ada ketergantungan produksi pada disk permanen Function.
- Webhook aman dari update duplikat dan jalur video berhasil di runtime target.
- Cron yang aktif hanya recap leaderboard; scheduled upload tidak memakai cron.
- Domain, bot, dan recap lolos smoke test; rollback host tetap bisa membaca DB
  dan media yang sama.

## 6. Catatan layanan

- Supabase: [koneksi Postgres dan pooler](https://supabase.com/docs/guides/database/connecting-to-postgres), [backup](https://supabase.com/docs/guides/platform/backups), [Storage pricing](https://supabase.com/docs/guides/storage/pricing), [egress](https://supabase.com/docs/guides/storage/serving/bandwidth).
- Vercel: [region Functions](https://vercel.com/docs/functions/configuring-functions/region), [batas Functions](https://vercel.com/docs/functions/limitations), [cron pricing/frequency](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Hobby plan](https://vercel.com/docs/plans/hobby).
- Tautan kebijakan/limit perlu dicek ulang tepat sebelum migrasi karena kuota dan paket dapat berubah.
