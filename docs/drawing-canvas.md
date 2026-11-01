# Kanvas gambar privat

Fitur: user bisa menggambar di atas foto/video, dan gambarnya tersimpan serta
hanya terlihat oleh user itu sendiri.

## Cara masuk

Tap foto → panel titik → buka sheet katalog emoji → tab **Gambar**.

Saat masuk mode gambar:
- foto 18+ yang masih blur otomatis dibuka (menggambar butuh clear view)
- tap-reaction, long-press komentar, dan pinch-zoom dimatikan
- toolbar bawah: 4 warna, 2 ukuran kuas, penghapus, undo, hapus semua, selesai

## Data

Tabel `drawings` (migrasi `0019_neat_wolfsbane.sql`):

| kolom | isi |
|---|---|
| `photo_id`, `user_id` | unik bersama: satu kanvas per user per foto |
| `strokes` | jsonb array `{ color, width, points: [[x,y]…] }` |

- Koordinat **0..1 relatif kotak media**, sama seperti `spots`. Jadi gambar
  menempel di bagian foto yang sama pada layar apa pun, termasuk video
  letterbox (digambar di kotak media, bukan di container).
- `width` juga fraksi lebar media, sehingga kuas ikut mengecil/membesar.
- Disimpan sebagai stroke, bukan PNG: kecil, tajam di semua resolusi, dan
  undo/erase murah.
- `color: "erase"` dihapus dengan `destination-out`, jadi tidak meninggalkan
  bekas putih di atas foto.

Batas dari `sanitiseStrokes()` di `src/lib/draw.ts`: maks 200 stroke, 1.500
titik per stroke, 20.000 titik total, warna harus hex 6 digit atau `erase`.

## Privasi

- `GET/PUT /api/photos/[id]/drawing` hanya memakai `user_id` dari session.
  Tidak ada route yang bisa membaca kanvas orang lain.
- Feed hanya mengirim flag `hasDrawing` (satu query tambahan), stroke diambil
  saat kartu aktif.
- Tidak masuk channel, leaderboard, notifikasi, atau analytics.
- Server tetap menyimpan datanya. Kalau user menghapus foto, baris ikut
  terhapus (`on delete cascade`).

## Rollout bertahap

Fitur ini dibatasi per Telegram id lewat env:

```
PAINT_TELEGRAM_IDS=123456789,987654321
```

- Kosong = hanya owner (`OWNER_TELEGRAM_ID`) yang bisa memakai.
- Owner selalu ikut, tanpa perlu ditulis di daftar.
- Diterapkan di dua tempat: `/api/session` (menentukan tab muncul) dan route
  gambar (menolak 403), jadi user di luar daftar tidak bisa menembak API.
- Mengubah daftar butuh `pm2 restart retpap --update-env` karena env dibaca
  saat proses start.
