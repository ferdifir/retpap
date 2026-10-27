export type FeedSpot = {
  id: number;
  /** 0..1 relative to the rendered image box. */
  x: number;
  y: number;
  total: number;
  myEmoji: string | null;
  /** Sorted by count desc, ties by insertion order. */
  reactions: { emoji: string; count: number }[];
  /** Number of comments pinned to this spot. */
  comments: number;
};

export type FeedComment = {
  id: number;
  body: string;
  createdAt: string;
  /** Written by the signed-in user: the one comment they own on this photo. */
  mine: boolean;
  author: { firstName: string; username: string | null };
};

export type FeedMediaType = "photo" | "video";

export type FeedPhoto = {
  id: number;
  /** Stable public identifier, used by share links. */
  slug: string;
  caption: string;
  mediaType: FeedMediaType;
  /** jpg for photos, mp4 for videos. */
  imageUrl: string;
  /** Video still frame; null for photos. */
  posterUrl: string | null;
  /** Length in seconds; null for photos. */
  durationSeconds: number | null;
  imageWidth: number;
  imageHeight: number;
  /** Marked 18+; the feed keeps it blurred until revealed. */
  isNsfw: boolean;
  /** Content gender; null for uploads made before the question existed. */
  gender: "female" | "male" | null;
  rating: { avg: number; votes: number; mine: number | null };
  spots: FeedSpot[];
};

/** One ranked row on the all-time leaderboard. */
export type LeaderboardEntry = {
  id: number;
  slug: string;
  caption: string;
  mediaType: FeedMediaType;
  imageUrl: string;
  posterUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  /** Rounded to one decimal for display. */
  avg: number;
  votes: number;
};

/** Window a leaderboard covers: day, week, month, or everything. */
export type LeaderboardPeriod = "day" | "week" | "month" | "all";

export type LeaderboardResult = {
  period: LeaderboardPeriod;
  /** Ratings needed before a media may appear on this leaderboard. */
  minVotes: number;
  /** ISO start of the window; null for all-time. */
  start: string | null;
  /** ISO end of the window; null for all-time. */
  end: string | null;
  entries: LeaderboardEntry[];
};
