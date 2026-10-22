import { markBotStarted, setNotifyByTelegram, toggleNotifyByTelegram, upsertUser } from "@/db/queries";
import { clearUploadSession, createPhoto, getUploadSession, saveUploadSession } from "@/db/upload";
import { shareUrlFor } from "@/lib/share";
import type { TelegramUser } from "@/types/telegram";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageCaption,
  getFile,
  sendMessage,
  sendPhoto,
} from "./api";
import { mediaUrl, savePhoto } from "./media";
import type { BotMessage, BotUpdate, InlineKeyboardMarkup } from "./types";

const MAX_CAPTION_LENGTH = 500;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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
        { text: "✅ Terbitkan", callback_data: "publish" },
        { text: "✕ Batal", callback_data: "cancel" },
      ],
    ],
  };
}

const START_TEXT = [
  "<b>RetPAP</b>",
  "",
  "Kasih nilai foto orang lain, atau unggah foto kamu sendiri.",
  "",
  "<b>Cara upload PAP untuk dinilai:</b>",
  "1. Ketik /upload",
  "2. Kirim fotonya (sebagai foto, bukan file)",
  "3. Kirim caption",
  "4. Tekan ✅ Terbitkan",
  "",
  "Setelah terbit, fotomu masuk feed dan bisa dinilai orang lain.",
  "",
  "/batal — batalkan upload",
].join("\n");

const ASK_PHOTO_TEXT = [
  "<b>Langkah 1/2</b>",
  "",
  "Kirim fotonya sekarang. Setelah itu saya minta caption.",
  "",
  "Ketik /batal kalau berubah pikiran.",
].join("\n");

const ASK_CAPTION_TEXT = [
  "<b>Langkah 2/2</b>",
  "",
  "Sekarang kirim caption untuk foto ini (teks biasa, maksimal " + MAX_CAPTION_LENGTH + " karakter).",
  "",
  "Ketik /batal kalau berubah pikiran.",
].join("\n");

function confirmText(caption: string): string {
  return [
    "<b>Konfirmasi upload</b>",
    "",
    "Caption: <i>" + escapeHtml(caption) + "</i>",
    "",
    "Terbitkan sekarang? Foto akan muncul di feed dan bisa dinilai semua orang.",
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
    fileId: null,
    imageWidth: null,
    imageHeight: null,
    caption: null,
  });
  await sendMessage(chatId, ASK_PHOTO_TEXT);
}

async function cancelUpload(chatId: number, telegramId: number): Promise<void> {
  await clearUploadSession(telegramId);
  await sendMessage(chatId, "Upload dibatalkan.");
}

async function showConfirmation(chatId: number, fileId: string, caption: string): Promise<void> {
  await sendPhoto(chatId, fileId, { caption: confirmText(caption), keyboard: confirmKeyboard() });
}

async function handlePhoto(message: BotMessage, user: TelegramUser): Promise<void> {
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
    fileId: largest.file_id,
    imageWidth: largest.width,
    imageHeight: largest.height,
    caption: caption || null,
  });

  if (caption) {
    await showConfirmation(message.chat.id, largest.file_id, caption);
    return;
  }

  await sendPhoto(message.chat.id, largest.file_id, { caption: ASK_CAPTION_TEXT });
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
  await showConfirmation(chatId, session.fileId, text);
}

async function handleText(message: BotMessage, user: TelegramUser): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";
  const command = commandOf(text);

  if (command === "start" || command === "help") {
    await sendMessage(chatId, START_TEXT, { keyboard: openAppKeyboard() });
    return;
  }

  if (command === "upload" || command === "tambah") {
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
        ? "Notifikasi dinyalakan. Kamu akan dapat kabar saat fotomu dinilai atau dikomentari."
        : "Notifikasi dimatikan. Ketik /notif lagi untuk menyalakan.",
    );
    return;
  }

  const session = await getUploadSession(user.id);

  if (!session) {
    await sendMessage(chatId, "Kirim /upload untuk mengunggah foto.");
    return;
  }

  if (session.step === "photo") {
    await sendMessage(chatId, "Saya masih menunggu fotonya. Kirim sebagai foto, bukan teks. /batal untuk membatalkan.");
    return;
  }

  if (text.length === 0) {
    await sendMessage(chatId, "Caption tidak boleh kosong. Kirim teks untuk captionnya.");
    return;
  }

  await handleCaption(chatId, user, text);
}

async function publish(chatId: number, messageId: number, user: TelegramUser): Promise<void> {
  const session = await getUploadSession(user.id);

  if (!session || session.step !== "confirm" || !session.fileId || !session.caption || !session.imageWidth || !session.imageHeight) {
    await editMessageCaption(chatId, messageId, "Sesi upload sudah tidak ada. Kirim /upload untuk mulai lagi.");
    return;
  }

  try {
    const file = await getFile(session.fileId);
    if (!file.file_path) throw new Error("getFile returned no file_path");

    const bytes = await downloadFile(file.file_path);
    const slug = await savePhoto(bytes);

    // The uploader becomes the owner, so later activity can reach them.
    const owner = await upsertUser({
      telegramId: user.id,
      firstName: user.first_name,
      username: user.username,
      lastName: user.last_name,
      languageCode: user.language_code,
    });

    await createPhoto({
      slug,
      caption: session.caption,
      imageUrl: mediaUrl(slug),
      imageWidth: session.imageWidth,
      imageHeight: session.imageHeight,
      userId: owner.id,
    });

    await clearUploadSession(user.id);

    await editMessageCaption(chatId, messageId, "✅ <b>Terbit!</b>\n\nCaption: <i>" + escapeHtml(session.caption) + "</i>");
    await sendMessage(chatId, "Fotonya sudah masuk feed dan jadi yang paling atas. Buka app untuk lihat dan menilai foto lain.", {
      keyboard: openAppKeyboard(slug),
    });
  } catch (error) {
    console.error("[bot] publish failed", error);
    await editMessageCaption(chatId, messageId, "Gagal menyimpan foto. Kirim ulang dengan /upload.");
  }
}

async function handleCallback(update: BotUpdate): Promise<void> {
  const query = update.callback_query;
  if (!query) return;

  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

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

  if (message.photo && message.photo.length > 0) {
    await handlePhoto(message, user);
    return;
  }

  if (message.text) {
    await handleText(message, user);
  }
}
