import {
  deactivatePhoto,
  markBotStarted,
  markChannelPost,
  setNotifyByTelegram,
  toggleNotifyByTelegram,
  upsertUser,
} from "@/db/queries";
import {
  clearUploadSession,
  createPhoto,
  getUploadSession,
  saveUploadSession,
  type MediaType,
} from "@/db/upload";
import { HOW_TO_NOTE, HOW_TO_TIPS } from "@/lib/how-to";
import { shareUrlFor, uploadUrl } from "@/lib/share";
import type { TelegramUser } from "@/types/telegram";
import {
  answerCallbackQuery,
  deleteMessage,
  downloadFile,
  editMessageCaption,
  getFile,
  sendMessage,
  sendPhoto,
  sendPhotoFile,
  sendVideo,
  sendVideoFile,
} from "./api";
import { CHANNEL_URL, channelConfigured, channelId, isChannelMember, ownerTelegramId } from "./channel";
import {
  blurPhoto,
  blurredThumbnail,
  mediaPath,
  mediaUrl,
  savePhoto,
  savePoster,
  saveVideo,
  videoUrl,
} from "./media";
import type { BotMessage, BotUpdate, InlineKeyboardMarkup } from "./types";
import { extractPoster, extractTeaser, matchAspect, normalisePoster, type Poster } from "./video";

const MAX_CAPTION_LENGTH = 500;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;
/** Bot API refuses to download files larger than this via getFile. */
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

function appUrl(): string {
  return (process.env.APP_URL ?? "https://bot.linkviu.my.id").replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * With a slug, this must be a t.me direct link, not a web_app button: only
 * direct links carry `startapp` into the Mini App as `start_param`, which is
 * what pins the freshly uploaded photo to the top of the deck.
 */
function openAppKeyboard(slug?: string): InlineKeyboardMarkup {
  if (slug) {
    return { inline_keyboard: [[{ text: "Buka RetPAP", url: shareUrlFor(slug) }]] };
  }

  return { inline_keyboard: [[{ text: "Buka RetPAP", web_app: { url: appUrl() } }]] };
}

function confirmKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Upload", callback_data: "publish" },
        { text: "✕ Batal", callback_data: "cancel" },
      ],
    ],
  };
}

const CHANNEL_CTA = "Rate foto ini, atau upload punyamu 👇";

/** Channel caption: the upload, then one line pointing at the app. */
function channelCaption(caption: string): string {
  return escapeHtml(caption) + "\n\n" + CHANNEL_CTA;
}

/**
 * Blocks the upload until the user joined the channel. Returns true when the
 * user may continue; a missing configuration also passes.
 */
async function requireChannel(chatId: number, telegramId: number): Promise<boolean> {
  if (await isChannelMember(telegramId)) return true;

  await sendMessage(chatId, "Untuk upload di RetPAP, join channel dulu ya.", {
    keyboard: { inline_keyboard: [[{ text: "Join Channel", url: CHANNEL_URL }]] },
  });
  return false;
}

type ChannelMedia = {
  mediaType: MediaType;
  slug: string;
  fileId: string;
  /** Original bytes, used to build the blurred photo teaser. */
  bytes: Buffer;
  /** Video still frame; also the source of the blurred cover. */
  poster: Poster | null;
};

/**
 * Publishes a blurred teaser of the upload to the channel; a failure must not
 * undo the upload. If the blur fails, the original cover is posted instead.
 */
async function postToChannel(photoId: number, media: ChannelMedia, caption: string): Promise<void> {
  if (!channelConfigured()) return;

  const options = {
    caption: channelCaption(caption),
    keyboard: {
      inline_keyboard: [
        [
          { text: "Beri nilai", url: shareUrlFor(media.slug) },
          { text: "Upload", url: uploadUrl() },
        ],
      ],
    },
  };

  try {
    let message: BotMessage;

    if (media.mediaType === "video") {
      // Prefer a short blurred clip: the motion tells the channel this is a
      // video, while the still cover looked like a blurred photo.
      const videoPath = mediaPath(media.slug, "mp4");
      let teaser: Buffer | null = null;

      if (videoPath) {
        try {
          teaser = await extractTeaser(videoPath);
        } catch (error) {
          console.error("[bot] channel teaser failed", error);
        }
      }

      if (teaser) {
        message = await sendVideoFile(channelId(), teaser, options);
      } else {
        let thumbnail: Buffer | null = null;

        if (media.poster) {
          try {
            thumbnail = await blurredThumbnail(media.poster.bytes);
          } catch (error) {
            console.error("[bot] channel thumbnail blur failed", error);
          }
        }

        // Without a blurred cover, fall back to Telegram's spoiler overlay so
        // the channel still does not reveal the frame.
        message = await sendVideo(channelId(), media.fileId, {
          ...options,
          thumbnail: thumbnail ?? undefined,
          spoiler: thumbnail === null,
        });
      }
    } else {
      let blurred: Buffer | null = null;

      try {
        blurred = await blurPhoto(media.bytes);
      } catch (error) {
        console.error("[bot] channel blur failed", error);
      }

      message = blurred
        ? await sendPhotoFile(channelId(), blurred, options)
        : await sendPhoto(channelId(), media.fileId, options);
    }

    await markChannelPost(photoId, message.message_id);
  } catch (error) {
    console.error("[bot] channel post failed", error);
  }
}

/** Sends the fresh upload to the owner with a manual delete button. */
async function notifyOwner(
  photoId: number,
  fileId: string,
  mediaType: MediaType,
  caption: string,
): Promise<void> {
  const ownerId = ownerTelegramId();
  if (ownerId === null) return;

  const options = {
    caption: escapeHtml(caption),
    keyboard: { inline_keyboard: [[{ text: "Hapus", callback_data: "del:" + photoId }]] },
  };

  try {
    if (mediaType === "video") {
      await sendVideo(ownerId, fileId, options);
    } else {
      await sendPhoto(ownerId, fileId, options);
    }
  } catch (error) {
    console.error("[bot] owner notification failed", error);
  }
}

/** Manual curation: hide the photo, drop the channel post, tell the uploader. */
async function removePhoto(photoId: number, chatId: number, messageId: number): Promise<void> {
  const removed = await deactivatePhoto(photoId);

  if (!removed) {
    await editMessageCaption(chatId, messageId, "Foto ini sudah tidak aktif.");
    return;
  }

  if (removed.channelMessageId !== null && channelConfigured()) {
    await deleteMessage(channelId(), removed.channelMessageId).catch(() => undefined);
  }

  if (removed.uploaderTelegramId !== null) {
    await sendMessage(
      removed.uploaderTelegramId,
      "Fotomu dihapus dari RetPAP karena tidak sesuai ketentuan. Kamu masih bisa upload foto lain lewat /upload.",
    ).catch(() => undefined);
  }

  await editMessageCaption(chatId, messageId, "Foto dihapus dari feed.");
}

const START_TEXT = [
  "<b>RetPAP</b>",
  "",
  "Upload foto/video: /upload",
  "Cara pakai: /howto",
].join("\n");

const HOWTO_TEXT = [
  "<b>Cara Pakai RetPAP</b>",
  "",
  ...HOW_TO_TIPS.map((tip) => "• <b>" + tip.title + "</b> — " + tip.body),
  "",
  HOW_TO_NOTE,
].join("\n");

const ASK_MEDIA_TEXT = [
  "<b>Langkah 1/2</b>",
  "",
  "Kirim foto atau video sekarang. Video maksimal 30 detik dan 20 MB.",
  "",
  "Setelah itu saya minta caption.",
  "",
  "Ketik /batal kalau berubah pikiran.",
].join("\n");

const ASK_CAPTION_TEXT = [
  "<b>Langkah 2/2</b>",
  "",
  "Sekarang kirim caption untuk foto atau video ini (teks biasa, maksimal " + MAX_CAPTION_LENGTH + " karakter).",
  "",
  "Ketik /batal kalau berubah pikiran.",
].join("\n");

function confirmText(caption: string): string {
  return [
    "<b>Konfirmasi upload</b>",
    "",
    "Caption: <i>" + escapeHtml(caption) + "</i>",
    "",
    "Upload sekarang? Konten akan muncul di feed dan bisa dinilai semua orang.",
  ].join("\n");
}

function commandOf(text: string | undefined): string | null {
  if (!text || !text.startsWith("/")) return null;
  return text.slice(1).split(/[\s@]/)[0].toLowerCase();
}

async function startUpload(chatId: number, telegramId: number): Promise<void> {
  await saveUploadSession({
    telegramId,
    step: "photo",
    mediaType: "photo",
    fileId: null,
    thumbnailFileId: null,
    imageWidth: null,
    imageHeight: null,
    durationSeconds: null,
    caption: null,
  });
  await sendMessage(chatId, ASK_MEDIA_TEXT);
}

async function cancelUpload(chatId: number, telegramId: number): Promise<void> {
  await clearUploadSession(telegramId);
  await sendMessage(chatId, "Upload dibatalkan.");
}

async function showConfirmation(
  chatId: number,
  fileId: string,
  mediaType: MediaType,
  caption: string,
): Promise<void> {
  const options = { caption: confirmText(caption), keyboard: confirmKeyboard() };

  if (mediaType === "video") {
    await sendVideo(chatId, fileId, options);
    return;
  }

  await sendPhoto(chatId, fileId, options);
}

async function handlePhoto(message: BotMessage, user: TelegramUser): Promise<void> {
  if (!(await requireChannel(message.chat.id, user.id))) return;

  const sizes = message.photo ?? [];
  // Telegram sends the sizes ascending, so the last entry is the largest.
  const largest = sizes[sizes.length - 1];
  if (!largest) return;

  if (largest.file_size && largest.file_size > MAX_PHOTO_BYTES) {
    await sendMessage(message.chat.id, "Fotonya terlalu besar. Kirim ulang sebagai foto biasa (bukan file), ya.");
    return;
  }

  const caption = message.caption?.trim() ?? "";

  if (caption.length > MAX_CAPTION_LENGTH) {
    await sendMessage(
      message.chat.id,
      "Caption kepanjangan (" + caption.length + " karakter, maksimal " + MAX_CAPTION_LENGTH + "). Kirim ulang fotonya dengan caption yang lebih pendek.",
    );
    return;
  }

  await saveUploadSession({
    telegramId: user.id,
    step: caption ? "confirm" : "caption",
    mediaType: "photo",
    fileId: largest.file_id,
    thumbnailFileId: null,
    imageWidth: largest.width,
    imageHeight: largest.height,
    durationSeconds: null,
    caption: caption || null,
  });

  if (caption) {
    await showConfirmation(message.chat.id, largest.file_id, "photo", caption);
    return;
  }

  await sendPhoto(message.chat.id, largest.file_id, { caption: ASK_CAPTION_TEXT });
}

async function handleVideo(message: BotMessage, user: TelegramUser): Promise<void> {
  if (!(await requireChannel(message.chat.id, user.id))) return;

  const video = message.video;
  if (!video) return;

  if (video.duration < 1 || video.duration > MAX_VIDEO_SECONDS) {
    await sendMessage(
      message.chat.id,
      "Durasi video harus 1–" + MAX_VIDEO_SECONDS + " detik (video ini " + video.duration + " detik). Kirim video yang lebih pendek, ya.",
    );
    return;
  }

  if (video.file_size && video.file_size > MAX_VIDEO_BYTES) {
    await sendMessage(
      message.chat.id,
      "Videonya terlalu besar (" +
        Math.round(video.file_size / (1024 * 1024)) +
        " MB). Maksimal 20 MB. Kirim versi yang lebih kecil, ya.",
    );
    return;
  }

  if (video.mime_type && !VIDEO_MIME_TYPES.has(video.mime_type)) {
    await sendMessage(message.chat.id, "Format videonya belum didukung. Kirim sebagai MP4 atau WebM, ya.");
    return;
  }

  if (!video.width || !video.height) {
    await sendMessage(message.chat.id, "Ukuran videonya tidak terbaca. Kirim ulang sebagai video biasa (bukan file), ya.");
    return;
  }

  const caption = message.caption?.trim() ?? "";

  if (caption.length > MAX_CAPTION_LENGTH) {
    await sendMessage(
      message.chat.id,
      "Caption kepanjangan (" + caption.length + " karakter, maksimal " + MAX_CAPTION_LENGTH + "). Kirim ulang videonya dengan caption yang lebih pendek.",
    );
    return;
  }

  await saveUploadSession({
    telegramId: user.id,
    step: caption ? "confirm" : "caption",
    mediaType: "video",
    fileId: video.file_id,
    thumbnailFileId: video.thumbnail?.file_id ?? null,
    imageWidth: video.width,
    imageHeight: video.height,
    durationSeconds: video.duration,
    caption: caption || null,
  });

  if (caption) {
    await showConfirmation(message.chat.id, video.file_id, "video", caption);
    return;
  }

  await sendVideo(message.chat.id, video.file_id, { caption: ASK_CAPTION_TEXT });
}

async function handleCaption(chatId: number, user: TelegramUser, text: string): Promise<void> {
  const session = await getUploadSession(user.id);
  if (!session || !session.fileId) {
    await sendMessage(chatId, "Sesi upload tidak ditemukan. Kirim /upload untuk mulai.");
    return;
  }

  if (text.length > MAX_CAPTION_LENGTH) {
    await sendMessage(chatId, "Caption maksimal " + MAX_CAPTION_LENGTH + " karakter. Coba lagi.");
    return;
  }

  await saveUploadSession({ ...session, step: "confirm", caption: text });
  await showConfirmation(chatId, session.fileId, session.mediaType, text);
}

async function handleText(message: BotMessage, user: TelegramUser): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";
  const command = commandOf(text);

  if (command === "start") {
    // The channel CTA uses t.me/<bot>?start=upload, which arrives as "/start upload".
    const payload = text.split(/\s+/)[1]?.toLowerCase() ?? "";
    if (payload === "upload") {
      if (!(await requireChannel(chatId, user.id))) return;
      await startUpload(chatId, user.id);
      return;
    }

    await sendMessage(chatId, START_TEXT, { keyboard: openAppKeyboard() });
    return;
  }

  if (command === "howto" || command === "help") {
    await sendMessage(chatId, HOWTO_TEXT, { keyboard: openAppKeyboard() });
    return;
  }

  if (command === "upload" || command === "tambah") {
    if (!(await requireChannel(chatId, user.id))) return;
    await startUpload(chatId, user.id);
    return;
  }

  if (command === "batal" || command === "cancel") {
    await cancelUpload(chatId, user.id);
    return;
  }

  if (command === "notif") {
    const enabled = await toggleNotifyByTelegram(user.id);
    await sendMessage(
      chatId,
      enabled
        ? "Notifikasi dinyalakan. Kamu akan dapat kabar saat kontenmu dinilai atau dikomentari."
        : "Notifikasi dimatikan. Ketik /notif lagi untuk menyalakan.",
    );
    return;
  }

  const session = await getUploadSession(user.id);

  if (!session) {
    await sendMessage(chatId, "Kirim /upload untuk mengunggah foto atau video.");
    return;
  }

  if (session.step === "photo") {
    await sendMessage(
      chatId,
      "Saya masih menunggu foto atau videonya. Kirim sebagai media, bukan teks. /batal untuk membatalkan.",
    );
    return;
  }

  if (text.length === 0) {
    await sendMessage(chatId, "Caption tidak boleh kosong. Kirim teks untuk captionnya.");
    return;
  }

  await handleCaption(chatId, user, text);
}

/** ffmpeg first, Telegram's thumbnail second; null when neither works. */
async function buildVideoPoster(video: Buffer, thumbnailFileId: string | null): Promise<Poster | null> {
  let frame = await extractPoster(video);

  if (!frame && thumbnailFileId) {
    try {
      const file = await getFile(thumbnailFileId);
      if (file.file_path) frame = await downloadFile(file.file_path);
    } catch (error) {
      console.error("[bot] thumbnail download failed", error);
    }
  }

  if (!frame) return null;

  try {
    return await normalisePoster(frame);
  } catch (error) {
    console.error("[bot] poster normalise failed", error);
    return null;
  }
}

async function publish(chatId: number, messageId: number, user: TelegramUser): Promise<void> {
  const session = await getUploadSession(user.id);

  if (
    !session ||
    session.step !== "confirm" ||
    !session.fileId ||
    !session.caption ||
    !session.imageWidth ||
    !session.imageHeight
  ) {
    await editMessageCaption(chatId, messageId, "Sesi upload sudah tidak ada. Kirim /upload untuk mulai lagi.");
    return;
  }

  try {
    const file = await getFile(session.fileId);
    if (!file.file_path) throw new Error("getFile returned no file_path");

    const bytes = await downloadFile(file.file_path);

    if (session.mediaType === "video" && bytes.byteLength > MAX_VIDEO_BYTES) {
      await editMessageCaption(
        chatId,
        messageId,
        "Videonya lebih dari 20 MB. Kirim versi yang lebih kecil dengan /upload.",
      );
      return;
    }

    let slug: string;
    let imageUrl: string;
    let posterUrl: string | null = null;
    let poster: Poster | null = null;
    let width = session.imageWidth;
    let height = session.imageHeight;

    if (session.mediaType === "video") {
      slug = await saveVideo(bytes);
      imageUrl = videoUrl(slug);
      poster = await buildVideoPoster(bytes, session.thumbnailFileId);

      if (poster) {
        await savePoster(slug, poster.bytes).catch((error) =>
          console.error("[bot] poster save failed", error),
        );
        posterUrl = mediaUrl(slug);

        const matched = matchAspect(width, height, poster.width, poster.height);
        width = matched.width;
        height = matched.height;
      }
    } else {
      slug = await savePhoto(bytes);
      imageUrl = mediaUrl(slug);
    }

    // The uploader becomes the owner, so later activity can reach them.
    const owner = await upsertUser({
      telegramId: user.id,
      firstName: user.first_name,
      username: user.username,
      lastName: user.last_name,
      languageCode: user.language_code,
    });

    const photoId = await createPhoto({
      slug,
      caption: session.caption,
      mediaType: session.mediaType,
      imageUrl,
      imageWidth: width,
      imageHeight: height,
      durationSeconds: session.durationSeconds,
      posterUrl,
      userId: owner.id,
    });

    await clearUploadSession(user.id);

    const label = session.mediaType === "video" ? "Video" : "Foto";
    await editMessageCaption(
      chatId,
      messageId,
      "✅ <b>" + label + " kamu sudah masuk feed.</b>\n\nCaption: <i>" + escapeHtml(session.caption) + "</i>",
    );
    await sendMessage(chatId, "Buka app buat lihat dan menilai konten lain.", {
      keyboard: openAppKeyboard(slug),
    });

    // Broadcast and curation are best-effort: the upload already succeeded.
    await postToChannel(
      photoId,
      { mediaType: session.mediaType, slug, fileId: session.fileId, bytes, poster },
      session.caption,
    );
    await notifyOwner(photoId, session.fileId, session.mediaType, session.caption);
  } catch (error) {
    console.error("[bot] publish failed", error);
    await editMessageCaption(chatId, messageId, "Gagal menyimpan konten. Kirim ulang dengan /upload.");
  }
}

async function handleCallback(update: BotUpdate): Promise<void> {
  const query = update.callback_query;
  if (!query) return;

  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

  // Owner-only buttons: anyone who sees the message can press them otherwise.
  if (query.data?.startsWith("del:")) {
    const photoId = Number(query.data.slice(4));
    if (query.from.id !== ownerTelegramId() || !Number.isInteger(photoId)) {
      await answerCallbackQuery(query.id, "Bukan untuk kamu").catch(() => undefined);
      return;
    }

    await answerCallbackQuery(query.id).catch(() => undefined);
    if (chatId !== undefined && messageId !== undefined) {
      await removePhoto(photoId, chatId, messageId);
    }
    return;
  }

  // Stop the client-side spinner before doing any slow work.
  await answerCallbackQuery(query.id).catch(() => undefined);

  if (chatId === undefined || messageId === undefined) return;

  if (query.data === "cancel") {
    await clearUploadSession(query.from.id);
    await editMessageCaption(chatId, messageId, "Upload dibatalkan.");
    return;
  }

  if (query.data === "publish") {
    await publish(chatId, messageId, query.from);
    return;
  }

  if (query.data === "notif:off") {
    await setNotifyByTelegram(query.from.id, false);
    await sendMessage(chatId, "Notifikasi dimatikan. Ketik /notif untuk menyalakan lagi.");
  }
}

/** Entry point for every webhook update. Never throws: the webhook always acks. */
export async function handleUpdate(update: BotUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update);
    return;
  }

  const message = update.message;
  const user = message?.from;
  if (!message || !user) return;

  if (message.chat.type !== "private") {
    await sendMessage(message.chat.id, "Upload hanya bisa lewat chat pribadi dengan bot.");
    return;
  }

  // Any private message proves the user has started the bot.
  await markBotStarted({
    telegramId: user.id,
    firstName: user.first_name,
    username: user.username,
    lastName: user.last_name,
    languageCode: user.language_code,
  });

  if (message.video) {
    await handleVideo(message, user);
    return;
  }

  if (message.photo && message.photo.length > 0) {
    await handlePhoto(message, user);
    return;
  }

  if (message.text) {
    await handleText(message, user);
  }
}
