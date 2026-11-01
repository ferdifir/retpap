# Share drawing ke carousel feed

Fitur: drawing yang di-share muncul sebagai slide tambahan saat foto/video itu
dibuka di feed. Geser horizontal di dalam kartu untuk pindah slide; geser
vertikal tetap ganti foto.

## Keputusan

| Pertanyaan | Keputusan |
|---|---|
| Batas slide per foto | **semua** drawing yang di-share, tanpa potong |
| Drawing pribadi milik sendiri | tetap muncul sebagai **slide khusus**, hanya untuk pemiliknya |
| Label saat tidak anonim | sama seperti komentar: nama depan, `@username` kalau ada |
| Rating di slide drawing | **tidak ada** — rating milik foto aslinya |

## Bentuk carousel

```
● ○ ○            2/3        ← indikator slide
      [foto + coretan]
Gambar oleh Anonim          ← pengganti rating/spot
```

- Slide 0 selalu foto/video asli, perilakunya tidak berubah.
- Slide berikutnya: drawing yang di-share, lalu drawing pribadi milik sendiri
  (kalau ada dan belum di-share).
- Slide drawing: tanpa marker reaksi, komentar, slider rating, dan tap emoji.
  Footer hanya label penulis + tombol **Laporkan**.
- Pindah foto (vertikal) mengembalikan slide ke 0.

## Gesture

Pemilik gesture yang ada sekarang:

| Gesture | Pemilik | Perlakuan |
|---|---|---|
| Drag vertikal | deck `flipTo` | menang kalau `|dy| > |dx|` |
| Drag horizontal di media | belum ada | carousel, hanya kalau ada slide |
| Pinch 2 jari | `usePinchZoom` | `zoomLocked` mematikan carousel |
| Long press | komentar | batal otomatis di gerak > 10px |
| Tap | emoji | ditolak kalau jari bergerak > `TAP_SLOP_PX` |
| Slider rating landscape | `RatingSlider` | sudah `stopPropagation` di pointerdown |
| Drag kanvas | `DrawCanvas` | mode gambar mematikan carousel |
| Swipe balik OS/Telegram | WebView | 24px pertama dari tepi kiri diabaikan |

Aturan:

1. **Axis lock** setelah gerak > 12px: horizontal kalau `|dx| > |dy| * 1.2`,
   selain itu vertikal. Bias 1.2 memihak vertikal karena itu navigasi utama.
   Sumbu tidak bisa berubah sampai jari diangkat.
2. **Satu pemilik gesture.** Drag horizontal ditangani di `pap-card` (tempat
   touch/pointer media sudah hidup). `pap-rater` menerima
   `onHorizontalClaim()` dan membatalkan swipe vertikalnya.
3. **Tepi kiri 24px diabaikan** supaya tidak menabrak swipe-balik Telegram.
4. **Target yang punya gesture sendiri dilewati**: `[role="slider"]`,
   `[data-native-scroll]`, tombol play video, marker spot.
5. Carousel hanya aktif kalau foto punya minimal satu slide tambahan.
6. Lepas jari: geser > 60px atau velocity > 0.3 px/ms pindah slide, kalau
   tidak snap balik. Resistansi 0.35 di ujung track.
7. Jangan pakai `touch-action: pan-x`. `useTouchGuard` sudah mematikan native
   pan global; membukanya justru menghidupkan gesture browser.
8. Keyboard: `ArrowLeft`/`ArrowRight` pindah slide.

## Data

Tambahan kolom di `drawings`:

| kolom | isi |
|---|---|
| `visibility` | `private` (default) atau `feed` |
| `is_anonymous` | default `true`; false = tampilkan nama seperti komentar |
| `shared_at` | waktu share terakhir, null saat private |

Tidak ada render PNG dan tidak ada halaman publik terpisah: slide memakai
`DrawingOverlay` yang sudah ada, jadi stroke tetap tajam dan video tetap bisa
diputar.

## API

| Endpoint | Isi |
|---|---|
| `PATCH /api/photos/[id]/drawing/share` | body `{ shared, anonymous }`, hanya pemilik baris |
| `GET /api/photos/[id]/drawings` | drawing `visibility='feed'` + drawing pribadi milik session; stroke + label penulis |
| `getFeed` | tambah `sharedCount` per foto, tanpa stroke |

Stroke diambil saat slide pertama kali dibutuhkan, bukan saat feed load.
Respons `GET .../drawings` di-cache 30 detik di server.

## Privasi

- Default private; share harus ditekan eksplisit dan anonim default menyala.
- Mencabut share menghilangkan slide seketika; tidak ada file yang perlu dihapus.
- Endpoint publik tidak pernah mengirim `user_id`, `telegram_id`, atau username
  saat anonim.
- Drawing dari foto 18+ tetap di balik blur yang sama.
- Peringatan saat share: jangan menulis nama, nomor, atau akun di gambar.
- `/admin`: cabut share per drawing dan tinjau laporan dari slide.

## Analytics

`draw_share` (`{ anonymous }`), `draw_unshare`, `draw_slide_view`
(`{ index }`), `drawing_report`. Section `/stats`: jumlah share, rasio
anonim vs bernama, slide view per foto.

## Rollout

Flag `DRAW_FEED_SHARE_ENABLED`, dibaca di `/api/session` seperti
`PAINT_TELEGRAM_IDS`, dan ditegakkan lagi di route share. Selama mati, tombol
share tidak muncul dan `PATCH` mengembalikan 403.

## Urutan kerja

1. Migrasi kolom + `PATCH share` + `GET .../drawings` + `sharedCount` di feed
2. Mesin carousel di `pap-card` (track, translate, indikator)
3. Arbitrase gesture di `pap-rater` (axis lock, `onHorizontalClaim`)
4. Sembunyikan rating/marker/tap di slide drawing, label penulis
5. Sheet share setelah **Selesai** + tombol cabut di `/goresan`
6. Moderasi `/admin`, analytics, flag
