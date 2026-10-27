# Plan: Preferensi Gender (Cewek / Cowok / Semua)

Status: **diimplementasikan (lokal, belum di-deploy)**

## Tujuan

1. User memilih preferensi feed saat masuk aplikasi: **cewek**, **cowok**, atau **semua**.
2. Feed hanya menampilkan konten yang cocok dengan preferensi.
3. Uploader menandai kontennya **cewek** atau **cowok** saat upload lewat bot.

## 1. Data Model

### `src/db/schema.ts`

**`users`** — preferensi tampilan:

```ts
/** null = belum pernah memilih; feed menampilkan semuanya. */
genderPreference: text("gender_preference"),
```
`check`: `gender_preference in ('female', 'male', 'all') or gender_preference is null`

**`photos`** — gender konten:

```ts
/** Gender uploader/konten; null untuk konten lama yang belum ditandai. */
gender: text("gender"),
```
`check`: `gender in ('female', 'male') or gender is null`

**`upload_sessions`** — jawaban sementara:

```ts
/** null = pertanyaan cewek/cowok belum dijawab. */
gender: text("gender"),
```

### Migration

Satu migration baru (`drizzle/0011_*.sql`):

```sql
alter table users add column gender_preference text;
alter table photos add column gender text;
alter table upload_sessions add column gender text;
alter table users add constraint users_gender_preference_valid
  check (gender_preference is null or gender_preference in ('female','male','all'));
alter table photos add constraint photos_gender_valid
  check (gender is null or gender in ('female','male'));
```

Konten lama dibiarkan `null` (tidak ditebak). Backfill opsional lewat SQL manual kalau owner mau menandai.

### Tipe & query

- `src/lib/feed-types.ts`: `FeedPhoto.gender: "female" | "male" | null`.
- `src/db/queries.ts`:
  - `getFeed(userId)` membaca `users.genderPreference` lalu memfilter.
  - `getFeed` mengembalikan `photos.gender`.
  - `upsertUser` tidak menimpa preferensi (tetap dibiarkan apa adanya).
  - Fungsi baru `setGenderPreference(userId, preference)`.
- `src/db/upload.ts`: `UploadSession.gender`, `NewPhoto.gender`, `createPhoto` menulis `gender`.

## 2. Filter Feed

Aturan:

| Preferensi user | Yang tampil |
|---|---|
| `null` (belum pilih) | semua konten |
| `all` | semua konten |
| `female` | `photos.gender = 'female'` **dan** `gender is null` |
| `male` | `photos.gender = 'male'` **dan** `gender is null` |

Konten `null` tetap tampil di filter mana pun supaya konten lama tidak hilang. Kalau nanti semua konten sudah ditandai, aturan ini bisa diperketat.

Implementasi di SQL (`getFeed`), bukan di client, supaya deck dan hitungan ikut benar:

```ts
const pref = user.genderPreference;
const genderFilter =
  pref === "female" || pref === "male"
    ? or(eq(photos.gender, pref), isNull(photos.gender))
    : undefined;
.where(and(eq(photos.isActive, true), genderFilter))
```

## 3. API

### `src/app/api/session/route.ts`

Response `POST /api/session` ditambah:

```ts
preference: user.genderPreference,   // "female" | "male" | "all" | null
```

### `src/app/api/preferences/gender/route.ts` (baru)

```ts
PUT  body: { preference: "female" | "male" | "all" }
```

- Wajib sesi (`getSessionUserId`), 401 kalau tidak ada.
- Validasi zod, 400 kalau nilai lain.
- Simpan ke `users.gender_preference`, balas `{ preference }`.
- Tidak ada enforcement tambahan di endpoint konten lain.

### `src/app/api/feed/route.ts`

Balas `{ photos, preference }` supaya client tahu filter aktif tanpa request tambahan.

## 4. UI Feed

### Pemilih saat masuk

Komponen baru `src/components/pap/gender-picker.tsx`:

- Panel/modal di tengah, gaya sama dengan `StartGate`.
- Judul: "Mau lihat konten siapa?"
- Tiga tombol besar: **Cewek**, **Cowok**, **Semua**.
- Muncul saat `preference === null` (belum pernah pilih).
- Setelah memilih: `PUT /api/preferences/gender` → refetch `/api/feed` → deck dirender.
- Selama panel tampil, deck belum dirender dan interaksi kartu tidak aktif (pola sama seperti gate konten ke-3 nanti).

### Ganti preferensi

- `AppHeader` dapat satu pill kecil di kiri tombol reaksi, menampilkan pilihan aktif (`Cewek` / `Cowok` / `Semua`).
- Menekan pill membuka pemilih yang sama, dengan pilihan aktif ditandai.
- Setelah ganti: refetch feed, reset `currentIndex` ke 0, hapus posisi deck tersimpan (indeks lama tidak valid untuk deck baru).
- Share link yang sedang dipin: kalau fotonya tidak lolos filter, pin dilepas dan deck mulai dari atas.

### Empty state

Kalau hasil filter kosong:

> Belum ada konten untuk pilihan ini.
> [Tampilkan semua]

Tombol memanggil `PUT` dengan `all` lalu refetch.

### Komponen yang disentuh

| File | Perubahan |
|---|---|
| `src/components/pap/pap-rater.tsx` | baca `preference` dari session, render pemilih, refetch saat ganti |
| `src/components/pap/gender-picker.tsx` (baru) | panel pilihan |
| `src/components/pap/app-header.tsx` | prop `preference` + `onPreferenceClick` |
| `src/components/pap/empty-state.tsx` | varian "filter kosong" |

## 5. Alur Upload (Bot)

Sekarang: media → caption → 18+ → konfirmasi.

Menjadi: media → caption → **cewek/cowok** → 18+ → konfirmasi.

### Pertanyaan gender

```
<b>Langkah 3/4</b>

Konten ini dari cewek atau cowok?
```

Tombol:

- `Cewek` → `callback_data: "genderans:female"`
- `Cowok` → `callback_data: "genderans:male"`

Setelah dijawab: simpan `upload_sessions.gender`, lalu lanjut `askNsfw()` dengan teks `Langkah 4/4`.

### Perubahan handler

- `ASK_MEDIA_TEXT`: `Langkah 1/4`.
- `ASK_CAPTION_TEXT`: `Langkah 2/4`.
- `handleCaption`: simpan caption, reset `gender: null` dan `isNsfw: null`, panggil `askGender()`.
- `handlePhoto` / `handleVideo`: reset `gender: null`, `isNsfw: null`.
- `handleCallback`: cabang `genderans:*` → simpan → `askNsfw()`.
- `publish`: tolak kalau `session.gender === null` (ulangi pertanyaan).
- `showConfirmation`: tampilkan `Konten: Cewek/Cowok` dan `18+: Ya/Tidak`.
- `createPhoto`: kirim `gender: session.gender`.

### Upload terjadwal

`scripts/scheduled-upload.ts` mengirim `gender` dari env baru `UPLOAD_GENDER` (default `female`), supaya konten otomatis tidak masuk sebagai `null`.

## 6. Yang Tidak Berubah

- Leaderboard: tetap semua konten, tidak difilter gender.
- Channel: caption dan tombol tidak berubah; tidak ada label gender di post.
- NSFW: tetap seperti sekarang, dan bisa digabung dengan filter gender.
- Tidak ada enforcement server baru di luar validasi input.

## 7. Edge Case

- **Konten lama (`gender = null`)**: tetap tampil di semua filter.
- **Preferensi belum dipilih**: feed menampilkan semua, pemilih muncul sekali di awal.
- **Ganti preferensi saat kartu ke-3 (gate) tampil**: gate tetap, deck di-reset setelah pilihan baru dimuat.
- **Filter menghasilkan 0 konten**: empty state dengan tombol "Tampilkan semua".
- **Share link ke konten di luar filter**: pin dilepas, feed mulai dari atas; tidak ada error.
- **Upload sebelum menjawab gender**: tidak bisa publish, bot mengulang pertanyaan.
- **User mengirim media baru saat masih di step gender**: sesi diganti, `gender` kembali `null`.
- **Preferensi berubah di device lain**: terbaca saat app dibuka ulang (disimpan di DB, bukan localStorage).

## 8. Testing Manual

1. User baru → pemilih muncul → pilih **Cewek** → feed hanya cewek (+ konten null).
2. Reload → pemilih tidak muncul lagi, filter tetap cewek.
3. Ganti ke **Cowok** lewat pill header → feed berganti, posisi kembali ke kartu 1.
4. Pilih **Semua** → semua konten tampil.
5. Filter yang tidak punya konten → empty state → tombol "Tampilkan semua" berfungsi.
6. Upload lewat bot → ditanya cewek/cowok → lalu 18+ → konfirmasi menampilkan keduanya.
7. Upload tanpa menjawab gender → tidak bisa publish.
8. Konten baru muncul di feed yang sesuai; konten `null` tetap muncul di semua filter.
9. Share link ke konten beda gender → feed mulai dari atas tanpa error.
10. Leaderboard tetap menampilkan semua konten.

## 9. Keputusan yang Sudah Dikonfirmasi

1. **Frekuensi tanya**: pemilih muncul sekali, hanya saat `users.gender_preference` masih null.
2. **Konten lama `null`**: tampil di semua filter.
3. **Ganti preferensi**: pill di header, membuka pemilih yang sama.
4. **Upload terjadwal**: `UPLOAD_GENDER` default `female`.
5. **Backfill konten lama**: sudah dijalankan; 6 konten male (`18, 20, 26, 29, 32, 35`), sisanya female. Detail di `docs/konten-gender-backfill.md`.

## 10. Status Implementasi

- Migration: `drizzle/0011_melted_purifiers.sql`.
- Endpoint: `PUT /api/preferences/gender`.
- Komponen: `src/components/pap/gender-picker.tsx`.
- Feed: filter di `getFeed`, konten `null` tetap tampil di semua filter.
- Bot: langkah 3/4 cewek/cowok (`genderans:female|male`), 4/4 pertanyaan 18+.
- Upload terjadwal: `UPLOAD_GENDER`.
