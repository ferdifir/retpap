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

/**
 * Ten-level crystal from docs/rating-icons-spec.md. The bands line up with
 * whole numbers (1.0-1.4 → 1, 1.5-2.4 → 2, …), so rounding is the mapping.
 */
export const RATING_LEVEL_NAMES = [
  "Frost",
  "Ice",
  "Thaw",
  "Ember",
  "Spark",
  "Flame",
  "Blaze",
  "Bolt",
  "Overcharge",
  "Supernova",
] as const;

export function ratingLevel(score: number): number {
  return Math.min(10, Math.max(1, Math.round(score)));
}

export type RatingTone = {
  fill: string;
  label: string;
};

export function getRatingTone(score: number): RatingTone {
  if (score < 5) {
    return {
      fill: "bg-gradient-to-t from-red-600 to-orange-500",
      label: "Kurang",
    };
  }

  if (score < 8) {
    return {
      fill: "bg-gradient-to-t from-orange-500 to-amber-400",
      label: "Lumayan",
    };
  }

  return {
    fill: "bg-gradient-to-t from-emerald-500 to-green-400",
    label: "Luar biasa",
  };
}

export function formatVotes(votes: number): string {
  return `${votes.toLocaleString("id-ID")} rating`;
}
