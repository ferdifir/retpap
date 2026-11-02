# Plan: Migrasi ke Supabase + Vercel + R2 + worker Android

Status: **rancangan** (belum ada kode, env, atau data yang diubah)

Dokumen ini menggantikan asumsi "pindah semua ke serverless". Pekerjaan yang
butuh filesystem atau binary besar tetap punya rumah sendiri, dan cron yang
sekarang berjalan tiap menit dipecah jadi reaktif + scheduler kalender.

## 0. Keputusan arsitektur

| Komponen | Rumah baru | Pemicu | Alasan |
|---|---|---|---|
| Web, API, webhook | Vercel Hobby | request | Next 16 + `cacheComponents` paling aman di Vercel |
| Database | Supabase free (500 MB) | — | Postgres 16, sama dengan sekarang |
| Media (jpg/mp4) | Cloudflare R2 | — | egress gratis; Supabase free cuma 5 GB/bulan |
| Notify | request yang membuatnya | `after()` setelah response | kejadian, bukan jadwal |
| Recap leaderboard | Vercel route | `pg_cron` 1x/hari | kejadian kalender |
| Scheduled upload | Android (Termux) | antrean + window catch-up | sumber foto memang di HP |
| Transcode video | Vercel (`ffmpeg-static`) | webhook | user menunggu, tidak boleh bergantung pada HP |

Aturan yang mengikat semua keputusan di bawah:

1. **Reaktif hanya untuk kejadian.** Yang berbasis jam tetap scheduler.
2. **HP tidak pernah dipanggil.** Semua kerja HP lewat antrean (pull).
3. **Setiap pekerjaan punya lease + attempts.** Tanpa itu, dua pekerja bisa
   mengerjakan baris yang sama.

```
Telegram ──webhook──> Vercel (Next)
                         │  ├─ Postgres (Supabase, pooler 6543)
                         │  ├─ R2 (media)
                         │  └─ Bot API (channel, notif)
                         │
Supabase trigger ──pg_net──> /api/cron/notify?kind=flush
Supabase pg_cron ──pg_net──> /api/cron/notify   (00:05 WIB, recap saja)
Android (Termux) ──poll/realtime──> tabel upload_jobs ──> R2 + Postgres + Bot API
```

## 1. Fase migrasi

Setiap fase bisa dibalik tanpa kehilangan data. Jangan gabungkan dua fase dalam
satu langkah.

### Fase 1 — Database ke Supabase

1. Buat project Supabase (region Singapore, paling dekat).
2. `pg_dump` dari VPS → restore ke Supabase (port **5432**, direct).
3. Ganti `DATABASE_URL` ke pooler **port 6543** (transaction mode) + `?sslmode=require`.
4. Ubah `src/db/client.ts`:

```ts
const pool = new Pool({
  connectionString,
  max: 1,                       // satu koneksi per instance function
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
```

5. `drizzle.config.ts` tetap memakai koneksi **direct** (5432) untuk
   `db:migrate`; pooler transaction mode tidak mendukung DDL multi-statement.
6. Jalankan `npm run db:migrate` dari lokal untuk memastikan migrasi bisa
   diterapkan ke Supabase.

**Rollback**: kembalikan `DATABASE_URL` ke VPS. Skema identik, tidak ada
perubahan data.

**Catatan penting**

- Free plan **pause setelah 7 hari tanpa aktivitas**. Cron recap harian sudah
  cukup untuk mencegahnya, tapi jangan mengandalkan ini untuk staging.
- Free plan **tidak punya backup**. Ganti `pg_dump` yang sekarang ada di
  `scripts/deploy.sh` dengan GitHub Actions mingguan → R2.
- `events` akan terus tumbuh; siapkan retensi 90 hari sebelum menembus 500 MB.

### Fase 2 — Media ke R2

1. Buat bucket `retpap-media`, sambungkan custom domain
   (`media.bot.linkviu.my.id`) lewat Cloudflare.
2. Salin 46 file dari `UPLOAD_DIR` ke bucket dengan key `<slug>.<ext>`.
3. Backfill URL di DB (lihat §2.4).
4. Ubah `src/lib/bot/media.ts`:
   - `writeMedia` → `PutObjectCommand`
   - `deleteMedia` → `DeleteObjectCommand`
   - `mediaUrl`/`videoUrl` → URL absolut R2
   - `mediaPath` tetap ada selama transisi, lalu dihapus
5. `src/app/media/[slug]/route.ts` → **308 redirect** ke R2 selama 30 hari,
   lalu dihapus. Link lama di chat/Channel masih hidup.
6. `src/lib/bot/flow.ts:293` (repost admin) membaca file dari disk →
   ganti jadi `fetch` ke R2.
7. `next.config.ts` → tambah `remotePatterns` untuk domain media.

**Rollback**: `mediaUrl` dikembalikan ke `/media/...`; file masih ada di VPS
sampai fase 6.

**Jangan** pakai Supabase Storage untuk media: egress 5 GB/bulan habis oleh
~1.600 penayangan video 3 MB.

### Fase 3 — Web ke Vercel

1. Import repo, set env (lihat §6), region `sin1`.
2. `ffmpeg-static` untuk video (lihat §2.5).
3. Deploy, uji dengan domain preview sebelum menyentuh DNS.
4. `npm run bot:setup` → `setWebhook` ke domain Vercel.
5. Pindahkan DNS (Cloudflare sudah mem-proxy, jadi cukup ubah origin).

**Rollback**: `setWebhook` balik ke VPS + DNS balik. Webhook adalah satu-satunya
titik switch, jadi rollback-nya hitungan detik.

### Fase 4 — Notify reaktif + recap terjadwal

Lihat §2.1–§2.3. Setelah ini cron VPS `retpap-notify.sh` dimatikan.

**Rollback**: hapus trigger + job `pg_cron`, hidupkan lagi cron 1 menit.

### Fase 5 — Scheduled upload ke Android

Lihat §3. Setelah worker HP terbukti jalan 3 hari berturut-turut, cron VPS
`scheduled-upload.ts` dimatikan.

**Rollback**: cron VPS masih terpasang (nonaktif), tinggal di-enable.

### Fase 6 — Matikan retpap di VPS

Hapus cron, pm2, nginx site, dan `UPLOAD_DIR` **setelah** Fase 2–5 stabil
minimal seminggu. Simpan `pg_dump` terakhir di luar server.

## 2. Perubahan kode

### 2.1 Notify: per event, bukan sweep

Status: **sudah diimplementasikan** (2026-11-02). Ini yang menggantikan cron
satu menit, jadi tidak ada trigger `pg_net` dan tidak ada klaim baris.

- `addComment`, `ratePhoto`, `reactToPhoto` menulis baris `notifications` di
  transaksi yang sama dengan aksinya, hanya kalau pemilik foto mengaktifkan
  notifikasi dan bukan pelakunya sendiri.
- Route memanggil `deliverAfterResponse([...])`; `after()` mengirim pesan
  Telegram setelah response selesai, jadi user tidak menunggu bot API.
- Digest 15 menit dihapus. Rating dan reaksi sekarang memicu notifikasi
  sendiri-sendiri, dan isinya anonim ("Seseorang") karena rating/reaksi memang
  tidak menampilkan identitas di feed.
- `/api/cron/notify` tinggal recap leaderboard. Di Vercel cukup cron harian.
- Baris yang gagal terkirim tetap tersimpan dengan `attempts` + `error`, tapi
  **tidak di-retry otomatis**. Kalau nanti butuh retry, tambahkan klaim
  `UPDATE ... RETURNING` dan panggil dari event berikutnya untuk user yang sama.

### 2.2 Recap: satu job kalender

```sql
select cron.schedule('retpap-recap', '5 17 * * *', $$   -- 00:05 WIB
  select net.http_post(
    url := 'https://bot.linkviu.my.id/api/cron/notify',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body := '{}'::jsonb
  );
$$);
```

Idempotensi sudah ada di `leaderboard_announcements` (unique per kind+period),
jadi job ini aman dijalankan dua kali.

### 2.3 Endpoint cron

`src/app/api/cron/notify/route.ts` sekarang hanya menjalankan recap:

```ts
const leaderboard = await maybeAnnounceLeaderboards();
return Response.json({ leaderboard });
```

Secret tetap `x-cron-secret`. `pg_net` mengirim header sebagai JSON object.

### 2.4 Media

```ts
// src/lib/bot/media.ts
export function mediaUrl(slug: string): string {
  return MEDIA_PUBLIC_URL + "/" + slug + ".jpg";
}
```

Backfill DB:

```sql
update photos
set image_url = replace(image_url, '/media/', 'https://media.bot.linkviu.my.id/'),
    poster_url = replace(poster_url, '/media/', 'https://media.bot.linkviu.my.id/')
where image_url like '/media/%';
```

### 2.5 Video

- `package.json`: `ffmpeg-static` (dependency, bukan dev).
- `src/lib/bot/video.ts`: `ffmpegPath()` → `process.env.FFMPEG_PATH ?? ffmpegStatic`.
- `maxDuration = 300` di route webhook (Hobby sudah 300 detik).
- Temp file tetap di `os.tmpdir()`; instance tidak dipakai ulang, jadi tidak ada
  kebocoran antar-request.

**Risiko**: cold start + bundle 80 MB. Kalau terasa lambat, pindahkan transcode
ke job queue (lihat §3.4) — bukan ke HP.

### 2.6 Webhook

`handleUpdate` dipanggil inline. Dengan 300 detik ini cukup, **tapi** Telegram
menganggap webhook gagal bila tidak ada respons dalam ~60 detik dan akan
mengirim ulang update yang sama. Video 60 detik + ffmpeg + upload channel bisa
melewatinya.

Mitigasi minimal: tabel `processed_updates(update_id bigint primary key)`,
di-insert di awal handler; duplikat langsung di-ack tanpa diproses.

```sql
create table processed_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);
```

## 3. Worker Android

### 3.1 Batasan yang membentuk desain

- HP tidak punya IP publik → **tidak bisa** dipanggil webhook.
- Doze mode membekukan proses saat layar mati.
- Jaringan seluler putus-nyambung.
- Token bot ada di perangkat yang bisa hilang.

Karena itu: **window + catch-up**, bukan jadwal tepat.

### 3.2 Kontrak kerja

```
Setiap 5 menit (atau saat Realtime memberi sinyal):
  jika jam WIB di luar 07:00–23:00      → tidur
  jika kuota hari ini >= MAX_PER_DAY    → tidur
  jika jarak dari upload terakhir < MIN_GAP → tidur
  ambil 1 file dari folder inbox HP
  proses (sharp/ffmpeg) → upload R2 → insert photos → kirim channel
  catat di state lokal
```

Kuota harian dihitung dari DB, bukan dari state lokal:

```sql
select count(*) from photos
where user_id = $worker_user
  and created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
```

State file `.upload-state.json` **tetap di HP** — isinya daftar file yang sudah
dipakai, dan file itu memang hanya ada di HP. Tidak perlu tabel baru.

### 3.3 Termux

```bash
pkg install nodejs ffmpeg
termux-wake-lock
# matikan optimasi baterai untuk Termux di setelan Android
```

Jalankan dengan `termux-services` atau `tmux` supaya hidup lagi setelah reboot.

### 3.4 Kalau nanti butuh antrean

Tabel `jobs` hanya perlu kalau ada pekerjaan yang **dipicu user** dan harus
dikerjakan HP (mis. transcode). Untuk scheduled upload murni, tidak perlu —
worker cukup memeriksa kuota.

```sql
create table jobs (
  id bigint generated by default as identity primary key,
  kind text not null check (kind in ('transcode','repost')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
```

Klaim: `update ... set status='running', lease_until=now()+interval '10 minutes'
where id = (select id from jobs where status='queued' or (status='running' and
lease_until < now()) order by id limit 1 for update skip locked) returning *;`

### 3.5 Keamanan

| Risiko | Mitigasi |
|---|---|
| HP hilang → token bot bocor | Buat bot kedua khusus worker, atau siapkan prosedur `revoke` via BotFather |
| HP punya akses DB penuh | Buat role `retpap_worker` dengan grant hanya `insert photos`, `select users/photos`; jangan pakai kredensial app |
| Kredensial di file | Simpan di `~/.retpap.env` dengan `chmod 600` |

## 4. Environment

| Variabel | Status | Catatan |
|---|---|---|
| `DATABASE_URL` | diubah | pooler 6543 + `sslmode=require` |
| `MEDIA_PUBLIC_URL` | **baru** | `https://media.bot.linkviu.my.id` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | **baru** | |
| `FFMPEG_PATH` | baru (opsional) | default ke `ffmpeg-static` |
| `CRON_SECRET` | diubah | disimpan juga di Supabase Vault |
| `APP_URL`, `SESSION_SECRET`, `TELEGRAM_*`, `OWNER_TELEGRAM_ID` | tetap | |
| `UPLOAD_DIR` | dihapus | tidak ada disk lokal |

## 5. Batas free tier

| Layanan | Limit | Dampak |
|---|---|---|
| Vercel Hobby | 300 dtk/function, 2 GB RAM, bundle 250 MB, cron maks 1x/hari | cukup; cron hanya untuk recap |
| Supabase | DB 500 MB, egress 5 GB, pause 7 hari idle, tanpa backup | DB aman; backup harus dibuat sendiri |
| Supabase Realtime | 200 koneksi, 2 juta pesan/bulan | satu HP = satu koneksi |
| Cloudflare R2 | 10 GB storage, egress gratis | media tidak jadi masalah |

## 6. Yang hilang dari setup sekarang

- `npm run deploy` (rsync + dump + migrate + build + restart) → diganti
  `git push` + migrasi manual.
- Backup otomatis tiap deploy → harus dibuat sendiri (GitHub Actions mingguan).
- Nginx + pm2 sebagai pengaman → tidak ada fallback kalau Vercel down.
- Kontrol penuh atas waktu eksekusi → function bisa cold start.

## 7. Risiko

| Risiko | Tingkat | Mitigasi |
|---|---|---|
| Notifikasi gagal tidak di-retry | rendah | baris tersimpan dengan `attempts`/`error`; tambahkan retry kalau perlu |
| Video upload > 60 dtk → Telegram retry | tinggi | `processed_updates` |
| Egress media membengkak | sedang | R2, bukan Supabase Storage |
| HP mati saat jadwal upload | sedang | window + catch-up |
| Token bot di HP | sedang | role terbatas + prosedur revoke |
| Free plan pause | rendah | recap harian menjaga aktivitas |

## 8. Checklist uji

- [ ] Upload foto dari bot → media ada di R2, URL di DB absolut.
- [ ] Upload video → poster + teaser jadi, channel terkirim < 60 dtk.
- [ ] Rating/komentar/reaksi → notifikasi terkirim < 2 dtk (bukan menunggu 60 dtk).
- [ ] Matikan endpoint notif → baris gagal, `attempts` naik, sweep 5 menit mengirim ulang.
- [ ] Dua invoker bersamaan → tidak ada notifikasi ganda.
- [ ] Recap 00:05 WIB → terkirim sekali, baris `leaderboard_announcements` bertambah.
- [ ] Link `/media/<slug>.jpg` lama → 308 ke R2.
- [ ] Video playback di Mini App → range request jalan dari R2.
- [ ] `/admin` hapus konten → file di R2 ikut terhapus.
- [ ] HP tidur 8 jam → bangun, kuota hari ini terisi sesuai window.
- [ ] HP mati 2 hari → saat hidup, tidak membanjiri channel (MAX_PER_DAY tetap).
- [ ] `pg_dump` mingguan berhasil ke R2 dan bisa di-restore.

## 9. Urutan kerja yang disarankan

1. ~~§2.1(a) klaim notifikasi~~ — selesai: notify sudah per event, tanpa cron.
2. Fase 1 (DB), diamkan seminggu.
3. Fase 2 (media) + backfill.
4. Fase 3 (web) + webhook switch.
5. Fase 4 (reaktif + recap).
6. Fase 5 (worker HP).
7. Fase 6 (matikan VPS).
