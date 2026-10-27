# Plan: Konten 18+ (blur, konfirmasi upload, aksi owner, overlay channel)

Status: **diimplementasikan (lokal, belum di-deploy)**

## Ringkasan

1. Uploader menandai kontennya 18+ sebelum upload.
2. Konten 18+ yang dikirim ke channel memakai blur lebih kuat + badge **18+** di kanan atas.
3. Pesan bot ke owner/admin dapat tombol **18+** di samping **Hapus**.
4. Di feed, konten 18+ diblur gaya X/Twitter; user bisa membuka per kartu atau
   memilih untuk selalu menampilkan tanpa blur.

Mockup UI: `docs/nsfw-mockup.html`. Varian yang dipakai: **A (toggle di overlay
kartu)**. Badge 18+ bisa ditekan lagi untuk mematikan "Selalu tampilkan".

## 1. Data Model

### `src/db/schema.ts`

- `photos`: tambah `isNsfw: boolean("is_nsfw").notNull().default(false)`.
- `upload_sessions`: tambah `isNsfw: boolean("is_nsfw")` (nullable).
  - `null` = user belum menjawab pertanyaan 18+.
  - `true` / `false` = jawaban sudah tersimpan.

### Migration

- Generate satu migration baru (mis. `drizzle/0010_*.sql`):
  - `alter table photos add column is_nsfw boolean not null default false`
  - `alter table upload_sessions add column is_nsfw boolean`
- Tidak perlu mengubah check constraint step: pertanyaan 18+ tetap memakai step
  `confirm`, dibedakan dari `is_nsfw is null`.

### Tipe & query

- `src/lib/feed-types.ts`: tambah `isNsfw: boolean` ke `FeedPhoto`.
- `src/db/queries.ts`: `getFeed` ikut memilih `photos.isNsfw` dan
  mengembalikannya. Leaderboard tidak diubah.
- `src/db/upload.ts`:
  - `UploadSession` tambah `isNsfw: boolean | null`.
  - `getUploadSession` / `saveUploadSession` ikut membaca/menulis kolom ini.
  - `NewPhoto` tambah `isNsfw?: boolean`; `createPhoto` menulis
    `isNsfw: input.isNsfw ?? false`.

## 2. Alur Upload (Bot)

Alur sekarang:

```
media → caption → konfirmasi (Upload / Batal) → publish
```

Alur baru:

```
media → caption → pertanyaan 18+ → konfirmasi (Upload / Batal) → publish
```

### Pertanyaan 18+

Setelah media + caption tersimpan, bot mengirim:

> **Konten ini mengandung 18+?**
> Pilih supaya konten diberi blur dan badge 18+.

Tombol:

- `Ya, 18+` → `callback_data: "nsfwans:yes"`
- `Bukan` → `callback_data: "nsfwans:no"`

Prefix `nsfwans:` dipakai supaya tidak bentrok dengan aksi owner `nsfw:<id>`.

Saat salah satu ditekan:

- simpan `isNsfw` ke `upload_sessions`,
- kirim pesan konfirmasi berisi media + caption + status
  (`18+: Ya` / `18+: Tidak`) + tombol `Upload` / `Batal`.

### Perubahan handler

- `handlePhoto` / `handleVideo`: setelah menyimpan sesi dengan `step: "confirm"`,
  set `isNsfw: null` lalu panggil `askNsfw()` (bukan langsung `showConfirmation`).
- `handleCaption`: setelah caption disimpan, panggil `askNsfw()`.
- `handleCallback`:
  - tambah cabang `nsfwans:yes` / `nsfwans:no`,
  - validasi sesi masih ada dan `fileId` tidak null,
  - simpan jawaban, lalu `showConfirmation()`.
- `publish`: tolak dan minta jawab dulu kalau `session.isNsfw === null`.
- `startUpload`: reset `isNsfw: null`.
- `cancelUpload` / `clearUploadSession`: tidak perlu perubahan.

### Konfirmasi

`confirmKeyboard()` tetap `Upload` / `Batal`. Status 18+ hanya ditampilkan di caption
pesan konfirmasi, bukan tombol tambahan, supaya tombol tidak bertambah.

## 3. Channel: Blur Lebih Kuat + Badge 18+

### Kekuatan blur

`src/lib/bot/media.ts`:

- Blur channel saat ini `CHANNEL_BLUR_SIGMA = 22`, teaser video `TEASER_BLUR_SIGMA = 7`.
- Tambah konstanta khusus 18+:
  - `NSFW_BLUR_SIGMA = 32` untuk foto.
  - `NSFW_TEASER_BLUR_SIGMA = 14` untuk video teaser.
- Konten non-18+ tetap memakai nilai lama.

### Badge 18+

Buat helper baru, mis. `src/lib/bot/nsfw-badge.ts`:

- Render badge PNG dengan `sharp` dari SVG:
  - kotak rounded, latar merah (`#dc2626`), teks putih tebal `18+`.
  - ukuran mis. 120×64 px, sudut 12 px.
- Cache hasilnya di memori (dibuat sekali per proses).

Penempatan:

- **Foto**: setelah `blurPhoto`, composite badge di kanan atas dengan margin 24 px
  (skala mengikuti lebar hasil).
- **Thumbnail video (fallback)**: composite badge di kanan atas setelah
  `blurredThumbnail`, margin 16 px.
- **Teaser video**: ffmpeg memakai badge PNG sebagai input kedua, lalu
  `overlay=W-w-24:24` setelah filter blur.

### Kalau blur gagal pada konten 18+

Jangan pernah mengirim original tanpa blur. Kirim dengan `has_spoiler: true`
(Telegram menutup media). Tidak ada prefiks atau teks tambahan di caption.

### Caption channel

Tidak diubah untuk konten non-18+ maupun 18+. Penanda 18+ hanya badge di media.

## 4. Pesan Bot ke Owner/Admin

Sekarang `notifyOwner` hanya punya tombol `Hapus` (`del:<id>`).

### Tombol baru

```ts
inline_keyboard: [[
  { text: "Hapus", callback_data: "del:" + photoId },
  { text: "18+", callback_data: "nsfw:" + photoId },
]]
```

### Aksi `nsfw:<id>`

Keputusan: **hapus post channel lama lalu re-post versi 18+**.

- Hanya owner (`ownerTelegramId()`), sama seperti `del:`.
- Kalau konten sudah 18+, jangan proses ulang; edit pesan jadi
  "Sudah ditandai 18+".
- Kalau belum:
  1. update `photos.is_nsfw = true`,
  2. hapus pesan channel lama (`channelMessageId`) bila ada,
  3. posting ulang ke channel dengan blur 18+ + badge, dari file yang tersimpan
     (`mediaPath(slug, "jpg"|"mp4")`),
  4. simpan `channelMessageId` baru,
  5. edit pesan owner: caption ditambah `18+`, tombol `18+` dihapus.
- Kalau channel tidak dikonfigurasi, cukup update DB dan edit pesan.
- Kalau re-post gagal, DB tetap sudah 18+; log error dan beri tahu owner.

## 5. Feed: Blur Gaya X/Twitter

### Preferensi user

- Simpan di `localStorage`: `retpap:nsfw:reveal` = `"1"` / `"0"`.
- Helper kecil `src/lib/nsfw.ts`:
  - `readNsfwReveal(): boolean`
  - `setNsfwReveal(value: boolean)`
  - aman untuk SSR (cek `typeof window`).
- Default: blur aktif.

### `PapCard` (`src/components/pap/pap-card.tsx`)

Untuk `item.isNsfw && !revealed`:

- Media tetap dirender, tetapi:
  - foto: `filter: blur(36px) brightness(0.48)`, `scale(1.14)` agar tepi
    tidak transparan.
  - video: jangan render `VideoSurface`; render poster (`item.posterUrl`)
    dengan blur yang sama. Video tidak autoplay.
- Overlay penuh:
  - badge `18+` di kanan atas,
  - teks "Konten 18+",
  - tombol **Tampilkan** (buka kartu ini saja),
  - tombol **Selalu tampilkan** (set preferensi global) di dalam overlay,
    sesuai varian A.
- Selama blur:
  - tap/hold/reaksi/komentar/rating/marker tidak aktif,
  - `RatingSlider` tidak dirender,
  - `SpotMarker` tidak dirender,
  - tombol next/previous tetap boleh, karena navigasi bukan interaksi konten.

Setelah revealed:

- render media normal,
- badge `18+` kecil tetap di kanan atas,
- semua interaksi aktif.

Kalau preferensi global `reveal = true`, semua kartu 18+ langsung tampil normal
dengan badge kecil.

### Leaderboard

Tidak diubah. Thumbnail leaderboard tetap tampil tanpa blur.

### Share / deep link

- Tidak ada perubahan khusus: share link membuka feed, jadi aturan blur yang sama
  otomatis berlaku.

## 6. File yang Disentuh

| File | Perubahan |
|---|---|
| `src/db/schema.ts` | kolom `photos.is_nsfw`, `upload_sessions.is_nsfw` |
| `drizzle/0010_*.sql` + meta | migration |
| `src/db/upload.ts` | sesi + `createPhoto` membawa `isNsfw` |
| `src/db/queries.ts` | `getFeed`, `getLeaderboard` mengembalikan `isNsfw` |
| `src/lib/feed-types.ts` | `isNsfw` di `FeedPhoto` |
| `src/lib/bot/flow.ts` | pertanyaan 18+, guard publish, tombol owner, re-post channel |
| `src/lib/bot/media.ts` | sigma blur 18+, composite badge |
| `src/lib/bot/nsfw-badge.ts` (baru) | render badge PNG |
| `src/lib/bot/video.ts` | teaser 18+ dengan overlay badge |
| `src/lib/nsfw.ts` (baru) | preferensi reveal di localStorage |
| `src/components/pap/pap-card.tsx` | blur, overlay, disable interaksi |
| `scripts/scheduled-upload.ts` | kirim `isNsfw: false` saat `createPhoto` |
| `README.md` / `PLAN.md` | dokumentasi singkat |

## 7. Edge Case

- User menekan Upload sebelum menjawab 18+ → bot mengulang pertanyaan.
- User mengirim media baru saat masih di step konfirmasi → sesi diganti,
  `isNsfw` kembali `null`.
- Owner menekan `18+` pada konten yang sudah dihapus → balas "Konten sudah tidak aktif".
- Owner menekan `18+` dua kali → idempoten, tidak posting ulang dua kali.
- Blur 18+ gagal di channel → spoiler + prefiks caption, bukan original.
- Video 18+ yang teaser-nya gagal dibuat → fallback thumbnail ber-blur + badge.
- Preferensi reveal disimpan per browser/device, bukan per akun.
- Leaderboard tidak berubah; konten 18+ tetap tampil normal di sana.

## 8. Testing Manual

1. Upload foto, jawab "Bukan 18+" → channel blur normal, tanpa badge.
2. Upload foto, jawab "Ya, 18+" → channel blur lebih kuat + badge 18+ kanan atas.
3. Upload video 18+ → teaser blur lebih kuat + badge; fallback thumbnail juga berbadge.
4. Owner menerima pesan dengan tombol Hapus + 18+.
5. Tekan 18+ → feed diblur, channel lama dihapus dan diganti versi 18+.
6. Buka feed sebagai user lain → kartu 18+ diblur, tombol Tampilkan berfungsi.
7. Aktifkan "Selalu tampilkan" → reload, semua 18+ tampil tanpa blur.
8. Saat blur aktif, tap/hold/rating/marker tidak bereaksi.
9. Video 18+ tidak autoplay selama blur.
10. Upload sebelum menjawab 18+ → tidak bisa publish.

## 9. Keputusan yang Sudah Dikonfirmasi

1. **Leaderboard**: tidak perlu blur; hanya feed.
2. **Aksi 18+ dari owner**: hapus post channel lama, lalu re-post versi 18+.
3. **Caption channel 18+**: cukup badge di media, tanpa prefiks/teks tambahan.
4. **Blur feed**: dinaikkan sedikit dari rencana awal menjadi
   `blur(36px) brightness(0.48) scale(1.14)`.
5. **Tombol "Selalu tampilkan"**: varian A (overlay kartu). Mematikan pilihan
   dilakukan dengan menekan badge `18+` pada kartu.

## 10. Status Implementasi

- Migration: `drizzle/0010_fixed_marvel_zombies.sql`.
- Badge: `src/lib/bot/nsfw-badge.ts` (sharp, di-cache per ukuran).
- Teaser video 18+: overlay badge lewat `-filter_complex` di `src/lib/bot/video.ts`.
- Preferensi feed: `src/lib/nsfw.ts` memakai `useSyncExternalStore` + `localStorage`.
- Leaderboard tidak diubah.
