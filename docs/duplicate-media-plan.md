# Plan: Deteksi repost (media duplikat)

Status: **rencana** (belum ada kode, belum ada migration)

## 0. Masalah

Kasus nyata 31 Okt 2026: foto `id=102` ("pc yu", 18+, uploader @bullll12) adalah
gambar yang sama dengan `id=28` ("first donate, klo rame nanti dikasih versi
terbuka", bukan 18+, uploader kosong). Jarak dHash **1 dari 64 bit**; hanya
resolusi, caption, dan flag 18+ yang berbeda.

Selama tidak ada pengecekan, pola ini berulang: konten lama di-upload ulang
dengan caption baru, sering untuk memancing donasi, dan kadang flag 18+
diturunkan supaya lolos blur.

## 1. Keputusan

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Hash **perceptual** (dHash 64-bit), bukan hash file | Re-encode, resize, dan crop ringan mengubah byte tapi tidak mengubah gambar |
| 2 | Simpan di kolom `photos.perceptual_hash`, tanpa tabel baru | Satu nilai per media, tidak butuh riwayat |
| 3 | Video di-hash dari **poster** yang sudah dibuat | Poster sudah ada dari ffmpeg; tidak perlu decode video |
| 4 | Perbandingan di SQL pakai `bit_count(hash # $1)` | Postgres 16 di server; tanpa dependency baru |
| 5 | Duplikat **ditolak saat upload**, bukan ditandai untuk review | Review manual butuh owner hadir; penolakan langsung menghentikan perilakunya |
| 6 | Dibandingkan dengan **semua** foto, termasuk yang nonaktif | Konten yang sudah dihapus tidak boleh masuk lagi |

## 2. Deteksi

### Foto

`sharp` sudah dipakai di jalur upload. Tambah satu fungsi:

```
resize 9x8 (fit: fill) → grayscale → raw
bit ke-i = pixel[i] < pixel[i+1]
```

Hasilnya 64 bit. Biaya ~20 ms per file, tanpa dependency baru.

### Video

Poster sudah dibuat `src/lib/bot/video.ts` (ffmpeg, satu frame). Hash poster
itu, jadi tidak ada ffmpeg tambahan dan tidak ada decode video.

Konsekuensinya: hanya satu frame yang dibandingkan, jadi dua video berbeda yang
pembukanya sama (layar hitam, teks judul) bisa dianggap sama. Karena itu ambang
video lebih ketat.

### Ambang

| Media | Ambang | Catatan |
|---|---|---|
| Foto | Hamming ≤ 6 / 64 | Kasus nyata jaraknya 1; gambar berbeda biasanya ≥ 12 |
| Video | Hamming ≤ 4 / 64 | Hanya poster, jadi lebih rawan |

Ambang disimpan sebagai konstanta di kode, bukan di DB, supaya mudah disetel
ulang setelah melihat data nyata.

## 3. Schema

Satu kolom baru:

| Kolom | Tipe | Default | Fungsi |
|---|---|---|---|
| `perceptual_hash` | bigint null | null | dHash 64-bit; null untuk baris lama sebelum backfill |

Tidak ada index. Query pembanding memakai `bit_count` yang tidak bisa memakai
btree; dengan ~100 baris biayanya di bawah 1 ms, dan sampai puluhan ribu baris
masih wajar untuk seq scan 64-bit.

## 4. Query pembanding

```sql
select id, slug, caption
from photos
where perceptual_hash is not null
  and bit_count(perceptual_hash # $1) <= $2
order by bit_count(perceptual_hash # $1)
limit 1
```

Mengembalikan baris terdekat, atau null kalau tidak ada yang di bawah ambang.

## 5. Alur upload

Titik sisip: tepat sebelum `createPhoto()` di `src/lib/bot/flow.ts:1051`
(satu-satunya pemanggil). Urutannya:

1. File sudah tersimpan dan poster sudah dibuat.
2. Hitung hash dari file media (foto) atau poster (video).
3. Cek duplikat.
4. Kalau duplikat:
   - hapus file yang baru ditulis (`deleteMedia`), supaya tidak menumpuk;
   - balas ke user: **"Foto/video ini sudah pernah diposting di RetPAP."**;
   - batalkan sesi upload, jangan buat baris `photos`.
5. Kalau tidak: lanjut `createPhoto()` dengan `perceptual_hash` terisi.

Upload terjadwal (`scripts/scheduled-upload.ts`) memakai jalur yang sama, jadi
otomatis ikut terlindungi.

## 6. Backfill

Sekali jalan untuk data lama:

- Ambil semua `photos` dengan `perceptual_hash is null`.
- Hitung dari file di `UPLOAD_DIR` (video: dari poster).
- Update per baris; file yang hilang dilewati, bukan dianggap gagal.

Perkiraan: ~100 file, di bawah 5 detik. Dijalankan lokal dulu untuk melihat
berapa pasangan yang terdeteksi, baru di server.

## 7. Risiko

| Risiko | Mitigasi |
|---|---|
| Video berbeda dengan pembuka sama ditolak | Ambang video 4; kalau masih salah, ambil 2 frame (detik 0 dan 1) |
| Foto berbeda tapi komposisinya mirip (selfie serupa) ditolak | Ambang 6 cukup longgar; kalau terlalu banyak tolakan, turunkan ke 4 |
| Re-encode berat / crop besar tidak terdeteksi | dHash tahan resize dan re-encode ringan; crop besar memang lolos, dan itu di luar cakupan |
| Hash salah hitung karena EXIF orientation | Pakai `sharp().rotate()` sebelum resize, sama seperti jalur blur sekarang |

## 8. Yang tidak dikerjakan

- Embedding visual / model ML, atau `pgvector`.
- Deteksi teks caption yang mirip.
- Deteksi video dengan membandingkan banyak frame.
- Panel admin untuk melihat pasangan duplikat.
- Pengecekan saat upload terjadwal dibatalkan (tetap ikut, karena jalurnya sama).

## 9. Urutan implementasi

1. Migration: `photos.perceptual_hash`.
2. `src/lib/media-hash.ts`: `dhash(file)` dan `findDuplicateMedia(hash, kind)`.
3. Sisipkan pengecekan di `flow.ts` sebelum `createPhoto()`, termasuk
   `deleteMedia` saat ditolak.
4. Script backfill.
5. Typecheck, lint, build.
6. Deploy, backfill di server, lalu uji: upload ulang foto 28 → harus ditolak.

## 10. Pertanyaan terbuka

1. Pesan penolakan: cukup satu kalimat, atau sebutkan bahwa konten serupa sudah
   ada tanpa menyebut captionnya?
2. Apakah owner perlu bisa menembus penolakan ini (misal upload ulang untuk
   memperbaiki caption)?
