import type { LeaderboardPeriod } from "./feed-types";
import { getTelegramWebApp } from "./telegram";

/** Query parameter accepted outside Telegram, and in dev. */
export const SHARE_PHOTO_PARAM = "photo";

/** Start parameter that opens the leaderboard instead of a photo. */
export const LEADERBOARD_START_PARAM = "leaderboard";

/** Start parameter that opens the owner-only analytics page. */
export const STATS_START_PARAM = "stats";

/** Per-period `startapp` values, so each recap can link to its own tab. */
const LEADERBOARD_START_PARAMS: Record<LeaderboardPeriod, string> = {
  all: LEADERBOARD_START_PARAM,
  day: "leaderboard_hari",
  week: "leaderboard_minggu",
  month: "leaderboard_bulan",
};

const PERIOD_BY_START_PARAM = new Map(
  Object.entries(LEADERBOARD_START_PARAMS).map(([period, param]) => [
    param,
    period as LeaderboardPeriod,
  ]),
);

/** Telegram `startapp` parameter read as a route or a photo slug. */
export type StartTarget =
  | { type: "leaderboard"; period: LeaderboardPeriod }
  | { type: "stats" }
  | { type: "photo"; slug: string };

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "menfesaibot";

/** Deep link that opens the bot chat with a Start button. */
export function botStartUrl(): string {
  return "https://t.me/" + BOT_USERNAME + "?start=app";
}

/** Deep link that opens the bot chat and jumps straight into /upload. */
export function uploadUrl(): string {
  return "https://t.me/" + BOT_USERNAME + "?start=upload";
}

/** Deep link that opens the Mini App straight on a leaderboard tab. */
export function leaderboardUrl(period: LeaderboardPeriod = "all"): string {
  return (
    "https://t.me/" +
    BOT_USERNAME +
    "?startapp=" +
    LEADERBOARD_START_PARAMS[period]
  );
}

/** In-app path for one leaderboard tab; all-time keeps the bare URL. */
export function leaderboardPath(period: LeaderboardPeriod): string {
  return period === "all" ? "/leaderboard" : "/leaderboard?period=" + period;
}

/** Deep link that opens the Mini App straight on the owner analytics page. */
export function statsUrl(): string {
  return "https://t.me/" + BOT_USERNAME + "?startapp=" + STATS_START_PARAM;
}

/** Deep link that opens the Mini App on one photo. */
export function shareUrlFor(slug: string): string {
  return (
    "https://t.me/" + BOT_USERNAME + "?startapp=" + encodeURIComponent(slug)
  );
}

/** Telegram share sheet prefilled with the deep link and a short blurb. */
export function telegramShareLink(slug: string, caption: string): string {
  const text = caption
    ? caption + " — rating di RetPAP"
    : "Rating foto ini di RetPAP";
  return (
    "https://t.me/share/url?url=" +
    encodeURIComponent(shareUrlFor(slug)) +
    "&text=" +
    encodeURIComponent(text)
  );
}

/**
 * What the Telegram `startapp` parameter asks for. The leaderboard values are
 * reserved as routes, so any other value keeps working as a photo slug.
 */
export function readStartTarget(): StartTarget | null {
  if (typeof window === "undefined") return null;

  const startParam = getTelegramWebApp()?.initDataUnsafe?.start_param?.trim();
  if (!startParam) return null;

  const lower = startParam.toLowerCase();
  if (lower === STATS_START_PARAM) return { type: "stats" };

  const period = PERIOD_BY_START_PARAM.get(lower);
  if (period) return { type: "leaderboard", period };
  return { type: "photo", slug: startParam };
}

/**
 * Slug to pin first: an explicit `?photo=` navigation wins, otherwise the
 * Telegram `startapp` parameter. Only used to pick the first card, never to
 * filter the feed.
 */
export function readSharedSlug(): string | null {
  if (typeof window === "undefined") return null;

  // An explicit ?photo= is an in-app navigation (for example from the
  // leaderboard), so it must win over a start_param left over from the
  // original Telegram launch.
  const fromQuery = new URLSearchParams(window.location.search)
    .get(SHARE_PHOTO_PARAM)
    ?.trim();
  if (fromQuery) return fromQuery;

  const target = readStartTarget();
  return target?.type === "photo" ? target.slug : null;
}

/**
 * Set once the launch target has been routed. In memory on purpose: a reload
 * starts a new app session, where the current URL decides what to show.
 */
let startTargetHandled = false;

/** Stops later boots from routing the same launch target again. */
export function markStartTargetHandled(): void {
  startTargetHandled = true;
}

/**
 * Leaderboard tab a `startapp` launch still has to open, or null once the
 * launch target has been handled or if it does not point at the leaderboard.
 */
export function pendingLeaderboardPeriod(): LeaderboardPeriod | null {
  if (startTargetHandled) return null;
  const target = readStartTarget();
  return target?.type === "leaderboard" ? target.period : null;
}

/**
 * True while a `startapp=leaderboard*` launch still has to be routed. Once it
 * is handled, backing out of the leaderboard stays on the feed instead of
 * bouncing straight back into it.
 */
export function shouldOpenLeaderboard(): boolean {
  return pendingLeaderboardPeriod() !== null;
}

/**
 * Puts the shared photo first and drops it from its original position, so the
 * deck continues in normal order without showing that photo twice.
 */
export function orderForSharedPhoto<T extends { slug: string }>(
  photos: T[],
  slug: string | null,
): T[] {
  if (!slug) return photos;

  const index = photos.findIndex((photo) => photo.slug === slug);
  if (index <= 0) return photos;

  return [photos[index], ...photos.slice(0, index), ...photos.slice(index + 1)];
}
