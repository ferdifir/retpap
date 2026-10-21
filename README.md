# Rate PAP — Telegram Mini App

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Postgres.
Foto di-rate lewat slider vertikal, reaksi emoji ditempel di titik tertentu pada foto.

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi DATABASE_URL, TELEGRAM_BOT_TOKEN, SESSION_SECRET
npm run db:migrate           # buat tabel
npm run db:seed              # foto awal + beberapa user/reaction/rating
npm run dev
```

Tanpa `TELEGRAM_BOT_TOKEN`, aplikasi tetap jalan di `npm run dev` dengan user dev per browser.

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
- `reactions` punya composite FK ke `reaction_spots (id, photo_id)`, jadi spot tidak bisa menempel ke foto lain.
- `ratings` primary key `(photo_id, user_id)` — rating kedua mengubah, bukan menambah.

## Struktur

```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/
│       ├── session/route.ts            # validasi initData → cookie sesi
│       ├── feed/route.ts               # foto + spot + rating
│       └── photos/[id]/
│           ├── reactions/route.ts      # POST toggle/pindah, DELETE
│           └── rating/route.ts         # PUT upsert
├── components/pap/
│   ├── pap-rater.tsx      # fetch feed, state, gesture
│   ├── pap-card.tsx       # kartu, tap surface, posisi pill
│   ├── reaction-pill.tsx  # stack emoji + total + N
│   ├── emoji-popover.tsx  # rincian spot + palette
│   └── ...
├── db/
│   ├── schema.ts, client.ts, queries.ts, seed.ts
├── hooks/
│   ├── use-telegram-user.ts  # identitas dari initData
│   ├── use-long-press.ts     # tap vs hold
│   ├── use-image-box.ts      # kotak gambar hasil object-contain
│   └── ...
└── lib/
    ├── init-data.ts       # HMAC-SHA256 sesuai docs Telegram
    ├── session.ts         # cookie bertanda tangan
    ├── reaction-rules.ts  # kapasitas, snap radius, urutan
    └── ...
```

## Catatan implementasi

- **Koordinat** disimpan 0..1 relatif kotak gambar yang benar-benar tergambar (`useImageBox`), bukan kotak kontainer. Dengan `object-contain` ada letterbox, dan persentase kontainer akan bergeser antar aspek layar. Tap di area letterbox ditolak.
- **Snap** dilakukan di server (`SNAP_RADIUS_RATIO = 0.04` dari lebar gambar, dikoreksi aspek), jadi dua device tidak membuat spot kembar.
- **Pill** menampilkan maksimal dua emoji: emoji milik sendiri lebih dulu kalau ada, lalu yang terbanyak. Sisanya jadi `+N`. Angka di kanan = total reaksi di spot itu (= jumlah user).
- **Tie-break** emoji dominan memakai `min(id)` per emoji — urutan insert, stabil antar render.
- **Gestur pill**: satu emoji → tap toggle, hold buka picker. Lebih dari satu emoji → tap langsung buka picker (hold dimatikan karena tap sudah membuka hal yang sama).
- **Auth**: `initData` diverifikasi di server dengan `HMAC_SHA256(key: "WebAppData", message: bot_token)`. Hanya `hash` yang dikeluarkan dari data-check-string; `signature` ikut dihitung karena klien baru mengirimkannya. `auth_date` dibatasi 24 jam.
- **Sesi**: cookie httpOnly bertanda tangan HMAC, 7 hari. `initData` tidak dikirim ulang.
- **Optimistic UI**: rating diterapkan lokal lalu direkonsiliasi dengan nilai server. Reaksi menunggu respons server karena server yang menentukan hasil akhir spot.
