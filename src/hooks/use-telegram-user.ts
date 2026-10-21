"use client";

import { useEffect, useState } from "react";
import { TELEGRAM_READY_EVENT } from "@/lib/telegram";
import {
  readAnonymousIdentity,
  readTelegramIdentity,
  type TelegramIdentity,
} from "@/lib/telegram-identity";

/** Grace period for the SDK script before falling back to an anonymous id. */
const FALLBACK_DELAY_MS = 1500;

/**
 * Resolves the current user identity.
 *
 * `initData` is populated synchronously by the SDK, so this resolves on the
 * first effect when the script is already loaded. Otherwise it waits for the
 * SDK's ready event and, if that never arrives, falls back to a device-scoped
 * anonymous id so the UI stays usable outside Telegram.
 *
 * Returns null until the identity is resolved.
 */
export function useTelegramUser(): TelegramIdentity | null {
  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = readTelegramIdentity() ?? readAnonymousIdentity();
      setIdentity((current) => (current?.userId === next.userId ? current : next));
    };

    sync();

    const timer = window.setTimeout(sync, FALLBACK_DELAY_MS);
    window.addEventListener(TELEGRAM_READY_EVENT, sync);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(TELEGRAM_READY_EVENT, sync);
    };
  }, []);

  return identity;
}
