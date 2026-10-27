# Daftar Konten untuk Backfill Gender

Status: **sudah diisi di produksi pada 2026-10-27**.

Hasil: **29 konten female**, **6 konten male** (`18, 20, 26, 29, 32, 35`).
Sisanya female, termasuk konten nonaktif. Tidak ada lagi baris dengan `gender = null`.

Total: 35 baris.

## Konten lama (id 2–25)

| ID | Caption | Aktif | 18+ |
|---|---|---|---|
| 2 | first, rate dungs.. | tidak | ya |
| 3 | rate dong besar ga? | ya | tidak |
| 4 | uhh 🫦 pgn di doggy sayang🥵 | ya | ya |
| 5 | tes pap disini | ya | tidak |
| 6 | temenin bobo sambil nenen sni, yg komennya bikin bcek nanti aku pc | ya | ya |
| 7 | suka yg gede ga sayang 🥵 | ya | tidak |
| 8 | FRIST TIME DONET GINI AJAA KALO RAME LANGSUNG BUKA² AN | tidak | tidak |
| 9 | nihh yang kepo sama bawah aya😡 jan bawel yaa | tidak | ya |
| 10 | Pengen di masukin | tidak | ya |
| 11 | mau bibir apa nen? | tidak | ya |
| 12 | ada yang mau jdi kucingnya ga disini😭 | tidak | tidak |
| 13 | nihh yang kepo sama bawah aya😡 jan bawel yaa | ya | ya |
| 14 | Pengen di masukin | ya | ya |
| 15 | FRIST TIME DONET GINI AJAA KALO RAME LANGSUNG BUKA² AN | ya | ya |
| 16 | ada yang mau jdi kucingnya ga disini😭 | ya | ya |
| 17 | mau bibir apa nen? | ya | ya |
| 18 | Rate dong | ya | ya |
| 19 | sesuai janji yaaa part 2 💋 tapi aku mau pcr dong yg baik🥹 | ya | ya |
| 20 | Ratr dong 1-10 | ya | ya |
| 21 | infoo nongkrong daerah pwt dong | ya | ya |
| 22 | hi ikutan ah jangan dibully hihi | ya | tidak |
| 23 | kl rame di spill versi tanktopan btw gua anak kampus ubakrie jaksel | ya | tidak |
| 24 | modee hijab nih | ya | ya |
| 25 | Rate dong pacarku | ya | tidak |

## Konten setelahnya (id 26–36)

| ID | Caption | Aktif | 18+ |
|---|---|---|---|
| 26 | pengenn dehh dii masukinn | ya | ya |
| 27 | Hilangkan blur | tidak | ya |
| 28 | first donate, klo rame nanti dikasih versi terbuka😳🙈 | ya | tidak |
| 29 | Ngaceng | ya | ya |
| 30 | sange chat aku di wa +6287768995667 | ya | ya |
| 31 | tidurin siniii | ya | ya |
| 32 | butuh ada yg buka in | ya | ya |
| 33 | sange chat aku di wa +6287768995667 | ya | ya |
| 34 | Pengen diisepin | ya | tidak |
| 35 | pengen dikasarin sama cewe dom | ya | ya |
| 36 | yuukk sayang basahin😋💋💋 | ya | tidak |

## Cara mengisi setelah diputuskan

```sql
-- satu id
update photos set gender = 'female' where id = 3;

-- banyak id sekaligus
update photos set gender = 'male' where id in (2, 4, 6);
```

Nilai yang diterima: `female`, `male`, atau biarkan `null`.
