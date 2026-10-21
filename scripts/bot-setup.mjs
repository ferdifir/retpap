#!/usr/bin/env node
//
// Registers the Telegram webhook for the upload bot.
//
//   npm run bot:setup           # create the secret if needed, then set the webhook
//   npm run bot:setup -- --delete   # remove the webhook (e.g. before switching to polling)
//   npm run bot:setup -- --status   # only print getWebhookInfo
//
// Reads .env.local from the current directory, so run it where the app runs
// (on the server: /var/www/retpap).

import { randomBytes } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing from .env.local");
  process.exit(1);
}

const appUrl = (process.env.APP_URL?.trim() || "https://bot.linkviu.my.id").replace(/\/$/, "");
const webhookUrl = appUrl + "/api/telegram/webhook";
const args = new Set(process.argv.slice(2));

async function call(method, payload = {}) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!body?.ok) {
    console.error(method + " failed:", body?.description ?? response.status);
    process.exit(1);
  }
  return body.result;
}

function ensureSecret() {
  const existing = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (existing) return existing;

  // Telegram only accepts A-Z a-z 0-9 _ - in secret_token.
  const secret = randomBytes(32).toString("base64url");
  appendFileSync(".env.local", "\nTELEGRAM_WEBHOOK_SECRET=" + secret + "\n");
  process.env.TELEGRAM_WEBHOOK_SECRET = secret;

  console.log("generated TELEGRAM_WEBHOOK_SECRET and appended it to .env.local");
  console.log("restart the app so it picks the secret up: pm2 restart retpap --update-env");
  return secret;
}

function checkEnvFile() {
  try {
    const contents = readFileSync(".env.local", "utf8");
    if (!/^APP_URL=/m.test(contents)) {
      console.log("note: APP_URL is not set in .env.local, using " + appUrl);
    }
  } catch {
    console.error("no .env.local in " + process.cwd());
    process.exit(1);
  }
}

checkEnvFile();

if (args.has("--delete")) {
  await call("deleteWebhook", { drop_pending_updates: false });
  console.log("webhook deleted");
  process.exit(0);
}

if (args.has("--status")) {
  const info = await call("getWebhookInfo");
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
}

const me = await call("getMe");
const secret = ensureSecret();

await call("setWebhook", {
  url: webhookUrl,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});

await call("setMyCommands", {
  commands: [
    { command: "upload", description: "Unggah foto untuk dinilai" },
    { command: "batal", description: "Batalkan upload yang sedang berjalan" },
    { command: "start", description: "Buka Rate PAP" },
  ],
});

const info = await call("getWebhookInfo");
console.log("bot: @" + me.username + " (" + me.id + ")");
console.log("webhook: " + info.url);
console.log("pending updates: " + info.pending_update_count);
if (info.last_error_message) {
  console.log("last error: " + info.last_error_message);
}
