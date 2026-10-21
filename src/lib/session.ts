import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pap_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = { uid: number; iat: number };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: number, now = Date.now()): string {
  const payload: SessionPayload = { uid: userId, iat: now };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (typeof payload.uid !== "number") return null;
    if (Date.now() - payload.iat > MAX_AGE_SECONDS * 1000) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
