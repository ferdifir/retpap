import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Postgres 12 rejects an explicit DEFAULT for GENERATED ALWAYS, which is how
  // Drizzle writes inserts. BY DEFAULT keeps the same behaviour for us.
  const identity = () => bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity();

export const users = pgTable("users", {
  id: identity(),
  /** Telegram user id, up to 52 bits, so a JS number is exact. */
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  languageCode: text("language_code"),
  isPremium: boolean("is_premium").notNull().default(false),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable(
  "photos",
  {
    id: identity(),
    slug: text("slug").notNull().unique(),
    caption: text("caption").notNull(),
    imageUrl: text("image_url").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("photos_width_positive", sql`${table.imageWidth} > 0`),
    check("photos_height_positive", sql`${table.imageHeight} > 0`),
  ],
);

export const reactionSpots = pgTable(
  "reaction_spots",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** 0..1 relative to the rendered image box, not the container. */
    x: real("x").notNull(),
    y: real("y").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Redundant for uniqueness, required as the target of the composite FK.
    unique("reaction_spots_id_photo").on(table.id, table.photoId),
    index("reaction_spots_photo_idx").on(table.photoId),
    check("reaction_spots_x_range", sql`${table.x} between 0 and 1`),
    check("reaction_spots_y_range", sql`${table.y} between 0 and 1`),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    spotId: bigint("spot_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One reaction per user per photo, enforced by the database.
    unique("reactions_photo_user").on(table.photoId, table.userId),
    index("reactions_spot_idx").on(table.spotId, table.emoji),
    foreignKey({
      name: "reactions_spot_photo_fk",
      columns: [table.spotId, table.photoId],
      foreignColumns: [reactionSpots.id, reactionSpots.photoId],
    }).onDelete("cascade"),
  ],
);

export const ratings = pgTable(
  "ratings",
  {
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.userId] }),
    check("ratings_score_range", sql`${table.score} between 1 and 10`),
  ],
);
