import {
  claimMonthlyReward,
  getMonthlyReward,
  isUploadBlocked,
  markBotStarted,
  markChannelPost,
  setNotifyByTelegram,
  toggleAnonymousByTelegram,
  toggleNotifyByTelegram,
  upsertUser,
} from "@/db/queries";
import {
  clearReportSession,
  createReport,
  getReportSession,
  getReportTarget,
  saveReportSession,
} from "@/db/reports";
import {
  clearUploadSession,
  createPhoto,
  getUploadSession,
  saveUploadSession,
  type ContentGender,
  type MediaType,
  type UploadSession,
} from "@/db/upload";
import { HOW_TO_NOTE, HOW_TO_TIPS } from "@/lib/how-to";
import { leaderboardWindow, WIB_TIME_ZONE } from "@/lib/leaderboard-period";
import { recordEvent } from "@/lib/analytics/record";
import { adminUrl, shareUrlFor, statsUrl, uploadUrl } from "@/lib/share";
import type { TelegramUser } from "@/types/telegram";
import {
  answerCallbackQuery,
  deleteMessage,
  downloadFile,
  editMessageCaption,
  editMessageText,
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
  mediaUrl,
  readMedia,
  savePhoto,
  savePoster,
  saveVideo,
  videoUrl,
} from "./media";
import { overlayNsfwBadge } from "./nsfw-badge";
import {
  rewardClaimOwnerNotice,
  rewardClaimText,
  rewardNotEligibleText,
} from "./format";
import type { BotMessage, BotUpdate, InlineKeyboardMarkup } from "./types";
import { extractPoster, extractTeaser, matchAspect, normalisePoster, type Poster } from "./video";

const MAX_CAPTION_LENGTH = 500;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
/** Bot API refuses to download files larger than this via getFile. */
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

function appUrl(): string {
  return (process.env.APP_URL ?? "https://bot.linkviu.my.id").replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseScheduledAtWib(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day, hour - 7, minute);
  const local = new Date(timestamp + 7 * 60 * 60_000);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute
  ) {
    return null;
  }

  const result = new Date(timestamp);
  return result.getTime() > Date.now() ? result : null;
}

function formatWib(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date) + " WIB";
}

function scheduleInputExample(): string {
  const date = new Date(Date.now() + 2 * 24 * 60 * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return value("year") + "-" + value("month") + "-" + value("day") + " 19:30";
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

/**
 * Owner picks between publishing now and joining the scheduled queue; everyone
 * else only ever publishes immediately.
 */
function confirmKeyboard(isOwner: boolean): InlineKeyboardMarkup {
  if (isOwner) {
    return {
      inline_keyboard: [
        [{ text: "✅ Upload sekarang", callback_data: "publish" }],
        [{ text: "🕒 Atur waktu tayang", callback_data: "publish:schedule" }],
        [{ text: "✕ Batal", callback_data: "cancel" }],
      ],
    };
  }

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
  // Bold + quotes separate the upload's caption from the call to action.
  return "<b>“" + escapeHtml(caption) + "”</b>\n\n" + CHANNEL_CTA;
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
  /** Absent when re-posting from disk after an owner 18+ action. */
  fileId?: string;
  /** Original bytes, used to build the blurred teaser. */
  bytes?: Buffer;
  /** Video still frame; also the source of the blurred cover. */
  poster: Poster | null;
};

/**
 * Publishes a blurred teaser of the upload to the channel; a failure must not
 * undo the upload. For 18+ the blur is stronger and the badge is burned in;
 * if that fails, the original is only sent behind Telegram's spoiler.
 */
export async function postToChannel(
  photoId: number,
  media: ChannelMedia,
  caption: string,
  isNsfw: boolean,
): Promise<boolean> {
  if (!channelConfigured()) return false;

  const options = {
    caption: channelCaption(caption),
    keyboard: {
      inline_keyboard: [
        [
          { text: "Lihat versi jelas", url: shareUrlFor(media.slug) },
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
      const videoBytes = media.bytes ?? await readMedia(media.slug, "mp4");
      let teaser: Buffer | null = null;

      if (videoBytes) {
        try {
          teaser = await extractTeaser(videoBytes, { nsfw: isNsfw });
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
            if (isNsfw) thumbnail = await overlayNsfwBadge(thumbnail);
          } catch (error) {
            console.error("[bot] channel thumbnail blur failed", error);
            thumbnail = null;
          }
        }

        // Without a blurred cover, fall back to Telegram's spoiler overlay so
        // the channel still does not reveal the frame.
        if (media.fileId) {
          message = await sendVideo(channelId(), media.fileId, {
            ...options,
            thumbnail: thumbnail ?? undefined,
            spoiler: thumbnail === null,
          });
        } else if (media.bytes) {
          message = await sendVideoFile(channelId(), media.bytes, {
            ...options,
            spoiler: true,
          });
        } else {
          throw new Error("no video source for channel post");
        }
      }
    } else {
      let blurred: Buffer | null = null;

      try {
        if (media.bytes) {
          blurred = await blurPhoto(media.bytes);
          if (isNsfw) blurred = await overlayNsfwBadge(blurred);
        }
      } catch (error) {
        console.error("[bot] channel blur failed", error);
        blurred = null;
      }

      if (blurred) {
        message = await sendPhotoFile(channelId(), blurred, options);
      } else if (media.fileId) {
        // The original is never posted unblurred, 18+ or not.
        message = await sendPhoto(channelId(), media.fileId, {
          ...options,
          spoiler: true,
        });
      } else if (media.bytes) {
        message = await sendPhotoFile(channelId(), media.bytes, {
          ...options,
          spoiler: true,
        });
      } else {
        throw new Error("no photo source for channel post");
      }
    }

    await markChannelPost(photoId, message.message_id);
    return true;
  } catch (error) {
    console.error("[bot] channel post failed", error);
    return false;
  }
}

/** Claim timestamps are always shown in Jakarta time. */
const REWARD_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: WIB_TIME_ZONE,
});

const START_TEXT = [
  "<b>RetPAP</b>",
  "",
  "Upload foto/video: /upload",
  "Komentar tanpa nama: /anon",
  "Hadiah Top PAP: /reward",
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
  "<b>Langkah 1/4</b>",
  "",
  "Kirim foto atau video sekarang. Video maksimal 1 menit dan 20 MB.",
  "",
  "Setelah itu saya minta caption.",
  "",
  "Ketik /batal kalau berubah pikiran.",
].join("\n");

const ASK_CAPTION_TEXT = [
  "<b>Langkah 2/4</b>",
  "",
  "Sekarang kirim caption untuk foto atau video ini (teks biasa, maksimal " + MAX_CAPTION_LENGTH + " karakter).",
  "",
  "Ketik /batal kalau berubah pikiran.",
].join("\n");

const ASK_GENDER_TEXT = [
  "<b>Langkah 3/4</b>",
  "",
  "Konten ini dari cewek atau cowok?",
  "",
  "Jawaban ini dipakai untuk filter feed, jadi penonton bisa memilih mau lihat yang mana.",
].join("\n");

const ASK_NSFW_TEXT = [
  "<b>Langkah 4/4</b>",
  "",
  "Konten ini mengandung 18+?",
  "",
  "Kalau ya, konten diberi blur lebih kuat dan badge 18+ saat dikirim ke channel.",
].join("\n");

function genderQuestionKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Cewek", callback_data: "genderans:female" },
        { text: "Cowok", callback_data: "genderans:male" },
      ],
    ],
  };
}

function nsfwQuestionKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Ya, 18+", callback_data: "nsfwans:yes" },
        { text: "Bukan", callback_data: "nsfwans:no" },
      ],
    ],
  };
}

function confirmText(
  caption: string,
  gender: ContentGender,
  isNsfw: boolean,
  isOwner: boolean,
): string {
  return [
    "<b>Konfirmasi upload</b>",
    "",
    "Caption: <i>" + escapeHtml(caption) + "</i>",
    "Konten: <b>" + (gender === "female" ? "Cewek" : "Cowok") + "</b>",
    "18+: <b>" + (isNsfw ? "Ya" : "Tidak") + "</b>",
    "",
    isOwner
      ? "Upload sekarang, atau tentukan tanggal dan waktu tayangnya?"
      : "Upload sekarang? Konten akan muncul di feed dan bisa di-rating semua orang.",
  ].join("\n");
}

function commandOf(text: string | undefined): string | null {
  if (!text || !text.startsWith("/")) return null;
  return text.slice(1).split(/[\s@]/)[0].toLowerCase();
}

/**
 * Owner-imposed upload ban. Reading, rating and reacting stay available; only
 * new uploads are refused, so a blocked account cannot spam again.
 */
async function canUpload(chatId: number, telegramId: number): Promise<boolean> {
  if (!(await isUploadBlocked(telegramId))) return true;

  await sendMessage(
    chatId,
    "Akunmu diblokir dari upload karena terdeteksi spam. Kamu masih bisa melihat dan memberi rate di feed.",
  );
  return false;
}

async function startUpload(chatId: number, telegramId: number): Promise<void> {
  if (!(await canUpload(chatId, telegramId))) return;

  // One flow at a time: a new upload drops a pending report.
  await clearReportSession(telegramId);

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
    isNsfw: null,
    gender: null,
  });
  void recordEvent({
    name: "upload_step",
    telegramId,
    meta: { step: "photo", media: "photo" },
  });
  await sendMessage(chatId, ASK_MEDIA_TEXT);
}

/**
 * /batal owns every flow: only the active one is cancelled, and an idle chat is
 * told so instead of pretending an upload was in progress.
 */
async function cancelActiveFlow(chatId: number, telegramId: number): Promise<void> {
  if (await getReportSession(telegramId)) {
    await clearReportSession(telegramId);
    await sendMessage(chatId, "Laporan dibatalkan.");
    return;
  }

  const session = await getUploadSession(telegramId);
  await clearUploadSession(telegramId);
  await sendMessage(chatId, session ? "Upload dibatalkan." : "Tidak ada yang bisa dibatalkan.");
}

/** Prefix of the `?start=` payload used by the feed report button. */
const REPORT_START_PREFIX = "r_";

/**
 * The feed opens this deep link, so the report starts in the bot chat: the
 * next plain text message becomes the body. No reason list, no rate limit.
 */
async function startReport(chatId: number, telegramId: number, payload: string): Promise<void> {
  const photoId = Number(payload.slice(REPORT_START_PREFIX.length));
  const target = await getReportTarget(photoId);

  if (!target) {
    await sendMessage(chatId, "Konten yang mau dilaporkan sudah tidak tersedia.");
    return;
  }

  // One flow at a time: a report drops a pending upload.
  await clearUploadSession(telegramId);
  await saveReportSession(telegramId, target.id);
  await sendMessage(
    chatId,
    [
      "🚩 <b>Laporkan PAP #" + target.id + "</b>",
      "",
      "Caption: <i>" + escapeHtml(target.caption) + "</i>",
      "",
      "Tulis laporanmu dalam satu pesan. Ketik /batal untuk keluar.",
    ].join("\n"),
    { keyboard: { inline_keyboard: [[{ text: "✕ Batal", callback_data: "reportcancel" }]] } },
  );
}

/** Owner only needs to know something came in; the details live in /admin. */
async function notifyOwnerReport(photoId: number): Promise<void> {
  const ownerId = ownerTelegramId();
  if (ownerId === null) return;

  try {
    await sendMessage(ownerId, "📩 Ada laporan baru masuk untuk PAP #" + photoId + ".", {
      keyboard: { inline_keyboard: [[{ text: "Buka admin", url: adminUrl() }]] },
    });
  } catch (error) {
    console.error("[bot] report owner notice failed", error);
  }
}

async function askGender(
  chatId: number,
  fileId: string,
  mediaType: MediaType,
): Promise<void> {
  const options = { caption: ASK_GENDER_TEXT, keyboard: genderQuestionKeyboard() };

  if (mediaType === "video") {
    await sendVideo(chatId, fileId, options);
    return;
  }

  await sendPhoto(chatId, fileId, options);
}

async function askNsfw(
  chatId: number,
  fileId: string,
  mediaType: MediaType,
): Promise<void> {
  const options = { caption: ASK_NSFW_TEXT, keyboard: nsfwQuestionKeyboard() };

  if (mediaType === "video") {
    await sendVideo(chatId, fileId, options);
    return;
  }

  await sendPhoto(chatId, fileId, options);
}

async function showConfirmation(
  chatId: number,
  fileId: string,
  mediaType: MediaType,
  caption: string,
  gender: ContentGender,
  isNsfw: boolean,
  isOwner: boolean,
): Promise<void> {
  const options = {
    caption: confirmText(caption, gender, isNsfw, isOwner),
    keyboard: confirmKeyboard(isOwner),
  };

  if (mediaType === "video") {
    await sendVideo(chatId, fileId, options);
    return;
  }

  await sendPhoto(chatId, fileId, options);
}

async function handlePhoto(message: BotMessage, user: TelegramUser): Promise<void> {
  // A pending report only accepts text; media would silently start an upload
  // and lose the report target.
  if (await getReportSession(user.id)) {
    await sendMessage(message.chat.id, "Laporan berupa teks ya. Ketik /batal untuk keluar.");
    return;
  }

  if (!(await requireChannel(message.chat.id, user.id))) return;
  if (!(await canUpload(message.chat.id, user.id))) return;

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
    isNsfw: null,
    gender: null,
  });

  void recordEvent({
    name: "upload_step",
    telegramId: user.id,
    meta: { step: caption ? "confirm" : "caption", media: "photo" },
  });

  if (caption) {
    await askGender(message.chat.id, largest.file_id, "photo");
    return;
  }

  await sendPhoto(message.chat.id, largest.file_id, { caption: ASK_CAPTION_TEXT });
}

async function handleVideo(message: BotMessage, user: TelegramUser): Promise<void> {
  // A pending report only accepts text; media would silently start an upload
  // and lose the report target.
  if (await getReportSession(user.id)) {
    await sendMessage(message.chat.id, "Laporan berupa teks ya. Ketik /batal untuk keluar.");
    return;
  }

  if (!(await requireChannel(message.chat.id, user.id))) return;
  if (!(await canUpload(message.chat.id, user.id))) return;

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
    isNsfw: null,
    gender: null,
  });

  void recordEvent({
    name: "upload_step",
    telegramId: user.id,
    meta: { step: caption ? "confirm" : "caption", media: "video" },
  });

  if (caption) {
    await askGender(message.chat.id, video.file_id, "video");
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

  await saveUploadSession({
    ...session,
    step: "confirm",
    caption: text,
    isNsfw: null,
    gender: null,
  });
  void recordEvent({
    name: "upload_step",
    telegramId: user.id,
    meta: { step: "confirm", media: session.mediaType },
  });
  await askGender(chatId, session.fileId, session.mediaType);
}

/**
 * Monthly reward claim. One winner per month, claimable once, and only until
 * the month ends. The conditional update inside claimMonthlyReward is what
 * makes two simultaneous claims impossible.
 */
async function handleReward(chatId: number, user: TelegramUser): Promise<void> {
  const window = leaderboardWindow("month");
  const reward =
    window.start === null ? null : await getMonthlyReward(window.start);

  if (!reward) {
    void recordEvent({ name: "reward_claim", telegramId: user.id, meta: { outcome: "not_announced" } });
    await sendMessage(
      chatId,
      [
        "🏆 <b>Top PAP bulan ini belum diumumkan.</b>",
        "",
        "Pemenang dan hadiahnya diumumkan lewat channel. Setelah itu baru bisa diklaim dengan /reward.",
      ].join("\n"),
    );
    return;
  }

  // Eligibility comes before status: a stranger must never learn whether
  // someone else already claimed, only who the prize belongs to.
  if (reward.telegramId !== user.id) {
    void recordEvent({
      name: "reward_claim",
      telegramId: user.id,
      photoId: reward.photoId,
      meta: { outcome: "not_winner" },
    });
    await sendMessage(chatId, rewardNotEligibleText(reward));
    return;
  }

  if (reward.claimedAt !== null) {
    void recordEvent({
      name: "reward_claim",
      telegramId: user.id,
      photoId: reward.photoId,
      meta: { outcome: "already_claimed" },
    });
    const when = REWARD_DATE.format(reward.claimedAt);
    await sendMessage(
      chatId,
      "Hadiah bulan ini sudah kamu klaim (" + when + ") · " + reward.amount + " Stars.",
    );
    return;
  }

  if (Date.now() >= reward.periodEnd.getTime()) {
    void recordEvent({
      name: "reward_claim",
      telegramId: user.id,
      photoId: reward.photoId,
      meta: { outcome: "closed" },
    });
    await sendMessage(chatId, "Klaim hadiah bulan ini sudah ditutup.");
    return;
  }

  if (!(await claimMonthlyReward(reward.id, user.id))) {
    void recordEvent({
      name: "reward_claim",
      telegramId: user.id,
      photoId: reward.photoId,
      meta: { outcome: "race_lost" },
    });
    await sendMessage(chatId, "Hadiah ini sudah diklaim.");
    return;
  }

  void recordEvent({
    name: "reward_claim",
    telegramId: user.id,
    photoId: reward.photoId,
    meta: { outcome: "claimed" },
  });
  await sendMessage(chatId, rewardClaimText(reward));

  const ownerId = ownerTelegramId();
  if (ownerId !== null && ownerId !== user.id) {
    await sendMessage(
      ownerId,
      rewardClaimOwnerNotice({
        claimant: {
          firstName: user.first_name,
          username: user.username,
          telegramId: user.id,
        },
        caption: reward.caption,
        avgScore: reward.avgScore,
        votes: reward.votes,
        amount: reward.amount,
      }),
    ).catch(() => undefined);
  }
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

    // The "Klaim hadiah" button on the monthly recap lands here.
    if (payload === "reward") {
      await handleReward(chatId, user);
      return;
    }

    // The report button in the feed carries the photo id: "r_123".
    if (payload.startsWith(REPORT_START_PREFIX)) {
      await startReport(chatId, user.id, payload);
      return;
    }

    await sendMessage(chatId, START_TEXT, { keyboard: openAppKeyboard() });
    return;
  }

  if (command === "howto" || command === "help") {
    await sendMessage(chatId, HOWTO_TEXT, { keyboard: openAppKeyboard() });
    return;
  }

  // Anonymous comments are a per-user toggle: the name is dropped from the
  // comment itself and from the uploader's notification.
  if (command === "anon") {
    const anonymous = await toggleAnonymousByTelegram(user.id);
    await sendMessage(
      chatId,
      anonymous
        ? "🕶 <b>Mode anonim aktif.</b>\n\nKomentarmu tampil sebagai <b>Anonim</b>, dan notifikasi ke pemilik foto tidak menyebut namamu. Ketik /anon lagi untuk mematikan."
        : "Mode anonim <b>mati</b>. Komentar barumu menampilkan namamu lagi.",
    );
    return;
  }

  if (command === "upload" || command === "tambah") {
    if (!(await requireChannel(chatId, user.id))) return;
    await startUpload(chatId, user.id);
    return;
  }

  if (command === "batal" || command === "cancel") {
    await cancelActiveFlow(chatId, user.id);
    return;
  }

  if (command === "stats") {
    if (user.id !== ownerTelegramId()) {
      await sendMessage(chatId, "Command ini hanya untuk owner.");
      return;
    }

    await sendMessage(chatId, "Analytics RetPAP 👇", {
      keyboard: { inline_keyboard: [[{ text: "Buka Stats", url: statsUrl() }]] },
    });
    return;
  }

  if (command === "reward") {
    await handleReward(chatId, user);
    return;
  }

  if (command === "notif") {
    const enabled = await toggleNotifyByTelegram(user.id);
    await sendMessage(
      chatId,
      enabled
        ? "Notifikasi dinyalakan. Kamu akan dapat kabar saat kontenmu di-rating atau dikomentari."
        : "Notifikasi dimatikan. Ketik /notif lagi untuk menyalakan.",
    );
    return;
  }

  const report = await getReportSession(user.id);

  if (report) {
    if (text.length === 0) {
      await sendMessage(chatId, "Tulis laporanmu dalam satu pesan. Ketik /batal untuk keluar.");
      return;
    }

    await createReport(user.id, report.photoId, text);
    await clearReportSession(user.id);

    const target = await getReportTarget(report.photoId);
    await sendMessage(chatId, "✅ Laporan diterima. Tim akan meninjau konten ini.", {
      keyboard: target ? openAppKeyboard(target.slug) : openAppKeyboard(),
    });
    await notifyOwnerReport(report.photoId);
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

  if (session.step === "schedule") {
    await handleScheduleText(chatId, user, text);
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

/**
 * Shared gate for both publish paths: ban, session completeness, and the two
 * questions. Returns null when it already answered the chat.
 */
async function readySession(
  chatId: number,
  messageId: number,
  user: TelegramUser,
  scheduled = false,
): Promise<UploadSession | null> {
  // A session can be older than the ban, so the final gate re-checks it.
  if (!(await canUpload(chatId, user.id))) {
    await clearUploadSession(user.id);
    return null;
  }

  const session = await getUploadSession(user.id);

  if (
    !session ||
    session.step !== "confirm" ||
    !session.fileId ||
    !session.caption ||
    !session.imageWidth ||
    !session.imageHeight
  ) {
    const message = "Sesi upload sudah tidak ada. Kirim /upload untuk mulai lagi.";
    if (scheduled) await sendMessage(chatId, message);
    else await editMessageCaption(chatId, messageId, message);
    return null;
  }

  if (session.gender === null) {
    await askGender(chatId, session.fileId, session.mediaType);
    return null;
  }

  if (session.isNsfw === null) {
    await askNsfw(chatId, session.fileId, session.mediaType);
    return null;
  }

  return session;
}

async function publish(
  chatId: number,
  messageId: number,
  user: TelegramUser,
  scheduledAt: Date | null = null,
): Promise<void> {
  const session = await readySession(chatId, messageId, user, scheduledAt !== null);
  if (
    !session ||
    !session.fileId ||
    !session.caption ||
    !session.imageWidth ||
    !session.imageHeight ||
    session.gender === null ||
    session.isNsfw === null
  ) {
    return;
  }

  const isNsfw = session.isNsfw;

  try {
    const file = await getFile(session.fileId);
    if (!file.file_path) throw new Error("getFile returned no file_path");

    const bytes = await downloadFile(file.file_path);

    if (session.mediaType === "video" && bytes.byteLength > MAX_VIDEO_BYTES) {
      const message = "Videonya lebih dari 20 MB. Kirim versi yang lebih kecil dengan /upload.";
      if (scheduledAt) await sendMessage(chatId, message);
      else await editMessageCaption(chatId, messageId, message);
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
      isNsfw,
      gender: session.gender,
      scheduledAt,
    });

    await clearUploadSession(user.id);

    void recordEvent({
      name: scheduledAt ? "upload_scheduled" : "upload_published",
      telegramId: user.id,
      userId: owner.id,
      photoId,
      meta: {
        media: session.mediaType,
        gender: session.gender,
        nsfw: isNsfw,
        scheduledAt: scheduledAt?.toISOString() ?? null,
      },
    });

    const label = session.mediaType === "video" ? "Video" : "Foto";
    if (scheduledAt) {
      await sendMessage(
        chatId,
        "🕒 <b>" + label + " dijadwalkan.</b>\n\nTayang " + formatWib(scheduledAt) +
          "\n\nCaption: <i>" + escapeHtml(session.caption) + "</i>",
        { keyboard: openAppKeyboard() },
      ).catch((error) => console.error("[bot] scheduled upload confirmation failed", error));
      return;
    }

    await editMessageCaption(
      chatId,
      messageId,
      "✅ <b>" +
        label +
        " kamu sudah masuk feed.</b>\n\n" +
        (isNsfw ? "18+: <b>Ya</b>\n" : "") +
        "Caption: <i>" +
        escapeHtml(session.caption) +
        "</i>",
    );
    await sendMessage(chatId, "Buka app buat kasih rating konten lain.", {
      keyboard: openAppKeyboard(slug),
    });

    // Broadcast and curation are best-effort: the upload already succeeded.
    await postToChannel(
      photoId,
      { mediaType: session.mediaType, slug, fileId: session.fileId, bytes, poster },
      session.caption,
      isNsfw,
    );
    // Owner tidak lagi dapat DM per upload: kurasi lewat halaman admin.
  } catch (error) {
    console.error("[bot] publish failed", error);
    if (scheduledAt) {
      await sendMessage(chatId, "Gagal menjadwalkan konten. Kirim /upload untuk mencoba lagi.").catch(() => undefined);
    } else {
      await editMessageCaption(chatId, messageId, "Gagal menyimpan konten. Kirim ulang dengan /upload.");
    }
  }
}

async function askScheduledAt(chatId: number, messageId: number, user: TelegramUser): Promise<void> {
  if (user.id !== ownerTelegramId()) {
    await editMessageCaption(chatId, messageId, "Penjadwalan hanya untuk owner.");
    return;
  }

  const session = await getUploadSession(user.id);
  if (!session || session.step !== "confirm" || !session.fileId || !session.caption) {
    await editMessageCaption(chatId, messageId, "Sesi upload sudah tidak ada. Kirim /upload untuk mulai lagi.");
    return;
  }

  await saveUploadSession({ ...session, step: "schedule" });
  await editMessageCaption(
    chatId,
    messageId,
    "Kirim tanggal dan waktu tayang dalam WIB dengan format <code>YYYY-MM-DD HH:mm</code>.\n\nContoh: <code>" + scheduleInputExample() + "</code>\n\nKetik /batal untuk membatalkan.",
  );
}

async function handleScheduleText(chatId: number, user: TelegramUser, text: string): Promise<void> {
  if (user.id !== ownerTelegramId()) {
    await clearUploadSession(user.id);
    await sendMessage(chatId, "Penjadwalan hanya untuk owner.");
    return;
  }

  const session = await getUploadSession(user.id);
  if (!session || session.step !== "schedule" || !session.fileId || !session.caption) {
    await sendMessage(chatId, "Sesi penjadwalan tidak ditemukan. Kirim /upload untuk mulai lagi.");
    return;
  }

  const scheduledAt = parseScheduledAtWib(text);
  if (!scheduledAt) {
    await sendMessage(
      chatId,
      "Tanggal/waktu tidak valid atau sudah lewat. Kirim waktu mendatang dengan format <code>YYYY-MM-DD HH:mm</code> WIB, misalnya <code>" + scheduleInputExample() + "</code>.",
    );
    return;
  }

  await saveUploadSession({ ...session, step: "confirm" });
  const notice = await sendMessage(chatId, "Menyimpan jadwal tayang " + formatWib(scheduledAt) + "…");
  await publish(chatId, notice.message_id, user, scheduledAt);
}

async function handleCallback(update: BotUpdate): Promise<void> {
  const query = update.callback_query;
  if (!query) return;

  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

  // Stop the client-side spinner before doing any slow work.
  await answerCallbackQuery(query.id).catch(() => undefined);

  if (chatId === undefined || messageId === undefined) return;

  if (query.data === "genderans:female" || query.data === "genderans:male") {
    const session = await getUploadSession(query.from.id);

    if (!session || session.step !== "confirm" || !session.fileId || !session.caption) {
      await editMessageCaption(chatId, messageId, "Sesi upload sudah tidak ada. Kirim /upload untuk mulai lagi.");
      return;
    }

    const gender: ContentGender = query.data === "genderans:female" ? "female" : "male";
    await saveUploadSession({ ...session, gender });
    void recordEvent({
      name: "upload_step",
      telegramId: query.from.id,
      meta: { step: "confirm", question: "gender", gender },
    });
    await editMessageCaption(
      chatId,
      messageId,
      "Konten: <b>" + (gender === "female" ? "Cewek" : "Cowok") + "</b>",
    ).catch(() => undefined);
    await askNsfw(chatId, session.fileId, session.mediaType);
    return;
  }

  if (query.data === "nsfwans:yes" || query.data === "nsfwans:no") {
    const session = await getUploadSession(query.from.id);

    if (!session || session.step !== "confirm" || !session.fileId || !session.caption) {
      await editMessageCaption(chatId, messageId, "Sesi upload sudah tidak ada. Kirim /upload untuk mulai lagi.");
      return;
    }

    if (session.gender === null) {
      await askGender(chatId, session.fileId, session.mediaType);
      return;
    }

    const isNsfw = query.data === "nsfwans:yes";
    await saveUploadSession({ ...session, isNsfw });
    void recordEvent({
      name: "upload_step",
      telegramId: query.from.id,
      meta: { step: "confirm", question: "nsfw", nsfw: isNsfw },
    });
    await editMessageCaption(
      chatId,
      messageId,
      "18+: <b>" + (isNsfw ? "Ya" : "Tidak") + "</b>",
    ).catch(() => undefined);
    await showConfirmation(
      chatId,
      session.fileId,
      session.mediaType,
      session.caption,
      session.gender,
      isNsfw,
      query.from.id === ownerTelegramId(),
    );
    return;
  }

  if (query.data === "cancel") {
    await clearUploadSession(query.from.id);
    await editMessageCaption(chatId, messageId, "Upload dibatalkan.");
    return;
  }

  if (query.data === "reportcancel") {
    await clearReportSession(query.from.id);
    await editMessageText(chatId, messageId, "Laporan dibatalkan.").catch(() => undefined);
    return;
  }

  if (query.data === "publish") {
    await publish(chatId, messageId, query.from);
    return;
  }

  if (query.data === "publish:schedule") {
    await askScheduledAt(chatId, messageId, query.from);
    return;
  }

  if (query.data === "notif:off") {
    await setNotifyByTelegram(query.from.id, false);
    await sendMessage(chatId, "Notifikasi dimatikan. Ketik /notif untuk menyalakan lagi.");
  }
}

/** How long the group greeting stays visible before the bot deletes it. */
const GROUP_WELCOME_MS = 3000;

/** Greets a new group member, then removes the greeting to keep the chat clean. */
async function welcomeGroupMember(chatId: number, member: TelegramUser): Promise<void> {
  const handle = member.username ? "@" + member.username : member.first_name;
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() || "retpapbot";

  const text = [
    "<b>👋 Selamat datang, " + escapeHtml(handle) + "!</b>",
    "",
    "Konten PAP ada di channel. Di sini tempat ngobrol.",
    "Buka aplikasinya lewat bot: @" + botUsername,
  ].join("\n");

  try {
    const sent = await sendMessage(chatId, text);
    setTimeout(() => {
      void deleteMessage(chatId, sent.message_id).catch(() => undefined);
    }, GROUP_WELCOME_MS);
  } catch (error) {
    console.error("[bot] group welcome failed", error);
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

  // Group and channel chats are ignored without a reply: the bot has nothing
  // to do there, and answering every group message spams the chat. The one
  // exception is a join, which gets a short greeting.
  if (message.chat.type !== "private") {
    const joined = (message.new_chat_members ?? []).filter((member) => member.is_bot !== true);
    for (const member of joined) await welcomeGroupMember(message.chat.id, member);
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
