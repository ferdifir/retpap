import type { TelegramUser } from "@/types/telegram";

/** Subset of the Bot API update payloads this bot actually reads. */

export interface BotPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface BotVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  /** Length in seconds, as reported by Telegram. */
  duration: number;
  mime_type?: string;
  file_size?: number;
  thumbnail?: BotPhotoSize;
}

export interface BotChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface BotMessage {
  message_id: number;
  from?: TelegramUser;
  chat: BotChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: BotPhotoSize[];
  video?: BotVideo;
}

export interface BotCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: BotMessage;
  data?: string;
}

export interface BotUpdate {
  update_id: number;
  message?: BotMessage;
  callback_query?: BotCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  /** Opens a link; used for t.me direct links that carry `startapp`. */
  url?: string;
  web_app?: { url: string };
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface BotFile {
  file_id: string;
  file_size?: number;
  file_path?: string;
}

export interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}
