export const MIN_RATING = 1;
export const MAX_RATING = 10;
export const DEFAULT_RATING = 7.5;

/** Pixels of vertical travel that map to a single rating point. */
export const PIXELS_PER_POINT = 20;

export function clampRating(value: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, value));
}

export function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

export function ratingToPercent(value: number): number {
  return ((value - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100;
}

export type RatingTone = {
  fill: string;
  emoji: string;
  label: string;
};

export function getRatingTone(score: number): RatingTone {
  if (score < 5) {
    return {
      fill: "bg-gradient-to-t from-red-600 to-orange-500",
      emoji: "❄️",
      label: "Not for me",
    };
  }

  if (score < 8) {
    return {
      fill: "bg-gradient-to-t from-orange-500 to-amber-400",
      emoji: "🔥",
      label: "Pretty good",
    };
  }

  return {
    fill: "bg-gradient-to-t from-emerald-500 to-green-400",
    emoji: "⚡️",
    label: "Outstanding",
  };
}

export function formatVotes(votes: number): string {
  return `${votes.toLocaleString("en-US")} votes overall`;
}
