import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./client";
import { comments, photos, ratings, reactions, spots, users } from "./schema";

config({ path: ".env.local" });

const SEED_TELEGRAM_IDS = [900000001, 900000002, 900000003, 900000004, 900000005, 900000006];
const SEED_SLUG = "foto-1";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database");
  }

  const { db, pool } = getDb();

  await db.transaction(async (tx) => {
    const existingPhotos = await tx
      .select({ id: photos.id })
      .from(photos)
      .where(eq(photos.slug, SEED_SLUG));
    const photoIds = existingPhotos.map((photo) => photo.id);

    if (photoIds.length > 0) {
      await tx.delete(reactions).where(inArray(reactions.photoId, photoIds));
      await tx.delete(spots).where(inArray(spots.photoId, photoIds));
      await tx.delete(ratings).where(inArray(ratings.photoId, photoIds));
      await tx.delete(photos).where(inArray(photos.id, photoIds));
    }

    const existingUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.telegramId, SEED_TELEGRAM_IDS));
    if (existingUsers.length > 0) {
      await tx.delete(users).where(
        inArray(
          users.id,
          existingUsers.map((user) => user.id),
        ),
      );
    }

    const [photo] = await tx
      .insert(photos)
      .values({
        slug: SEED_SLUG,
        caption: "Foto pertama untuk di-rate 📸",
        imageUrl: "/foto.jpg",
        imageWidth: 714,
        imageHeight: 1280,
      })
      .returning({ id: photos.id });

    const seededUsers = await tx
      .insert(users)
      .values([
        { telegramId: 900000001, firstName: "Raka", username: "raka" },
        { telegramId: 900000002, firstName: "Nadia", username: "nadia" },
        { telegramId: 900000003, firstName: "Bima", username: "bima" },
        { telegramId: 900000004, firstName: "Sinta", username: "sinta" },
        { telegramId: 900000005, firstName: "Dimas", username: "dimas" },
        { telegramId: 900000006, firstName: "Ayu", username: "ayu" },
      ])
      .returning({ id: users.id });

    const [spotA, spotB, spotC] = await tx
      .insert(spots)
      .values([
        { photoId: photo.id, x: 0.5, y: 0.28 },
        { photoId: photo.id, x: 0.33, y: 0.66 },
        { photoId: photo.id, x: 0.63, y: 0.74 },
      ])
      .returning({ id: spots.id });

    // One reaction per user per photo. Insert order drives the tie-break.
    await tx.insert(reactions).values([
      { photoId: photo.id, spotId: spotA.id, userId: seededUsers[0].id, emoji: "👓" },
      { photoId: photo.id, spotId: spotA.id, userId: seededUsers[1].id, emoji: "🔥" },
      { photoId: photo.id, spotId: spotA.id, userId: seededUsers[2].id, emoji: "💯" },
      { photoId: photo.id, spotId: spotB.id, userId: seededUsers[3].id, emoji: "❤️" },
      { photoId: photo.id, spotId: spotB.id, userId: seededUsers[4].id, emoji: "❤️" },
      { photoId: photo.id, spotId: spotC.id, userId: seededUsers[5].id, emoji: "😂" },
    ]);

    await tx.insert(comments).values([
      { photoId: photo.id, spotId: spotA.id, userId: seededUsers[0].id, body: "Cahayanya bagus banget di sini" },
      { photoId: photo.id, spotId: spotA.id, userId: seededUsers[1].id, body: "Setuju, golden hour-nya kena" },
      { photoId: photo.id, spotId: spotB.id, userId: seededUsers[3].id, body: "Komposisinya rapi, suka" },
    ]);

    await tx.insert(ratings).values([
      { photoId: photo.id, userId: seededUsers[0].id, score: 8.5 },
      { photoId: photo.id, userId: seededUsers[1].id, score: 9 },
      { photoId: photo.id, userId: seededUsers[2].id, score: 7 },
      { photoId: photo.id, userId: seededUsers[3].id, score: 8 },
    ]);

    console.log(`seeded photo ${photo.id}: 3 spots, 6 reactions, 3 comments, 4 ratings`);
  });

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
