import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { photos, reportSessions, reports, users } from "./schema";

export type ReportTarget = {
  id: number;
  slug: string;
  caption: string;
  mediaType: "photo" | "video";
};

/** Photo a report can point at; inactive rows are refused by the bot. */
export async function getReportTarget(photoId: number): Promise<ReportTarget | null> {
  if (!Number.isInteger(photoId) || photoId <= 0) return null;
  const { db } = getDb();

  const [row] = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      caption: photos.caption,
      mediaType: photos.mediaType,
      isActive: photos.isActive,
    })
    .from(photos)
    .where(eq(photos.id, photoId));

  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    slug: row.slug,
    caption: row.caption,
    mediaType: row.mediaType === "video" ? "video" : "photo",
  };
}

export async function saveReportSession(telegramId: number, photoId: number): Promise<void> {
  const { db } = getDb();

  await db
    .insert(reportSessions)
    .values({ telegramId, photoId })
    .onConflictDoUpdate({
      target: reportSessions.telegramId,
      set: { photoId, createdAt: new Date() },
    });
}

export async function getReportSession(
  telegramId: number,
): Promise<{ photoId: number } | null> {
  const { db } = getDb();

  const [row] = await db
    .select({ photoId: reportSessions.photoId })
    .from(reportSessions)
    .where(eq(reportSessions.telegramId, telegramId));

  return row ?? null;
}

export async function clearReportSession(telegramId: number): Promise<void> {
  const { db } = getDb();
  await db.delete(reportSessions).where(eq(reportSessions.telegramId, telegramId));
}

/** Stores one report; the caller clears the session afterwards. */
export async function createReport(
  telegramId: number,
  photoId: number,
  body: string,
): Promise<void> {
  const { db } = getDb();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramId, telegramId));

  if (!user) throw new Error("report from unknown user " + telegramId);

  await db.insert(reports).values({ photoId, userId: user.id, body });
}

export type AdminReport = {
  id: number;
  photoId: number;
  slug: string;
  caption: string;
  mediaType: "photo" | "video";
  isActive: boolean;
  body: string;
  createdAt: string;
  reporterTelegramId: number | null;
  reporterUsername: string | null;
  reporterFirstName: string | null;
};

/** Newest first, for the /admin Laporan tab. */
export async function listReportsForAdmin(limit = 50): Promise<AdminReport[]> {
  const { db } = getDb();

  const rows = await db
    .select({
      id: reports.id,
      photoId: reports.photoId,
      slug: photos.slug,
      caption: photos.caption,
      mediaType: photos.mediaType,
      isActive: photos.isActive,
      body: reports.body,
      createdAt: reports.createdAt,
      reporterTelegramId: users.telegramId,
      reporterUsername: users.username,
      reporterFirstName: users.firstName,
    })
    .from(reports)
    .innerJoin(photos, eq(photos.id, reports.photoId))
    .leftJoin(users, eq(users.id, reports.userId))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(Math.min(200, Math.max(1, limit)));

  return rows.map((row) => ({
    ...row,
    mediaType: row.mediaType === "video" ? "video" : "photo",
    createdAt: row.createdAt.toISOString(),
  }));
}
