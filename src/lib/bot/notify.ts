import { after } from "next/server";
import {
  markNotificationFailed,
  markNotificationSent,
  setNotify,
  takeNotifications,
} from "@/db/queries";
import { shareUrlFor } from "@/lib/share";
import { BotApiError, sendMessage } from "./api";

export type DeliveryResult = { sent: number; failed: number };

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
 * Delivers the notifications one action produced. Rows are claimed by id, so a
 * retried request cannot send the same message twice; a blocked bot switches
 * that user's notifications off for good.
 */
export async function deliverNotifications(
  ids: number[],
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0 };
  const pending = await takeNotifications(ids);

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

  return result;
}

/**
 * Sends after the response is finished, so the user action never waits on
 * Telegram. A failed send is recorded on the row (attempts + error) instead of
 * blocking the action.
 */
export function deliverAfterResponse(
  ids: Array<number | null | undefined>,
): void {
  const ready = ids.filter((id): id is number => typeof id === "number");
  if (ready.length === 0) return;

  after(async () => {
    try {
      await deliverNotifications(ready);
    } catch (error) {
      console.error("[notify] delivery failed", error);
    }
  });
}
