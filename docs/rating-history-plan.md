# Plan: Riwayat rating (rating history)

Status: **diimplementasi** (menunggu deploy). Riwayat tetap perekam pasif:
`getLeaderboard` tidak membaca tabel ini, jadi Top PAP harian/mingguan/bulanan/
all-time tidak berubah. Reward Top PAP Oktober memakai snapshot
(`docs/top-pap-reward-plan.md`).

## 0. Masalah yang diselesaikan

Sekarang `ratings` hanya menyimpan **nilai terakhir**:

- PK `(photo_id, user_id)` — satu baris per user per foto.
- `ratePhoto()` memakai `onConflictDoUpdate`: nilai lama ditimpa.
- `created_at` = kapan pertama kali rate, `updated_at` = kapan terakhir diubah.
- Tabel `events` tidak mencatat rating sama sekali.

Akibatnya:

1. Pertanyaan user "saya kasih 10 minggu lalu, kenapa sekarang 6?" tidak bisa dijawab dengan data.
2. Peringkat periode yang sudah lewat bisa **berubah surut**: leaderboard memfilter `ratings.created_at` (waktu pertama rate) tapi memakai `score` terkini. Rating Oktober yang diubah 2 November tetap dihitung sebagai rating Oktober, dengan nilai baru.
3. Tidak ada dasar untuk audit kalau ada sengketa hadiah.

## 1. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Tabel **append-only** `rating_history`, satu baris per perubahan | Riwayat tidak boleh bisa ditimpa |
| 2 | Tulis di `ratePhoto()` setelah upsert sukses | Satu tempat, semua jalur rate lewat situ |
| 3 | Simpan `score`, `at`, `source` | `source` membedakan data asli vs backfill |
| 4 | Backfill sekali dari `ratings` saat migrasi, `source = 'backfill'` | Mengisi titik awal; `at` = `updated_at` |
| 5 | Riwayat **tidak** dipakai di leaderboard harian | Menghindari query mahal di jalur baca |
| 6 | Rekonstruksi "posisi per waktu" pakai query `distinct on` | Cukup untuk audit dan halaman transparansi |

## 2. Skema

```
rating_history
  id          identity
  photo_id    bigint  -> photos.id  (cascade)
  user_id     bigint  -> users.id   (cascade)
  score       real    check 1..10
  at          timestamptz default now()
  source      text    'live' | 'backfill'
```

Index: `(photo_id, at desc)` untuk rekonstruksi per foto, `(user_id, at desc)` untuk pertanyaan "riwayat saya".

Backfill saat migrasi:

```sql
insert into rating_history (photo_id, user_id, score, at, source)
select photo_id, user_id, score, updated_at, 'backfill' from ratings;
```

Yang perlu dicatat jujur: baris backfill hanya tahu nilai **terakhir** dan waktu perubahan terakhir. Nilai-nilai sebelumnya tetap hilang permanen.

## 3. Perubahan kode

1. `src/db/schema.ts` — tabel `rating_history` + migrasi (tabel + backfill).
2. `src/db/queries.ts` — di `ratePhoto()`, setelah upsert:
   ```ts
   await db.insert(ratingHistory).values({ photoId, userId, score, source: "live" });
   ```
   Tulis di transaksi yang sama dengan upsert, supaya riwayat dan nilai sekarang tidak pernah berbeda.
3. Tidak ada perubahan API atau UI di tahap ini.

### Soal beban tulis

Slider rating mengirim satu request per perubahan nilai yang sudah di-debounce di klien. Satu insert tambahan per request tidak signifikan pada volume sekarang (ratusan rating per bulan). Kalau nanti jadi masalah, opsinya: hanya mencatat perubahan yang beda nilai, atau batch per sesi. **Belum perlu sekarang.**

## 4. Query rekonstruksi

Nilai tiap user pada satu foto per waktu cut-off:

```sql
select distinct on (user_id) user_id, score
from rating_history
where photo_id = $1 and at <= $2
order by user_id, at desc;
```

Peringkat "as of" waktu tertentu (setara `getLeaderboard`, tapi historis):

```sql
with latest as (
  select distinct on (photo_id, user_id) photo_id, user_id, score, at
  from rating_history
  where at <= $cutoff
  order by photo_id, user_id, at desc
)
select photo_id, round(avg(score)::numeric, 1) as avg, count(*) as votes
from latest
where at >= $window_start
group by photo_id
having count(*) >= 3
order by avg desc, votes desc;
```

Ini yang dipakai untuk halaman transparansi "posisi saat cut-off" dan untuk menjawab sengketa hadiah.

## 5. Dampak ke leaderboard yang ada

Setelah riwayat ada, semantik periode bisa diperbaiki: rating dihitung pada periode **saat nilainya ditulis**, bukan saat pertama kali. Itu mengubah hasil periode yang sedang berjalan, jadi harus diputuskan sadar, bukan efek samping.

Usulan: **jangan ubah** `getLeaderboard` di tahap ini. Riwayat dipakai untuk audit dan tampilan transparansi dulu. Perubahan semantik leaderboard dibahas terpisah setelah ada data satu periode penuh.

## 6. Langkah implementasi (setelah 31 Okt)

1. Migrasi tabel + backfill, deploy.
2. Pastikan `ratePhoto()` menulis riwayat; tes rate lalu ubah nilai, cek dua baris muncul.
3. Verifikasi angka: `rating_history` untuk satu foto harus cocok dengan `ratings` (nilai terakhir).
4. Opsional: halaman/endpoint transparansi yang membaca rekonstruksi cut-off.

## 7. Masih terbuka

1. Simpan juga riwayat penghapusan rating (kalau nanti ada fitur unrate)?
2. Perlu retensi? `rating_history` tumbuh satu baris per perubahan; pada volume sekarang tidak masalah.
3. Perlu tampil ke user ("riwayat rating saya") atau cukup internal untuk audit?
