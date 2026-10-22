import { getTelegramWebApp } from "./telegram";

/** Query parameter accepted outside Telegram, and in dev. */
export const SHARE_PHOTO_PARAM = "photo";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "menfesaibot";

/** Deep link that opens the bot chat with a Start button. */
export function botStartUrl(): string {
  return "https://t.me/" + BOT_USERNAME + "?start=app";
}

/** Deep link that opens the Mini App on one photo. */
export function shareUrlFor(slug: string): string {
  return "https://t.me/" + BOT_USERNAME + "?startapp=" + encodeURIComponent(slug);
}

/** Telegram share sheet prefilled with the deep link and a short blurb. */
export function telegramShareLink(slug: string, caption: string): string {
  const text = caption ? caption + " — nilai di RetPAP" : "Nilai foto ini di RetPAP";
  return (
    "https://t.me/share/url?url=" +
    encodeURIComponent(shareUrlFor(slug)) +
    "&text=" +
    encodeURIComponent(text)
  );
}

/**
 * Slug the app was opened with: `startapp` inside Telegram, `?photo=` in a
 * browser. Only used to pick the first card, never to filter the feed.
 */
export function readSharedSlug(): string | null {
  if (typeof window === "undefined") return null;

  const startParam = getTelegramWebApp()?.initDataUnsafe?.start_param?.trim();
  if (startParam) return startParam;

  const fromQuery = new URLSearchParams(window.location.search).get(SHARE_PHOTO_PARAM)?.trim();
  return fromQuery ? fromQuery : null;
}

/**
 * Puts the shared photo first and drops it from its original position, so the
 * deck continues in normal order without showing that photo twice.
 */
export function orderForSharedPhoto<T extends { slug: string }>(photos: T[], slug: string | null): T[] {
  if (!slug) return photos;

  const index = photos.findIndex((photo) => photo.slug === slug);
  if (index <= 0) return photos;

  return [photos[index], ...photos.slice(0, index), ...photos.slice(index + 1)];
}
