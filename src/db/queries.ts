import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  MAX_REACTIONS_PER_SPOT,
  findSpotAt,
  sortReactionSummary,
  type ReactionSummary,
} from "@/lib/reaction-rules";
import { getDb, type Db } from "./client";
import { comments, photos, ratings, reactions, spots, users } from "./schema";

import type { FeedComment, FeedPhoto, FeedSpot } from "@/lib/feed-types";

export type { FeedPhoto, FeedSpot };

function summarise(
  rows: { emoji: string; id: number; userId: number }[],
  userId: number,
): { reactions: ReactionSummary[]; total: number; myEmoji: string | null } {
  const byEmoji = new Map<string, ReactionSummary>();

  for (const row of rows) {
    const current = byEmoji.get(row.emoji);
    if (current) {
      current.count += 1;
      current.firstId = Math.min(current.firstId, row.id);
    } else {
      byEmoji.set(row.emoji, { emoji: row.emoji, count: 1, firstId: row.id });
    }
  }

  const mine = rows.find((row) => row.userId === userId);

  return {
    reactions: sortReactionSummary([...byEmoji.values()]),
    total: rows.length,
    myEmoji: mine?.emoji ?? null,
  };
}

export async function getFeed(userId: number): Promise<FeedPhoto[]> {
  const { db } = getDb();

  const photoRows = await db
    .select()
    .from(photos)
    .where(eq(photos.isActive, true))
    // Newest upload first: the deck opens on the most recent photo.
    .orderBy(desc(photos.id));

  if (photoRows.length === 0) return [];

  const photoIds = photoRows.map((photo) => photo.id);

  const spotRows = await db
    .select()
    .from(spots)
    .where(inArray(spots.photoId, photoIds))
    .orderBy(spots.id);

  const reactionRows = await db
    .select({
      id: reactions.id,
      photoId: reactions.photoId,
      spotId: reactions.spotId,
      userId: reactions.userId,
      emoji: reactions.emoji,
    })
    .from(reactions)
    .where(inArray(reactions.photoId, photoIds))
    .orderBy(reactions.id);

  const ratingRows = await db
    .select()
    .from(ratings)
    .where(inArray(ratings.photoId, photoIds));

  const commentRows = await db
    .select({ id: comments.id, spotId: comments.spotId })
    .from(comments)
    .where(inArray(comments.photoId, photoIds));

  return photoRows.map((photo) => {
    const photoRatings = ratingRows.filter((row) => row.photoId === photo.id);
    const sum = photoRatings.reduce((total, row) => total + row.score, 0);

    const spots: FeedSpot[] = spotRows
      .filter((spot) => spot.photoId === photo.id)
      .map((spot) => {
        const rows = reactionRows.filter((row) => row.spotId === spot.id);
        const summary = summarise(rows, userId);

        return {
          id: spot.id,
          x: spot.x,
          y: spot.y,
          total: summary.total,
          myEmoji: summary.myEmoji,
          reactions: summary.reactions.map(({ emoji, count }) => ({ emoji, count })),
          comments: commentRows.filter((row) => row.spotId === spot.id).length,
        };
      })
      // A spot with only comments still needs a marker.
      .filter((spot) => spot.total > 0 || spot.comments > 0);

    return {
      id: photo.id,
      slug: photo.slug,
      caption: photo.caption,
      imageUrl: photo.imageUrl,
      imageWidth: photo.imageWidth,
      imageHeight: photo.imageHeight,
      rating: {
        avg: photoRatings.length > 0 ? Math.round((sum / photoRatings.length) * 10) / 10 : 0,
        votes: photoRatings.length,
        mine: photoRatings.find((row) => row.userId === userId)?.score ?? null,
      },
      spots,
    };
  });
}

export async function getSpotSummary(spotId: number, userId: number): Promise<FeedSpot | null> {
  const { db } = getDb();

  const [spot] = await db.select().from(spots).where(eq(spots.id, spotId));
  if (!spot) return null;

  const rows = await db
    .select({ id: reactions.id, emoji: reactions.emoji, userId: reactions.userId })
    .from(reactions)
    .where(eq(reactions.spotId, spotId))
    .orderBy(reactions.id);

  const [{ count: commentCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(eq(comments.spotId, spotId));

  if (rows.length === 0 && commentCount === 0) return null;

  const summary = summarise(rows, userId);

  return {
    id: spot.id,
    x: spot.x,
    y: spot.y,
    total: summary.total,
    myEmoji: summary.myEmoji,
    reactions: summary.reactions.map(({ emoji, count }) => ({ emoji, count })),
    comments: commentCount,
  };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type SpotTarget = { spotId?: number; x?: number; y?: number };

/**
 * Resolves the spot a write should land on: an explicit id, or the nearest
 * spot inside the snap radius, or a brand new one. Shared by reactions and
 * comments so both layers meet at exactly the same points.
 */
async function resolveSpot(
  tx: Tx,
  photo: { id: number; imageWidth: number; imageHeight: number },
  input: SpotTarget,
): Promise<{ ok: true; spotId: number } | { ok: false; reason: "spot_not_found" | "invalid_target" }> {
  if (input.spotId !== undefined) {
    const [spot] = await tx
      .select()
      .from(spots)
      .where(and(eq(spots.id, input.spotId), eq(spots.photoId, photo.id)));
    if (!spot) return { ok: false, reason: "spot_not_found" };
    return { ok: true, spotId: spot.id };
  }

  if (input.x === undefined || input.y === undefined) {
    return { ok: false, reason: "invalid_target" };
  }

  const existing = await tx.select().from(spots).where(eq(spots.photoId, photo.id));
  const snapped = findSpotAt(existing, input.x, input.y, photo.imageHeight / photo.imageWidth);
  if (snapped !== null) return { ok: true, spotId: snapped };

  const [created] = await tx
    .insert(spots)
    .values({ photoId: photo.id, x: input.x, y: input.y })
    .returning({ id: spots.id });

  return { ok: true, spotId: created.id };
}

export type ReactInput = { spotId?: number; x?: number; y?: number; emoji: string };
export type ReactOutcome =
  | { ok: true; spotId: number; removed: boolean }
  | { ok: false; reason: "spot_full" | "spot_not_found" | "invalid_target" };

export async function reactToPhoto(
  photoId: number,
  userId: number,
  input: ReactInput,
): Promise<ReactOutcome> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    // A spot may hold reactions, comments, or both: it only disappears when
    // both layers are empty.
    const deleteSpotIfEmpty = async (id: number) => {
      const [remainingReaction] = await tx
        .select({ id: reactions.id })
        .from(reactions)
        .where(eq(reactions.spotId, id))
        .limit(1);
      if (remainingReaction) return;

      const [remainingComment] = await tx
        .select({ id: comments.id })
        .from(comments)
        .where(eq(comments.spotId, id))
        .limit(1);
      if (remainingComment) return;

      await tx.delete(spots).where(eq(spots.id, id));
    };

    // Serialise reactions for one photo so the capacity check is race-free.
    const [photo] = await tx.select().from(photos).where(eq(photos.id, photoId)).for("update");
    if (!photo) return { ok: false, reason: "invalid_target" } as const;

    const resolved = await resolveSpot(tx, photo, input);
    if (!resolved.ok) return resolved;
    const spotId = resolved.spotId;

    const [mine] = await tx
      .select()
      .from(reactions)
      .where(and(eq(reactions.photoId, photoId), eq(reactions.userId, userId)));

    if (mine && mine.spotId === spotId && mine.emoji === input.emoji) {
      await tx.delete(reactions).where(eq(reactions.id, mine.id));
      await deleteSpotIfEmpty(spotId);
      return { ok: true, spotId, removed: true } as const;
    }

    const occupants = await tx
      .select({ userId: reactions.userId, emoji: reactions.emoji })
      .from(reactions)
      .where(eq(reactions.spotId, spotId));

    // The moving user's own row is replaced, so it must not count against the cap.
    const others = occupants.filter((row) => row.userId !== userId);
    const distinctOthers = new Set(others.map((row) => row.emoji));

    if (!distinctOthers.has(input.emoji) && distinctOthers.size >= MAX_REACTIONS_PER_SPOT) {
      return { ok: false, reason: "spot_full" } as const;
    }

    if (mine) {
      const previousSpotId = mine.spotId;
      await tx
        .update(reactions)
        .set({ spotId, emoji: input.emoji })
        .where(eq(reactions.id, mine.id));
      if (previousSpotId !== spotId) await deleteSpotIfEmpty(previousSpotId);
    } else {
      await tx.insert(reactions).values({ photoId, spotId, userId, emoji: input.emoji });
    }

    return { ok: true, spotId, removed: false } as const;
  });
}


export async function ratePhoto(photoId: number, userId: number, score: number) {
  const { db } = getDb();

  await db
    .insert(ratings)
    .values({ photoId, userId, score })
    .onConflictDoUpdate({
      target: [ratings.photoId, ratings.userId],
      set: { score, updatedAt: new Date() },
    });

  const rows = await db.select({ score: ratings.score }).from(ratings).where(eq(ratings.photoId, photoId));
  const sum = rows.reduce((total, row) => total + row.score, 0);

  return {
    avg: rows.length > 0 ? Math.round((sum / rows.length) * 10) / 10 : 0,
    votes: rows.length,
    mine: score,
  };
}

export async function upsertUser(profile: {
  telegramId: number;
  firstName: string;
  username?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  isPremium?: boolean;
  photoUrl?: string | null;
}) {
  const { db } = getDb();

  const [row] = await db
    .insert(users)
    .values({
      telegramId: profile.telegramId,
      firstName: profile.firstName,
      username: profile.username ?? null,
      lastName: profile.lastName ?? null,
      languageCode: profile.languageCode ?? null,
      isPremium: profile.isPremium ?? false,
      photoUrl: profile.photoUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        firstName: profile.firstName,
        username: profile.username ?? null,
        lastName: profile.lastName ?? null,
        languageCode: profile.languageCode ?? null,
        isPremium: profile.isPremium ?? false,
        photoUrl: profile.photoUrl ?? null,
        lastSeenAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function clearReaction(photoId: number, userId: number): Promise<number | null> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    const [mine] = await tx
      .select()
      .from(reactions)
      .where(and(eq(reactions.photoId, photoId), eq(reactions.userId, userId)));

    if (!mine) return null;

    await tx.delete(reactions).where(eq(reactions.id, mine.id));

    const [remainingReaction] = await tx
      .select({ id: reactions.id })
      .from(reactions)
      .where(eq(reactions.spotId, mine.spotId))
      .limit(1);

    const [remainingComment] = remainingReaction
      ? [null]
      : await tx
          .select({ id: comments.id })
          .from(comments)
          .where(eq(comments.spotId, mine.spotId))
          .limit(1);

    if (!remainingReaction && !remainingComment) {
      await tx.delete(spots).where(eq(spots.id, mine.spotId));
    }

    return mine.spotId;
  });
}

/** Rebuilds every spot of one photo. Used to reconcile after a write. */
export async function getPhotoSpots(photoId: number, userId: number): Promise<FeedSpot[]> {
  const { db } = getDb();

  const spotRows = await db
    .select()
    .from(spots)
    .where(eq(spots.photoId, photoId))
    .orderBy(spots.id);

  if (spotRows.length === 0) return [];

  const rows = await db
    .select({ id: reactions.id, spotId: reactions.spotId, userId: reactions.userId, emoji: reactions.emoji })
    .from(reactions)
    .where(eq(reactions.photoId, photoId))
    .orderBy(reactions.id);

  const commentRows = await db
    .select({ spotId: comments.spotId })
    .from(comments)
    .where(eq(comments.photoId, photoId));

  return spotRows.flatMap((spot) => {
    const atSpot = rows.filter((row) => row.spotId === spot.id);
    const commentCount = commentRows.filter((row) => row.spotId === spot.id).length;
    if (atSpot.length === 0 && commentCount === 0) return [];

    const summary = summarise(atSpot, userId);

    return [
      {
        id: spot.id,
        x: spot.x,
        y: spot.y,
        total: summary.total,
        myEmoji: summary.myEmoji,
        reactions: summary.reactions.map(({ emoji, count }) => ({ emoji, count })),
        comments: commentCount,
      },
    ];
  });
}

export type CommentInput = { spotId?: number; x?: number; y?: number; body: string };
export type CommentOutcome =
  | { ok: true; spotId: number }
  | { ok: false; reason: "spot_not_found" | "invalid_target" };

/** Adds a comment to an existing spot, or to a new one at the given point. */
export async function addComment(
  photoId: number,
  userId: number,
  input: CommentInput,
): Promise<CommentOutcome> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    const [photo] = await tx.select().from(photos).where(eq(photos.id, photoId)).for("update");
    if (!photo) return { ok: false, reason: "invalid_target" } as const;

    const resolved = await resolveSpot(tx, photo, input);
    if (!resolved.ok) return resolved;

    await tx.insert(comments).values({
      photoId,
      spotId: resolved.spotId,
      userId,
      body: input.body,
    });

    return { ok: true, spotId: resolved.spotId } as const;
  });
}

/** Newest first, so the panel can show the latest without a second query. */
export async function getSpotComments(
  photoId: number,
  spotId: number,
  limit = 50,
): Promise<FeedComment[]> {
  const { db } = getDb();

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      firstName: users.firstName,
      username: users.username,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.photoId, photoId), eq(comments.spotId, spotId)))
    .orderBy(desc(comments.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { firstName: row.firstName, username: row.username },
  }));
}
