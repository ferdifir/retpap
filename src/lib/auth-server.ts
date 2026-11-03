import { cookies } from "next/headers";
import { after } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "./session";
import { processDueScheduledPost } from "@/lib/bot/scheduled-posts";

/** Reads the signed session cookie. Returns null when absent or tampered with. */
export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  const userId = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (userId !== null) after(() => processDueScheduledPost());
  return userId;
}
