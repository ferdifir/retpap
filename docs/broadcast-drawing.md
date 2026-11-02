# Draft broadcast: fitur gambar

Status: **belum dikirim**. Owner yang mengirim setelah review.

## Teks (persis, HTML)

```html
<b>Fitur baru: gambar di atas PAP</b>

Sekarang kamu bisa corat-coret di atas foto atau video. Tap gambarnya, buka katalog emoji, lalu pilih tab <b>Gambar</b>.

• Gambarmu cuma terlihat olehmu
• Foto 18+ otomatis terbuka saat menggambar
• Mau dibagikan? Tekan <b>Selesai</b>, lalu <b>Bagikan</b>
• Defaultnya anonim — namamu hanya muncul kalau kamu nyalakan
• Yang dibagikan muncul sebagai slide tambahan di foto itu, tanpa reaksi dan komentar
• Berhenti kapan saja lewat tombol <b>Berhenti bagikan</b>
```

Tombol: satu baris, `Buka aplikasi` → `https://t.me/<botUsername>?startapp=`
(botUsername dibaca dari env server, jangan ditulis manual).

## Perintah kirim

Jalankan dari root repo, ganti bagian `text` dengan teks di atas:

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
  "<b>Fitur baru: gambar di atas PAP</b>",
  "",
  "Sekarang kamu bisa corat-coret di atas foto atau video. Tap gambarnya, buka katalog emoji, lalu pilih tab <b>Gambar</b>.",
  "",
  "• Gambarmu cuma terlihat olehmu",
  "• Foto 18+ otomatis terbuka saat menggambar",
  "• Mau dibagikan? Tekan <b>Selesai</b>, lalu <b>Bagikan</b>",
  "• Defaultnya anonim — namamu hanya muncul kalau kamu nyalakan",
  "• Yang dibagikan muncul sebagai slide tambahan di foto itu, tanpa reaksi dan komentar",
  "• Berhenti kapan saja lewat tombol <b>Berhenti bagikan</b>",
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
        inline_keyboard: [[{ text: "Buka aplikasi", url: `https://t.me/${botUsername}?startapp=` }]],
      },
    }),
  });

  const body = await response.json().catch(() => null);
  if (!body || !body.ok) {
    console.error("gagal:", response.status, body && body.description);
    process.exit(1);
  }

  console.log("terkirim message_id=" + body.result.message_id);
})();
EOF
```

## Catatan

- Tidak ada handle, username, atau link karangan di teks.
- Tanpa CTA tambahan; hanya satu tombol buka aplikasi.
- Kalau teks diubah, kirim ulang file ini untuk review sebelum dikirim.
