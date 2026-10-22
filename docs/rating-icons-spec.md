# Spesifikasi ikon tier rating (1–10)

Brief produksi untuk 10 ikon nilai rating "RetPAP". Tujuannya supaya ikon bisa digambar ulang
(oleh ilustrator atau generator gambar) tanpa kehilangan kesatuan keluarga bentuk.

Konteks pemakaian:

- Watermark hasil share, tinggi ikon **40–48 px**.
- Di dalam app (overlay rating), **34–56 px**.
- Di kartu feed dan pill, **20–24 px** — harus tetap terbaca.
- Selalu di atas foto, jadi harus punya tepi terang dan tidak boleh bergantung pada latar gelap.

---

## 1. Konsep

Satu objek yang berubah wujud seiring panas: **kristal**. Di skor rendah kristal itu beku dan
retak; di tengah ia memanas dan terbakar; di atas ia melepaskan listrik lalu meledak.

Konsekuensi desain: **siluet kristal tidak berubah di semua level.** Yang bertambah adalah
energinya. Ini yang membuat 10 ikon terasa satu keluarga, bukan 10 simbol lepas.

Urutan energi:

    1–3  dingin, statis, retak        (es mencair)
    4–7  panas, api tumbuh            (bara → kobaran)
    8–10 listrik, ledakan             (petir → supernova)

---

## 2. Aturan keluarga (wajib, berlaku untuk semua level)

1. **Satu kristal, satu fokus.** Maksimal satu elemen energi utama per ikon. Kalau ada api,
   jangan ada petir; kalau ada petir, api sudah habis.
2. **Siluet dulu.** Ikon harus dikenali dari bentuk hitam-putihnya saja di 24 px. Detail
   interior hanya menambah, bukan menentukan.
3. **Tepi terang, isi tembus.** Kristal digambar seperti kaca: garis tepi terang, isi
   transparan/translucent. Jangan pakai fill solid gelap — akan hilang di atas foto gelap.
4. **Ketebalan garis seragam.** Outline kristal 4.5 unit (lihat §3), garis energi 3 unit,
   garis detail dalam 2 unit dengan opacity 30–40%.
5. **Sudut tajam, tanpa bayangan.** Semua bentuk bersudut/geometris. Tanpa drop shadow, tanpa
   bayangan elips di bawah objek, tanpa tekstur noise.
6. **Arah cahaya dari atas-kiri.** Highlight di kiri-atas, shade di kanan-bawah.
7. **Tidak ada teks, angka, atau emoji** di dalam ikon. Angka skor dirender terpisah oleh app.
8. **Kompleksitas bertambah monoton.** Level n+1 harus selalu terlihat "lebih" dari level n:
   lebih banyak elemen, lebih besar, atau lebih terang. Tidak boleh ada level yang terlihat
   lebih tenang dari level sebelumnya.

---

## 3. Kanvas & grid

- Kanvas persegi 1:1, 1024×1024 px (atau SVG viewBox 0 0 100 100).
- Sistem koordinat di dokumen ini: **0–100**, origin kiri-atas, y ke bawah.
- Safe area: semua tinta di dalam **6–94**. Pengecualian: api level 7 dan pancaran level 10
  boleh sampai **2–98**.
- Kristal, dipakai identik di semua level:

        (50,13)
   (27,31)      (73,31)
   (27,65)      (73,65)
        (50,90)

  Heksagon vertikal, lebar 46, tinggi 77, rasio 0.6. Vertex atas dan bawah tajam, empat sisi
  samping lurus. **Jangan** membulatkan sudut.

- Facet kristal, garis dalam opacity 30–40%, tebal 2:
  - horizontal (27,42) → (73,42), batas mahkota
  - vertikal (50,42) → (50,90), spine bawah
- Outline kristal: tebal **4.5**, linejoin round, warna tepi **#EAF4FF** dengan inner stroke
  **#9CC0E8** — efek kaca dua lapis.
- Optical center: kalau api/petir membuat berat ke atas, geser kristal turun 2–4 unit supaya
  pusat massa tetap di sekitar y=50.

---

## 4. Palet

Kristal, sama di semua level:

| Peran | Hex |
|---|---|
| Tepi terang | #EAF4FF |
| Tepi dalam | #9CC0E8 |
| Facet | #7FA8D4 @ 35% |
| Isi translucent | #0B1220 @ 10% |

Energi per level, gradien linear arah bawah→atas:

| Lv | Nama | Dari | Ke | Glow |
|---|---|---|---|---|
| 1 | Frost | #BFDBFE | #7DD3FC | tidak ada |
| 2 | Ice | #93C5FD | #60A5FA | tidak ada |
| 3 | Thaw | #7DD3FC | #38BDF8 | sangat tipis, biru, 15% |
| 4 | Ember | #FCD34D | #F59E0B | radial 40%, kuning 25% |
| 5 | Spark | #FBBF24 | #F97316 | radial 50%, oranye 30% |
| 6 | Flame | #FDBA74 | #F97316 | radial 60%, oranye 35% |
| 7 | Blaze | #FB923C | #EA580C | radial 70%, oranye 40% |
| 8 | Bolt | #FDE68A | #FACC15 | radial 60%, kuning 45% |
| 9 | Overcharge | #FEF08A | #FBBF24 | radial 75%, kuning 50% |
| 10 | Supernova | #FFFFFF | #FDE047 | radial 90%, putih 55% |

Inti (core) setiap elemen energi selalu **lebih terang** dari lapisan luarnya, minimal 2 stop:
api punya inti **#FEF3C7**, petir punya inti putih.

---

## 5. Tabel ringkas

| Lv | Nama | Rentang skor | Elemen energi | Kata kunci |
|---|---|---|---|---|
| 1 | Frost | 0.5–1.4 | es menggantung | mati, beku |
| 2 | Ice | 1.5–2.4 | jarum frost | dingin, tajam |
| 3 | Thaw | 2.5–3.4 | retak + tetesan | mulai luntur |
| 4 | Ember | 3.5–4.4 | inti membara | hangat pertama |
| 5 | Spark | 4.5–5.4 | api kecil | menyala |
| 6 | Flame | 5.5–6.4 | api menutup atas | terbakar |
| 7 | Blaze | 6.5–7.4 | api menelan | berkobar |
| 8 | Bolt | 7.5–8.4 | satu petir | pelepasan |
| 9 | Overcharge | 8.5–9.4 | petir + busur | tak stabil |
| 10 | Supernova | 9.5–10 | pecah + pancaran | klimaks |

---

## 6. Detail per level

Format tiap level: konsep → elemen & posisi → warna → larangan → prompt siap pakai.
Prompt berbahasa Inggris karena generator gambar lebih patuh pada istilah Inggris.

### 6.1 Level 1 — Frost

**Konsep:** kristal mati, beku total. Tidak ada energi, tidak ada gerak.

**Elemen:**

1. Kristal, outline penuh, tanpa glow. Isi sedikit lebih biru dari biasanya, **#DBEAFE** @ 12%.
2. Dua es menggantung di bawah, keluar dari sisi miring bawah:
   - kiri: segitiga dari (34,72) turun ke (33,86) lalu (39,75), ujung tajam ke bawah.
   - kanan: dari (63,74) turun ke (65,84) lalu (58,76).
   Keduanya **di luar** garis kristal, menempel di tepi, bukan menutupi facet.
3. Satu retak di facet kiri: polyline 3 segmen (41,36) → (46,45) → (42,53) → (47,60),
   tebal 2, warna **#BFDBFE**.
4. Opsional: 2 titik salju kecil r=1.2 di (78,26) dan (20,22), opacity 50%.

**Larangan:** jangan ada tetesan air, jangan ada warna hangat sama sekali, jangan ada glow.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A translucent pale-blue
> hexagonal crystal gem with crisp light edges, drawn like frosted glass. Two sharp icicles hang
> from its lower edges, one small angular crack inside the left facet, two tiny snow specks
> beside it. Cold pale blue palette (#BFDBFE, #7DD3FC). Minimal geometric style, uniform thin
> outlines, no glow, no shadow, no text.

---

### 6.2 Level 2 — Ice

**Konsep:** dingin tapi hidup — kristal menumbuhkan jarum es ke luar.

**Elemen:**

1. Kristal, outline penuh, isi **#DBEAFE** @ 14%.
2. Tiga **klaster jarum** — bedanya dengan level 1 adalah arah, bukan bentuk:
   - klaster A di pojok kiri-atas: tiga garis keluar dari (30,28) ke (16,14), (16,28), (30,14).
     Panjang 14–16, tebal 3, ujung runcing.
   - klaster B di pojok kanan-atas: dari (70,28) ke (84,14), (84,28), (70,14).
   - klaster C di sisi kanan-bawah: dari (73,58) ke (88,66) dan (76,70).
3. Facet tetap terlihat, tanpa retak.

**Pembeda dari level 1:** semua energi mengarah **keluar dan ke atas**; level 1 mengarah ke bawah.

**Larangan:** jangan ada retak, jangan ada api, jarum jangan menembus badan kristal.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A translucent hexagonal
> crystal gem made of pale blue frosted glass, with three clusters of sharp ice needles growing
> outward from its upper-left, upper-right and lower-right corners. Cold blue palette
> (#93C5FD, #60A5FA). Minimal geometric line art, uniform stroke, no glow, no text.

---

### 6.3 Level 3 — Thaw

**Konsep:** mulai mencair. Retakan menyebar, satu tetes jatuh.

**Elemen:**

1. Kristal, outline penuh.
2. Retak utama zigzag dari vertex atas ke tengah:
   (50,13) → (44,30) → (55,40) → (47,52) → (52,62), tebal 2.5, warna **#7DD3FC**.
   Retak **tidak** sampai menembus tepi luar — kristal belum pecah.
3. Satu tetesan air di luar kanan-bawah: bentuk tetes, bulat di bawah dan meruncing ke atas,
   tinggi 9, lebar 6, pusat (82,80). Gradien **#7DD3FC → #38BDF8**, satu highlight putih
   kecil di kiri-atas.
4. Glow sangat tipis di dasar kristal: radial, radius 18, opacity 15%.

**Larangan:** jangan ada api atau warna hangat, jangan ada uap, jangan kristal pecah.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A translucent hexagonal
> crystal gem with a single jagged crack running from its top point down the middle, and one
> small water droplet falling beside its lower right side. Cool cyan-blue palette (#7DD3FC,
> #38BDF8), very faint glow at the base. Minimal geometric style, no text, no shadow.

---

### 6.4 Level 4 — Ember

**Konsep:** panas pertama. Kristal belum terbakar, tapi intinya membara dari dalam.

**Elemen:**

1. Kristal, outline penuh, isi **#FEF3C7** @ 8%.
2. **Inti membara**: lingkaran radial di (50,62), radius 16, **#FCD34D** @ 35% → transparan.
   Di dalamnya satu titik solid r=5 **#F59E0B**.
3. Rim light hangat di dua sisi miring bawah: garis tebal 2, **#FBBF24** @ 60%, sepanjang
   60% tepi bawah kiri dan kanan.
4. Dua bara naik di kanan-atas: bulatan r=2 di (80,28) dan r=1.4 di (86,20), **#FBBF24**.

**Larangan:** jangan ada api berbentuk lidah, jangan ada petir, jangan kristal retak.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A translucent hexagonal
> crystal gem glowing warm from inside, amber core light at its lower center, warm rim light
> along the bottom edges, two tiny embers floating to the upper right. Amber palette (#FCD34D,
> #F59E0B). Minimal geometric style, no flames yet, no text, no shadow.

---

### 6.5 Level 5 — Spark

**Konsep:** api pertama muncul di sisi kristal.

**Elemen:**

1. Kristal, outline penuh, tanpa retak.
2. **Satu lidah api** menempel di sisi kanan-atas kristal, keluar dari (70,26): tinggi 20,
   lebar 12, ujung meruncing ke atas dan sedikit melengkung ke kanan. Dua lapis: luar
   **#F97316**, dalam **#FCD34D**, inti **#FEF3C7** @ 60%. Api **tumpang tindih** tepi kristal
   sekitar 3 unit, bukan melayang.
3. Satu bara di (84,16), r=1.6.
4. Glow radial lembut di sekitar api, radius 20, opacity 30%.

**Larangan:** api tidak boleh menutupi vertex atas; jangan ada asap; jangan ada busur listrik.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A translucent hexagonal
> crystal gem with a single small flame licking up from its upper right edge, overlapping the
> crystal outline. Two-layer flame: orange outer, pale yellow inner. Soft orange glow. Minimal
> geometric style, no smoke, no text, no shadow.

---

### 6.6 Level 6 — Flame

**Konsep:** api menguasai bagian atas kristal.

**Elemen:**

1. Api **mahkota** tumbuh dari vertex atas (50,13): tinggi 30, lebar 24, tiga lidah dengan
   tengah paling tinggi, ujung runcing, tepi sedikit bergelombang tapi tetap geometris — bukan
   api realistis berasap.
2. Api menutupi 30–35% badan kristal bagian atas.
3. Kristal digambar **di atas** api: outline tetap tajam dan terang, sehingga api terlihat
   di belakang kaca.
4. Inti api **#FEF3C7**, badan **#F97316**, tepi **#FDBA74**.
5. Facet di area terbakar diberi tint oranye @ 15%.

**Larangan:** jangan api menutupi seluruh kristal; jangan hilangkan outline kristal; jangan
ada percikan besar.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A translucent hexagonal
> crystal gem with a three-tongued flame crown rising from its top point and covering the upper
> third of the crystal; the crystal outline stays crisp and bright in front of the flame. Orange
> and pale yellow palette. Minimal geometric style, no smoke, no text, no shadow.

---

### 6.7 Level 7 — Blaze

**Konsep:** api menelan kristal. Kristal mulai kalah.

**Elemen:**

1. Api besar: tinggi 46, lebar 34, menutupi 60% atas kristal, lima lidah dengan tinggi
   bervariasi, plus **dua wisp** api terlepas di (18,20) dan (84,14), masing-masing tinggi 10.
2. Kristal diredupkan: outline opacity 50%, isi tetap translucent.
3. Tiga bara naik: r=2.2 di (86,30), r=1.6 di (90,22), r=1.4 di (80,10).
4. Glow radial besar: radius 40, oranye @ 40%.

**Pembeda dari level 6:** level 6 api hanya di atas dan kristal masih penuh; level 7 api
menyelimuti badan kristal dan kristal meredup.

**Larangan:** jangan ada petir; jangan kristal hilang total, harus masih terbaca.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A large five-tongued flame
> engulfing the upper two thirds of a translucent hexagonal crystal gem, two small flame wisps
> detached at the sides, three embers rising. The crystal is dimmed and semi-transparent behind
> the fire. Deep orange palette (#FB923C, #EA580C) with pale yellow cores. Minimal geometric
> style, no smoke, no text, no shadow.

---

### 6.8 Level 8 — Bolt

**Konsep:** api habis, energi berubah jadi listrik. Satu pelepasan.

**Elemen:**

1. Kristal diredupkan (opacity 45%), **tanpa api, tanpa bara**.
2. **Satu petir** menembus kristal diagonal dari kanan-atas ke kiri-bawah: mulai (72,10),
   zigzag 5 segmen, berakhir (24,90). Lebar badan 8–12, ujung runcing.
3. Petir dua lapis: luar **#FACC15** tebal, inti putih **#FFFFFF** lebih tipis di tengah.
4. Dua percikan di titik masuk (76,8) r=2 dan titik keluar (20,92) r=1.4.
5. Glow kuning radius 30 @ 45%.

**Larangan:** jangan ada api, jangan dua petir (itu level 9), jangan petir melengkung —
harus zigzag tajam.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A dimmed translucent
> hexagonal crystal gem pierced diagonally by a single sharp zigzag lightning bolt with a white
> hot core, small sparks at entry and exit points. Yellow electric palette (#FDE68A, #FACC15).
> Minimal geometric style, no fire, no text, no shadow.

---

### 6.9 Level 9 — Overcharge

**Konsep:** energi tidak stabil. Petir di dalam, busur di luar.

**Elemen:**

1. Kristal opacity 45%, dengan retak halus di dalam: 2 garis tipis, opacity 30%.
2. Petir utama lebih **tegak** dari level 8: dari (58,8) zigzag ke (38,88), lebih ramping,
   lebar 6–9.
3. **Dua busur listrik** mengapit kristal, berbentuk C:
   - kiri: dari (18,32) melengkung keluar ke (8,50) lalu (18,68).
   - kanan: cermin, (82,32) → (92,50) → (82,68).
   Tebal 3, warna **#FDE047**, dengan 1–2 percikan kecil di ujungnya.
4. Glow kuning radius 38 @ 50%, sedikit lebih terang dari level 8.

**Pembeda dari level 8:** jumlah sumber listrik 1 → 3, dan arah petir diagonal → tegak.

**Larangan:** jangan ada api, jangan busur menutupi kristal, jangan lebih dari dua busur.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. A dimmed translucent
> hexagonal crystal gem with a near-vertical zigzag lightning bolt inside it, flanked by two
> C-shaped electric arcs on the left and right, tiny sparks at the arc tips. Bright yellow
> palette (#FEF08A, #FBBF24) with white-hot cores. Minimal geometric style, no fire, no text.

---

### 6.10 Level 10 — Supernova

**Konsep:** klimaks. Kristal pecah dan melepaskan ledakan radial.

**Elemen:**

1. Kristal **tidak lagi utuh**: pilih salah satu, jangan keduanya —
   - hanya outline samar, opacity 25%, atau
   - tiga pecahan kecil yang terbang keluar, segitiga 8–12 unit, di (30,18), (76,26), (34,84).
2. **Delapan sinar** radial dari pusat (50,52): empat sinar panjang 22 unit di atas/bawah/
   kiri/kanan, empat sinar pendek 14 unit di diagonal. Tebal 3.5, ujung runcing, putih
   **#FFFFFF** dengan tepi **#FDE047**.
3. **Inti ledakan**: bintang atau bolt kecil di pusat, tinggi 26, putih, dengan glow putih
   radius 45.
4. Tiga percikan di antara sinar, r=1.6.

**Larangan:** jangan ada api; jangan kristal utuh dan besar — harus terlihat hancur; jangan
sinar lebih dari 8, akan jadi matahari generik.

**Prompt:**

> Flat vector icon on transparent background, 1024x1024, centered. An explosion burst of eight
> radial rays — four long cardinal, four short diagonal — with a white-hot star core at the
> center, and three small crystal shards flying outward. White and pale yellow palette with a
> strong white glow. Minimal geometric style, no fire, no text, no shadow.

---

## 7. Pasangan yang mudah tertukar (wajib dicek)

| Pasangan | Pembeda yang harus terlihat di 24 px |
|---|---|
| 1 vs 2 | arah: es **turun** vs jarum **keluar** |
| 2 vs 3 | 2 simetris & bersih vs 3 asimetris + ada tetesan |
| 4 vs 5 | 4 hanya cahaya di dalam vs 5 ada bentuk api di luar |
| 5 vs 6 | 5 satu lidah kecil di sisi vs 6 tiga lidah di puncak |
| 6 vs 7 | 6 kristal penuh & terang vs 7 kristal meredup & api lebih besar |
| 7 vs 8 | api organik oranye vs petir zigzag kuning |
| 8 vs 9 | 8 satu petir diagonal vs 9 tiga sumber listrik |
| 9 vs 10 | 9 masih ada kristal vs 10 kristal pecah + sinar radial |

Kalau dua level masih tertukar saat diperkecil ke 24 px, **ubah jumlah elemen**, jangan
mengandalkan warna.

---

## 8. Varian output yang dibutuhkan

1. **Full color** — SVG + PNG 1024 transparan. Dipakai di watermark dan overlay.
2. **Mono** — satu warna putih **#FFFFFF**, semua elemen jadi outline + fill putih dengan
   opacity berbeda (100% / 60% / 30%) untuk memisahkan lapisan. Dipakai kalau watermark perlu
   netral di atas foto terang.
3. **Small-size** opsional — versi 16–20 px dengan detail dalam dihapus, hanya siluet + satu
   elemen energi.

Penamaan file: rating-01-frost.svg, rating-02-ice.svg, … rating-10-supernova.svg, plus
rating-01-frost-mono.svg.

---

## 9. Cara menjaga konsistensi saat generate

Generator gambar cenderung mengubah gaya antar gambar. Tiga trik:

1. **Buat satu lembar dulu.** Minta satu gambar berisi 10 ikon dalam satu baris dengan
   deskripsi lengkap kesepuluhnya. Gaya akan lebih konsisten karena satu render.

   > A single row of ten flat vector icons on a dark neutral background, same art style,
   > same stroke weight, same crystal silhouette in every icon, showing a progression:
   > frosted crystal with icicles → ice needles → cracked crystal with droplet → glowing amber
   > core → small flame → flame crown → engulfing blaze → single lightning bolt →
   > lightning with side arcs → shattered crystal with radial burst. Minimal geometric line
   > art, translucent glass crystal, light outlines, no text, evenly spaced.

2. **Pakai hasilnya sebagai referensi** untuk generate ulang per ikon (image-to-image),
   bukan text-to-image dari nol.
3. **Selalu sebutkan aturan keluarga** di setiap prompt: satu kristal, outline terang, tanpa
   bayangan, tanpa teks.

Negative prompt untuk semua level:

> text, numbers, letters, watermark, logo, drop shadow, cast shadow, photorealism, 3D render,
> glossy plastic, noise, grain, texture, multiple crystals, extra objects, cartoon face, emoji,
> blurry edges, thick uneven strokes, realistic fire, smoke

---

## 10. Checklist QA

- [ ] Di 24 px, tiap ikon bisa dibedakan dari tetangganya tanpa melihat warna.
- [ ] Di 24 px, outline kristal tidak pecah atau tumpang tindih.
- [ ] Tidak ada ikon yang terlihat lebih tenang dari level sebelumnya.
- [ ] Semua ikon muat di safe area 6–94, kecuali level 7 dan 10.
- [ ] Tidak ada teks, angka, atau bayangan di dalam ikon.
- [ ] Versi mono tetap terbaca di atas foto terang dan gelap.
- [ ] Kristal di semua level identik secara proporsi: lebar 46, tinggi 77, rasio 0.6.
