# Rancangan halaman admin RetPAP

Status: **rancangan**, belum ada kode. Ditulis 2026-10-27 setelah insiden spam
user `7840943147` (4 video dengan nomor WA di caption).

## 1. Tujuan

Satu halaman owner-only untuk dua pekerjaan yang sekarang harus dilakukan manual
(psql + script channel):

1. **Per konten** — tandai 18+, ubah gender, nonaktifkan, hapus permanen.
2. **Per user** — blokir upload, lihat kontennya, bersihkan kontennya.

## 2. Prinsip

- **Owner-only, gagal tertutup.** Pakai pola `/stats`: `getSessionUserId()` +
  `isOwner()` di server, `notFound()` kalau bukan owner. Jangan pernah percaya
  flag `owner` dari `/api/session` di client.
- **DB dulu, channel belakangan.** Kalau Telegram gagal, data tetap benar dan
  konten tidak tampil lagi di feed. Pola ini sudah dipakai `markNsfwAndRepost`.
- **Idempoten.** Semua aksi aman diulang; "hapus pesan yang sudah hilang" bukan error.
- **Setiap aksi dicatat** (lihat §8). Insiden hari ini tidak punya jejak apa pun
  karena snapshot gagal dan tidak ada audit log.

## 3. Temuan penting sebelum mendesain

- `photos.is_active = false` hanya menyembunyikan dari **feed** (`queries.ts:100`)
  dan **leaderboard** (`queries.ts:219`). Route `/api/photos/[id]/rating`,
  `/reactions`, `/comments` **tidak** mengecek `is_active`, jadi konten yang
  "dihapus" masih bisa di-rate lewat id langsung. Untuk spam, soft delete saja
  tidak cukup.
- Belum ada fungsi hapus file media. File hidup di `UPLOAD_DIR`
  (`/var/lib/retpap/uploads`), 2 file per video: `<slug>.mp4` + `<slug>.jpg`
  (poster). Foto: 1 file `<slug>.jpg`.
- Gender **tidak** memengaruhi channel post dan tidak memengaruhi leaderboard —
  hanya filter feed. Jadi ubah gender tidak perlu repost.
- 18+ memengaruhi channel (badge 18+; blur semua post sama) dan feed (blur + tombol
  Tampilkan). Jadi ubah 18+ **harus** repost channel.

### Yang menempel pada satu foto/video

| Artefak | Tabel/letak | Saat hapus permanen |
| --- | --- | --- |
| Data konten | `photos` | dihapus |
| Titik rate/reaksi | `spots` | cascade |
| Rating | `ratings` | cascade |
| Reaksi | `reactions` | cascade |
| Komentar | `comments` | cascade |
| Notifikasi pending | `notifications.photo_id` | cascade (digest batal) |
| Analytics | `events.photo_id` | `set null` (riwayat tetap ada) |
| File media | `<slug>.mp4`, `<slug>.jpg` | dihapus manual |
| Post channel | `photos.channel_message_id` | `deleteMessage` |
| Peringkat | turunan `ratings` | otomatis hilang; recap yang sudah terkirim tetap |

## 4. Struktur halaman

`/admin`, dua tab: **Konten** dan **User**. Dibuka dari header `/stats` atau
deep link `startapp=admin` (tambahan di `src/lib/share.ts`, pola sama seperti
`stats`).

### Tab Konten

Kolom: thumbnail (poster), caption (potong 60 char), tipe (foto/video), gender,
18+, status (aktif/nonaktif), uploader (telegram_id), rate (avg · jumlah), tanggal.

Filter: pencarian caption, tipe, 18+, status, uploader, urut terbaru.
Pagination 25/halaman.

### Tab User

Kolom: telegram_id, username, first_name, gabung, terakhir lihat, jumlah upload,
rate rata-rata yang diterima, status blokir.

Filter: pencarian (id/username/nama), hanya yang diblokir, hanya yang punya upload.

## 5. Aksi per konten

| Aksi | DB | Channel | File | Catatan |
| --- | --- | --- | --- | --- |
| **Toggle 18+** | `photos.is_nsfw` | hapus post lama → kirim ulang (blur kuat + badge) | baca ulang dari disk | Kalau file hilang: tandai di DB saja, jangan hapus post lama. Pakai ulang logika `markNsfwAndRepost`. |
| **Ubah gender** | `photos.gender` (female/male/null) | — | — | Langsung terasa di feed setelah refresh. Leaderboard tidak berubah. |
| **Nonaktifkan** (soft) | `is_active = false` | hapus post | disimpan | Hilang dari feed + leaderboard. Bisa diaktifkan lagi. |
| **Aktifkan lagi** | `is_active = true` | — (post tidak dikembalikan) | — | Sediakan tombol repost terpisah kalau mau muncul di channel lagi. |
| **Hapus permanen** | row `photos` dihapus (cascade) | hapus post | hapus `.mp4` + `.jpg` | Tidak bisa dibatalkan. Wajib konfirmasi: ketik slug. |
| **Repost channel** | update `channel_message_id` | kirim ulang | baca dari disk | Untuk memulihkan post yang terlanjur terhapus. |
| **Kirim ulang recap** | update `leaderboard_announcements.message_id` | hapus recap lama → kirim baru | — | Perlu setelah hapus/nonaktif konten yang ada di top 3. |

Yang **tidak** disediakan: edit caption. Caption channel dan feed akan
berbeda dan tidak ada jalan sinkron yang murah; untuk spam, hapus lebih tepat.

## 6. Aksi per user

| Aksi | Efek | Catatan |
| --- | --- | --- |
| **Blokir upload** (toggle) | `users.upload_blocked` | Sudah ada. Bot menolak `/upload`, kirim foto/video, dan tombol Upload untuk sesi lama. Baca/rate/reaksi tetap jalan. |
| **Isi alasan blokir** | `upload_blocked_reason`, `upload_blocked_at` | Untuk diri sendiri 3 bulan lagi, bukan untuk user. |
| **Lihat konten user** | pindah ke tab Konten dengan filter uploader | — |
| **Bersihkan semua konten** | soft/hard delete semua `photos` milik user | Pakai `is_active` dulu, hard delete terpisah. |
| **Batalkan blokir** | `upload_blocked = false` | — |

Yang **tidak** disediakan: hapus user. `users` di-cascade ke `ratings` dan
`reactions` yang dia **berikan** ke konten orang lain — menghapus user akan
mengubah leaderboard historis. Blokir cukup.

## 7. Perubahan skema (migrasi 0014)

```sql
ALTER TABLE users ADD COLUMN upload_blocked_at timestamptz;
ALTER TABLE users ADD COLUMN upload_blocked_reason text;

CREATE TABLE admin_actions (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_telegram_id bigint NOT NULL,
  action text NOT NULL,            -- photo.nsfw, photo.gender, photo.soft_delete, ...
  target_type text NOT NULL,       -- 'photo' | 'user'
  target_id bigint NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_target_idx ON admin_actions (target_type, target_id, created_at DESC);
```

## 8. Audit log (saran utama)

Setiap aksi tulis baris `admin_actions` **dalam transaksi yang sama** dengan
perubahannya, berisi nilai sebelum/sesudah:

```json
{ "before": { "isNsfw": false }, "after": { "isNsfw": true } }
```

Alasan: hari ini snapshot manual gagal karena `psql \o` jalan sebagai
`postgres` dan tidak boleh menulis ke `/var/backups/retpap`. Kalau ada audit
log, isi row yang dihapus tetap bisa direkonstruksi dari `payload`.
Untuk hard delete, simpan juga snapshot row lengkap di `payload.before`.

## 9. API

Semua route di bawah `/api/admin/*`, semua memanggil `requireOwner()` →
`403` kalau bukan owner.

```
GET    /api/admin/photos?q=&type=&nsfw=&status=&userId=&page=
PATCH  /api/admin/photos/[id]        { isNsfw?, gender?, isActive? }
DELETE /api/admin/photos/[id]        ?mode=soft|hard
POST   /api/admin/photos/[id]/repost
GET    /api/admin/users?q=&blocked=&hasUpload=&page=
PATCH  /api/admin/users/[id]         { uploadBlocked?, reason? }
POST   /api/admin/users/[id]/purge   { mode: "soft"|"hard" }
GET    /api/admin/actions?targetType=&targetId=
POST   /api/admin/leaderboard/resend { period: "day" }
```

Fungsi DB baru di `src/db/queries.ts`:

- `listPhotosForAdmin(filters, page)`
- `setPhotoNsfw(id, value)`, `setPhotoGender(id, gender)`
- `softDeletePhoto(id)` (ganti nama `deactivatePhoto`), `restorePhoto(id)`
- `hardDeletePhoto(id)` → kembalikan `{ slug, mediaType, channelMessageId, uploaderTelegramId, before }`
- `listUsersForAdmin(filters, page)`
- `setUploadBlocked(userId, blocked, reason)`
- `purgeUserPhotos(userId, mode)`
- `logAdminAction(...)`, `listAdminActions(...)`

Helper file di `src/lib/bot/media.ts`: `deleteMedia(slug, mediaType)` —
`rm -f` dua file, abaikan `ENOENT`.

## 10. Urutan kerja

**Fase 1 — inti (yang dipakai saat spam muncul lagi)**
1. Migrasi 0014 + `admin_actions`.
2. `listPhotosForAdmin` + tab Konten (tanpa filter canggih dulu).
3. Toggle 18+, ubah gender, soft delete, hard delete (+ konfirmasi slug).

**Fase 2 — user**
4. Tab User + toggle blokir + alasan.
5. "Lihat konten user" + purge konten user.

**Fase 3 — penyempurnaan**
6. Guard `is_active` di route rating/reaction/comment (menutup celah soft delete).
7. Tombol kirim ulang recap.
8. Pencarian/pagination/urut.

## 11. Risiko & catatan

- **Hard delete tidak bisa dibatalkan.** Konfirmasi ketik slug, dan tulis
  snapshot row ke `payload.before` sebelum `DELETE`.
- **Hapus post channel bisa gagal** (sudah dihapus manual). Anggap sukses kalau
  Telegram membalas `message to delete not found`.
- **Repost butuh file.** Kalau file sudah hilang, jangan hapus post lama dulu —
  tandai DB saja, lalu laporkan di UI.
- **Backup otomatis hanya saat deploy** (`scripts/deploy.sh`). Jangan andalkan
  itu untuk undo; audit log adalah jaring pengamannya.
- **Blokir upload bukan blokir akun.** User bisa buat akun Telegram baru. Kalau
  itu terjadi berulang, pertimbangkan `pHash` video + throttle akun baru
  (belum masuk rancangan ini).
- **Filter caption nomor WA** sengaja ditunda atas permintaan; kalau nanti
  dipasang, tempatnya di `handlePhoto`/`handleVideo`/`handleCaption` sebelum
  `saveUploadSession`.
