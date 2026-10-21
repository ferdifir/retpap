import { and, desc, eq, inArray } from "drizzle-orm";
import {
  MAX_REACTIONS_PER_SPOT,
  findSpotAt,
  sortReactionSummary,
  type ReactionSummary,
} from "@/lib/reaction-rules";
import { getDb } from "./client";
import { photos, ratings, reactionSpots, reactions, users } from "./schema";

import type { FeedPhoto, FeedSpot } from "@/lib/feed-types";

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
    .from(reactionSpots)
    .where(inArray(reactionSpots.photoId, photoIds))
    .orderBy(reactionSpots.id);

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
        };
      })
      .filter((spot) => spot.total > 0);

    return {
      id: photo.id,
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

  const [spot] = await db.select().from(reactionSpots).where(eq(reactionSpots.id, spotId));
  if (!spot) return null;

  const rows = await db
    .select({ id: reactions.id, emoji: reactions.emoji, userId: reactions.userId })
    .from(reactions)
    .where(eq(reactions.spotId, spotId))
    .orderBy(reactions.id);

  if (rows.length === 0) return null;

  const summary = summarise(rows, userId);

  return {
    id: spot.id,
    x: spot.x,
    y: spot.y,
    total: summary.total,
    myEmoji: summary.myEmoji,
    reactions: summary.reactions.map(({ emoji, count }) => ({ emoji, count })),
  };
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
    const deleteSpotIfEmpty = async (id: number) => {
      const remaining = await tx
        .select({ id: reactions.id })
        .from(reactions)
        .where(eq(reactions.spotId, id))
        .limit(1);

      if (remaining.length === 0) {
        await tx.delete(reactionSpots).where(eq(reactionSpots.id, id));
      }
    };

    // Serialise reactions for one photo so the capacity check is race-free.
    const [photo] = await tx.select().from(photos).where(eq(photos.id, photoId)).for("update");
    if (!photo) return { ok: false, reason: "invalid_target" } as const;

    let spotId = input.spotId;

    if (spotId !== undefined) {
      const [spot] = await tx
        .select()
        .from(reactionSpots)
        .where(and(eq(reactionSpots.id, spotId), eq(reactionSpots.photoId, photoId)));
      if (!spot) return { ok: false, reason: "spot_not_found" } as const;
    } else {
      if (input.x === undefined || input.y === undefined) {
        return { ok: false, reason: "invalid_target" } as const;
      }

      const spots = await tx
        .select()
        .from(reactionSpots)
        .where(eq(reactionSpots.photoId, photoId));

      const snapped = findSpotAt(
        spots,
        input.x,
        input.y,
        photo.imageHeight / photo.imageWidth,
      );

      if (snapped !== null) {
        spotId = snapped;
      } else {
        const [created] = await tx
          .insert(reactionSpots)
          .values({ photoId, x: input.x, y: input.y })
          .returning({ id: reactionSpots.id });
        spotId = created.id;
      }
    }

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

    const remaining = await tx
      .select({ id: reactions.id })
      .from(reactions)
      .where(eq(reactions.spotId, mine.spotId))
      .limit(1);

    if (remaining.length === 0) {
      await tx.delete(reactionSpots).where(eq(reactionSpots.id, mine.spotId));
    }

    return mine.spotId;
  });
}

/** Rebuilds every spot of one photo. Used to reconcile after a write. */
export async function getPhotoSpots(photoId: number, userId: number): Promise<FeedSpot[]> {
  const { db } = getDb();

  const spotRows = await db
    .select()
    .from(reactionSpots)
    .where(eq(reactionSpots.photoId, photoId))
    .orderBy(reactionSpots.id);

  if (spotRows.length === 0) return [];

  const rows = await db
    .select({ id: reactions.id, spotId: reactions.spotId, userId: reactions.userId, emoji: reactions.emoji })
    .from(reactions)
    .where(eq(reactions.photoId, photoId))
    .orderBy(reactions.id);

  return spotRows.flatMap((spot) => {
    const atSpot = rows.filter((row) => row.spotId === spot.id);
    if (atSpot.length === 0) return [];

    const summary = summarise(atSpot, userId);

    return [
      {
        id: spot.id,
        x: spot.x,
        y: spot.y,
        total: summary.total,
        myEmoji: summary.myEmoji,
        reactions: summary.reactions.map(({ emoji, count }) => ({ emoji, count })),
      },
    ];
  });
}
