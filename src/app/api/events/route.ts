import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { events, photos } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth-server";
import { EVENT_NAMES } from "@/lib/analytics/events";

const bodySchema = z.object({
  sessionId: z.string().min(8).max(64),
  events: z
    .array(
      z.object({
        name: z.enum(EVENT_NAMES),
        photoId: z.number().int().positive().optional(),
        meta: z
          .record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean(), z.null()]),
          )
          .optional(),
      }),
    )
    .min(1)
    .max(20),
});

const MAX_EVENTS_PER_MINUTE = 120;
const WINDOW_MS = 60_000;

/**
 * In-memory budget per user. pm2 runs a single fork, so a Map is enough; a
 * reload resets the counters and costs at most a few extra rows.
 */
const budgets = new Map<number, { count: number; resetAt: number }>();

function overBudget(userId: number): boolean {
  const now = Date.now();
  const current = budgets.get(userId);
  if (!current || current.resetAt <= now) {
    budgets.set(userId, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > MAX_EVENTS_PER_MINUTE;
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (userId === null) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  // Analytics must never surface an error to the app: report success and drop.
  if (overBudget(userId)) {
    return Response.json({ ok: true, dropped: parsed.data.events.length });
  }

  const { db } = getDb();

  // Drop unknown photo ids instead of failing the whole batch.
  const wanted = Array.from(
    new Set(
      parsed.data.events
        .map((event) => event.photoId)
        .filter((id): id is number => id !== undefined),
    ),
  );
  const known = new Set<number>();
  if (wanted.length > 0) {
    const rows = await db
      .select({ id: photos.id })
      .from(photos)
      .where(inArray(photos.id, wanted));
    for (const row of rows) known.add(row.id);
  }

  const values = parsed.data.events.map((event) => ({
    name: event.name,
    userId,
    photoId:
      event.photoId !== undefined && known.has(event.photoId)
        ? event.photoId
        : null,
    sessionId: parsed.data.sessionId,
    meta: event.meta ?? {},
  }));

  try {
    await db.insert(events).values(values);
  } catch (error) {
    console.error("[analytics] batch insert failed", error);
  }

  return Response.json({ ok: true });
}
