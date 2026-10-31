# Welcome Message Channel RetPAP

Fitur bawaan Telegram (rilis 25 Agu 2026): pesan hanya terlihat oleh member
yang **baru join**, tidak menumpuk di chat. Bisa berisi teks, media, dan
beberapa pesan sekaligus.

**Set manual di client:** buka profil channel **RetPAP** → **Edit** →
**Welcome Message** → kirim teks di bawah.

Tidak bisa lewat API. Bot API 10.3 hanya menambah izin
`can_send_welcome_messages`; tidak ada method untuk men-set teks welcome, dan
MTProto schema belum mengekspos fitur ini.

Tombol di dalam pesan (`RichMessageButton`, Bot API 10.3) juga fitur sisi API,
bukan fitur editor welcome message. Jadi jangan berasumsi editor bisa membuat
tombol — pakai link `t.me` biasa di teks, karena link otomatis bisa diketuk.

## Teks

```
Selamat datang di RetPAP 👋

Foto dan video di channel sengaja diblur. Versi jelasnya ada di app —
tekan "Lihat versi jelas" di bawah post.

Buka app:
https://t.me/retpapbot?startapp

Mau ikut upload?
1. Buka https://t.me/retpapbot?start=upload
2. Kirim foto atau video (maks 1 menit, 20 MB)
3. Tulis caption, maks 500 karakter
4. Pilih Cewek atau Cowok
5. Pilih 18+ atau bukan
6. Tekan Upload
```

## Kenapa dua link itu

| Link | Fungsi |
| --- | --- |
| `https://t.me/retpapbot?startapp` | Buka Mini App langsung di feed. Tanpa nilai `start_param`, jadi tidak ada foto tertentu yang dipin. |
| `https://t.me/retpapbot?start=upload` | Buka chat bot dan langsung masuk alur upload. |

Langkah 2–6 sama persis dengan alur bot: `ASK_MEDIA_TEXT` →
`ASK_CAPTION_TEXT` (500 karakter) → `ASK_GENDER_TEXT` → `ASK_NSFW_TEXT` →
konfirmasi (`src/lib/bot/flow.ts`). Kalau alur bot berubah, teks ini ikut
diperbarui.

## Kenapa menyebut tombol di post, bukan tombol di welcome message

Setiap post di channel sudah punya dua tombol sebaris (`src/lib/bot/flow.ts`):

| Tombol | Tujuan |
| --- | --- |
| `Lihat versi jelas` | `t.me/<bot>?startapp=<slug>` — buka Mini App langsung di foto itu |
| `Upload` | `t.me/<bot>?start=upload` — masuk alur upload di chat bot |

## Aturan penulisan

- Bahasa Indonesia santai, singkat.
- Istilah yang dipakai: **rate/rating**, bukan "nilai"/"penilaian".
- Blur di channel = konten 18+, bukan error. Jangan tulis "foto blur semua"
  seolah itu masalah; jelaskan bahwa versi jelasnya ada di aplikasi.
- Jangan tambahkan kalimat penjelasan blur di caption post channel. Penjelasan
  blur hanya ada di welcome message dan di app.
