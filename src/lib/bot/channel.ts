import { getChatMember } from "./api";

const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID?.trim() ?? "";

/** Public link shown in the gate and in bot messages. */
export const CHANNEL_URL = process.env.TELEGRAM_CHANNEL_URL?.trim() || "https://t.me/retpap";

/** Empty id turns the gate off, which keeps local development usable. */
export function channelConfigured(): boolean {
  return CHANNEL_ID.length > 0;
}

export function channelId(): string {
  if (!CHANNEL_ID) throw new Error("TELEGRAM_CHANNEL_ID is not set");
  return CHANNEL_ID;
}

export function ownerTelegramId(): number | null {
  const raw = process.env.OWNER_TELEGRAM_ID?.trim();
  if (!raw) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

/**
 * Live check of one user's subscription. A failed call passes the user through:
 * a Telegram blip must never lock everybody out of the app.
 */
export async function isChannelMember(telegramId: number): Promise<boolean> {
  if (!channelConfigured()) return true;

  try {
    const member = await getChatMember(channelId(), telegramId);
    if (member.status === "restricted") return member.is_member === true;
    return MEMBER_STATUSES.has(member.status);
  } catch {
    return true;
  }
}
