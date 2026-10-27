# media-check

Skrip berdiri sendiri untuk menandai konten yang kemungkinan bukan milik pengunggah. Tidak menyentuh DB, tidak mengubah file.

```bash
node scripts/media-check.mjs /path/foto.jpg          # cepat: hash + watermark
node scripts/media-check.mjs /path/foto.jpg --ocr    # tambah pembacaan teks
node scripts/media-check.mjs /path/*.jpg --json      # keluaran mesin
```

## Tiga lapis

**1. phash** — dHash 64-bit dari `sharp`, ~19 ms per gambar. Menangkap foto yang di-upload ulang walau sudah dikompres ulang. Jarak Hamming ≤ 6 dianggap duplikat. Lemah pada crop berat (crop 40% → jarak ~37), karena itu ada `phashCrop` sebagai sidik jari kedua.

**2. watermark template** — patch watermark yang sudah dikenal disimpan di `scripts/watermarks/*.png` (+ `.json` berisi label). Dicocokkan ke seluruh gambar dengan normalized cross-correlation, skor 0–1, ambang **0,90**.

Menambah watermark baru: potong patch-nya dari foto yang sudah dikonfirmasi, simpan sebagai PNG, lalu tulis labelnya di JSON dengan nama sama.

**3. ocr** — `tesseract.js`, hanya jalan kalau `--ocr`. Mencari teks yang cocok blocklist (`bullgp`, `rate dong`, `@username`, `t.me/`, dst.) atau teks besar di pita tengah.

## Batas yang sudah diukur

- Watermark semi-transparan seperti BULLGP **tidak terbaca OCR**, bahkan setelah di-crop dan diperbesar 4–6x. Karena itu lapis 2 ada.
- OCR hanya berguna untuk teks kontras tinggi: `@username`, `t.me/...`, tulisan putih bertepi.
- Template hanya menangkap watermark yang sudah dikenal. Foto curian dari sumber baru butuh satu sampel untuk didaftarkan.

## Hasil uji

| Berkas | Skor watermark | Verdict |
|---|---|---|
| `bgMB9sSQoE8h` (asli) | 0,940 | review |
| versi resize 600px + JPEG q50 | 0,940 | review |
| `fDxyj8Lh5-RH` | 0,728 | clean |
| `hlQwamjbH4-h` | 0,679 | clean |
| `EebLddf4tiIS` | 0,784 | clean |

Dari 26 foto aktif, hanya satu yang melewati ambang: `bgMB9sSQoE8h`.
