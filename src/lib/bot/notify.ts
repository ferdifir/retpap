import {
  listDigestCandidates,
  markDigestSent,
  markNotificationFailed,
  markNotificationSent,
  setNotify,
  takePendingNotifications,
} from "@/db/queries";
import { shareUrlFor } from "@/lib/share";
import { BotApiError, sendMessage } from "./api";
import { digestNotificationBody } from "./format";

export type FlushResult = { sent: number; failed: number; digests: number };

function notificationKeyboard(slug: string) {
  return {
    inline_keyboard: [
      [{ text: "Lihat foto", url: shareUrlFor(slug) }],
      [{ text: "Matikan notif", callback_data: "notif:off" }],
    ],
  };
}

function reasonOf(error: unknown): string {
  if (error instanceof BotApiError) return error.status + ": " + error.description;
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Delivers the outbox and the periodic digests. Safe to call often: every row
 * is marked once, failed rows are retried until they hit the attempt cap, and a
 * blocked bot switches that user's notifications off for good.
 */
export async function flushNotifications(limit = 20): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, digests: 0 };

  const pending = await takePendingNotifications(limit);

  for (const item of pending) {
    try {
      await sendMessage(item.telegramId, item.body, {
        keyboard: notificationKeyboard(item.slug),
      });
      await markNotificationSent(item.id);
      result.sent += 1;
    } catch (error) {
      if (error instanceof BotApiError && error.status === 403) {
        await setNotify(item.userId, false);
        await markNotificationSent(item.id);
      } else {
        await markNotificationFailed(item.id, reasonOf(error));
      }
      result.failed += 1;
    }
  }

  for (const candidate of await listDigestCandidates(5)) {
    try {
      await sendMessage(
        candidate.telegramId,
        digestNotificationBody(candidate),
        { keyboard: notificationKeyboard(candidate.slug) },
      );
      await markDigestSent(candidate.photoId);
      result.digests += 1;
    } catch (error) {
      if (error instanceof BotApiError && error.status === 403) {
        await setNotify(candidate.userId, false);
        await markDigestSent(candidate.photoId);
      }
      result.failed += 1;
    }
  }

  return result;
}
