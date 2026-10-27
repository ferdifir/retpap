import {
  claimLeaderboardAnnouncement,
  getLeaderboard,
  markLeaderboardAnnouncementFailed,
  markLeaderboardAnnouncementSent,
  type LeaderboardAnnouncementKind,
} from "@/db/queries";
import type { LeaderboardPeriod, LeaderboardResult } from "@/lib/feed-types";
import {
  isLastWibDayOfMonth,
  leaderboardWindow,
  WIB_TIME_ZONE,
  wibHour,
  wibParts,
  wibWeekday,
} from "@/lib/leaderboard-period";
import { leaderboardUrl } from "@/lib/share";
import { BotApiError, sendMessage } from "./api";
import { channelConfigured, channelId } from "./channel";
import { escapeHtml } from "./format";

const MAX_ATTEMPTS = 5;
const DEFAULT_ANNOUNCE_HOUR = 21;
const DEFAULT_CAPTION_MAX = 60;

const KIND_META = {
  daily: { period: "day", label: "Hari Ini" },
  weekly: { period: "week", label: "Minggu Ini" },
  monthly: { period: "month", label: "Bulan Ini" },
} as const satisfies Record<
  LeaderboardAnnouncementKind,
  { period: LeaderboardPeriod; label: string }
>;

const MEDALS = ["🥇", "🥈", "🥉"];

const FULL_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: WIB_TIME_ZONE,
});

const MONTH_YEAR = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: WIB_TIME_ZONE,
});

function announceHour(): number {
  const raw = Number(process.env.LEADERBOARD_ANNOUNCE_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23
    ? raw
    : DEFAULT_ANNOUNCE_HOUR;
}

function captionMax(): number {
  const raw = Number(process.env.LEADERBOARD_CAPTION_MAX);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_CAPTION_MAX;
}

function isDryRun(): boolean {
  const raw = process.env.LEADERBOARD_ANNOUNCE_DRY_RUN?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/**
 * Recaps are only due inside the 21:00–23:59 WIB window. A period whose window
 * was missed (server down) is deliberately not caught up later.
 */
export function dueAnnouncementKinds(
  now: Date = new Date(),
): LeaderboardAnnouncementKind[] {
  if (wibHour(now) < announceHour()) return [];

  const kinds: LeaderboardAnnouncementKind[] = ["daily"];
  if (wibWeekday(now) === 0) kinds.push("weekly");
  if (isLastWibDayOfMonth(now)) kinds.push("monthly");
  return kinds;
}

/** Truncates by code point so emoji never get cut in half. */
function truncateCaption(caption: string, max: number): string {
  // One caption line per entry: a newline would break the channel list.
  const chars = Array.from(
    caption.trim().replace(/\s+/g, " ") || "Tanpa caption",
  );
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("") + "…";
}

function periodDateLine(
  kind: LeaderboardAnnouncementKind,
  result: LeaderboardResult,
): string {
  if (!result.start || !result.end) return "";

  const start = new Date(result.start);
  if (kind === "daily") return FULL_DATE.format(start);
  if (kind === "monthly") return MONTH_YEAR.format(start);

  // Weekly: the end is the next Monday at 00:00, so the last day is -1 day.
  const end = new Date(new Date(result.end).getTime() - 24 * 60 * 60 * 1000);
  const from = wibParts(start);
  const to = wibParts(end);

  if (from.year === to.year && from.month === to.month) {
    return from.day + "–" + to.day + " " + MONTH_YEAR.format(start);
  }

  return FULL_DATE.format(start) + " – " + FULL_DATE.format(end);
}

/** Text of the channel post, including the period date and the qualifiers. */
export function leaderboardAnnouncementText(
  kind: LeaderboardAnnouncementKind,
  result: LeaderboardResult,
): string {
  const meta = KIND_META[kind];
  const max = captionMax();

  const rows = result.entries.map((entry, index) => {
    const rank = MEDALS[index] ?? String(index + 1) + ".";
    return (
      rank +
      " <b>" +
      escapeHtml(truncateCaption(entry.caption, max)) +
      "</b> — " +
      entry.avg.toFixed(1) +
      "/10 · " +
      entry.votes +
      " rating"
    );
  });

  return [
    "🏆 <b>Top PAP " + meta.label + "</b>",
    [periodDateLine(kind, result), "minimal " + result.minVotes + " rating"]
      .filter(Boolean)
      .join(" · "),
    "",
    ...rows,
    "",
    "Lihat peringkat lengkap dan periode lainnya 👇",
  ].join("\n");
}

function announcementKeyboard(kind: LeaderboardAnnouncementKind) {
  return {
    inline_keyboard: [
      [
        {
          text: "🏆 Lihat Leaderboard",
          url: leaderboardUrl(KIND_META[kind].period),
        },
      ],
    ],
  };
}

function reasonOf(error: unknown): string {
  if (error instanceof BotApiError)
    return error.status + ": " + error.description;
  return error instanceof Error ? error.message : "unknown error";
}

export type LeaderboardAnnouncementOutcome = {
  kind: LeaderboardAnnouncementKind;
  periodStart: string;
  sent: boolean;
  skipped?: "already-sent" | "attempts-exhausted" | "empty";
  messageId?: number;
  /** Filled in dry-run mode instead of sending. */
  preview?: string;
  error?: string;
};

export type LeaderboardAnnouncementSummary = {
  announcements: LeaderboardAnnouncementOutcome[];
};

/**
 * Sends the recap for every period that is due right now. Called by the
 * minute cron; null means there was nothing to do (no channel, or outside the
 * window), so the cron response stays small.
 */
export async function maybeAnnounceLeaderboards(
  now: Date = new Date(),
): Promise<LeaderboardAnnouncementSummary | null> {
  if (!channelConfigured()) return null;

  const kinds = dueAnnouncementKinds(now);
  if (kinds.length === 0) return null;

  const announcements: LeaderboardAnnouncementOutcome[] = [];
  for (const kind of kinds) {
    announcements.push(await announceOne(kind, now));
  }

  return { announcements };
}

async function announceOne(
  kind: LeaderboardAnnouncementKind,
  now: Date,
): Promise<LeaderboardAnnouncementOutcome> {
  const period = KIND_META[kind].period;
  const window = leaderboardWindow(period, now);
  if (!window.start || !window.end) throw new Error("period window is missing");

  const result = await getLeaderboard(period, 3, now);
  const periodStart = window.start.toISOString();

  if (isDryRun()) {
    const preview =
      result.entries.length === 0
        ? "(kosong, akan di-skip)"
        : leaderboardAnnouncementText(kind, result);
    console.info("[leaderboard-announce] dry run " + kind, preview);
    return { kind, periodStart, sent: false, preview };
  }

  // The unique (kind, period_start) row is the idempotency gate. Getting an
  // existing row back means a previous attempt failed and may be retried.
  const claim = await claimLeaderboardAnnouncement({
    kind,
    periodStart: window.start,
    periodEnd: window.end,
  });

  if (claim.sentAt)
    return { kind, periodStart, sent: false, skipped: "already-sent" };
  if (claim.attempts >= MAX_ATTEMPTS) {
    return { kind, periodStart, sent: false, skipped: "attempts-exhausted" };
  }

  // No qualifiers: mark it handled so the cron stops looking at this period.
  if (result.entries.length === 0) {
    await markLeaderboardAnnouncementSent(claim.id, null);
    return { kind, periodStart, sent: false, skipped: "empty" };
  }

  try {
    const message = await sendMessage(
      channelId(),
      leaderboardAnnouncementText(kind, result),
      {
        keyboard: announcementKeyboard(kind),
      },
    );
    await markLeaderboardAnnouncementSent(claim.id, message.message_id);
    return { kind, periodStart, sent: true, messageId: message.message_id };
  } catch (error) {
    const reason = reasonOf(error);
    await markLeaderboardAnnouncementFailed(claim.id, reason);
    return { kind, periodStart, sent: false, error: reason };
  }
}
