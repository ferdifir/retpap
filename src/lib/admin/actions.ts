import { readFile } from "node:fs/promises";
import { claimLeaderboardAnnouncement, getLeaderboard } from "@/db/queries";
import { leaderboardAnnouncementText } from "@/lib/bot/leaderboard-announce";
import { BotApiError, deleteMessage, sendMessage } from "@/lib/bot/api";
import { channelConfigured, channelId } from "@/lib/bot/channel";
import { postToChannel } from "@/lib/bot/flow";
import { deleteMedia, mediaPath } from "@/lib/bot/media";
import type { InlineKeyboardMarkup } from "@/lib/bot/types";
import { leaderboardWindow } from "@/lib/leaderboard-period";
import { leaderboardUrl } from "@/lib/share";
import {
  deletePhotoRow,
  getPhotoSnapshot,
  getTodayDailyAnnouncement,
  listUserPhotos,
  logAdminAction,
  setAnnouncementMessage,
  setPhotoActive,
  setPhotoGender,
  setPhotoNsfw,
  type PhotoSnapshot,
} from "./queries";

export type ActionResult = {
  ok: boolean;
  reason?: string;
  slug?: string;
  messageId?: number;
  count?: number;
  reposted?: boolean;
  channelNote?: string;
};

/**
 * A channel post that is already gone is not an error: the owner may have
 * removed it by hand, or Telegram cleaned it up after the media was deleted.
 */
async function dropChannelPost(messageId: number | null): Promise<boolean> {
  if (messageId === null || !channelConfigured()) return false;

  try {
    await deleteMessage(channelId(), messageId);
    return true;
  } catch (error) {
    if (error instanceof BotApiError && (error.status === 400 || error.status === 403)) {
      return false;
    }
    throw error;
  }
}

/** Rebuilds the channel post from the file on disk; used by 18+ and repost. */
async function repostToChannel(photoId: number): Promise<ActionResult> {
  if (!channelConfigured()) return { ok: false, reason: "channel_not_configured" };

  const snapshot = await getPhotoSnapshot(photoId);
  if (!snapshot) return { ok: false, reason: "not_found" };

  const mediaType = snapshot.mediaType === "video" ? "video" : "photo";
  const file = mediaPath(snapshot.slug, mediaType === "video" ? "mp4" : "jpg");
  const bytes = file ? await readFile(file).catch(() => null) : null;
  if (!bytes) return { ok: false, reason: "missing_file" };

  await postToChannel(
    photoId,
    { mediaType, slug: snapshot.slug, bytes, poster: null },
    snapshot.caption,
    snapshot.isNsfw,
  );

  const after = await getPhotoSnapshot(photoId);
  return after && after.channelMessageId !== null
    ? { ok: true, slug: snapshot.slug }
    : { ok: false, reason: "channel_failed" };
}

export async function adminDeletePhoto(input: {
  photoId: number;
  mode: "soft" | "hard";
  actorTelegramId: number;
  notify: boolean;
}): Promise<ActionResult> {
  const snapshot = await getPhotoSnapshot(input.photoId);
  if (!snapshot) return { ok: false, reason: "not_found" };

  // Hide first so the feed stops serving it even if Telegram is slow.
  await setPhotoActive(input.photoId, false);
  await dropChannelPost(snapshot.channelMessageId).catch(() => undefined);

  if (input.mode === "hard") {
    await deletePhotoRow(input.photoId);
    await deleteMedia(
      snapshot.slug,
      snapshot.mediaType === "video" ? "video" : "photo",
    );
  }

  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: input.mode === "hard" ? "photo.hard_delete" : "photo.soft_delete",
    targetType: "photo",
    targetId: input.photoId,
    payload: { before: snapshot, mode: input.mode },
  });

  if (input.notify && snapshot.uploaderTelegramId !== null) {
    await sendMessage(
      snapshot.uploaderTelegramId,
      "Kontenmu dihapus dari RetPAP karena tidak sesuai ketentuan.",
    ).catch(() => undefined);
  }

  return { ok: true, slug: snapshot.slug };
}

export async function adminRestorePhoto(input: {
  photoId: number;
  actorTelegramId: number;
}): Promise<ActionResult> {
  const snapshot = await getPhotoSnapshot(input.photoId);
  if (!snapshot) return { ok: false, reason: "not_found" };

  await setPhotoActive(input.photoId, true);
  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: "photo.restore",
    targetType: "photo",
    targetId: input.photoId,
    payload: { before: snapshot },
  });

  return { ok: true, slug: snapshot.slug };
}

export async function adminSetNsfw(input: {
  photoId: number;
  isNsfw: boolean;
  actorTelegramId: number;
}): Promise<ActionResult> {
  const snapshot = await getPhotoSnapshot(input.photoId);
  if (!snapshot) return { ok: false, reason: "not_found" };
  if (snapshot.isNsfw === input.isNsfw) {
    return { ok: true, slug: snapshot.slug, reposted: false };
  }

  // DB first: a failed re-post must never leave the channel unblurred.
  await setPhotoNsfw(input.photoId, input.isNsfw);

  let reposted = false;
  let channelNote: string | undefined;

  if (snapshot.isActive && channelConfigured()) {
    await dropChannelPost(snapshot.channelMessageId).catch(() => undefined);
    const result = await repostToChannel(input.photoId);
    reposted = result.ok;
    if (!result.ok) channelNote = result.reason;
  }

  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: "photo.nsfw",
    targetType: "photo",
    targetId: input.photoId,
    payload: { before: snapshot, after: { isNsfw: input.isNsfw }, reposted },
  });

  return { ok: true, slug: snapshot.slug, reposted, channelNote };
}

export async function adminSetGender(input: {
  photoId: number;
  gender: "female" | "male" | null;
  actorTelegramId: number;
}): Promise<ActionResult> {
  const snapshot = await getPhotoSnapshot(input.photoId);
  if (!snapshot) return { ok: false, reason: "not_found" };

  await setPhotoGender(input.photoId, input.gender);
  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: "photo.gender",
    targetType: "photo",
    targetId: input.photoId,
    payload: { before: snapshot, after: { gender: input.gender } },
  });

  return { ok: true, slug: snapshot.slug };
}

export async function adminRepostPhoto(input: {
  photoId: number;
  actorTelegramId: number;
}): Promise<ActionResult> {
  const snapshot = await getPhotoSnapshot(input.photoId);
  if (!snapshot) return { ok: false, reason: "not_found" };

  await dropChannelPost(snapshot.channelMessageId).catch(() => undefined);
  const result = await repostToChannel(input.photoId);

  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: "photo.repost",
    targetType: "photo",
    targetId: input.photoId,
    payload: { before: snapshot, ok: result.ok, reason: result.reason ?? null },
  });

  return result;
}

export async function adminPurgeUserPhotos(input: {
  userId: number;
  mode: "soft" | "hard";
  actorTelegramId: number;
  notify: boolean;
}): Promise<ActionResult> {
  const photos = await listUserPhotos(input.userId);
  let count = 0;

  for (const photo of photos) {
    const result = await adminDeletePhoto({
      photoId: photo.id,
      mode: input.mode,
      actorTelegramId: input.actorTelegramId,
      notify: input.notify,
    });
    if (result.ok) count += 1;
  }

  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: "user.purge",
    targetType: "user",
    targetId: input.userId,
    payload: { mode: input.mode, count, slugs: photos.map((p: { slug: string }) => p.slug) },
  });

  return { ok: true, count };
}

function recapKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🏆 Lihat Leaderboard", url: leaderboardUrl("day") }],
    ],
  };
}

/** Replaces today's daily recap with one built from the current ratings. */
export async function adminResendDailyRecap(input: {
  actorTelegramId: number;
}): Promise<ActionResult> {
  if (!channelConfigured()) return { ok: false, reason: "channel_not_configured" };

  const window = leaderboardWindow("day");
  if (!window.start || !window.end) return { ok: false, reason: "no_window" };

  const result = await getLeaderboard("day", 3);
  const current = await getTodayDailyAnnouncement();

  if (current?.messageId != null) {
    await dropChannelPost(current.messageId).catch(() => undefined);
  }

  if (result.entries.length === 0) {
    await logAdminAction({
      actorTelegramId: input.actorTelegramId,
      action: "leaderboard.resend",
      targetType: "photo",
      targetId: 0,
      payload: { skipped: "empty" },
    });
    return { ok: false, reason: "empty" };
  }

  const message = await sendMessage(
    channelId(),
    leaderboardAnnouncementText("daily", result),
    { keyboard: recapKeyboard() },
  );

  const claim = await claimLeaderboardAnnouncement({
    kind: "daily",
    periodStart: window.start,
    periodEnd: window.end,
  });
  await setAnnouncementMessage(claim.id, message.message_id);

  await logAdminAction({
    actorTelegramId: input.actorTelegramId,
    action: "leaderboard.resend",
    targetType: "photo",
    targetId: 0,
    payload: { messageId: message.message_id, previous: current?.messageId ?? null },
  });

  return { ok: true, messageId: message.message_id };
}

export type { PhotoSnapshot };
