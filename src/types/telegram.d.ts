/**
 * Telegram Mini Apps types.
 * Field names follow https://core.telegram.org/bots/webapps (Bot API 10.1).
 */

export interface TelegramUser {
  /** Up to 52 significant bits, so a double is safe. */
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: true;
  added_to_attachment_menu?: true;
  allows_write_to_pm?: true;
  photo_url?: string;
}

/**
 * Parsed form of `Telegram.WebApp.initData`. Complex fields are JSON strings
 * inside the query string; this shape is the already-decoded version.
 */
export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  /** HMAC-SHA-256 of the data-check-string, keyed with the bot token. */
  hash: string;
  /** Ed25519 signature, for third parties that do not hold the bot token. */
  signature?: string;
}

/**
 * Device-level insets that keep content clear of notches, the home indicator
 * and the status bar. Available since Bot API 8.0; absent on older clients.
 */
export interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Same shape as SafeAreaInset, but for Telegram's own chrome. */
export type ContentSafeAreaInset = SafeAreaInset;

export interface TelegramHapticFeedback {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
}

export interface TelegramWebApp {
  /** Raw query string. Empty when the page runs outside Telegram. */
  initData: string;
  /** Decoded copy of `initData`. Never trust it for authorisation. */
  initDataUnsafe: Partial<TelegramInitData>;
  /** Bot API version of the client, e.g. "8.0". */
  version: string;
  platform: string;
  isVerticalSwipesEnabled?: boolean;
  /** Device safe area. Absent before Bot API 8.0. */
  safeAreaInset?: SafeAreaInset;
  /** Area not covered by Telegram UI. Absent before Bot API 8.0. */
  contentSafeAreaInset?: ContentSafeAreaInset;
  isFullscreen?: boolean;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  HapticFeedback?: TelegramHapticFeedback;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
