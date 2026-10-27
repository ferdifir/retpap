import { and, avg, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  adminActions,
  comments,
  leaderboardAnnouncements,
  photos,
  ratings,
  reactions,
  users,
} from "@/db/schema";
import { leaderboardWindow } from "@/lib/leaderboard-period";

export type AdminPhoto = {
  id: number;
  slug: string;
  caption: string;
  mediaType: "photo" | "video";
  gender: "female" | "male" | null;
  isNsfw: boolean;
  isActive: boolean;
  channelMessageId: number | null;
  createdAt: string;
  userId: number | null;
  uploaderTelegramId: number | null;
  uploaderUsername: string | null;
  votes: number;
  avg: number | null;
  reactions: number;
  comments: number;
};

export type AdminUser = {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  createdAt: string;
  lastSeenAt: string;
  uploadCount: number;
  avgReceived: number | null;
  ratingCount: number;
  uploadBlocked: boolean;
  uploadBlockedAt: string | null;
  uploadBlockedReason: string | null;
};

export type PhotoFilters = {
  q?: string;
  type?: "photo" | "video";
  nsfw?: "yes" | "no";
  status?: "active" | "inactive";
  userId?: number;
  page?: number;
  perPage?: number;
};

export type UserFilters = {
  q?: string;
  blocked?: boolean;
  hasUpload?: boolean;
  page?: number;
  perPage?: number;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function photoCondition(filters: PhotoFilters) {
  const parts = [];
  if (filters.q) parts.push(ilike(photos.caption, "%" + filters.q + "%"));
  if (filters.type) parts.push(eq(photos.mediaType, filters.type));
  if (filters.nsfw) parts.push(eq(photos.isNsfw, filters.nsfw === "yes"));
  if (filters.status) parts.push(eq(photos.isActive, filters.status === "active"));
  if (filters.userId) parts.push(eq(photos.userId, filters.userId));
  return parts.length > 0 ? and(...parts) : undefined;
}

/** One page of photos for the admin table, newest first, with counts. */
export async function listPhotosForAdmin(
  filters: PhotoFilters,
): Promise<{ rows: AdminPhoto[]; total: number; page: number; perPage: number }> {
  const { db } = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(50, Math.max(1, filters.perPage ?? 25));
  const where = photoCondition(filters);

  const [base, totals] = await Promise.all([
    db
      .select({
        id: photos.id,
        slug: photos.slug,
        caption: photos.caption,
        mediaType: photos.mediaType,
        gender: photos.gender,
        isNsfw: photos.isNsfw,
        isActive: photos.isActive,
        channelMessageId: photos.channelMessageId,
        createdAt: photos.createdAt,
        userId: photos.userId,
        uploaderTelegramId: users.telegramId,
        uploaderUsername: users.username,
      })
      .from(photos)
      .leftJoin(users, eq(users.id, photos.userId))
      .where(where)
      .orderBy(desc(photos.createdAt), desc(photos.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: count() }).from(photos).where(where),
  ]);

  const ids = base.map((row) => row.id);
  const [ratingRows, reactionRows, commentRows] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({
            photoId: ratings.photoId,
            votes: count(),
            avg: avg(ratings.score),
          })
          .from(ratings)
          .where(inArray(ratings.photoId, ids))
          .groupBy(ratings.photoId),
    ids.length === 0
      ? []
      : db
          .select({ photoId: reactions.photoId, n: count() })
          .from(reactions)
          .where(inArray(reactions.photoId, ids))
          .groupBy(reactions.photoId),
    ids.length === 0
      ? []
      : db
          .select({ photoId: comments.photoId, n: count() })
          .from(comments)
          .where(inArray(comments.photoId, ids))
          .groupBy(comments.photoId),
  ]);

  const ratingByPhoto = new Map(
    ratingRows.map((row) => [
      row.photoId,
      { votes: Number(row.votes), avg: row.avg === null ? null : Number(row.avg) },
    ]),
  );
  const reactionsByPhoto = new Map(reactionRows.map((row) => [row.photoId, Number(row.n)]));
  const commentsByPhoto = new Map(commentRows.map((row) => [row.photoId, Number(row.n)]));

  const rows: AdminPhoto[] = base.map((row) => {
    const rating = ratingByPhoto.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      caption: row.caption,
      mediaType: row.mediaType === "video" ? "video" : "photo",
      gender: row.gender === "female" || row.gender === "male" ? row.gender : null,
      isNsfw: row.isNsfw,
      isActive: row.isActive,
      channelMessageId: row.channelMessageId,
      createdAt: iso(row.createdAt) ?? "",
      userId: row.userId,
      uploaderTelegramId: row.uploaderTelegramId,
      uploaderUsername: row.uploaderUsername,
      votes: rating?.votes ?? 0,
      avg: rating?.avg ?? null,
      reactions: reactionsByPhoto.get(row.id) ?? 0,
      comments: commentsByPhoto.get(row.id) ?? 0,
    };
  });

  return { rows, total: Number(totals[0]?.n ?? 0), page, perPage };
}

function userCondition(filters: UserFilters) {
  const parts = [];
  if (filters.q) {
    parts.push(
      ilike(users.firstName, "%" + filters.q + "%"),
    );
  }
  if (filters.blocked !== undefined) parts.push(eq(users.uploadBlocked, filters.blocked));
  return parts.length > 0 ? and(...parts) : undefined;
}

/** One page of users, newest first, with upload and received-rating counts. */
export async function listUsersForAdmin(
  filters: UserFilters,
): Promise<{ rows: AdminUser[]; total: number; page: number; perPage: number }> {
  const { db } = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(50, Math.max(1, filters.perPage ?? 25));
  const where = userCondition(filters);

  const [base, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        username: users.username,
        firstName: users.firstName,
        createdAt: users.createdAt,
        lastSeenAt: users.lastSeenAt,
        uploadBlocked: users.uploadBlocked,
        uploadBlockedAt: users.uploadBlockedAt,
        uploadBlockedReason: users.uploadBlockedReason,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: count() }).from(users).where(where),
  ]);

  const ids = base.map((row) => row.id);
  const [uploadRows, ratingRows] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({ userId: photos.userId, n: count() })
          .from(photos)
          .where(inArray(photos.userId, ids))
          .groupBy(photos.userId),
    ids.length === 0
      ? []
      : db
          .select({
            userId: photos.userId,
            n: count(ratings.userId),
            avg: avg(ratings.score),
          })
          .from(ratings)
          .innerJoin(photos, eq(photos.id, ratings.photoId))
          .where(inArray(photos.userId, ids))
          .groupBy(photos.userId),
  ]);

  const uploadsByUser = new Map(uploadRows.map((row) => [row.userId, Number(row.n)]));
  const ratingsByUser = new Map(
    ratingRows.map((row) => [
      row.userId,
      { n: Number(row.n), avg: row.avg === null ? null : Number(row.avg) },
    ]),
  );

  const rows: AdminUser[] = base
    .map((row) => {
      const received = ratingsByUser.get(row.id);
      return {
        id: row.id,
        telegramId: row.telegramId,
        username: row.username,
        firstName: row.firstName,
        createdAt: iso(row.createdAt) ?? "",
        lastSeenAt: iso(row.lastSeenAt) ?? "",
        uploadCount: uploadsByUser.get(row.id) ?? 0,
        avgReceived: received?.avg ?? null,
        ratingCount: received?.n ?? 0,
        uploadBlocked: row.uploadBlocked,
        uploadBlockedAt: iso(row.uploadBlockedAt),
        uploadBlockedReason: row.uploadBlockedReason,
      };
    })
    .filter((row) => (filters.hasUpload ? row.uploadCount > 0 : true));

  return { rows, total: Number(totals[0]?.n ?? 0), page, perPage };
}

export type PhotoSnapshot = {
  id: number;
  slug: string;
  caption: string;
  mediaType: string;
  isNsfw: boolean;
  gender: string | null;
  isActive: boolean;
  channelMessageId: number | null;
  userId: number | null;
  uploaderTelegramId: number | null;
};

export async function getPhotoSnapshot(photoId: number): Promise<PhotoSnapshot | null> {
  const { db } = getDb();
  const [row] = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      caption: photos.caption,
      mediaType: photos.mediaType,
      isNsfw: photos.isNsfw,
      gender: photos.gender,
      isActive: photos.isActive,
      channelMessageId: photos.channelMessageId,
      userId: photos.userId,
      uploaderTelegramId: users.telegramId,
    })
    .from(photos)
    .leftJoin(users, eq(users.id, photos.userId))
    .where(eq(photos.id, photoId));

  return row ?? null;
}

export async function setPhotoNsfw(photoId: number, isNsfw: boolean): Promise<void> {
  const { db } = getDb();
  await db.update(photos).set({ isNsfw }).where(eq(photos.id, photoId));
}

export async function setPhotoGender(
  photoId: number,
  gender: "female" | "male" | null,
): Promise<void> {
  const { db } = getDb();
  await db.update(photos).set({ gender }).where(eq(photos.id, photoId));
}

export async function setPhotoActive(photoId: number, isActive: boolean): Promise<void> {
  const { db } = getDb();
  await db.update(photos).set({ isActive }).where(eq(photos.id, photoId));
}

export async function setPhotoChannelMessage(
  photoId: number,
  channelMessageId: number | null,
): Promise<void> {
  const { db } = getDb();
  await db.update(photos).set({ channelMessageId }).where(eq(photos.id, photoId));
}

/** Removes the row; spots, ratings, reactions and notifications follow by cascade. */
export async function deletePhotoRow(photoId: number): Promise<void> {
  const { db } = getDb();
  await db.delete(photos).where(eq(photos.id, photoId));
}

export async function listUserPhotos(
  userId: number,
): Promise<{ id: number; slug: string; mediaType: string; channelMessageId: number | null }[]> {
  const { db } = getDb();
  return db
    .select({
      id: photos.id,
      slug: photos.slug,
      mediaType: photos.mediaType,
      channelMessageId: photos.channelMessageId,
    })
    .from(photos)
    .where(eq(photos.userId, userId))
    .orderBy(desc(photos.createdAt));
}

export async function setUploadBlocked(
  userId: number,
  blocked: boolean,
  reason: string | null,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(users)
    .set({
      uploadBlocked: blocked,
      uploadBlockedAt: blocked ? new Date() : null,
      uploadBlockedReason: blocked ? reason : null,
    })
    .where(eq(users.id, userId));
}

export async function getUploaderTelegramId(userId: number): Promise<number | null> {
  const { db } = getDb();
  const [row] = await db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(eq(users.id, userId));
  return row?.telegramId ?? null;
}

export type AdminActionRow = {
  id: number;
  actorTelegramId: number;
  action: string;
  targetType: string;
  targetId: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function logAdminAction(input: {
  actorTelegramId: number;
  action: string;
  targetType: "photo" | "user";
  targetId: number;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { db } = getDb();
  await db.insert(adminActions).values({
    actorTelegramId: input.actorTelegramId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: input.payload ?? {},
  });
}

export async function listAdminActions(limit = 30): Promise<AdminActionRow[]> {
  const { db } = getDb();
  const rows = await db
    .select()
    .from(adminActions)
    .orderBy(desc(adminActions.id))
    .limit(Math.min(100, Math.max(1, limit)));

  return rows.map((row) => ({
    id: row.id,
    actorTelegramId: row.actorTelegramId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    payload: row.payload,
    createdAt: iso(row.createdAt) ?? "",
  }));
}

/** Today's daily recap row, so a resend can reuse and update it. */
export async function getTodayDailyAnnouncement(): Promise<{
  id: number;
  messageId: number | null;
} | null> {
  const { db } = getDb();
  const window = leaderboardWindow("day");
  if (!window.start) return null;

  const [row] = await db
    .select({
      id: leaderboardAnnouncements.id,
      messageId: leaderboardAnnouncements.messageId,
    })
    .from(leaderboardAnnouncements)
    .where(
      and(
        eq(leaderboardAnnouncements.kind, "daily"),
        eq(leaderboardAnnouncements.periodStart, window.start),
      ),
    );

  return row ? { id: row.id, messageId: row.messageId } : null;
}

export async function setAnnouncementMessage(
  id: number,
  messageId: number | null,
): Promise<void> {
  const { db } = getDb();
  await db
    .update(leaderboardAnnouncements)
    .set({ messageId, sentAt: new Date(), error: null })
    .where(eq(leaderboardAnnouncements.id, id));
}
