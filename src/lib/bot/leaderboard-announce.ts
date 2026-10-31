import {
  claimLeaderboardAnnouncement,
  createMonthlyReward,
  getLeaderboard,
  getPhotoUploader,
  getUserTelegramId,
  markLeaderboardAnnouncementFailed,
  markLeaderboardAnnouncementSent,
  type LeaderboardAnnouncementKind,
} from "@/db/queries";
import type { LeaderboardPeriod, LeaderboardResult } from "@/lib/feed-types";
import {
  isMonthlyAnnounceDay,
  leaderboardWindow,
  WIB_TIME_ZONE,
  wibHour,
  wibParts,
  wibWeekday,
} from "@/lib/leaderboard-period";
import { leaderboardUrl, rewardUrl } from "@/lib/share";
import { BotApiError, sendMessage, sendPhotoFile } from "./api";
import { renderPodiumImage } from "./leaderboard-image";
import { channelConfigured, channelId, ownerTelegramId } from "./channel";
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
  if (isMonthlyAnnounceDay(now)) kinds.push("monthly");
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

const DEADLINE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: WIB_TIME_ZONE,
});

/**
 * Monthly posts explain the prize and how the number was produced. The amount
 * is computed from the same entry that freezeMonthlyReward() stores, so the
 * channel and the claim can never disagree.
 */
function rewardLines(result: LeaderboardResult): string[] {
  const winner = result.entries[0];
  if (!winner || !result.end) return [];

  const amount = Math.round(winner.avg * winner.votes);
  const raw = (winner.avg * winner.votes).toFixed(1);
  // period_end is exclusive (next month 00:00), so the deadline is a minute before.
  const deadline = new Date(new Date(result.end).getTime() - 60_000);

  return [
    "🎁 <b>Hadiah: " + amount + " Stars</b>",
    "Rata-rata rating × jumlah rating = " + winner.avg.toFixed(1) + " × " + winner.votes + " = " + raw + " → dibulatkan " + amount,
    "Klaim dengan cara kirim /reward ke bot sebelum " +
      DEADLINE.format(deadline) +
      " WIB.",
  ];
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
    ...(kind === "monthly" ? ["", ...rewardLines(result)] : []),
    "",
    "Lihat peringkat lengkap dan periode lainnya 👇",
  ].join("\n");
}

function announcementKeyboard(kind: LeaderboardAnnouncementKind) {
  const rows = [
    [
      {
        text: "🏆 Lihat Leaderboard",
        url: leaderboardUrl(KIND_META[kind].period),
      },
    ],
  ];

  // Monthly posts carry a prize, so the claim gets its own button.
  if (kind === "monthly") {
    rows.push([{ text: "🎁 Klaim hadiah", url: rewardUrl() }]);
  }

  return { inline_keyboard: rows };
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

  // The monthly recap is the important one, so it goes first and the shorter
  // recaps of that same day are dropped: two posts in the same minute would
  // bury it. Only a monthly recap that actually went out (or was already sent
  // earlier today) suppresses the rest; an empty or failed one does not.
  if (kinds.includes("monthly")) {
    const monthly = await announceOne("monthly", now);
    announcements.push(monthly);

    if (monthly.sent || monthly.skipped === "already-sent") {
      return { announcements };
    }
  }

  for (const kind of kinds) {
    if (kind === "monthly") continue;
    announcements.push(await announceOne(kind, now));
  }

  return { announcements };
}

/**
 * Stores the monthly winner plus a per-voter copy of its ratings. Seeded
 * content has no uploader, so the owner is the one who can claim it.
 */
async function freezeMonthlyReward(
  result: LeaderboardResult,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  const winner = result.entries[0];
  if (!winner) return;

  const uploaderId = await getPhotoUploader(winner.id);
  const uploaderTelegramId =
    uploaderId === null ? null : await getUserTelegramId(uploaderId);
  const recipient = uploaderTelegramId ?? ownerTelegramId();
  if (recipient === null) return;

  await createMonthlyReward({
    periodStart,
    periodEnd,
    decidedAt: new Date(),
    photoId: winner.id,
    userId: uploaderId,
    telegramId: recipient,
    avgScore: winner.avg,
    votes: winner.votes,
    amount: Math.round(winner.avg * winner.votes),
  });
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
    const text = leaderboardAnnouncementText(kind, result);
    const keyboard = announcementKeyboard(kind);
    const subtitle = periodDateLine(kind, result);

    // The podium picture is a bonus: a failed render must not stop the recap.
    const image = await renderPodiumImage(
      result,
      "TOP PAP " + KIND_META[kind].label,
      subtitle,
    ).catch((error) => {
      console.error("[leaderboard] podium render failed", error);
      return null;
    });

    let message;
    if (image) {
      // Photo captions cap at 1024 characters; longer text goes as its own
      // message so the channel still gets the full explanation.
      message =
        text.length <= 1024
          ? await sendPhotoFile(channelId(), image, { caption: text, keyboard })
          : await sendPhotoFile(channelId(), image);

      if (text.length > 1024) {
        await sendMessage(channelId(), text, { keyboard });
      }
    } else {
      message = await sendMessage(channelId(), text, { keyboard });
    }

    await markLeaderboardAnnouncementSent(claim.id, message.message_id);

    // The recap is live, so the standings are final for this period: freeze the
    // winner before anything can change the ratings behind it.
    if (kind === "monthly") {
      await freezeMonthlyReward(result, window.start, window.end).catch((error) => {
        console.error("[reward] freeze failed", error);
      });
    }

    return { kind, periodStart, sent: true, messageId: message.message_id };
  } catch (error) {
    const reason = reasonOf(error);
    await markLeaderboardAnnouncementFailed(claim.id, reason);
    return { kind, periodStart, sent: false, error: reason };
  }
}
