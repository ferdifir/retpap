# Gate Start Bot & Join Channel di Konten Urutan ke-3

Status: **rencana, belum diimplementasikan**

## Tujuan

Gate "Start bot dulu" dan "Join channel dulu" tidak lagi memblokir saat Mini App dibuka.
Keduanya dipindah menjadi **konten ke-3 di dalam container foto/video**: user bebas melihat
kartu ke-1 dan ke-2, lalu saat mau masuk kartu ke-3, container menampilkan gate tersebut.

Selama gate tampil, seluruh kontrol dinonaktifkan:

- semua tombol di header (reaksi, share, leaderboard)
- tombol next/previous
- gesture swipe, tap, hold, dan rating
- komentar/reaksi tidak bisa dibuka

Leaderboard **tidak** di-gate. Enforcement di server tidak diubah.

## Perilaku yang Diinginkan

1. Buka app → sesi dibuat → feed langsung dimuat → kartu ke-1 tampil normal.
2. User bisa swipe/next ke kartu ke-2 seperti biasa.
3. Saat mencoba masuk kartu ke-3:
   - kalau `started` belum lolos → container menampilkan gate **start bot**
   - kalau `started` sudah lolos tapi `subscribed` belum → container menampilkan gate **join channel**
   - urutan tetap: start bot dulu, baru channel
4. Kartu ke-3 asli belum dirender selama gate tampil.
5. Gate hanya bisa diselesaikan lewat tombolnya:
   - start bot: buka chat bot, lalu balik ke app (recheck otomatis lewat visibility/focus)
   - channel: tombol "Saya sudah join" → `POST /api/subscription/check`
6. Setelah kedua gate lolos, gate hilang dan kartu ke-3 tampil di posisi yang sama.
   User tidak dikembalikan ke kartu ke-1.
7. Setelah lolos, gate tidak muncul lagi selama sesi tersebut, termasuk saat swipe bolak-balik.

## Perubahan File

### 1. `src/components/pap/pap-rater.tsx`

**Boot tidak lagi berhenti di gate.**

- Hapus early return yang menampilkan `StartGate` sebelum `fetch("/api/feed")`
  (saat ini di sekitar baris 119–133).
- Tetap baca `started`, `subscribed`, dan `channelUrl` dari `POST /api/session`.
- Simpan status gate di state/ref (mis. `gate`, `gateRef`, `channelUrl`) tanpa
  memblokir render deck.
- Feed tetap dimuat dan deck tampil normal.

**Gate sebagai konten ke-3.**

- Gate dianggap aktif ketika `currentIndex === 2` dan masih ada gate yang belum lolos.
- Saat kondisi itu, render `StartGate` **di dalam `<section>` container kartu**
  (pembungkus yang sama dengan `PapCard`, memakai `card-face`/panel yang sama)
  sebagai pengganti isi kartu ke-3.
- `PapCard` untuk indeks 2 tidak dirender selama gate tampil.

**Kunci semua kontrol selama gate tampil.**

- `flipTo` langsung return kalau gate tampil (mencegah next/previous dan swipe).
- Handler gesture (`handleSwipeStart/Move/End`, touch, pointer) return lebih awal.
- Rating, tap, hold, marker, komentar, dan reaksi tidak dijalankan.
- `AppHeader` diberi prop `disabled`; ketiga tombol (reaksi, share, leaderboard)
  dinonaktifkan dan tidak memanggil handler.
- `canGoPrevious`/`canGoNext` untuk kartu di sekitar gate dibuat `false`.

**Setelah gate lolos.**

- Start bot: recheck lewat `visibilitychange`/`focus` yang sudah ada. Jangan reset
  `currentIndex` dan jangan refetch deck kalau sudah ada; cukup perbarui status gate.
- Channel: `recheckChannel` yang sudah ada memanggil `/api/subscription/check`.
  Kalau lolos, perbarui status gate tanpa mengembalikan user ke kartu awal.
- Setelah `started` dan `subscribed` benar, gate dihapus dan kartu ke-3 dirender.

**Deep link leaderboard.**

- Redirect `startapp=leaderboard*` tetap jalan tanpa menunggu gate.
- Karena leaderboard tidak di-gate, redirect tidak boleh lagi bergantung pada
  `started`/`subscribed`.

### 2. `src/components/pap/app-header.tsx`

- Tambah prop opsional `disabled?: boolean`.
- Saat `disabled`, ketiga tombol memakai atribut `disabled`, styling redup,
  dan tidak memanggil callback.

### 3. `src/components/pap/leaderboard.tsx`

- Hapus pengecekan gate yang membounce user ke `/`:

  ```ts
  if (!sessionBody.started || !sessionBody.subscribed) {
    router.replace("/");
    return;
  }
  ```

- Leaderboard tetap membuat sesi sendiri, tetapi langsung memuat data tanpa
  peduli status bot/channel.
- Komentar yang menyebut "feed owns the gates" diperbarui.

### 4. Tidak diubah

- `src/app/api/session/route.ts` tetap mengembalikan `started`, `subscribed`,
  `channelUrl` seperti sekarang.
- `/api/feed`, `/api/leaderboard`, dan API lain tidak diberi enforcement baru.
- `start-gate.tsx` tetap dipakai apa adanya (copy dan tombol tidak berubah).

## Edge Case

- **Deck kurang dari 3 item**: gate tidak pernah muncul; user bisa melihat semua konten.
- **Reload saat posisi tersimpan >= indeks 2 dan gate belum lolos**: posisi di-clamp
  ke indeks 2 supaya gate tampil lebih dulu; kartu setelahnya belum bisa diakses.
- **Share link yang mem-pin konten tertentu**: gate tetap di urutan ke-3 deck,
  bukan di konten yang di-pin.
- **Gate channel sudah lolos tapi start bot belum** (data lama/aneh): tampilkan gate start
  lebih dulu, lalu channel bila masih perlu.
- **Kembali dari chat bot tanpa menekan Start**: gate tetap tampil, tidak ada perubahan.
- **Swipe mundur saat gate tampil**: diblokir, jadi user tidak bisa mengakali gate
  dengan kembali ke kartu ke-2.

## Testing Manual

1. User baru (belum start, belum join) → kartu 1 dan 2 tampil, kartu 3 menampilkan gate start.
2. Tekan "Buka Bot" → kembali ke app → gate berganti ke join channel (kalau belum join).
3. Tekan "Saya sudah join" → gate hilang, kartu ke-3 tampil, posisi tidak reset.
4. Saat gate tampil: tombol header, next/previous, swipe, tap, hold, dan rating tidak bereaksi.
5. User yang sudah start + join → tidak pernah melihat gate, termasuk setelah reload.
6. Deck 2 item → tidak ada gate.
7. Buka `/leaderboard` langsung (deep link dan reload) tanpa start/join → leaderboard tetap terbuka.
8. Reload di kartu ke-3 dengan gate belum lolos → gate tampil, bukan konten ke-3.

## Di Luar Scope

- Enforcement gate di API/server.
- Perubahan copy gate.
- Perubahan urutan gate selain start → channel.
- Gate pada halaman leaderboard.
