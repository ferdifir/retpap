# Aset & Teks Bot RetPAP

Prompt gambar untuk foto profil bot dan banner sambutan, plus teks deskripsi bot.
Semua teks di bawah sudah memakai nama brand **RetPAP**.

## Aturan Telegram yang harus dipatuhi

- **Foto profil bot**: gambar persegi, disarankan 512x512, PNG atau JPG. Harus
  jelas pada ukuran kecil (chat list sekitar 40px), tanpa teks kecil, tanpa logo
  Telegram, tanpa meniru UI Telegram, dan tidak menyesatkan soal isi bot.
- **Banner sambutan**: dikirim sebagai pesan foto biasa saat /start, jadi tunduk
  pada aturan konten Telegram: tidak boleh pornografi, kekerasan, ujaran
  kebencian, atau menyamar sebagai pihak lain. Ukuran aman 1280x720 (16:9),
  di bawah 5 MB, JPG.
- **Deskripsi bot** (setMyDescription): maksimal 512 karakter.
- **Deskripsi singkat** (setMyShortDescription): maksimal 120 karakter.
- Jangan taruh teks penting di dalam gambar: Telegram menampilkan caption di
  bawah foto, dan teks di gambar tidak bisa dipilih atau diterjemahkan.

## Prompt 1 - foto profil bot

> Minimalist flat vector logo for a photo-rating app: a geometric camera
> aperture made of six rounded blades, its centre shaped like a small
> four-point spark. Deep navy circular background (#0b0f19), blades in flat
> cyan (#22d3ee) with one blade in amber (#fbbf24). Thick even strokes, hard
> edges, two flat colours, no gradients, no shadows, no 3D, no text. Centred,
> symmetrical, generous padding, readable at 40px. Square 1:1, 1024x1024.

## Prompt 2 - banner sambutan (16:9)

> Wide flat vector banner for a photo-rating app. Deep navy background
> (#0b0f19) with a soft cyan glow in the lower right. Left side: a large
> camera aperture mark with a four-point spark in its centre, cyan with one
> amber blade. Right side: three small rounded cards floating at a slight
> angle, each showing a simple abstract photo thumbnail with a small emoji
> badge. Clean geometric composition, plenty of empty space on the left for
> text overlay, two accent colours only (cyan #22d3ee, amber #fbbf24), no
> gradients on the objects, no shadows, no text, no letters, no numbers.
> 16:9, 1280x720, vector style.

## Negative prompt (tempel di kedua prompt)

> text, letters, words, numbers, watermark, logo of Telegram, paper plane,
> photorealistic, 3D render, bevel, drop shadow, glow blur, gradient mesh,
> detailed texture, thin hairlines, clutter, human bodies, nudity, weapons,
> money, UI screenshot, phone mockup, perspective distortion, noisy background

## Teks bot

**Deskripsi singkat (maks 120 karakter)**

> Foto orang lain? Kasih nilai. Foto kamu? Biar dinilai 👀 Tap, komen, geser —
> semua di sini. Masuk sekarang!

**Deskripsi (maks 512 karakter)**

> Kamu punya pendapat soal foto? Bagus, di sini pendapatmu berharga 👀
>
> Tap di titik yang bikin kamu bereaksi, tahan buat komen pedas, geser slider
> buat kasih nilai 1-10. Foto keren bakal naik panggung, yang asal-asalan
> siap-siap dibahas.
>
> Mau fotomu ikut dinilai? /upload, kirim foto, tulis caption, tekan Terbitkan.
> Fotomu langsung nangkring paling atas.
>
> Jangan cuma jadi penonton. Mulai nilai sekarang 👇

**Pesan /start** (sudah dipakai di kode)

> **RetPAP**
>
> Kasih nilai foto orang lain, atau unggah foto kamu sendiri.
>
> **Cara upload PAP untuk dinilai:**
> 1. Ketik /upload
> 2. Kirim fotonya (sebagai foto, bukan file)
> 3. Kirim caption
> 4. Tekan Terbitkan
>
> Setelah terbit, fotomu masuk feed dan bisa dinilai orang lain.
>
> /batal - batalkan upload

## Checklist sebelum dipasang

- Foto profil tampil jelas di chat list, tidak ada teks yang tidak terbaca.
- Banner tidak memuat teks; caption dipasang lewat bot.
- Tidak ada elemen milik Telegram (logo, ikon paper plane, mockup chat).
- Warna sesuai brand: navy #0b0f19, cyan #22d3ee, amber #fbbf24.
- Deskripsi singkat maks 120 karakter, deskripsi maks 512 karakter.
