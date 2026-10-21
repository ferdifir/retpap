import { getTelegramWebApp } from "./telegram";
import type { TelegramUser } from "@/types/telegram";

export type IdentitySource = "telegram" | "anonymous";

export type TelegramIdentity = {
  /** Stable per-user key: `tg:<id>` inside Telegram, `anon:<uuid>` elsewhere. */
  userId: string;
  source: IdentitySource;
  user: TelegramUser | null;
  /**
   * Raw `initData`. Send this to the bot backend and validate it with
   * HMAC-SHA-256 keyed by `HMAC_SHA256(bot_token, "WebAppData")` before
   * trusting the identity for anything that matters.
   */
  initData: string;
  authDate: number | null;
};

const ANONYMOUS_KEY = "pap:identity";

function parseUser(raw: string | null): TelegramUser | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as TelegramUser).id === "number"
    ) {
      return parsed as TelegramUser;
    }
  } catch {
    // Malformed payload: treat as anonymous rather than crashing the app.
  }

  return null;
}

/**
 * Reads the current Telegram user from the raw `initData` string. Parsing the
 * raw string (instead of `initDataUnsafe`) keeps `hash`, `signature` and
 * `auth_date` available for server-side validation later.
 *
 * Returns null when the page runs outside Telegram or without a user.
 */
export function readTelegramIdentity(): TelegramIdentity | null {
  const webApp = getTelegramWebApp();
  if (!webApp?.initData) return null;

  const params = new URLSearchParams(webApp.initData);
  const user = parseUser(params.get("user")) ?? webApp.initDataUnsafe?.user ?? null;
  if (!user) return null;

  const authDate = Number(params.get("auth_date"));

  return {
    userId: `tg:${user.id}`,
    source: "telegram",
    user,
    initData: webApp.initData,
    authDate: Number.isFinite(authDate) ? authDate : null,
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Older Android WebViews ship without randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(ANONYMOUS_KEY);
  } catch {
    return null;
  }
}

/**
 * Device-scoped fallback used in a browser and in previews. This is not an
 * identity: it cannot be verified and disappears with the browser storage, so
 * treat it as a development convenience only.
 */
export function readAnonymousIdentity(): TelegramIdentity {
  let id = readStoredId();

  if (!id) {
    id = createId();
    try {
      window.localStorage.setItem(ANONYMOUS_KEY, id);
    } catch {
      // Storage can be unavailable in private modes; the session id still works.
    }
  }

  return {
    userId: `anon:${id}`,
    source: "anonymous",
    user: null,
    initData: "",
    authDate: null,
  };
}
