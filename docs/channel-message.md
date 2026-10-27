# Kirim Pesan ke Channel RetPAP

Panduan ini cukup untuk tugas "kirim pesan ke channel". **Jangan explore repo**
(`src/`, `scripts/`, `package.json`) — semua yang dibutuhkan ada di file ini.

- Channel tujuan: nilai `TELEGRAM_CHANNEL_ID` di `/var/www/retpap/.env.local`
  (judulnya **RetPAP**, `https://t.me/retpap`).
- Bot pengirim: `TELEGRAM_BOT_TOKEN` di file env yang sama.
- Kirim dari server produksi (`root@109.111.53.58`, port `38954`), karena token
  produksi hanya ada di sana. Token lokal di `.env.local` repo bisa beda bot.
- **Jangan pernah** `echo`/print token, jangan tulis ke file, jangan commit.

## Command siap pakai

Ganti bagian `text` dan tombolnya, lalu jalankan dari root repo:

```bash
ssh -p 38954 root@109.111.53.58 'node -' <<'EOF'
const fs = require("fs");

const env = {};
for (const line of fs.readFileSync("/var/www/retpap/.env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let value = m[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[m[1]] = value;
}

const token = env.TELEGRAM_BOT_TOKEN;
const chatId = env.TELEGRAM_CHANNEL_ID;
const botUsername = env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "menfesaibot";

if (!token || !chatId) {
  console.error("TELEGRAM_BOT_TOKEN atau TELEGRAM_CHANNEL_ID tidak ada");
  process.exit(1);
}

const text = [
  "<b>Judul pesan</b>",
  "",
  "Isi pesan di sini.",
].join("\n");

(async () => {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[{ text: "Upload PAP", url: `https://t.me/${botUsername}?start=upload` }]],
      },
    }),
  });

  const body = await response.json().catch(() => null);
  if (!body || !body.ok) {
    console.error("gagal:", response.status, body && body.description);
    process.exit(1);
  }

  const chat = body.result.chat;
  console.log("terkirim message_id=" + body.result.message_id + " ke " + (chat.title || chat.username || chat.id));
})();
EOF
```

Output sukses: `terkirim message_id=<n> ke RetPAP`. Laporkan `message_id` ke user.

## Aturan penulisan teks

- `parse_mode: "HTML"` — **Markdown tidak dirender**. `**bold**` akan tampil
  sebagai bintang. Pakai `<b>`, `<i>`, `<code>`, `<a href="...">`.
- Escape `&`, `<`, `>` di teks biasa menjadi `&amp;`, `&lt;`, `&gt;`.
- Baris baru: `\n` (atau array `join("\n")` seperti contoh).
- Emoji aman. Maksimal 4096 karakter.
- Link preview dimatikan by default; jangan ubah kecuali user minta.
- Bahasa: Indonesia santai, singkat, sesuai gaya bot RetPAP.

## Tombol (opsional)

- Upload: `https://t.me/<botUsername>?start=upload`
- Buka aplikasi: `https://t.me/<botUsername>?start=app`
- Satu baris satu tombol: `inline_keyboard: [[{ text, url }]]`
- Tanpa tombol: hapus `reply_markup` dari payload.

## Pin, edit, hapus

Ganti `METHOD` dan payload di script di atas, tetap baca token dari env server:

| Aksi | Method | Payload |
| --- | --- | --- |
| Pin | `pinChatMessage` | `{ chat_id, message_id, disable_notification: true }` |
| Edit teks | `editMessageText` | `{ chat_id, message_id, text, parse_mode: "HTML" }` |
| Hapus | `deleteMessage` | `{ chat_id, message_id }` |

Jangan pin/hapus tanpa instruksi eksplisit dari user.

## Error umum

- `400 chat not found` → `TELEGRAM_CHANNEL_ID` salah atau bot belum jadi admin channel.
- `403 Forbidden: bot is not a member` → tambahkan bot sebagai admin channel.
- `400 can't parse entities` → ada `<`, `>`, atau `&` yang tidak di-escape.
- `401 Unauthorized` → token di env server kosong/salah.

## Kalau SSH tidak tersedia

Jalankan script yang sama dari root repo tanpa `ssh ... 'node -' <<'EOF'` wrapper,
tapi baca `.env.local` lokal. Hanya untuk pesan non-produksi: token lokal bisa
milik bot/channel lain.
