import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, users } from "@/db/schema";
import type { AnalyticsEvent } from "./events";

/**
 * Server-side write for events the bot produces. Analytics must never break
 * the caller, so every failure is logged and swallowed.
 */
export async function recordEvent(
  input: AnalyticsEvent & { telegramId?: number; userId?: number | null },
): Promise<void> {
  try {
    const { db } = getDb();

    let userId = input.userId ?? null;
    if (userId === null && input.telegramId !== undefined) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.telegramId, input.telegramId))
        .limit(1);
      userId = row?.id ?? null;
    }

    await db.insert(events).values({
      name: input.name,
      userId,
      photoId: input.photoId ?? null,
      // Bot events have no browser session; one id per chat keeps funnels
      // countable without inventing a second identifier.
      sessionId:
        input.telegramId !== undefined ? "bot:" + input.telegramId : "server",
      meta: input.meta ?? {},
    });
  } catch (error) {
    console.error("[analytics] record failed", error);
  }
}
