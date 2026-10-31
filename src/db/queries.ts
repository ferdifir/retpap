import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { anonymousCommentNotificationBody, commentNotificationBody } from "@/lib/bot/format";
import {
  LEADERBOARD_PERIODS,
  leaderboardWindow,
} from "@/lib/leaderboard-period";
import { isReactionEmoji } from "@/lib/reactions/catalog";
import {
  findSpotAt,
  sortReactionSummary,
  type ReactionSummary,
} from "@/lib/reaction-rules";
import { getDb, type Db } from "./client";
import {
  comments,
  leaderboardAnnouncements,
  notifications,
  photos,
  ratingHistory,
  ratings,
  reactions,
  rewardVotes,
  rewards,
  spots,
  users,
} from "./schema";

import type {
  FeedComment,
  FeedPhoto,
  FeedSpot,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResult,
} from "@/lib/feed-types";

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

export type GenderPreference = "female" | "male" | "all";

/** null means the user has never picked; the feed then shows everything. */
export async function getGenderPreference(
  userId: number,
): Promise<GenderPreference | null> {
  const { db } = getDb();

  const [row] = await db
    .select({ preference: users.genderPreference })
    .from(users)
    .where(eq(users.id, userId));

  const value = row?.preference;
  return value === "female" || value === "male" || value === "all" ? value : null;
}

export async function setGenderPreference(
  userId: number,
  preference: GenderPreference,
): Promise<void> {
  const { db } = getDb();
  await db.update(users).set({ genderPreference: preference }).where(eq(users.id, userId));
}

export async function getFeed(userId: number): Promise<FeedPhoto[]> {
  const { db } = getDb();

  // Unlabelled rows stay visible under every filter, so older uploads do not
  // disappear when a user picks a side.
  const preference = await getGenderPreference(userId);
  const genderFilter =
    preference === "female" || preference === "male"
      ? or(eq(photos.gender, preference), isNull(photos.gender))
      : undefined;

  const photoRows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.isActive, true), genderFilter))
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
          reactions: summary.reactions.map(({ emoji, count }) => ({
            emoji,
            count,
          })),
          comments: commentRows.filter((row) => row.spotId === spot.id).length,
        };
      })
      // A spot with only comments still needs a marker.
      .filter((spot) => spot.total > 0 || spot.comments > 0);

    return {
      id: photo.id,
      slug: photo.slug,
      caption: photo.caption,
      mediaType: photo.mediaType === "video" ? "video" : "photo",
      imageUrl: photo.imageUrl,
      posterUrl: photo.posterUrl,
      durationSeconds: photo.durationSeconds,
      imageWidth: photo.imageWidth,
      imageHeight: photo.imageHeight,
      isNsfw: photo.isNsfw,
      gender: photo.gender === "female" || photo.gender === "male" ? photo.gender : null,
      rating: {
        avg:
          photoRatings.length > 0
            ? Math.round((sum / photoRatings.length) * 10) / 10
            : 0,
        votes: photoRatings.length,
        mine: photoRatings.find((row) => row.userId === userId)?.score ?? null,
      },
      spots,
    };
  });
}

/**
 * Top PAP for one period. Only ratings written inside the window count, so an
 * old upload can still win today when it gets fresh scores. Qualifying needs
 * `minVotes` ratings; ties fall back to the larger voter count, then the newer
 * upload.
 */
export async function getLeaderboard(
  period: LeaderboardPeriod = "all",
  limit = 10,
  now: Date = new Date(),
): Promise<LeaderboardResult> {
  const { db } = getDb();
  const { minVotes } = LEADERBOARD_PERIODS[period];
  const window = leaderboardWindow(period, now);

  const rows = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      caption: photos.caption,
      mediaType: photos.mediaType,
      imageUrl: photos.imageUrl,
      posterUrl: photos.posterUrl,
      imageWidth: photos.imageWidth,
      imageHeight: photos.imageHeight,
      avg: sql<string>`round(avg(${ratings.score})::numeric, 1)::text`,
      votes: sql<number>`count(${ratings.userId})::int`,
    })
    .from(photos)
    .innerJoin(ratings, eq(ratings.photoId, photos.id))
    .where(
      and(
        eq(photos.isActive, true),
        window.start ? gte(ratings.createdAt, window.start) : undefined,
        window.end ? lt(ratings.createdAt, window.end) : undefined,
      ),
    )
    .groupBy(photos.id)
    .having(sql`count(${ratings.userId}) >= ${minVotes}`)
    .orderBy(
      sql`avg(${ratings.score}) desc`,
      sql`count(${ratings.userId}) desc`,
      desc(photos.createdAt),
      desc(photos.id),
    )
    .limit(limit);

  return {
    period,
    minVotes,
    start: window.start?.toISOString() ?? null,
    end: window.end?.toISOString() ?? null,
    entries: rows.map((row) => ({
      ...row,
      mediaType: row.mediaType === "video" ? "video" : "photo",
      avg: Number(row.avg),
    })) satisfies LeaderboardEntry[],
  };
}

export async function getSpotSummary(
  spotId: number,
  userId: number,
): Promise<FeedSpot | null> {
  const { db } = getDb();

  const [spot] = await db.select().from(spots).where(eq(spots.id, spotId));
  if (!spot) return null;

  const rows = await db
    .select({
      id: reactions.id,
      emoji: reactions.emoji,
      userId: reactions.userId,
    })
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

/**
 * A spot is just a point shared by both layers: it only disappears once it
 * has neither reactions nor comments left.
 */
async function deleteSpotIfEmpty(tx: Tx, spotId: number) {
  const [remainingReaction] = await tx
    .select({ id: reactions.id })
    .from(reactions)
    .where(eq(reactions.spotId, spotId))
    .limit(1);
  if (remainingReaction) return;

  const [remainingComment] = await tx
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.spotId, spotId))
    .limit(1);
  if (remainingComment) return;

  await tx.delete(spots).where(eq(spots.id, spotId));
}

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
  kind: "reaction" | "comment",
): Promise<
  | { ok: true; spotId: number }
  | { ok: false; reason: "spot_not_found" | "invalid_target" }
> {
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

  // A spot holds either reactions or comments, never both, so snapping only
  // considers spots of the same kind.
  const [existing, used] = await Promise.all([
    tx.select().from(spots).where(eq(spots.photoId, photo.id)),
    kind === "reaction"
      ? tx
          .selectDistinct({ id: reactions.spotId })
          .from(reactions)
          .where(eq(reactions.photoId, photo.id))
      : tx
          .selectDistinct({ id: comments.spotId })
          .from(comments)
          .where(eq(comments.photoId, photo.id)),
  ]);
  const sameKind = new Set(used.map((row) => row.id));

  const snapped = findSpotAt(
    existing.filter((spot) => sameKind.has(spot.id)),
    input.x,
    input.y,
    photo.imageHeight / photo.imageWidth,
  );
  if (snapped !== null) return { ok: true, spotId: snapped };

  const [created] = await tx
    .insert(spots)
    .values({ photoId: photo.id, x: input.x, y: input.y })
    .returning({ id: spots.id });

  return { ok: true, spotId: created.id };
}

export type ReactInput = {
  spotId?: number;
  x?: number;
  y?: number;
  emoji: string;
};
export type ReactOutcome =
  | { ok: true; spotId: number; removed: boolean }
  | {
      ok: false;
      reason: "spot_not_found" | "invalid_target" | "unknown_emoji";
    };

export async function reactToPhoto(
  photoId: number,
  userId: number,
  input: ReactInput,
): Promise<ReactOutcome> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    // Serialise reactions for one photo so the capacity check is race-free.
    const [photo] = await tx
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .for("update");
    if (!photo) return { ok: false, reason: "invalid_target" } as const;

    const [mine] = await tx
      .select()
      .from(reactions)
      .where(and(eq(reactions.photoId, photoId), eq(reactions.userId, userId)));

    // Validate before resolveSpot so a bad emoji never creates an empty spot.
    // Re-sending the stored emoji stays allowed: rows written before the
    // catalog existed must remain removable.
    if (!isReactionEmoji(input.emoji) && mine?.emoji !== input.emoji) {
      return { ok: false, reason: "unknown_emoji" } as const;
    }

    const resolved = await resolveSpot(tx, photo, input, "reaction");
    if (!resolved.ok) return resolved;
    const spotId = resolved.spotId;

    if (mine && mine.spotId === spotId && mine.emoji === input.emoji) {
      await tx.delete(reactions).where(eq(reactions.id, mine.id));
      await deleteSpotIfEmpty(tx, spotId);
      return { ok: true, spotId, removed: true } as const;
    }

    if (mine) {
      const previousSpotId = mine.spotId;
      await tx
        .update(reactions)
        .set({ spotId, emoji: input.emoji })
        .where(eq(reactions.id, mine.id));
      if (previousSpotId !== spotId)
        await deleteSpotIfEmpty(tx, previousSpotId);
    } else {
      await tx
        .insert(reactions)
        .values({ photoId, spotId, userId, emoji: input.emoji });
    }

    return { ok: true, spotId, removed: false } as const;
  });
}

/**
 * Deactivated content is hidden from the feed and the leaderboard, but the
 * mutation routes take a photo id directly, so they have to ask separately.
 */
export async function isPhotoActive(photoId: number): Promise<boolean> {
  const { db } = getDb();
  const [row] = await db
    .select({ isActive: photos.isActive })
    .from(photos)
    .where(eq(photos.id, photoId));
  return row?.isActive === true;
}

export async function ratePhoto(
  photoId: number,
  userId: number,
  score: number,
) {
  const { db } = getDb();

  const rows = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ score: ratings.score })
      .from(ratings)
      .where(and(eq(ratings.photoId, photoId), eq(ratings.userId, userId)));

    await tx
      .insert(ratings)
      .values({ photoId, userId, score })
      .onConflictDoUpdate({
        target: [ratings.photoId, ratings.userId],
        set: { score, updatedAt: new Date() },
      });

    // Only real changes are logged: the slider can send the same value twice,
    // and a repeated value would make the history look like a new decision.
    if (existing?.score !== score) {
      await tx.insert(ratingHistory).values({ photoId, userId, score });
    }

    return tx
      .select({ score: ratings.score })
      .from(ratings)
      .where(eq(ratings.photoId, photoId));
  });
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

/**
 * True when the owner blocked this account from uploading. Missing rows are
 * not blocked: the check runs before the first upsert on some paths.
 */
export async function isUploadBlocked(telegramId: number): Promise<boolean> {
  const { db } = getDb();
  const [row] = await db
    .select({ blocked: users.uploadBlocked })
    .from(users)
    .where(eq(users.telegramId, telegramId));

  return row?.blocked === true;
}

/**
 * Records that the user has started the bot. Called from the webhook, so the
 * Mini App can refuse to run for people who never pressed Start.
 */
export async function markBotStarted(profile: {
  telegramId: number;
  firstName: string;
  username?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
}): Promise<void> {
  const { db } = getDb();

  await db
    .insert(users)
    .values({
      telegramId: profile.telegramId,
      firstName: profile.firstName,
      username: profile.username ?? null,
      lastName: profile.lastName ?? null,
      languageCode: profile.languageCode ?? null,
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        startedAt: sql`coalesce(${users.startedAt}, now())`,
        lastSeenAt: new Date(),
      },
    });
}

export async function clearReaction(
  photoId: number,
  userId: number,
): Promise<number | null> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    const [mine] = await tx
      .select()
      .from(reactions)
      .where(and(eq(reactions.photoId, photoId), eq(reactions.userId, userId)));

    if (!mine) return null;

    await tx.delete(reactions).where(eq(reactions.id, mine.id));
    await deleteSpotIfEmpty(tx, mine.spotId);

    return mine.spotId;
  });
}

export type PendingNotification = {
  id: number;
  userId: number;
  telegramId: number;
  kind: string;
  body: string;
  slug: string;
  attempts: number;
};

/** Oldest unsent notifications, joined with the data the sender needs. */
export async function takePendingNotifications(
  limit = 20,
): Promise<PendingNotification[]> {
  const { db } = getDb();

  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      telegramId: users.telegramId,
      kind: notifications.kind,
      body: notifications.body,
      slug: photos.slug,
      attempts: notifications.attempts,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .innerJoin(photos, eq(photos.id, notifications.photoId))
    .where(and(isNull(notifications.sentAt), lt(notifications.attempts, 5)))
    .orderBy(notifications.id)
    .limit(limit);

  return rows;
}

export async function markNotificationSent(id: number): Promise<void> {
  const { db } = getDb();
  await db
    .update(notifications)
    .set({ sentAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markNotificationFailed(
  id: number,
  error: string,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(notifications)
    .set({ attempts: sql`${notifications.attempts} + 1`, error })
    .where(eq(notifications.id, id));
}

export type LeaderboardAnnouncementKind = "daily" | "weekly" | "monthly";

export type LeaderboardAnnouncement = {
  id: number;
  kind: LeaderboardAnnouncementKind;
  periodStart: Date;
  periodEnd: Date;
  messageId: number | null;
  attempts: number;
  error: string | null;
  sentAt: Date | null;
};

/**
 * Claims a period for sending. The unique key makes this the idempotency gate:
 * the first caller gets a fresh row, later callers get the existing one so a
 * failed send can still be retried.
 */
export async function claimLeaderboardAnnouncement(input: {
  kind: LeaderboardAnnouncementKind;
  periodStart: Date;
  periodEnd: Date;
}): Promise<LeaderboardAnnouncement> {
  const { db } = getDb();

  const [inserted] = await db
    .insert(leaderboardAnnouncements)
    .values(input)
    .onConflictDoNothing({
      target: [
        leaderboardAnnouncements.kind,
        leaderboardAnnouncements.periodStart,
      ],
    })
    .returning();

  if (inserted) return toAnnouncement(inserted);

  const [existing] = await db
    .select()
    .from(leaderboardAnnouncements)
    .where(
      and(
        eq(leaderboardAnnouncements.kind, input.kind),
        eq(leaderboardAnnouncements.periodStart, input.periodStart),
      ),
    );

  if (!existing) throw new Error("leaderboard announcement claim disappeared");
  return toAnnouncement(existing);
}

function toAnnouncement(
  row: typeof leaderboardAnnouncements.$inferSelect,
): LeaderboardAnnouncement {
  return { ...row, kind: row.kind as LeaderboardAnnouncementKind };
}

/** Success, and the deliberate skip after a period had no qualifiers. */
export async function markLeaderboardAnnouncementSent(
  id: number,
  messageId: number | null,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(leaderboardAnnouncements)
    .set({ messageId, sentAt: new Date(), error: null })
    .where(eq(leaderboardAnnouncements.id, id));
}

export async function markLeaderboardAnnouncementFailed(
  id: number,
  error: string,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(leaderboardAnnouncements)
    .set({ attempts: sql`${leaderboardAnnouncements.attempts} + 1`, error })
    .where(eq(leaderboardAnnouncements.id, id));
}

export async function setNotify(
  userId: number,
  enabled: boolean,
): Promise<void> {
  const { db } = getDb();
  await db.update(users).set({ notify: enabled }).where(eq(users.id, userId));
}

export async function setNotifyByTelegram(
  telegramId: number,
  enabled: boolean,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(users)
    .set({ notify: enabled })
    .where(eq(users.telegramId, telegramId));
}

/** Flips the anonymous-comment switch and reports the new state. */
export async function toggleAnonymousByTelegram(
  telegramId: number,
): Promise<boolean> {
  const { db } = getDb();
  const [row] = await db
    .select({ anonymous: users.anonymous })
    .from(users)
    .where(eq(users.telegramId, telegramId));

  const next = !(row?.anonymous ?? false);
  await db
    .update(users)
    .set({ anonymous: next })
    .where(eq(users.telegramId, telegramId));
  return next;
}

/** Flips the switch and reports the new state. */
export async function toggleNotifyByTelegram(
  telegramId: number,
): Promise<boolean> {
  const { db } = getDb();
  const [row] = await db
    .select({ notify: users.notify })
    .from(users)
    .where(eq(users.telegramId, telegramId));

  const next = !(row?.notify ?? true);
  await db
    .update(users)
    .set({ notify: next })
    .where(eq(users.telegramId, telegramId));
  return next;
}

export type DigestCandidate = {
  photoId: number;
  userId: number;
  telegramId: number;
  slug: string;
  reactions: number;
  ratings: number;
  comments: number;
};

/**
 * Photos with fresh activity and an owner who still wants notifications.
 * Digests are throttled to one per photo per 15 minutes.
 */
export async function listDigestCandidates(
  limit = 10,
): Promise<DigestCandidate[]> {
  const { db } = getDb();

  const result = await db.execute(sql`
    with base as (
      select p.id, p.slug, p.user_id, u.telegram_id,
             coalesce(p.last_digest_at, p.created_at) as since
      from photos p
      join users u on u.id = p.user_id
      where p.is_active
        and u.notify
        and coalesce(p.last_digest_at, p.created_at) < now() - interval '15 minutes'
    )
    select b.id as "photoId", b.user_id as "userId", b.telegram_id as "telegramId", b.slug,
      (select count(*)::int from reactions r where r.photo_id = b.id and r.created_at > b.since) as reactions,
      (select count(*)::int from ratings ra where ra.photo_id = b.id and ra.updated_at > b.since) as ratings,
      (select count(*)::int from comments c where c.photo_id = b.id and c.created_at > b.since) as comments
    from base b
    order by b.id
    limit ${limit}
  `);

  return (result.rows as unknown as DigestCandidate[]).filter(
    (row) => row.reactions + row.ratings + row.comments > 0,
  );
}

export async function markDigestSent(photoId: number): Promise<void> {
  const { db } = getDb();
  await db
    .update(photos)
    .set({ lastDigestAt: new Date() })
    .where(eq(photos.id, photoId));
}

/** Rebuilds every spot of one photo. Used to reconcile after a write. */
export async function getPhotoSpots(
  photoId: number,
  userId: number,
): Promise<FeedSpot[]> {
  const { db } = getDb();

  const spotRows = await db
    .select()
    .from(spots)
    .where(eq(spots.photoId, photoId))
    .orderBy(spots.id);

  if (spotRows.length === 0) return [];

  const rows = await db
    .select({
      id: reactions.id,
      spotId: reactions.spotId,
      userId: reactions.userId,
      emoji: reactions.emoji,
    })
    .from(reactions)
    .where(eq(reactions.photoId, photoId))
    .orderBy(reactions.id);

  const commentRows = await db
    .select({ spotId: comments.spotId })
    .from(comments)
    .where(eq(comments.photoId, photoId));

  return spotRows.flatMap((spot) => {
    const atSpot = rows.filter((row) => row.spotId === spot.id);
    const commentCount = commentRows.filter(
      (row) => row.spotId === spot.id,
    ).length;
    if (atSpot.length === 0 && commentCount === 0) return [];

    const summary = summarise(atSpot, userId);

    return [
      {
        id: spot.id,
        x: spot.x,
        y: spot.y,
        total: summary.total,
        myEmoji: summary.myEmoji,
        reactions: summary.reactions.map(({ emoji, count }) => ({
          emoji,
          count,
        })),
        comments: commentCount,
      },
    ];
  });
}

export type CommentInput = {
  spotId?: number;
  x?: number;
  y?: number;
  body: string;
};
export type CommentOutcome =
  | { ok: true; spotId: number }
  | { ok: false; reason: "spot_not_found" | "invalid_target" };

/**
 * One comment per user per photo, exactly like reactions: a new comment on a
 * different point moves the existing row instead of adding a second one.
 */
export async function addComment(
  photoId: number,
  userId: number,
  input: CommentInput,
): Promise<CommentOutcome> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    const [photo] = await tx
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .for("update");
    if (!photo) return { ok: false, reason: "invalid_target" } as const;

    const resolved = await resolveSpot(tx, photo, input, "comment");
    if (!resolved.ok) return resolved;

    const [author] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId));
    // Snapshot: toggling later must not expose comments posted anonymously.
    const isAnonymous = author?.anonymous === true;

    const [mine] = await tx
      .select()
      .from(comments)
      .where(and(eq(comments.photoId, photoId), eq(comments.userId, userId)));

    if (mine) {
      const previousSpotId = mine.spotId;
      await tx
        .update(comments)
        .set({
          spotId: resolved.spotId,
          body: input.body,
          isAnonymous,
          createdAt: new Date(),
        })
        .where(eq(comments.id, mine.id));
      if (previousSpotId !== resolved.spotId)
        await deleteSpotIfEmpty(tx, previousSpotId);
      return { ok: true, spotId: resolved.spotId } as const;
    }

    const [inserted] = await tx
      .insert(comments)
      .values({
        photoId,
        spotId: resolved.spotId,
        userId,
        body: input.body,
        isAnonymous,
      })
      .returning({ id: comments.id });

    // Notify the uploader, unless they are the one commenting.
    if (photo.userId && photo.userId !== userId) {
      const [owner] = await tx
        .select()
        .from(users)
        .where(eq(users.id, photo.userId));

      if (owner?.notify && author) {
        await tx
          .insert(notifications)
          .values({
            userId: owner.id,
            photoId,
            kind: "comment",
            dedupeKey: "comment:" + inserted.id,
            body: isAnonymous
              ? anonymousCommentNotificationBody(input.body)
              : commentNotificationBody(
                  {
                    firstName: author.firstName,
                    username: author.username,
                    telegramId: author.telegramId,
                  },
                  input.body,
                ),
          })
          .onConflictDoNothing();
      }
    }

    return { ok: true, spotId: resolved.spotId } as const;
  });
}

/** Removes the caller's own comment on a photo, then drops an empty spot. */
export async function deleteOwnComment(
  photoId: number,
  userId: number,
): Promise<{ spotId: number } | null> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    const [mine] = await tx
      .select()
      .from(comments)
      .where(and(eq(comments.photoId, photoId), eq(comments.userId, userId)));

    if (!mine) return null;

    await tx.delete(comments).where(eq(comments.id, mine.id));
    await deleteSpotIfEmpty(tx, mine.spotId);

    return { spotId: mine.spotId };
  });
}

/** Newest first, so the panel can show the latest without a second query. */
export async function getSpotComments(
  photoId: number,
  spotId: number,
  userId: number,
  limit = 50,
): Promise<FeedComment[]> {
  const { db } = getDb();

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userId: comments.userId,
      isAnonymous: comments.isAnonymous,
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
    mine: row.userId === userId,
    // Anonymous authors are masked for everyone, including the uploader.
    author: row.isAnonymous
      ? { firstName: "Anonim", username: null }
      : { firstName: row.firstName, username: row.username },
  }));
}

/** Remembers the channel post so a manual delete can remove it as well. */
export async function markChannelPost(
  photoId: number,
  messageId: number,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(photos)
    .set({ channelMessageId: messageId })
    .where(eq(photos.id, photoId));
}

export async function getUserTelegramId(
  userId: number,
): Promise<number | null> {
  const { db } = getDb();

  const [row] = await db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(eq(users.id, userId));

  return row?.telegramId ?? null;
}

export type MonthlyReward = {
  id: number;
  photoId: number;
  caption: string;
  avgScore: number;
  votes: number;
  amount: number;
  telegramId: number;
  periodStart: Date;
  periodEnd: Date;
  decidedAt: Date;
  claimedAt: Date | null;
  claimedBy: number | null;
};

/**
 * Freezes the monthly winner. Called once, right after the recap post lands.
 * Returns null when a reward for that period already exists, which is what
 * makes a re-sent recap harmless.
 */
export async function createMonthlyReward(input: {
  periodStart: Date;
  periodEnd: Date;
  decidedAt: Date;
  photoId: number;
  userId: number | null;
  telegramId: number;
  avgScore: number;
  votes: number;
  amount: number;
}): Promise<number | null> {
  const { db } = getDb();

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(rewards)
      .values(input)
      .onConflictDoNothing({ target: [rewards.periodStart] })
      .returning({ id: rewards.id });

    if (!inserted) return null;

    // Per-voter copy: the published average must stay reproducible even after
    // the ratings themselves are changed.
    const votes = await tx
      .select({ userId: ratings.userId, score: ratings.score })
      .from(ratings)
      .where(eq(ratings.photoId, input.photoId));

    if (votes.length > 0) {
      await tx
        .insert(rewardVotes)
        .values(
          votes.map((vote) => ({
            rewardId: inserted.id,
            userId: vote.userId,
            score: vote.score,
          })),
        )
        .onConflictDoNothing();
    }

    return inserted.id;
  });
}

export async function getMonthlyReward(
  periodStart: Date,
): Promise<MonthlyReward | null> {
  const { db } = getDb();

  const [row] = await db
    .select({
      id: rewards.id,
      photoId: rewards.photoId,
      caption: photos.caption,
      avgScore: rewards.avgScore,
      votes: rewards.votes,
      amount: rewards.amount,
      telegramId: rewards.telegramId,
      periodStart: rewards.periodStart,
      periodEnd: rewards.periodEnd,
      decidedAt: rewards.decidedAt,
      claimedAt: rewards.claimedAt,
      claimedBy: rewards.claimedBy,
    })
    .from(rewards)
    .innerJoin(photos, eq(photos.id, rewards.photoId))
    .where(eq(rewards.periodStart, periodStart));

  return row ?? null;
}

/** Atomic claim: the conditional update is what stops a double claim. */
export async function claimMonthlyReward(
  id: number,
  telegramId: number,
): Promise<boolean> {
  const { db } = getDb();

  const [row] = await db
    .update(rewards)
    .set({ claimedAt: new Date(), claimedBy: telegramId })
    .where(and(eq(rewards.id, id), isNull(rewards.claimedAt)))
    .returning({ id: rewards.id });

  return row !== undefined;
}

/** Uploader of a photo, or null for seeded content. */
export async function getPhotoUploader(photoId: number): Promise<number | null> {
  const { db } = getDb();

  const [row] = await db
    .select({ userId: photos.userId })
    .from(photos)
    .where(eq(photos.id, photoId));

  return row?.userId ?? null;
}
