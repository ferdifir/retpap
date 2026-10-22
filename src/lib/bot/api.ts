import type { BotFile, BotMessage, InlineKeyboardMarkup, WebhookInfo } from "./types";

const API_BASE = "https://api.telegram.org";

export class BotApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
  ) {
    super("telegram " + method + " failed (" + status + "): " + description);
    this.name = "BotApiError";
  }
}

export function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

async function call<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_BASE + "/bot" + botToken() + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; description?: string }
    | null;

  if (!body || !body.ok) {
    const description = body && !body.ok ? (body.description ?? "unknown error") : "invalid response";
    throw new BotApiError(method, response.status, description);
  }

  return body.result;
}

export type ChatProbe = "ok" | "missing" | "blocked" | "unknown";

/**
 * Live check whether the bot can reach this user.
 *
 * getChat is not enough: it still returns the chat after the user blocked the
 * bot. Only a real call to the chat reveals it, and `sendChatAction` is the
 * cheapest one — it shows a brief "typing…" hint instead of sending a message.
 * A chat that was never started answers 400, a blocked bot answers 403.
 */
export async function probePrivateChat(chatId: number): Promise<ChatProbe> {
  try {
    await call<unknown>("sendChatAction", { chat_id: chatId, action: "typing" });
    return "ok";
  } catch (error) {
    if (error instanceof BotApiError) {
      if (error.status === 403) return "blocked";
      if (error.status === 400) return "missing";
    }
    return "unknown";
  }
}

export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface ChatMember {
  status: ChatMemberStatus;
  /** Only present for "restricted" members. */
  is_member?: boolean;
}

/** Membership of one user; channels need the bot to be an administrator. */
export function getChatMember(chatId: number | string, userId: number): Promise<ChatMember> {
  return call<ChatMember>("getChatMember", { chat_id: chatId, user_id: userId });
}

export async function deleteMessage(chatId: number | string, messageId: number): Promise<void> {
  await call("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export function sendMessage(
  chatId: number | string,
  text: string,
  options: { keyboard?: InlineKeyboardMarkup; preview?: boolean } = {},
): Promise<BotMessage> {
  return call<BotMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: options.preview !== true },
    ...(options.keyboard ? { reply_markup: options.keyboard } : {}),
  });
}

export function sendPhoto(
  chatId: number | string,
  photo: string,
  options: { caption?: string; keyboard?: InlineKeyboardMarkup } = {},
): Promise<BotMessage> {
  return call<BotMessage>("sendPhoto", {
    chat_id: chatId,
    photo,
    parse_mode: "HTML",
    ...(options.caption ? { caption: options.caption } : {}),
    ...(options.keyboard ? { reply_markup: options.keyboard } : {}),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: keyboard } : { reply_markup: { inline_keyboard: [] } }),
  });
}

export async function editMessageCaption(
  chatId: number,
  messageId: number,
  caption: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  await call("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
    reply_markup: keyboard ?? { inline_keyboard: [] },
  });
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export function getFile(fileId: string): Promise<BotFile> {
  return call<BotFile>("getFile", { file_id: fileId });
}

/** Streams a file from Telegram. Paths come from getFile and expire after ~1h. */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const response = await fetch(API_BASE + "/file/bot" + botToken() + "/" + filePath, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new BotApiError("downloadFile", response.status, response.statusText);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function setWebhook(url: string, secretToken: string): Promise<true> {
  return call<true>("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export function deleteWebhook(): Promise<true> {
  return call<true>("deleteWebhook", { drop_pending_updates: false });
}

export function getWebhookInfo(): Promise<WebhookInfo> {
  return call<WebhookInfo>("getWebhookInfo");
}

export interface BotIdentity {
  id: number;
  username: string;
  first_name: string;
}

export function getMe(): Promise<BotIdentity> {
  return call<BotIdentity>("getMe");
}

export function setMyCommands(commands: { command: string; description: string }[]): Promise<true> {
  return call<true>("setMyCommands", { commands });
}
