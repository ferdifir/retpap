# Plan: Reward Top PAP bulanan

Status: **diimplementasi** (menunggu deploy + `LEADERBOARD_MONTHLY_DAY=30`)
Target rilis: **30 Oktober 2026**, pengumuman pukul 21:00 WIB

Dokumen terkait: `docs/rating-history-plan.md` (riwayat rating, ditunda).

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Pemenang **hanya peringkat 1** bulan berjalan | Satu hadiah per bulan, tidak ada peringkat 2/3 |
| 2 | Hadiah = `round(rata-rata × jumlah rating)` Stars | Sesuai rumus yang diminta; contoh 9.6 × 13 = 124.8 → **125** |
| 3 | Konten seed (tanpa `user_id`) → hadiah milik **owner** | Seed tidak punya uploader yang bisa mengklaim |
| 4 | Klaim lewat `/reward`, **sekali per bulan** | Atomik lewat `update ... where claimed_at is null` |
| 5 | Batas klaim **akhir bulan berjalan** (23:59 WIB tanggal terakhir) | Ditentukan owner |
| 6 | Bot **tidak mengirim Stars**; owner transfer manual | Bot API tidak punya method transfer Stars ke user |
| 7 | Angka hadiah diambil dari **snapshot**, bukan leaderboard live | Rating bisa berubah setelah pengumuman |
| 8 | Snapshot menyimpan **per-vote** (`reward_votes`) | Supaya angka bisa direkonstruksi dan dipertanggungjawabkan |

## 1. Rumus dan contoh

```
amount = Math.round(avg_score * votes)
```

`avg_score` dibulatkan 1 desimal dulu (sama seperti yang tampil di channel), lalu dikali `votes`, lalu `Math.round`.

| Foto | Rata-rata | Rating | Hitung | Hadiah |
|---|---|---|---|---|
| #63 "coba rate dong hihii" | 9.6 | 13 | 124.8 | **125** |
| #64 "rate om, masih smp😖" | 9.7 | 10 | 97.0 | **97** |
| #48 "jam jam rawan 😫😫" | 9.3 | 18 | 167.4 | **167** |

Nilai di tabel hanya contoh dari data 29 Okt; pemenang ditentukan saat cut-off.

## 2. Kenapa snapshot wajib

`ratings` hanya menyimpan nilai terakhir (PK `photo_id + user_id`, di-upsert). Tidak ada riwayat. Dua akibat:

1. Nilai yang diubah setelah pengumuman **mengubah rata-rata historis**.
2. Leaderboard memfilter `ratings.created_at` (kapan pertama rate) tapi memakai `score` sekarang — rating Oktober yang diubah 2 November tetap dihitung sebagai rating Oktober dengan nilai baru.

Tanpa snapshot, angka di channel dan angka di `/reward` bisa berbeda dan tidak ada bukti mana yang benar.

## 3. Skema

### `rewards`

| kolom | tipe | catatan |
|---|---|---|
| `id` | identity | |
| `period_start`, `period_end` | timestamptz | batas bulan WIB |
| `decided_at` | timestamptz | waktu post channel **pertama** untuk periode itu, bukan jam tetap |
| `photo_id` | bigint | pemenang |
| `user_id` | bigint null | uploader; null kalau seed |
| `telegram_id` | bigint | penerima: uploader, atau owner kalau seed |
| `avg_score` | numeric(3,1) | snapshot |
| `votes` | int | snapshot |
| `amount` | int | hasil pembulatan |
| `claimed_at` | timestamptz null | null = belum diklaim |
| `claimed_by` | bigint null | `telegram_id` yang menekan `/reward` |

Unique index `(period_start)` — satu pemenang per bulan, sekaligus pengaman dobel insert.

### `reward_votes`

Salinan baris rating pemenang tepat saat cut-off.

| kolom | tipe | catatan |
|---|---|---|
| `reward_id` | bigint | FK `rewards`, cascade |
| `user_id` | bigint | untuk audit internal |
| `score` | real | |

PK `(reward_id, user_id)`. Dipakai untuk membuktikan `sum(score)/count = avg_score` dan `count = votes`.

## 4. Kapan snapshot dibuat

Menempel di job pengumuman bulanan yang sudah ada (`src/lib/bot/leaderboard-announce.ts`), **setelah** post channel sukses:

1. `getLeaderboard("month", 1, now)` → pemenang.
2. Hitung `amount`.
3. Insert `rewards` + `reward_votes` dalam satu transaksi, `onConflictDoNothing` pada `period_start`.
4. Kalau pengumuman gagal terkirim, tidak ada reward — angka channel dan reward tidak pernah beda.

### Jadwal tetap 21:00, snapshot ikut waktu post sebenarnya

Jadwal pengumuman **tidak berubah**: otomatis pukul 21:00 WIB, sama seperti
rekap harian sekarang. Yang tidak boleh diasumsikan adalah bahwa 21:00 selalu
menjadi waktu post — tombol admin "Recap harian dikirim ulang" melewati cek jam
sepenuhnya. Terbukti 29 Okt: rekap harian tayang 13:00:12 karena dipencet
manual, lalu cron 21:00 melewatinya karena `claim.sentAt` sudah terisi.

Aturan:

- Normal: post pertama pukul 21:00 → `decided_at` = 21:00. Ini yang diharapkan.
- Kalau ada yang memajukan lewat tombol admin, `decided_at` mencatat waktu
  sebenarnya dan itu yang ditampilkan. Reward tidak rusak, cut-off-nya saja
  lebih awal.
- `unique (period_start)` pada `rewards` membuat pengiriman ulang tidak bisa
  membuat reward kedua atau mengubah nominal.
- Kalau nanti tombol kirim ulang ditambahkan untuk bulanan, jalur itu hanya
  mengganti post channel; reward dan `reward_votes` tetap beku.

Konsekuensi yang diterima: kalau pengumuman dimajukan, rating setelah jam itu
tidak masuk hitungan, dan pemenang bisa berbeda dari kalau dikirim jam 21:00.

### Perubahan trigger

Sekarang pengumuman bulanan hanya jalan di **hari terakhir bulan** pukul ≥21:00 WIB (`isLastWibDayOfMonth`). Tambah env:

```
LEADERBOARD_MONTHLY_DAY=30
```

- Kosong / `0` → perilaku lama (hari terakhir).
- `30` → pengumuman bulanan jalan tanggal 30 pukul 21:00 WIB.
- Bulan yang tidak punya tanggal itu (Februari) → jatuh ke hari terakhir.

Daily dan weekly tidak berubah jadwalnya, tapi pada hari pengumuman bulanan
keduanya **dilewati**: bulanan dikirim lebih dulu dan menggantikan rekap pendek
hari itu, supaya tidak ada dua post dalam satu menit. Pengecualian: kalau rekap
bulanan kosong atau gagal terkirim, harian/mingguan tetap dikirim seperti biasa.

## 5. Alur `/reward`

| Kondisi | Balasan |
|---|---|
| Belum ada baris reward bulan ini | "Belum ada reward bulan ini." |
| Sudah diklaim | "Sudah diklaim 30 Okt 21:12 · 125 Stars." |
| Bukan penerima | "Reward ini bukan untukmu." |
| Sekarang ≥ `period_end` | "Klaim sudah ditutup." |
| Valid | Klaim tersimpan, lalu detail hadiah |

Klaim atomik:

```sql
update rewards set claimed_at = now(), claimed_by = $1
where id = $2 and claimed_at is null
returning amount, photo_id
```

Tidak ada baris kembali = sudah diklaim orang lain / balapan.

Setelah klaim berhasil:

1. Balas ke pengklaim: nominal, caption pemenang, dan catatan bahwa Stars dikirim manual oleh owner.
2. DM owner: `@user (id 123) klaim 125 Stars — "coba rate dong hihii" · 9.6 × 13`. Ini satu-satunya notifikasi ke owner; tidak ada DM massal.

## 6. Transparansi ke user

Yang ditampilkan ke publik (tanpa membocorkan identitas pemberi rating):

```
🏆 Top PAP Oktober 2026

"coba rate dong hihii" · 9.6/10
13 rating · cut-off 30 Okt 2026 21:00 WIB

Sebaran: 8× 10 · 3× 9 · 2× 8
Hadiah: 9.6 × 13 = 124.8 → 125 Stars
```

- Timestamp cut-off selalu ikut, supaya jelas "dihitung per kapan".
- Sebaran nilai diambil dari `reward_votes`, bukan dari data live.
- Nama pemberi rating tidak pernah ditampilkan; hanya owner yang bisa melihat lewat DM klaim.

## 7. File yang berubah

- `src/db/schema.ts` — tabel `rewards`, `reward_votes` + migrasi drizzle.
- `src/db/queries.ts` — `createMonthlyReward`, `getMonthlyReward`, `claimReward`.
- `src/lib/leaderboard-period.ts` — helper `isMonthlyAnnounceDay` (pakai env).
- `src/lib/bot/leaderboard-announce.ts` — snapshot setelah post sukses.
- `src/lib/bot/flow.ts` — command `/reward`, tambahan di teks `/start`.
- `src/lib/bot/format.ts` — teks balasan reward.
- `scripts/bot-setup.mjs` — daftarkan `/reward` (sekalian `/anon` yang belum ada di menu).
- `src/lib/how-to.ts` — satu tip singkat.

## 8. Edge case

| Kasus | Perilaku |
|---|---|
| Tidak ada yang lolos min 3 rating | Pengumuman di-skip seperti sekarang, tidak ada reward |
| Pemenang seed | `telegram_id` = owner, owner yang klaim |
| Owner tidak klaim sampai akhir bulan | Hangus, tidak ada rollover |
| Foto dinonaktifkan setelah cut-off | Reward tetap sah (snapshot) |
| `/reward` sebelum pengumuman | "Belum ada reward bulan ini" |
| Dua user klaim bersamaan | `update ... where claimed_at is null` → satu menang |
| Pengumuman gagal terkirim | Tidak ada reward; job retry seperti sekarang (maks 5x) |
| Rekap dikirim ulang manual | Post channel diganti; reward tidak berubah (`unique period_start`) |
| Hari pengumuman bulanan | Harian dan mingguan dilewati; hanya bulanan yang tayang |
| Rekap bulanan kosong di hari itu | Harian/mingguan tetap dikirim seperti biasa |

## 9. Langkah rilis (30 Okt)

1. Migrasi + deploy (migrasi jalan otomatis di deploy).
2. Set `LEADERBOARD_MONTHLY_DAY=30` di `.env.local` server, restart pm2.
3. Verifikasi job: `LEADERBOARD_ANNOUNCE_DRY_RUN=1` dulu, cek teks pengumuman + angka hadiah di log.
4. Matikan dry-run, tunggu 21:00 WIB (atau kirim lebih awal kalau mau), cek post channel dan baris `rewards` — `decided_at` harus sama dengan waktu post.
5. Tes `/reward` dari akun pemenang, lalu dari akun lain (harus ditolak).
6. Transfer Stars manual dari akun owner.

## 10. Masih terbuka

1. ~~Jam pengumuman~~ — **diputuskan: 21:00 WIB**, tidak berubah.
2. Kalau pengumuman terlewat (server mati tanggal 30), reward bulan itu tidak dibuat — diterima?
3. Perlu command owner untuk membuat reward manual (backfill) kalau poin 2 terjadi?
