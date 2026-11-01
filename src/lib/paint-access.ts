import { ownerTelegramId } from "./bot/channel";

/**
 * Staged rollout for the drawing tool. Only these Telegram ids get the paint
 * tab; the owner is always included so the feature can be tried before it is
 * opened up.
 *
 * PAINT_TELEGRAM_IDS is a comma-separated list of Telegram user ids.
 * Unset means nobody but the owner, so a forgotten variable cannot leak the
 * feature to every user.
 */
function allowList(): number[] {
  const raw = process.env.PAINT_TELEGRAM_IDS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

export function paintAccessEnabled(telegramId: number | null): boolean {
  if (telegramId === null) return false;

  const owner = ownerTelegramId();
  if (owner !== null && owner === telegramId) return true;

  return allowList().includes(telegramId);
}
