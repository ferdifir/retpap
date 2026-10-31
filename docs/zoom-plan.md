# Plan: Zoom foto/video, posisi emoji, dan area toleransi

Status: **rancangan** (belum ada kode yang diubah)

Mockup interaktif: `docs/zoom-mockup.html`

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Zoom hanya di kartu aktif, reset ke 1x saat kartu berganti | Tiap kartu punya state sendiri; kartu di belakang tidak perlu di-render ulang |
| 2 | Pinch 2 jari (1x–4x) + pan 1 jari saat zoom + chip reset | Nol konflik dengan tap/long-press yang sudah ada |
| 3 | Double-tap zoom **ditunda ke fase 4** (opsional) | Single tap sekarang langsung membuka panel emoji; double-tap memaksa delay ~280ms |
| 4 | Emoji **diproyeksikan ulang** tiap perubahan zoom, ukuran tetap 34px | Posisi ikut berubah, tapi tombol tidak ikut membesar |
| 5 | Area toleransi jadi **konstanta piksel** (22px) | Radius layar tetap sama di semua level zoom |
| 6 | Panel menempel ke **spot** (bukan titik tap mentah) bila tap masuk toleransi | Reaksi yang tersimpan konsisten dengan marker yang terlihat |
| 7 | Rating slider disembunyikan saat zoom > 1 | Drag vertikal slider bentrok dengan pan |

## 1. Model koordinat

Kontrak lama tetap: `x, y ∈ [0,1]` relatif ke **kotak foto** (`useImageBox`),
bukan ke container. Yang ditambah hanya satu state tampilan per kartu:

```ts
type ZoomView = { scale: number; tx: number; ty: number };
const IDENTITY: ZoomView = { scale: 1, tx: 0, ty: 0 };
```

Layer media berukuran **persis kotak foto**, di-transform dari pojok kiri atas:

```
container (frame)
└── media layer  left = box.left, top = box.top, w = box.width, h = box.height
    transform-origin: 0 0
    transform: translate3d(tx, ty, 0) scale(scale)
```

Karena layer sudah seukuran kotak foto, `object-contain` di dalamnya identik
dengan `object-fill` — tidak ada letterbox ganda.

### Proyeksi (normalized → piksel container)

```ts
export function project(view: ZoomView, box: ImageBox, x: number, y: number) {
  return {
    x: box.left + view.tx + view.scale * x * box.width,
    y: box.top + view.ty + view.scale * y * box.height,
  };
}
```

### Invers (piksel client → normalized)

```ts
const containerX = (clientX - rect.left) / scaleX;   // scaleX = koreksi transform kartu
const x = (containerX - box.left - view.tx) / (view.scale * box.width);
```

Ini pengganti isi `toPct` sekarang; rumus lama otomatis jadi kasus khusus
`scale = 1, tx = ty = 0`.

### Zoom di titik fokus

```ts
function zoomAt(view, box, nextScale, focusX, focusY) {
  const s = clamp(nextScale, 1, ZOOM_MAX);
  const nx = (focusX - box.left - view.tx) / (view.scale * box.width);
  const ny = (focusY - box.top - view.ty) / (view.scale * box.height);
  return clampPan({
    scale: s,
    tx: focusX - box.left - s * nx * box.width,
    ty: focusY - box.top - s * ny * box.height,
  }, box);
}
```

### Batas pan

```ts
function clampPan(view, box) {
  return {
    ...view,
    tx: clamp(view.tx, box.width - view.scale * box.width, 0),
    ty: clamp(view.ty, box.height - view.scale * box.height, 0),
  };
}
```

Efeknya: saat zoom, gambar selalu menutupi kotak foto — tidak ada celah hitam
di tepi. Saat `scale = 1` batasnya `[0, 0]`, jadi identik dengan perilaku
sekarang.

## 2. Gesture

Semua gesture zoom ditangani di lapisan interaksi kartu (`pap-card`), memakai
peta pointer (`Map<pointerId, {x,y}>`).

| Gesture | 1x | Zoom > 1 |
|---|---|---|
| Tap 1 jari | Buka panel emoji di titik tap (snap bila dalam toleransi) | Sama, di titik hasil invers |
| Long press 420ms | Komentar baru / buka thread | Sama |
| Drag 1 jari | Tidak dipakai di kartu (swipe kartu di `section`) | **Pan foto**; swipe kartu dikunci |
| Pinch 2 jari | Zoom masuk/keluar di titik tengah | Sama |
| Wheel / ctrl+wheel | Zoom di posisi kursor (desktop) | Sama |
| Tap chip `1.0×` | — | Reset ke 1x |
| Esc | Tutup panel | Reset zoom dulu, lalu tutup panel |

Aturan arbitrase:

1. `pointerdown` kedua saat satu pointer aktif → batalkan timer long-press,
   masuk mode pinch, jangan pernah memicu tap.
2. Saat zoom > 1, drag > 6px mengubah mode jadi pan; `tapStart` dibuang.
3. Kartu melaporkan `onZoomChange(zoomed: boolean)` ke `pap-rater`; selama
   `zoomed`, `handleSwipeStart/Move/End` langsung `return`.
4. Pinch mengunci `ratingDragging` (slider sudah tidak terlihat saat zoom).
5. Panel terbuka tidak menutup saat pinch — hanya anchor-nya ikut bergerak.

Konstanta:

| Nama | Nilai | Catatan |
|---|---|---|
| `ZOOM_MIN` | 1 | |
| `ZOOM_MAX` | 4 foto, 3 video | video > 3x sudah pecah |
| `PAN_ACTIVATION_PX` | 6 | |
| `ZOOM_RESET_MS` | 180 | 0 bila `prefers-reduced-motion` |

## 3. Emoji / marker

Marker **tidak** ikut di dalam layer yang di-scale (kalau ikut, tombol 34px
akan jadi 136px di 4x). Marker tetap di overlay container, diposisikan lewat
proyeksi:

```tsx
const p = project(view, box, spot.x, spot.y);
// p.x, p.y dalam piksel container
```

| Kondisi | Perilaku |
|---|---|
| `scale === 1` | Clamp horizontal `[box.left + 44, box.left + box.width - 44]` (perilaku lama, supaya badge tidak terpotong) |
| `scale > 1` | **Tanpa clamp** — posisi jujur sesuai titik di foto |
| Titik keluar kotak foto | Marker disembunyikan (`opacity 0`, `pointer-events: none`), bukan ditempel di tepi |
| Ukuran | Selalu 34px, badge tetap 16px |
| Transisi | `transform 120ms ease-out` saat reset; 0ms saat gesture (biar tidak “karet”) |

Alasan menyembunyikan: marker yang ditempel di tepi padahal titiknya di luar
layar akan menipu — user menekan marker lalu bereaksi ke titik yang tidak
terlihat.

Konsekuensi tampilan yang perlu disepakati: saat zoom ke wajah, emoji yang
menempel di kaki **hilang dari layar** dan muncul lagi saat zoom out. Ini
benar secara spasial, tapi perlu dicatat di catatan rilis.

## 4. Area toleransi

Sekarang: `SNAP_RADIUS_RATIO = 0.04` relatif lebar foto (≈14px pada kotak
360px), dan radius layar ikut membesar saat zoom.

Baru: toleransi **konstan di layar**.

```ts
export const TAP_TOLERANCE_PX = 22;

// titik marker sudah dalam piksel container
export function findSpotNear(points, x, y, radiusPx = TAP_TOLERANCE_PX) { ... }
```

Karena marker sudah diproyeksikan, jarak bisa dihitung Euclidean biasa dalam
piksel — koreksi aspect ratio yang lama **hilang** (dulu perlu karena bekerja
di ruang ternormalisasi).

Radius ternormalisasi untuk dikirim/dipakai ulang:

```ts
const radiusNorm = TAP_TOLERANCE_PX / (box.width * view.scale);
```

### Snap → anchor

Bila tap masuk toleransi, `interaction` memakai koordinat **spot**, bukan
koordinat tap:

```ts
const snapped = findSpotNear(...);
const anchor = snapped ?? { x: at.x, y: at.y };
setInteraction({ xPct: anchor.x, yPct: anchor.y, spotId: snapped?.id ?? null, ... });
```

Ini yang membuat panel “menempel” ke emoji, bukan melayang di titik jari.

### Ketidakcocokan dengan server

Server (`src/db/queries.ts`) masih men-snap dengan `0.04` ternormalisasi. Di
zoom 4x, radius server jadi 4x lebih besar dari yang dilihat user, sehingga
titik “baru” bisa tidak sengaja digabung ke spot lama.

Perbaikan kecil dan kompatibel: tambah field opsional `snap?: boolean` pada
body `POST /api/photos/[id]/reactions` dan `/comments`. Client mengirim
`snap: false` karena keputusan snap sudah dibuat di klien. Default `true`
supaya klien lama tidak berubah.

## 5. Panel

Posisi sekarang: `panelX = box.left + xPct * box.width`, tanpa clamp vertikal.

Baru:

```ts
const p = project(view, box, interaction.xPct, interaction.yPct);
const panelX = clamp(p.x, PANEL_HALF, frameWidth - PANEL_HALF);
const above  = p.y > frameHeight * 0.36;
const panelY = clamp(p.y + (above ? -34 : 34), 8, frameHeight - 8);
```

- `frameHeight = box.top * 2 + box.height` (trik yang sama dengan `frameWidth`).
- Bila anchor keluar layar karena pan, panel tetap di tepi terdekat — jangan
  sampai panel menghilang sementara state-nya masih terbuka.
- Tinggi panel komentar bervariasi; untuk clamp vertikal yang akurat, ukur
  `offsetHeight` panel lewat `ResizeObserver` dan pakai nilai itu (opsional,
  fase 3).

## 6. Video

- Transform hanya dipasang pada elemen `<video>`, **bukan** pada kontrol
  (mute, play, badge durasi). Kontrol tetap di container, ukuran tetap.
- Video tetap berjalan saat di-zoom (tidak menambah `suspended`).
- `poster` ikut ter-scale karena menempel di elemen video.
- Reset zoom saat kartu berganti; tidak perlu pause.

Implementasi: `VideoSurface` menerima `mediaStyle?: CSSProperties` yang
ditempel ke `<video>`. Tidak perlu memecah komponen.

## 7. Edge case

| Kasus | Perilaku |
|---|---|
| Konten 18+ masih blur | Zoom dinonaktifkan (overlay blur menutup lapisan interaksi) |
| Panel terbuka lalu pinch | Panel ikut berpindah; tidak ditutup |
| Ganti kartu saat zoom | Reset ke 1x (state per kartu, `useEffect` saat `isActive` jadi false) |
| Resize / rotasi | `useImageBox` sudah `ResizeObserver`; `clampPan` dijalankan ulang setelah box berubah |
| `box.width === 0` (belum terukur) | Abaikan gesture zoom, jangan bagi nol |
| iOS WebView | `touch-action: none` sudah ada di `section`; tambahkan `gesturestart` `preventDefault` agar Safari tidak zoom halaman |
| Kartu non-aktif | `inert` + `pointer-events: none` sudah menutup; state zoom tidak di-reset dari belakang |
| Perangkat lambat | Update transform via `requestAnimationFrame`, commit state maksimal 1x per frame |

## 8. Rencana file

| File | Perubahan |
|---|---|
| `src/lib/zoom.ts` (baru) | `clampPan`, `zoomAt`, `project`, `unproject`, konstanta — fungsi murni, mudah dites |
| `src/hooks/use-zoom.ts` (baru) | State `ZoomView`, peta pointer, pinch/pan/wheel, `reset()`, `isZoomed` |
| `src/lib/reaction-rules.ts` | Tambah `findSpotNear` (piksel); `findSpotAt` tetap dipakai server |
| `src/components/pap/pap-card.tsx` | `toPct` pakai invers baru; marker diproyeksikan; panel pakai `project`; `--zoom-*` CSS var di container; `onZoomChange` |
| `src/components/pap/video-surface.tsx` | Prop `mediaStyle` untuk `<video>` |
| `src/components/pap/pap-rater.tsx` | `zoomLocked` state; swipe di-skip; reset saat `flipTo` |
| `src/app/api/photos/[id]/reactions/route.ts`, `.../comments/route.ts` | Field opsional `snap` |
| `src/db/queries.ts` | Hormati `snap === false` |

Tidak ada migration, tidak ada perubahan schema.

## 9. Analytics & aksesibilitas

- `track("zoom", { photoId, meta: { from, to, method: "pinch" | "wheel" | "button" } })`
  dikirim sekali saat gesture selesai (debounce 400ms), bukan tiap frame.
- `track("zoom_reset", ...)` untuk mengukur apakah user sering tersesat.
- Keyboard (kartu fokus): `+` / `-` zoom di tengah, `0` reset.
- Chip zoom punya `aria-label="Zoom 1.0x, tekan untuk reset"` dan
  `aria-live="polite"` saat level berubah.

## 10. Fase

1. **Fase 1 — fondasi**: `lib/zoom.ts`, `use-zoom.ts`, layer + transform,
   pinch/pan, kunci swipe, reset antar kartu. (foto + video)
2. **Fase 2 — presisi**: marker diproyeksikan, toleransi piksel, snap→anchor,
   `snap: false`, clamp panel.
3. **Fase 3 — chrome**: chip reset, sembunyikan slider saat zoom, keyboard,
   analytics, clamp tinggi panel.
4. **Fase 4 — opsional**: double-tap 2.5x (butuh delay tap 280ms).

## 11. Checklist uji

- [ ] 1x: tap/long-press berperilaku persis seperti sekarang (regresi nol).
- [ ] Pinch ke 2x di wajah: marker di wajah tetap di wajah, ukuran tetap 34px.
- [ ] Pinch ke 4x di pojok: marker sisi lain hilang, tidak menempel di tepi.
- [ ] Tap 30px dari marker saat 3x: tidak snap (di luar 22px layar).
- [ ] Tap 15px dari marker saat 3x: snap, panel menempel ke marker.
- [ ] Pan sampai tepi: tidak ada celah hitam.
- [ ] Swipe kartu saat 1x tetap jalan; saat 2x tidak memindah kartu.
- [ ] Ganti kartu: kartu baru mulai 1x.
- [ ] Video: kontrol tidak ikut membesar, video tetap main.
- [ ] Rotasi layar saat 2x: gambar tetap menutupi kotak.
- [ ] `prefers-reduced-motion`: reset tanpa animasi.

## 12. Risiko

- **Penemuan fitur**: pinch tidak terlihat. Mitigasi: chip `1.0×` di pojok
  kiri bawah sebagai petunjuk + `aria-live`.
- **Marker hilang saat zoom** bisa dikira bug. Mitigasi: animasi fade 120ms
  dan catatan rilis.
- **Pan vs swipe** adalah sumber bug paling mungkin; mitigasi: satu sumber
  kebenaran (`zoomLocked` di `pap-rater`), bukan cek terpisah di dua tempat.
- **Performa** pada foto besar di perangkat rendah: transform GPU + marker
  minimal, tanpa re-render tree media.
