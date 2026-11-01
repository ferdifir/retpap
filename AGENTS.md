<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Kirim pesan ke channel Telegram

Kalau user minta kirim/edit/pin pesan ke channel RetPAP, langsung baca dan ikuti
`docs/channel-message.md`. Tidak perlu explore `src/` atau `scripts/`.

## Batasan channel dan produksi

Wajib dibaca sebelum menyentuh channel atau produksi. Lihat `docs/insiden-2026-11-01.md`.

1. Teks yang sudah disetujui owner dikirim apa adanya. Tidak ada tambahan baris, CTA, atau perbaikan gaya.
2. Tidak ada handle, username, atau link karangan. Kalau tidak ada di env/DB/docs, tidak dikirim.
3. Pesan channel yang salah: hapus lalu kirim ulang. Jangan pernah diedit.
4. Asisten tidak mengirim ke channel atas inisiatif sendiri. Draft ditulis ke file, owner yang mengirim.
5. Perubahan produksi (DB write, hapus post, hapus pesan, deploy, cron) hanya setelah persetujuan eksplisit per aksi.

