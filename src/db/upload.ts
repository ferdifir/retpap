import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { photos, uploadSessions } from "./schema";

export type UploadStep = "photo" | "caption" | "confirm";

export interface UploadSession {
  telegramId: number;
  step: UploadStep;
  fileId: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  caption: string | null;
}

export async function getUploadSession(telegramId: number): Promise<UploadSession | null> {
  const { db } = getDb();
  const [row] = await db.select().from(uploadSessions).where(eq(uploadSessions.telegramId, telegramId));
  if (!row) return null;

  return {
    telegramId: row.telegramId,
    step: row.step as UploadStep,
    fileId: row.fileId,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
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
      fileId: session.fileId,
      imageWidth: session.imageWidth,
      imageHeight: session.imageHeight,
      caption: session.caption,
    })
    .onConflictDoUpdate({
      target: uploadSessions.telegramId,
      set: {
        step: session.step,
        fileId: session.fileId,
        imageWidth: session.imageWidth,
        imageHeight: session.imageHeight,
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
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
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
      imageUrl: input.imageUrl,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      userId: input.userId ?? null,
    })
    .returning({ id: photos.id });

  return row.id;
}
