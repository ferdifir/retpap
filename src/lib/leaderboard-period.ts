import type { LeaderboardPeriod } from "./feed-types";

/**
 * The leaderboard is built for one audience (WIB), which has no DST. Shifting
 * the timestamp by a fixed offset and reading the UTC fields is therefore the
 * whole time-zone conversion: no Intl parsing, no server TZ dependency.
 */
export const WIB_TIME_ZONE = "Asia/Jakarta";
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Per-period rule: how many ratings a media needs before it ranks. */
export const LEADERBOARD_PERIODS = {
  day: { minVotes: 2, label: "Hari Ini" },
  week: { minVotes: 2, label: "Minggu Ini" },
  month: { minVotes: 3, label: "Bulan Ini" },
  all: { minVotes: 3, label: "All Time" },
} as const satisfies Record<
  LeaderboardPeriod,
  { minVotes: number; label: string }
>;

/** Tab order; all-time stays last so it reads as the default. */
export const LEADERBOARD_PERIOD_ORDER: readonly LeaderboardPeriod[] = [
  "day",
  "week",
  "month",
  "all",
];

/** Unknown or empty values fall back to all-time, never to an error. */
export function parseLeaderboardPeriod(
  value: string | null | undefined,
): LeaderboardPeriod {
  const normalised = value?.trim().toLowerCase();
  if (
    normalised === "day" ||
    normalised === "week" ||
    normalised === "month" ||
    normalised === "all"
  ) {
    return normalised;
  }
  return "all";
}

export type WibParts = {
  year: number;
  /** 0 = January. */
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
};

/** Wall-clock parts in Jakarta for a given instant. */
export function wibParts(now: Date): WibParts {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
  };
}

/** Midnight WIB of the given wall-clock date, as a real instant. */
function wibMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - WIB_OFFSET_MS);
}

export type LeaderboardWindow = {
  start: Date | null;
  end: Date | null;
};

/**
 * Current window for a period. Weeks start on Monday, matching Postgres
 * `date_trunc('week')`. `end` is exclusive and may be in the future: the
 * recap reads the window while the period is still running.
 */
export function leaderboardWindow(
  period: LeaderboardPeriod,
  now: Date = new Date(),
): LeaderboardWindow {
  if (period === "all") return { start: null, end: null };

  const { year, month, day, weekday } = wibParts(now);

  if (period === "day") {
    return {
      start: wibMidnight(year, month, day),
      end: wibMidnight(year, month, day + 1),
    };
  }

  if (period === "week") {
    const sinceMonday = (weekday + 6) % 7;
    return {
      start: wibMidnight(year, month, day - sinceMonday),
      end: wibMidnight(year, month, day - sinceMonday + 7),
    };
  }

  return {
    start: wibMidnight(year, month, 1),
    end: wibMidnight(year, month + 1, 1),
  };
}

/** Hour of day in Jakarta, 0..23. */
export function wibHour(now: Date): number {
  return wibParts(now).hour;
}

/** 0 = Sunday, matching Date#getUTCDay. */
export function wibWeekday(now: Date): number {
  return wibParts(now).weekday;
}

/** True on the last calendar day of the month in Jakarta. */
export function isLastWibDayOfMonth(now: Date): boolean {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  const tomorrow = new Date(shifted.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.getUTCMonth() !== shifted.getUTCMonth();
}
