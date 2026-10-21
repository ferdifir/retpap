import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/bot/flow";
import type { BotUpdate } from "@/lib/bot/types";

/** Compares the webhook secret without leaking its length or content. */
function secretMatches(header: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected || !header) return false;

  const received = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

/**
 * Telegram webhook. Configured by `npm run bot:setup`; the secret header is
 * the only authentication, so an unset secret rejects everything.
 */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as BotUpdate | null;
  if (!update) return Response.json({ ok: true });

  try {
    await handleUpdate(update);
  } catch (error) {
    // Always ack: a non-200 makes Telegram retry the same update forever.
    console.error("[bot] update failed", error);
  }

  return Response.json({ ok: true });
}
