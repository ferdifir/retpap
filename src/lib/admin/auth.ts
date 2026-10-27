import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isOwner } from "@/lib/analytics/queries";
import { getSessionUserId } from "@/lib/auth-server";

export type AdminActor = { userId: number; telegramId: number };

/**
 * Gate for every /api/admin route. Fails closed: no session, no owner env, or
 * an unknown user all return null. The telegram id is what the audit log keeps.
 */
export async function requireAdmin(): Promise<AdminActor | null> {
  const userId = await getSessionUserId();
  if (userId === null) return null;
  if (!(await isOwner(userId))) return null;

  const { db } = getDb();
  const [row] = await db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(eq(users.id, userId));

  return row ? { userId, telegramId: row.telegramId } : null;
}

export function forbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}
