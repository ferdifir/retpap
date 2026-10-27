/**
 * Every event name the app is allowed to write. Kept as a union instead of a
 * database check constraint so adding one does not need a migration.
 */
export const EVENT_NAMES = [
  "app_open",
  "feed_loaded",
  "photo_view",
  "nsfw_reveal",
  "gate_shown",
  "gate_pass",
  "share",
  "pref_change",
  "upload_step",
  "upload_published",
  "upload_abandoned",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Small attributes only: enums, counters and flags. Never free text. */
export type EventMeta = Record<string, string | number | boolean | null>;

export type AnalyticsEvent = {
  name: EventName;
  photoId?: number;
  meta?: EventMeta;
};
