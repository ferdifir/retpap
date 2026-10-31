/**
 * Sekali jalan: samakan label tombol di post channel yang sudah tayang.
 *
 * Tombol post lama masih berbunyi "Kasih rating" (dan "Beri nilai" dari
 * scheduled uploader). Mengubah kode hanya berlaku untuk post baru, jadi
 * script ini menelusuri setiap foto yang punya channel_message_id lalu
 * menulis ulang reply markup-nya ke label sekarang.
 *
 *   npx tsx scripts/relabel-channel-buttons.ts --dry-run   # cuma daftar
 *   npx tsx scripts/relabel-channel-buttons.ts             # kirim perubahan
 *
 * Aman diulang: post yang markup-nya sudah sama dijawab Telegram dengan
 * "message is not modified" dan dihitung sebagai dilewati.
 */
import "./dotenv-load";

import { isNotNull } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { photos } from "../src/db/schema";
import { channelConfigured, channelId } from "../src/lib/bot/channel";
import { shareUrlFor, uploadUrl } from "../src/lib/share";

const LABEL = "Lihat versi jelas";
/** Telegram membatasi edit per chat; 1,2 detik aman untuk ~100 post. */
const DELAY_MS = Number(process.env.RELABEL_DELAY_MS ?? 1200);
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

function token(): string {
  const value = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TelegramAnswer = {
  ok: boolean;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

async function editKeyboard(messageId: number, slug: string): Promise<TelegramAnswer> {
  const response = await fetch(
    "https://api.telegram.org/bot" + token() + "/editMessageReplyMarkup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId(),
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: LABEL, url: shareUrlFor(slug) },
              { text: "Upload", url: uploadUrl() },
            ],
          ],
        },
      }),
    },
  );

  return (await response.json().catch(() => ({ ok: false }))) as TelegramAnswer;
}

async function main(): Promise<void> {
  if (!channelConfigured()) throw new Error("TELEGRAM_CHANNEL_ID is not set");

  const { db } = getDb();
  const rows = await db
    .select({ id: photos.id, slug: photos.slug, messageId: photos.channelMessageId })
    .from(photos)
    .where(isNotNull(photos.channelMessageId))
    .orderBy(photos.id);

  console.log(
    (DRY_RUN ? "[dry-run] " : "") +
      "post channel ditemukan: " +
      rows.length +
      " (jeda " +
      DELAY_MS +
      " ms)",
  );

  let updated = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    const messageId = row.messageId;
    if (messageId === null) continue;

    const position = index + 1 + "/" + rows.length;

    if (DRY_RUN) {
      console.log("  " + position + " photo " + row.id + " message " + messageId);
      updated += 1;
      continue;
    }

    let answer = await editKeyboard(messageId, row.slug);

    // A flood wait is a pause, not a failure: wait it out once.
    if (!answer.ok && answer.error_code === 429) {
      const wait = (answer.parameters?.retry_after ?? 5) + 1;
      console.warn("  " + position + " flood wait " + wait + "s");
      await sleep(wait * 1000);
      answer = await editKeyboard(messageId, row.slug);
    }

    if (answer.ok) {
      updated += 1;
      console.log("  " + position + " ok photo " + row.id);
    } else if (answer.description?.includes("message is not modified")) {
      skipped += 1;
      console.log("  " + position + " sudah sama photo " + row.id);
    } else if (answer.description?.includes("message to edit not found")) {
      missing += 1;
      console.warn("  " + position + " post hilang photo " + row.id);
    } else {
      failed += 1;
      console.error(
        "  " + position + " gagal photo " + row.id + ": " + answer.description,
      );
    }

    await sleep(DELAY_MS);
  }

  console.log(
    "\nselesai: " +
      updated +
      " diperbarui, " +
      skipped +
      " sudah sama, " +
      missing +
      " post hilang, " +
      failed +
      " gagal",
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
