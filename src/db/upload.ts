import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { photos, uploadSessions } from "./schema";

export type UploadStep = "photo" | "caption" | "confirm";
export type MediaType = "photo" | "video";

export interface UploadSession {
  telegramId: number;
  step: UploadStep;
  mediaType: MediaType;
  fileId: string | null;
  /** Telegram thumbnail, only for videos; poster fallback for the feed. */
  thumbnailFileId: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  durationSeconds: number | null;
  caption: string | null;
}

export async function getUploadSession(telegramId: number): Promise<UploadSession | null> {
  const { db } = getDb();
  const [row] = await db.select().from(uploadSessions).where(eq(uploadSessions.telegramId, telegramId));
  if (!row) return null;

  return {
    telegramId: row.telegramId,
    step: row.step as UploadStep,
    mediaType: row.mediaType === "video" ? "video" : "photo",
    fileId: row.fileId,
    thumbnailFileId: row.thumbnailFileId,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    durationSeconds: row.durationSeconds,
    caption: row.caption,
  };
}

export async function saveUploadSession(session: UploadSession): Promise<void> {
  const { db } = getDb();

  await db
    .insert(uploadSessions)
    .values({
      telegramId: session.telegramId,
      step: session.step,
      mediaType: session.mediaType,
      fileId: session.fileId,
      thumbnailFileId: session.thumbnailFileId,
      imageWidth: session.imageWidth,
      imageHeight: session.imageHeight,
      durationSeconds: session.durationSeconds,
      caption: session.caption,
    })
    .onConflictDoUpdate({
      target: uploadSessions.telegramId,
      set: {
        step: session.step,
        mediaType: session.mediaType,
        fileId: session.fileId,
        thumbnailFileId: session.thumbnailFileId,
        imageWidth: session.imageWidth,
        imageHeight: session.imageHeight,
        durationSeconds: session.durationSeconds,
        caption: session.caption,
        updatedAt: new Date(),
      },
    });
}

export async function clearUploadSession(telegramId: number): Promise<void> {
  const { db } = getDb();
  await db.delete(uploadSessions).where(eq(uploadSessions.telegramId, telegramId));
}

export interface NewPhoto {
  slug: string;
  caption: string;
  mediaType: MediaType;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  /** Uploader, so they can be notified about activity on the photo. */
  userId?: number | null;
}

export async function createPhoto(input: NewPhoto): Promise<number> {
  const { db } = getDb();

  const [row] = await db
    .insert(photos)
    .values({
      slug: input.slug,
      caption: input.caption,
      mediaType: input.mediaType,
      imageUrl: input.imageUrl,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      durationSeconds: input.durationSeconds ?? null,
      posterUrl: input.posterUrl ?? null,
      userId: input.userId ?? null,
    })
    .returning({ id: photos.id });

  return row.id;
}
