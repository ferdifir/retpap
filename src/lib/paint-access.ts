import { ownerTelegramId } from "./bot/channel";

/**
 * Staged rollout switch. The value is either a comma-separated list of
 * Telegram ids, or "*" for everyone.
 *
 * Unset means nobody but the owner, so a forgotten variable cannot leak the
 * feature to every user. That default is why opening the feature up has to be
 * an explicit change on the server, not a missing line.
 */
function allows(raw: string | undefined, telegramId: number): boolean {
  const value = raw?.trim();
  if (!value) return false;
  if (value === "*") return true;

  return value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .includes(telegramId);
}

export function paintAccessEnabled(telegramId: number | null): boolean {
  if (telegramId === null) return false;

  const owner = ownerTelegramId();
  if (owner !== null && owner === telegramId) return true;

  return allows(process.env.PAINT_TELEGRAM_IDS, telegramId);
}

/**
 * Who may put a drawing into the feed carousel. Separate from the drawing
 * tool, so publishing can be opened later than drawing itself.
 */
export function feedShareEnabled(telegramId: number | null): boolean {
  if (telegramId === null) return false;

  const owner = ownerTelegramId();
  if (owner !== null && owner === telegramId) return true;

  return allows(process.env.DRAW_FEED_SHARE_IDS, telegramId);
}
