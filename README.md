# Rate PAP — Telegram Mini App

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Postgres.
Foto dan video di-rate lewat slider vertikal, reaksi emoji ditempel di titik tertentu pada media.

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi DATABASE_URL, TELEGRAM_BOT_TOKEN, SESSION_SECRET
npm run db:migrate           # buat tabel
npm run db:seed              # foto awal + beberapa user/reaction/rating
npm run dev
```

Tanpa `TELEGRAM_BOT_TOKEN`, aplikasi tetap jalan di `npm run dev` dengan user dev per browser.

## Upload lewat bot

Tidak ada form upload di dalam Mini App; foto dan video masuk lewat chat bot.

```
/start    → ringkasan singkat
/howto    → cara pakai aplikasi
/upload   → bot minta foto atau video
media     → bot minta caption
caption   → pertanyaan cewek/cowok → pertanyaan 18+ (Ya / Bukan) → preview + tombol Upload / Batal
```

`/batal` kapan saja untuk reset. Media yang dikirim beserta caption dalam satu pesan melewati
langkah caption. Video dibatasi 30 detik dan 20 MB (batas unduh Bot API); format yang diterima
MP4/WebM.

Sesi disimpan di tabel `upload_sessions` (satu per Telegram user), jadi restart pm2 di tengah
percakapan tidak menghilangkan media. File baru diunduh dari Telegram saat tombol Terbitkan
ditekan, disimpan ke `UPLOAD_DIR` (produksi: `/var/lib/retpap/uploads`, sengaja di luar direktori
app supaya `rsync --delete` tidak menghapusnya), lalu disajikan lewat `GET /media/<slug>`.
Video memakai `ffmpeg` untuk mengambil poster dan mendukung HTTP Range agar bisa di-seek. Untuk
channel, video dibuatkan teaser 3 detik yang diblur dan tanpa audio, sehingga gerakannya
membedakannya dari foto yang cover-nya juga diblur.

### Filter gender

Saat pertama membuka Mini App, user memilih feed **Cewek**, **Cowok**, atau **Semua**.
Pilihan disimpan di `users.gender_preference` (bukan localStorage), jadi ikut di device lain,
dan bisa diganti lewat pill di header. Feed difilter di SQL: pilihan cewek/cowok menampilkan
konten dengan gender yang sama **plus** konten yang belum berlabel (`photos.gender is null`),
supaya upload lama tidak hilang. Konten baru diberi label dari pertanyaan cewek/cowok saat
upload; upload terjadwal memakai `UPLOAD_GENDER` (default `female`). Leaderboard tidak difilter.

### Konten 18+

Uploader menjawab pertanyaan 18+ sebelum konfirmasi. Jawaban disimpan di
`photos.is_nsfw`. Konten 18+ yang dikirim ke channel memakai blur lebih kuat dan badge
`18+` yang dibakar ke media (kanan atas); caption tidak diubah. Di feed, kartu 18+
diblur sampai user menekan **Tampilkan**; opsi **Selalu tampilkan konten 18+**
disimpan di `localStorage` dan bisa dimatikan lagi lewat badge `18+`. Owner juga
mendapat tombol `18+` di pesan notifikasi upload; menekannya menandai konten,
menghapus post channel lama, lalu memposting ulang versi 18+.

Webhook: `POST /api/telegram/webhook`, diautentikasi lewat header
`X-Telegram-Bot-Api-Secret-Token` yang harus sama dengan `TELEGRAM_WEBHOOK_SECRET`. Daftarkan
sekali dari server:

```bash
cd /var/www/retpap
npm run bot:setup              # buat secret kalau belum ada, lalu setWebhook + setMyCommands
npm run bot:setup -- --status  # getWebhookInfo
npm run bot:setup -- --delete  # hapus webhook
```

Kalau `bot:setup` baru membuat secret, jalankan `pm2 restart retpap --update-env` supaya app
memakai nilai itu.

## Leaderboard

Halaman `/leaderboard` dibuka dari ikon trofi di header feed. Ada empat tab: **Hari Ini**,
**Minggu Ini**, **Bulan Ini**, dan **All Time** (default). Periode memakai rating yang masuk pada
window tersebut (`ratings.created_at`), bukan tanggal upload.

- **Window WIB**: hari 00:00, minggu Senin 00:00, bulan tanggal 1, semuanya `Asia/Jakarta`.
- **Minimum**: 2 penilai untuk harian/mingguan; 3 untuk bulanan/all-time.
- **Tie-break**: rata-rata sama → penilai lebih banyak → upload lebih baru (`created_at`, lalu `id`).
- **Media**: foto dan video digabung; video memakai poster + badge play di thumbnail.
- **Identitas**: tanpa nama uploader, hanya caption, rating, dan jumlah penilai.

`GET /api/leaderboard?period=day|week|month|all` mengembalikan
`{ period, minVotes, start, end, entries }` (nilai kosong/tidak dikenal = `all`). Tab aktif
disimpan di URL dan diganti dengan `router.replace`, jadi tombol back Telegram tetap kembali ke
feed, bukan berpindah tab. Halaman mem-bootstrap sesi sendiri lewat `POST /api/session`, jadi deep
link dan reload tetap bekerja tanpa cookie; kalau gerbang bot/channel belum lolos, user
dikembalikan ke feed.

Deep link periode: `startapp=leaderboard_hari`, `leaderboard_minggu`, `leaderboard_bulan`;
`startapp=leaderboard` membuka All Time.

### Recap otomatis ke channel

`/api/cron/notify` (dipanggil setiap menit) juga mengirim recap 3 besar ke channel pada
**21:00–23:59 WIB**: harian setiap hari, mingguan hari Minggu, bulanan di hari terakhir bulan.
Periode tanpa cukup penilai di-skip, bukan dikirim kosong. Idempotensi dijaga tabel
`leaderboard_announcements` dengan `unique (kind, period_start)`; kiriman yang gagal diulang
maksimal 5 kali. Caption dipotong 60 code point (per code point, bukan byte) dan tombol recap
menuju tab periode terkait.

Env opsional: `LEADERBOARD_ANNOUNCE_HOUR` (default 21), `LEADERBOARD_CAPTION_MAX` (default 60),
`LEADERBOARD_ANNOUNCE_DRY_RUN=1` (hanya log teks, tanpa kirim dan tanpa klaim).

## Deploy

Produksi ada di VPS `root@109.111.53.58:38954`, path `/var/www/retpap`, pm2 `retpap` di port 3010.

```bash
npm run deploy                 # sync → backup DB → migrate → build → restart → health check
npm run deploy -- --dry-run    # lihat file yang akan berubah, tanpa menyentuh server
npm run deploy -- --install    # paksa npm ci (kalau lockfile berubah, ini otomatis)
```

Target bisa diganti lewat env: `SSH_HOST`, `SSH_PORT`, `REMOTE_DIR`, `PM2_APP`, `APP_PORT`, `PUBLIC_URL`.
File `.env.local` tidak pernah ikut ter-sync dan tidak terhapus oleh `--delete`.

## Database

Postgres 12. Skema ada di `src/db/schema.ts`, migrasi di `drizzle/`.

```bash
npm run db:generate   # bikin file migrasi dari perubahan skema
npm run db:migrate    # terapkan migrasi
npm run db:seed       # reset data seed (menolak jalan di production)
npm run db:studio     # drizzle studio
```

Aturan yang ditegakkan database:

- `reactions unique (photo_id, user_id)` — satu user satu emoji per foto.
- `reactions` dan `comments` punya composite FK ke `spots (id, photo_id)`, jadi spot tidak bisa menempel ke foto lain.
- Satu `spots` menyimpan dua lapisan: reaksi dan komentar. Spot baru dihapus saat keduanya kosong.
- `ratings` primary key `(photo_id, user_id)` — rating kedua mengubah, bukan menambah.

## Struktur

```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/
│       ├── session/route.ts            # validasi initData → cookie sesi
│       ├── telegram/webhook/route.ts   # update bot: /upload, foto, caption
│       ├── feed/route.ts               # foto + spot + rating
│       ├── leaderboard/route.ts        # 10 besar rata-rata rating
│       ├── media/[slug]/route.ts       # sajikan foto hasil upload
│       └── photos/[id]/
│           ├── reactions/route.ts      # POST toggle/pindah, DELETE
│           ├── comments/route.ts       # POST tulis, GET thread per spot
│           └── rating/route.ts         # PUT upsert
├── components/pap/
│   ├── pap-rater.tsx      # fetch feed, state, gesture
│   ├── pap-card.tsx       # kartu, tap/hold surface, posisi marker
│   ├── leaderboard.tsx    # podium 1–3, list 4–10
│   ├── spot-marker.tsx    # marker gabungan: emoji + badge reaksi/komentar
│   ├── spot-panel.tsx     # chip pilihan, palette emoji, thread komentar
│   └── ...
├── db/
│   ├── schema.ts, client.ts, queries.ts, seed.ts
├── hooks/
│   ├── use-telegram-user.ts  # identitas dari initData
│   ├── use-long-press.ts     # tap vs hold
│   ├── use-image-box.ts      # kotak gambar hasil object-contain
│   └── ...
└── lib/
    ├── bot/               # api.ts (Bot API), flow.ts (state machine), media.ts
    ├── init-data.ts       # HMAC-SHA256 sesuai docs Telegram
    ├── session.ts         # cookie bertanda tangan
    ├── reaction-rules.ts  # kapasitas, snap radius, urutan
    └── ...
```

## Catatan implementasi

- **Koordinat** disimpan 0..1 relatif kotak gambar yang benar-benar tergambar (`useImageBox`), bukan kotak kontainer. Dengan `object-contain` ada letterbox, dan persentase kontainer akan bergeser antar aspek layar. Tap di area letterbox ditolak.
- **Snap** dilakukan di server (`SNAP_RADIUS_RATIO = 0.04` dari lebar gambar, dikoreksi aspek), jadi dua device tidak membuat spot kembar.
- **Marker** adalah satu objek per spot: emoji dominan (atau milik sendiri), badge cyan = jumlah komentar, badge amber = total reaksi. Warna marker membedakan spot gabungan, komentar saja, dan emoji saja.
- **Gestur** mengikuti besarnya usaha: tap di area foto = palette emoji (ringan), long-press = tulis komentar (butuh mengetik). Tap marker = chip pilihan (emoji / komentar, ikon + angka saja); long-press marker = langsung ke komentar.
- **Snap**: tap dalam radius 4% dari spot yang ada masuk ke spot itu, jadi tidak pernah lahir dua marker yang menumpuk.
- **Tie-break** emoji dominan memakai `min(id)` per emoji — urutan insert, stabil antar render.
- **Share**: tombol share membuat deep link `https://t.me/<bot>?startapp=<slug>` (fallback `?photo=<slug>` untuk browser). Saat dibuka dari link, foto itu dipasang sebagai kartu pertama dan **dikeluarkan dari posisi aslinya**, jadi deck lanjut di urutan normal tanpa menampilkan foto yang sama dua kali. Tidak ada state per user — dedupe-nya murni urutan deck dalam sesi itu.
- **Deeplink leaderboard**: `https://t.me/<bot>?startapp=leaderboard` membuka Mini App lalu mendorong `/leaderboard` di atas feed. Feed tetap menjadi entri history di bawahnya, jadi tombol back kembali ke halaman rate di dalam Mini App, bukan menutup app. Nilai `leaderboard` dipesan sebagai route; `startapp` lain tetap diperlakukan sebagai slug foto.
- **Auth**: `initData` diverifikasi di server dengan `HMAC_SHA256(key: "WebAppData", message: bot_token)`. Hanya `hash` yang dikeluarkan dari data-check-string; `signature` ikut dihitung karena klien baru mengirimkannya. `auth_date` dibatasi 24 jam.
- **Sesi**: cookie httpOnly bertanda tangan HMAC, 7 hari. `initData` tidak dikirim ulang.
- **Optimistic UI**: rating diterapkan lokal lalu direkonsiliasi dengan nilai server. Reaksi menunggu respons server karena server yang menentukan hasil akhir spot.
