import { sql } from "drizzle-orm";
import type { DrawStroke } from "@/lib/draw";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Postgres 12 rejects an explicit DEFAULT for GENERATED ALWAYS, which is how
// Drizzle writes inserts. BY DEFAULT keeps the same behaviour for us.
const identity = () =>
  bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity();

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
  /** Uploader notifications about reactions, comments and ratings. */
  notify: boolean("notify").notNull().default(true),
  /** Toggled from the bot: new comments are posted without the author name. */
  anonymous: boolean("anonymous").notNull().default(false),
  /** Set the first time the user talks to the bot; gates the Mini App. */
  startedAt: timestamp("started_at", { withTimezone: true }),
  /** Feed filter chosen once; null until the user picks. */
  genderPreference: text("gender_preference"),
  /** Set by the owner after spam; the bot refuses new uploads but not reading. */
  uploadBlocked: boolean("upload_blocked").notNull().default(false),
  /** When the ban was applied, so the admin page can sort by recency. */
  uploadBlockedAt: timestamp("upload_blocked_at", { withTimezone: true }),
  /** Owner's note, e.g. "spam nomor WA". Never shown to the user. */
  uploadBlockedReason: text("upload_blocked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "users_gender_preference_valid",
    sql`${table.genderPreference} is null or ${table.genderPreference} in ('female', 'male', 'all')`,
  ),
]);

/**
 * One in-flight upload per Telegram user. The bot asks for a photo, then a
 * caption, then shows a confirmation; the row survives restarts so a pm2
 * reload mid-conversation does not lose the user photo.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
    /** "photo" | "caption" | "confirm" */
    step: text("step").notNull(),
    /** "photo" | "video"; both share the same caption/confirm steps. */
    mediaType: text("media_type").notNull().default("photo"),
    fileId: text("file_id"),
    /** Telegram's thumbnail, used as a poster fallback when ffmpeg is unavailable. */
    thumbnailFileId: text("thumbnail_file_id"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    durationSeconds: integer("duration_seconds"),
    caption: text("caption"),
    /** Uploader's answer to the 18+ question; null until answered. */
    isNsfw: boolean("is_nsfw"),
    /** Uploader's answer to the female/male question; null until answered. */
    gender: text("gender"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "upload_sessions_step_valid",
      sql`${table.step} in ('photo', 'caption', 'confirm')`,
    ),
    check(
      "upload_sessions_media_type_valid",
      sql`${table.mediaType} in ('photo', 'video')`,
    ),
    check(
      "upload_sessions_duration_range",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} between 1 and 60`,
    ),
    check(
      "upload_sessions_gender_valid",
      sql`${table.gender} is null or ${table.gender} in ('female', 'male')`,
    ),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: identity(),
    slug: text("slug").notNull().unique(),
    caption: text("caption").notNull(),
    /** "photo" | "video"; imageUrl points at the jpg or mp4 accordingly. */
    mediaType: text("media_type").notNull().default("photo"),
    imageUrl: text("image_url").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    /** Video length in seconds; null for photos. */
    durationSeconds: integer("duration_seconds"),
    /** Still frame shown before a video plays; null for photos. */
    posterUrl: text("poster_url"),
    /** Marked 18+ by the uploader or the owner. */
    isNsfw: boolean("is_nsfw").notNull().default(false),
    /** Content gender, answered at upload; null for older rows. */
    gender: text("gender"),
    isActive: boolean("is_active").notNull().default(true),
    /** Uploader; null for photos published before ownership existed. */
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    /** Channel post for this photo, so a manual delete can remove it too. */
    channelMessageId: bigint("channel_message_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("photos_width_positive", sql`${table.imageWidth} > 0`),
    check("photos_height_positive", sql`${table.imageHeight} > 0`),
    check(
      "photos_media_type_valid",
      sql`${table.mediaType} in ('photo', 'video')`,
    ),
    check(
      "photos_duration_range",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} between 1 and 60`,
    ),
    check(
      "photos_gender_valid",
      sql`${table.gender} is null or ${table.gender} in ('female', 'male')`,
    ),
    index("photos_user_idx").on(table.userId),
  ],
);

export const spots = pgTable(
  "spots",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** 0..1 relative to the rendered image box, not the container. */
    x: real("x").notNull(),
    y: real("y").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Redundant for uniqueness, required as the target of the composite FK.
    unique("spots_id_photo").on(table.id, table.photoId),
    index("spots_photo_idx").on(table.photoId),
    check("spots_x_range", sql`${table.x} between 0 and 1`),
    check("spots_y_range", sql`${table.y} between 0 and 1`),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One reaction per user per spot: a photo may hold up to three of their
    // reactions, capped in reactToPhoto().
    unique("reactions_spot_user").on(table.spotId, table.userId),
    index("reactions_spot_idx").on(table.spotId, table.emoji),
    foreignKey({
      name: "reactions_spot_photo_fk",
      columns: [table.spotId, table.photoId],
      foreignColumns: [spots.id, spots.photoId],
    }).onDelete("cascade"),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** Spot the comment is pinned to; comments and reactions share a point. */
    spotId: bigint("spot_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Snapshot of the author's preference at write time, so old comments
     *  keep the name they were posted with. */
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("comments_spot_idx").on(table.spotId, table.createdAt),
    // One comment per user per photo, mirroring the one-reaction rule.
    unique("comments_photo_user_key").on(table.photoId, table.userId),
    foreignKey({
      name: "comments_spot_photo_fk",
      columns: [table.spotId, table.photoId],
      foreignColumns: [spots.id, spots.photoId],
    }).onDelete("cascade"),
    check(
      "comments_body_length",
      sql`char_length(${table.body}) between 1 and 500`,
    ),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.userId] }),
    // Period leaderboards filter by when a rating was first written.
    index("ratings_created_at_idx").on(table.createdAt, table.photoId),
    check("ratings_score_range", sql`${table.score} between 1 and 10`),
  ],
);

/**
 * One private canvas per user per photo. Strokes are normalised coordinates,
 * never a rendered bitmap: the drawing stays sharp at any zoom and costs a few
 * kilobytes instead of an image.
 *
 * Rows are only ever read back for their owner. Nothing in the feed, the
 * channel or the leaderboard exposes them.
 */
export const drawings = pgTable(
  "drawings",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    strokes: jsonb("strokes").$type<DrawStroke[]>().notNull().default(sql`'[]'::jsonb`),
    /** "private" | "feed"; feed means the drawing rides along in the carousel. */
    visibility: text("visibility").notNull().default("private"),
    /** Author label in the feed carousel; false shows the name, like comments. */
    isAnonymous: boolean("is_anonymous").notNull().default(true),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One canvas per photo per user: the row is edited, not appended to.
    unique("drawings_photo_user").on(table.photoId, table.userId),
    index("drawings_user_idx").on(table.userId),
    // The carousel reads every shared drawing of one photo.
    index("drawings_shared_idx").on(table.photoId, table.visibility),
    check("drawings_strokes_array", sql`jsonb_typeof(${table.strokes}) = 'array'`),
    check("drawings_visibility_valid", sql`${table.visibility} in ('private', 'feed')`),
  ],
);

/**
 * One claimed recap per kind and period. The unique key is the idempotency
 * guard: the cron runs every minute, so a period must only ever be sent once.
 */
export const leaderboardAnnouncements = pgTable(
  "leaderboard_announcements",
  {
    id: identity(),
    /** "daily" | "weekly" | "monthly" */
    kind: text("kind").notNull(),
    /** Start of the window, at 00:00 Asia/Jakarta, stored as timestamptz. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Channel message id once Telegram accepted the message. */
    messageId: bigint("message_id", { mode: "number" }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    /** Set on success, and on a deliberate skip when nothing qualified. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("leaderboard_announcements_kind_period").on(
      table.kind,
      table.periodStart,
    ),
    check(
      "leaderboard_announcements_kind_valid",
      sql`${table.kind} in ('daily', 'weekly', 'monthly')`,
    ),
  ],
);

/**
 * Outbox for uploader notifications. Rows are written inside the same
 * transaction as the action, then delivered right after that request, so the
 * actor never waits on Telegram.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: identity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** "comment" | "rating" | "reaction" */
    kind: text("kind").notNull(),
    /** Idempotency key, e.g. "comment:12". */
    dedupeKey: text("dedupe_key").notNull().unique(),
    body: text("body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_pending_idx").on(table.userId, table.sentAt),
    check(
      "notifications_kind_valid",
      sql`${table.kind} in ('comment', 'rating', 'reaction')`,
    ),
  ],
);

/**
 * Every owner action from /admin, written in the same transaction as the change
 * it describes. `payload.before` keeps enough of the old row to reconstruct it
 * after a hard delete, which the deploy-time pg_dump cannot guarantee.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: identity(),
    actorTelegramId: bigint("actor_telegram_id", { mode: "number" }).notNull(),
    /** e.g. "photo.nsfw", "photo.soft_delete", "user.block". */
    action: text("action").notNull(),
    /** "photo" | "user" */
    targetType: text("target_type").notNull(),
    targetId: bigint("target_id", { mode: "number" }).notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_actions_target_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("admin_actions_created_idx").on(table.createdAt),
    check(
      "admin_actions_target_type_valid",
      sql`${table.targetType} in ('photo', 'user')`,
    ),
  ],
);

/**
 * First-party analytics. Only for facts the rest of the schema cannot answer:
 * app opens, impressions, gate funnel and bot upload steps. Reactions, ratings
 * and comments stay in their own tables and are never duplicated here.
 */
export const events = pgTable(
  "events",
  {
    id: identity(),
    /** Validated in the app against `EventName`; no check so new events skip a migration. */
    name: text("name").notNull(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    photoId: bigint("photo_id", { mode: "number" }).references(() => photos.id, {
      onDelete: "set null",
    }),
    /** Random id per app launch; unique impressions without a cookie. */
    sessionId: text("session_id").notNull(),
    /** Small, already-summarised attributes; never free text. */
    meta: jsonb("meta")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_name_created_idx").on(table.name, table.createdAt),
    index("events_created_idx").on(table.createdAt),
    index("events_photo_name_idx").on(table.photoId, table.name),
    index("events_user_created_idx").on(table.userId, table.createdAt),
    index("events_session_idx").on(table.sessionId),
  ],
);

/**
 * Append-only log of every rating change. `ratings` keeps only the latest
 * value per (photo, user), so this table is the only way to answer "what did
 * this user score, and when". It is never read by the leaderboard.
 */
export const ratingHistory = pgTable(
  "rating_history",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** "live" for rows written by ratePhoto, "backfill" for the one-off seed. */
    source: text("source").notNull().default("live"),
  },
  (table) => [
    index("rating_history_photo_at_idx").on(table.photoId, table.at),
    index("rating_history_user_at_idx").on(table.userId, table.at),
    check("rating_history_score_range", sql`${table.score} between 1 and 10`),
    check(
      "rating_history_source_valid",
      sql`${table.source} in ('live', 'backfill')`,
    ),
  ],
);

/**
 * One monthly Top PAP reward, frozen at the moment the recap was posted.
 * The unique period_start is the guard: a re-sent recap must never create a
 * second reward or change the amount.
 */
export const rewards = pgTable(
  "rewards",
  {
    id: identity(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** When the recap post went out, which is also the rating cut-off. */
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** Uploader; null for seeded content, where the owner claims instead. */
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    /** Who may claim: the uploader, or the owner for seeded content. */
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    avgScore: real("avg_score").notNull(),
    votes: integer("votes").notNull(),
    amount: integer("amount").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: bigint("claimed_by", { mode: "number" }),
  },
  (table) => [
    unique("rewards_period_start").on(table.periodStart),
    index("rewards_telegram_idx").on(table.telegramId),
  ],
);

/**
 * Snapshot of the winning photo's ratings at cut-off. Kept per voter so the
 * published average and vote count can be recomputed later.
 */
export const rewardVotes = pgTable(
  "reward_votes",
  {
    rewardId: bigint("reward_id", { mode: "number" })
      .notNull()
      .references(() => rewards.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
  },
  (table) => [primaryKey({ columns: [table.rewardId, table.userId] })],
);

/**
 * Free-text reports about one photo/video, written by the bot. No reason list
 * and no rate limit: the owner reads every row in /admin and decides.
 */
export const reports = pgTable(
  "reports",
  {
    id: identity(),
    photoId: bigint("photo_id", { mode: "number" })
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("reports_photo_idx").on(table.photoId),
    index("reports_created_idx").on(table.createdAt),
  ],
);

/**
 * One pending report per Telegram user: the next plain text from that chat is
 * stored as the report body. Mirrors upload_sessions so a pm2 reload does not
 * lose the target photo mid-conversation.
 */
export const reportSessions = pgTable("report_sessions", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  photoId: bigint("photo_id", { mode: "number" })
    .notNull()
    .references(() => photos.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
