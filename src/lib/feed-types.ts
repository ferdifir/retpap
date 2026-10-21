export type FeedSpot = {
  id: number;
  /** 0..1 relative to the rendered image box. */
  x: number;
  y: number;
  total: number;
  myEmoji: string | null;
  /** Sorted by count desc, ties by insertion order. */
  reactions: { emoji: string; count: number }[];
};

export type FeedPhoto = {
  id: number;
  /** Stable public identifier, used by share links. */
  slug: string;
  caption: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  rating: { avg: number; votes: number; mine: number | null };
  spots: FeedSpot[];
};

export type FeedUser = {
  id: number;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
};
