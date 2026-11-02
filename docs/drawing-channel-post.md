# Plan: drawing ikut di-post ke channel

Status: **sudah diimplementasikan** (2026-11-02), belum di-deploy.
Post ke channel sungguhan belum pernah dijalankan — lihat §12.

Fitur ini menyambung `docs/drawing-feed-share.md`: slide carousel sudah ada,
sekarang coretan yang di-share juga tayang di channel seperti post foto/video.

## 0. Keputusan owner (2026-11-02)

| Hal | Keputusan |
|---|---|
| Caption | `"<b>“Coretan dari RetPAP”</b>\n\nCoretan ini dibuat user di atas foto. Lihat versi jelas + coretan lainnya di aplikasi."` (verbatim) |
| Moderasi | Otomatis untuk semua yang punya akses share, tanpa batas harian |
| Blur | Foto **dan** coretan sama-sama di-blur |
| Nama | Channel tidak pernah menyebut nama pembuat coretan |

## 1. Perilaku

1. User menekan **Bagikan** di panel coretan → baris `drawings` jadi
   `visibility='feed'` (seperti sekarang) **dan** satu post baru masuk channel.
2. Tombol di post membuka Mini App dengan `startapp=draw-<id>-<slug>`,
   sehingga carousel langsung terbuka pada slide coretan itu.
3. **Berhenti bagikan** menghapus post channel dan menyembunyikan slide.
4. Share ulang setelah berhenti = post baru (post lama sudah dihapus).

## 2. Render gambar

File baru `src/lib/bot/drawing-image.ts`, fungsi
`renderDrawingTeaser(photo, strokes): Promise<Buffer | null>`.

1. Sumber: `mediaPath(slug, "jpg")`. Untuk video, jpg itu adalah poster.
   Kalau file tidak ada → return null, post dilewati (feed tetap jalan).
2. Base: `sharp(bytes).rotate().resize(1600 inside).blur(32).toBuffer()` —
   konstanta yang sama dengan `blurPhoto` (`CHANNEL_BLUR_SIGMA`).
3. Layer coretan: SVG seukuran base, latar transparan.
   - `<mask>`: rect putih + stroke `erase` berwarna hitam, jadi penghapus
     tetap bekerja tanpa meninggalkan bekas.
   - stroke biasa: `<polyline>` dengan `stroke-width = width * lebarBase`,
     `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`.
4. Layer itu di-rasterize (PNG), lalu `blur(CHANNEL_BLUR_SIGMA)` juga.
   Efeknya: bentuk coretan masih terbaca sebagai gumpalan warna, detailnya
   tidak. Kalau nanti terasa terlalu hancur, turunkan sigma layer saja
   (satu konstanta) tanpa menyentuh foto.
5. `sharp(base).composite([{ input: layer }]).jpeg({ quality: 82, mozjpeg: true })`.

Batasan yang sudah ada tetap berlaku: maks 200 stroke / 20.000 titik
(`src/lib/draw.ts`), jadi render tidak bisa dibanjiri input raksasa.

## 3. Posting ke channel

Di `src/app/api/photos/[id]/drawing/share/route.ts`, setelah
`setDrawingShare()` sukses dan `shared === true`:

- `after()` → ambil drawing + foto, render teaser, `sendPhotoFile(channelId(), ...)`.
- Caption: teks di §0, `parse_mode: "HTML"`.
- Tombol: `Lihat coretan` (`drawingStartUrl(id, slug)`) dan `Upload`.
- Simpan `message_id` ke `drawings.channel_message_id`.
- Kalau channel belum dikonfigurasi: lewati tanpa error.
- Kalau render/kirim gagal: catat di log, share di feed tetap sukses. User bisa
  toggle off/on untuk mencoba lagi.
- Kalau `channel_message_id` sudah terisi: jangan kirim ulang.

## 4. Deep link

- `src/lib/share.ts`: `drawingStartUrl(drawingId, slug)` →
  `https://t.me/<bot>?startapp=draw-<id>-<slug>`.
- `readStartTarget()` menambah tipe `{ type: "drawing"; slug; drawingId }`
  dengan regex `^draw-(\d+)-([A-Za-z0-9_-]{10,24})$`. Slug sendiri hanya
  memakai `A-Za-z0-9_-`, jadi awalan `draw-<angka>-` tidak bisa bentrok.
- `readSharedSlug()` tetap mengembalikan slug, supaya urutan feed sama
  seperti `?photo=`.
- Target `drawing` hanya dipakai sekali saat launch (pola `startTargetHandled`
  yang sudah ada), bukan setiap render.

## 5. Membuka slide yang dituju

- `pap-card.tsx`: setelah `slides` termuat, kalau ada target drawing dan
  `slides[i].id === drawingId` → `setSlideIndex(i)`.
- Kalau coretan sudah tidak ada / tidak di-share (mis. di-unshare setelah post
  terkirim) → jatuh ke slide pertama, jangan error.
- Berlaku juga untuk video, karena slide drawing memakai poster yang sama.

## 6. Skema

```ts
// src/db/schema.ts, tabel drawings
channelMessageId: bigint("channel_message_id", { mode: "number" }),
```

Migrasi `0022` (satu kolom nullable, tanpa index). Aman di-rollback: drop column.

## 7. Berhenti bagikan

- Setelah `setDrawingShare(false)`: `after()` memanggil
  `deleteMessage(channelId(), channelMessageId)`.
- Sukses → `channel_message_id = null`.
- Gagal → biarkan id-nya, catat error. Bot API hanya bisa menghapus pesan
  yang umurnya < 48 jam; lewat dari itu post tetap ada walau slide sudah
  hilang dari feed. Ini batasan Telegram, bukan bug.

## 8. Risiko

| Risiko | Tingkat | Catatan |
|---|---|---|
| Coretan tidak layak tayang langsung masuk channel | sedang | tanpa moderasi sesuai keputusan owner; hapus manual + `deleteMessage` kalau perlu |
| Spam share berulang membanjiri channel | rendah | user masih sedikit; pantau `/stats` (`draw_share`) |
| Post tidak bisa dihapus setelah 48 jam | rendah | slide tetap bisa disembunyikan dari feed |
| Render gagal di foto besar | rendah | maks 1600 px, sharp sudah dipakai untuk blur channel |

## 9. Uji

- [ ] Share drawing di foto → post channel muncul, caption persis §0.
- [ ] Tombol membuka carousel tepat di slide coretan itu.
- [ ] Buka link di luar Telegram (`?photo=`) tetap membuka foto, bukan error.
- [ ] Share drawing di video → teaser dari poster, slide tetap kebuka.
- [ ] Berhenti bagikan → post hilang, slide hilang, feed bersih.
- [ ] Share ulang → post baru, bukan duplikat.
- [ ] Foto tanpa file di disk → share tetap sukses, post dilewati.
- [ ] Coretan dengan penghapus → area yang dihapus tidak ikut ter-blur warna.
- [ ] Anonim / non-anonim → caption identik, tidak ada nama.

## 10. File yang berubah

| File | Perubahan |
|---|---|
| `src/lib/bot/drawing-image.ts` | baru: render teaser |
| `src/lib/bot/media.ts` | expose konstanta blur / helper resize kalau perlu |
| `src/lib/share.ts` | `drawingStartUrl`, tipe target `drawing`, parser |
| `src/app/api/photos/[id]/drawing/share/route.ts` | post + hapus pesan |
| `src/db/queries.ts` | simpan/ambil `channelMessageId` |
| `src/db/schema.ts` + `drizzle/0022_*.sql` | kolom baru |
| `src/components/pap/pap-card.tsx` | buka slide sesuai target |

## 11. Urutan kerja

1. Render teaser + uji manual dengan 3 drawing nyata dari DB.
2. Kolom + migrasi lokal.
3. Post saat share, lalu hapus saat unshare.
4. Deep link + buka slide.
5. Uji end-to-end di dev, baru deploy (butuh persetujuan terpisah).
## 12. Status implementasi (2026-11-02)

| Bagian | Status |
|---|---|
| Render teaser (`drawing-image.ts`) | selesai, dicek visual: foto blur, coretan blur, area `erase` bolong |
| Kolom `drawings.channel_message_id` | migrasi `0022`, sudah di DB lokal |
| Post saat share | selesai, diuji dengan token palsu: share tetap 200, error dicatat, kolom tetap null |
| Skip kalau sudah pernah dipost | selesai, diuji: `channel_message_id` tidak berubah |
| Hapus saat unshare | selesai, diuji gagal-hapus: slide tetap privat, id dipertahankan |
| Deep link `draw-<id>-<slug>` | selesai, diuji parser: target drawing, slug lama, leaderboard, format salah |
| Buka slide sesuai target | kode selesai, belum diuji di Telegram sungguhan |

Yang belum: post sukses ke channel asli dan lompatan carousel di klien Telegram.
Keduanya butuh deploy + satu drawing nyata, jadi menunggu persetujuan.