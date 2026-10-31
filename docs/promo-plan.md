# Plan: Promosi subscriber di dalam app

Status: **rencana** (belum ada kode, belum ada migration)
Target: menunggu hasil poll subscriber

Dokumen terkait: `docs/top-pap-reward-plan.md` (reward bulanan),
`docs/admin-plan.md` (panel admin), `docs/nsfw-18plus-plan.md` (blur channel).

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Promo = atribut di `photos`, bukan tabel baru | Satu konten hanya butuh 3 kolom tambahan |
| 2 | Promo **tidak masuk leaderboard** dan tidak bisa menang reward | Supaya peringkat tetap murni dari rating organik |
| 3 | Rating pada promo **tetap** diterima dan tersimpan | Tidak mengubah alur rating; hanya peringkat yang mengecualikan |
| 4 | Promo hanya bisa diaktifkan **owner** lewat `/admin` | Link eksternal rawan scam, tidak boleh self-serve |
| 5 | Tanpa tabel pembayaran/langganan | Di luar cakupan; promo dikelola manual |
| 6 | Expired difilter saat baca, bukan diubah `is_active` | Tidak butuh cron, tidak menghapus riwayat |

## 1. Poll subscriber

Dikirim ke channel sebelum implementasi. Tujuannya mengukur permintaan,
bukan mengikat aturan.

```
Subscriber boleh promo di dalam app?

Boleeeh
Kagak
Boleh asal yang hottt
Boleh tapi tak masuk leaderboard
```

Setting: poll biasa, satu pilihan, anonim (wajib di channel), tombol
`Buka RetPAP` → `?start=app`.

Catatan API: `open_period` maksimal 600 detik, jadi poll dibiarkan terbuka
dan ditutup manual dengan `stopPoll` (mis. 24 jam kemudian). Hasil agregat
baru terbaca setelah ditutup.

## 2. Schema

Tiga kolom baru di `photos`:

| Kolom | Tipe | Default | Fungsi |
|---|---|---|---|
| `is_promo` | boolean | false | penanda konten promo |
| `promo_url` | text null | null | link tujuan, wajib kalau `is_promo` |
| `promo_expires_at` | timestamptz null | null | batas tayang; null = tanpa batas |

Constraint:

- `photos_promo_url_required`: `is_promo = false or promo_url is not null`.
- URL divalidasi di aplikasi (`https` saja), bukan di DB.

Migration baru lewat `npm run db:generate`; tidak ada backfill karena default
`false` sudah benar untuk semua konten lama.

## 3. Aturan tampil

### Feed
- Kartu promo dapat badge `PROMO` di samping caption.
- Tombol `Buka promo` → `openTelegramUrl(promo_url)`.
- Blur 18+ tetap berlaku; promo bukan pengecualian.
- Tombol lapor tetap tersedia untuk promo.
- Filter: `is_active = true and (promo_expires_at is null or promo_expires_at > now())`.

### Channel
- Caption ditambah satu baris: `Promo: <url>` dan tombol `Buka promo`.
- Blur dan badge 18+ tidak berubah.
- Posting promo tidak mengubah jadwal recap.

### Leaderboard
- `getLeaderboard()` menambah `photos.is_promo = false`.
- Freeze reward bulanan memakai query yang sama, jadi promo otomatis tidak
  bisa menang.
- Halaman `/stats` tetap menampilkan promo (itu arsip, bukan peringkat).

## 4. Pengelolaan (admin)

Tab **Konten** di `/admin`:

- Toggle `Promo` per baris.
- Input `promo_url` (validasi `https://`).
- Input tanggal berakhir (opsional, kosong = tanpa batas).
- Aksi disimpan lewat route admin yang sudah ada; tidak ada route baru.

Tidak ada jalur user untuk mengaktifkan promo sendiri. Kalau nanti perlu
cepat, opsional command owner `/promo <photoId> <url> <hari>`, tapi tidak
masuk iterasi pertama.

## 5. Analytics

Event baru `promo_open` dengan `photoId`, dicatat saat tombol promo ditekan
(dari Mini App maupun tombol channel). Dipakai untuk melihat promo mana yang
benar-benar diklik.

## 6. Yang tidak dikerjakan

- Pembayaran, langganan, atau paket promo berbayar.
- Prioritas antrean upload untuk promo.
- Halaman daftar promo khusus.
- Penjadwalan promo otomatis (mulai/berhenti tanpa owner).

## 7. Urutan implementasi

1. Schema + migration (`is_promo`, `promo_url`, `promo_expires_at`).
2. Query feed + leaderboard + freeze reward.
3. Tipe `FeedPhoto` dan komponen kartu (badge + tombol).
4. Route admin + form di tab Konten.
5. Caption + tombol channel.
6. Event `promo_open`.
7. Typecheck, lint, deploy, lalu uji satu konten promo dan satu konten biasa.

## 8. Pertanyaan terbuka

1. Batas durasi promo: bebas, atau maksimal 30 hari?
2. Promo boleh 18+ atau dibatasi non-18+?
3. Kalau `promo_url` mati/expired, kontennya tetap tampil tanpa tombol atau
   ikut disembunyikan?
