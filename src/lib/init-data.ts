import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUser } from "@/types/telegram";

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: "missing_hash" | "bad_hash" | "bad_auth_date" | "expired" | "missing_user" };

const MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Verifies Telegram initData exactly as documented in
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret = HMAC_SHA256(key: "WebAppData", message: bot_token)
 * hash   = HMAC_SHA256(key: secret, message: data_check_string)
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): InitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };

  // Only "hash" is excluded from the signed payload. "signature" (Ed25519,
  // added by newer clients for third-party validation) IS part of the
  // data-check-string — dropping it makes every hash mismatch.
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest();

  let received: Buffer;
  try {
    received = Buffer.from(hash, "hex");
  } catch {
    return { ok: false, reason: "bad_hash" };
  }

  if (received.length !== computed.length || !timingSafeEqual(received, computed)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return { ok: false, reason: "bad_auth_date" };
  if (nowSeconds - authDate > MAX_AGE_SECONDS) return { ok: false, reason: "expired" };

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "missing_user" };

  try {
    const user = JSON.parse(rawUser) as TelegramUser;
    if (typeof user?.id !== "number") return { ok: false, reason: "missing_user" };
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, reason: "missing_user" };
  }
}

/** Builds a signed initData string. Used by tests and local scripts only. */
export function signInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
