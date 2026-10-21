import { cookies } from "next/headers";
import { SESSION_COOKIE, readSessionToken } from "./session";

/** Reads the signed session cookie. Returns null when absent or tampered with. */
export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}
