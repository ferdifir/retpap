import type { SafeAreaInset, TelegramWebApp } from "@/types/telegram";

export type HapticKind = "selection" | "impact" | "success" | "warning" | "light";

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

/** Fires Telegram haptics when available; silently no-ops in the browser. */
export function haptic(kind: HapticKind = "light"): void {
  const feedback = getTelegramWebApp()?.HapticFeedback;
  if (!feedback) return;

  switch (kind) {
    case "selection":
      feedback.selectionChanged();
      break;
    case "impact":
      feedback.impactOccurred("medium");
      break;
    case "success":
      feedback.notificationOccurred("success");
      break;
    case "warning":
      feedback.notificationOccurred("warning");
      break;
    case "light":
      feedback.impactOccurred("light");
      break;
  }
}

/**
 * Opens a Telegram profile inside the app. `openTelegramLink` keeps the Mini
 * App alive (Bot API 7.0+); the browser falls back to a new tab.
 */
export function openTelegramUrl(url: string): void {
  const webApp = getTelegramWebApp();

  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url);
    return;
  }

  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

export function openTelegramProfile(username: string): void {
  openTelegramUrl("https://t.me/" + username);
}

/** Fired once the SDK is loaded and the Mini App has booted. */
export const TELEGRAM_READY_EVENT = "telegram:ready";

const SIDES = ["top", "right", "bottom", "left"] as const;

function readInset(inset: Partial<SafeAreaInset> | undefined): Record<(typeof SIDES)[number], number> {
  return {
    top: Math.max(0, Math.round(inset?.top ?? 0)),
    right: Math.max(0, Math.round(inset?.right ?? 0)),
    bottom: Math.max(0, Math.round(inset?.bottom ?? 0)),
    left: Math.max(0, Math.round(inset?.left ?? 0)),
  };
}

/**
 * Publishes the two safe-area insets as CSS variables on <html>.
 *
 * The SDK exposes them on the WebApp object and, on Bot API 8.0+, also writes
 * the same variables itself. We set them here so older clients (which omit the
 * fields) end up with explicit 0px instead of an unresolved variable, and so a
 * single source of truth feeds the CSS layout.
 */
export function applySafeArea(webApp: TelegramWebApp | undefined = getTelegramWebApp()): void {
  if (!webApp || typeof document === "undefined") return;

  const system = readInset(webApp.safeAreaInset);
  const content = readInset(webApp.contentSafeAreaInset);
  const root = document.documentElement;

  for (const side of SIDES) {
    root.style.setProperty(`--tg-safe-area-inset-${side}`, `${system[side]}px`);
    root.style.setProperty(`--tg-content-safe-area-inset-${side}`, `${content[side]}px`);
  }
}

let booted = false;

/** Expands the mini app to full height and aligns its chrome with the theme. */
export function initTelegram(): void {
  if (booted) return;

  const webApp = getTelegramWebApp();
  if (!webApp) return;
  // The SDK also loads in a normal browser and reports itself as version 6.0
  // with no init data. Telegram APIs would only log unsupported errors.
  if (webApp.platform === "unknown" || !webApp.initData) return;

  booted = true;
  webApp.ready();
  webApp.expand();

  applySafeArea(webApp);
  const resync = () => applySafeArea(webApp);
  webApp.onEvent?.("safeAreaChanged", resync);
  webApp.onEvent?.("contentSafeAreaChanged", resync);

  // Fullscreen makes Telegram's header transparent, so the app can draw its
  // own brand inside that strip. The flag lets the CSS decide where the brand
  // lives; without it the layout stays exactly as before.
  const markFullscreen = (on: boolean) => {
    document.documentElement.dataset.tgFullscreen = on ? "true" : "false";
  };
  markFullscreen(Boolean(webApp.isFullscreen));
  webApp.onEvent?.("fullscreenChanged", () => {
    markFullscreen(Boolean(webApp.isFullscreen));
    applySafeArea(webApp);
  });
  webApp.onEvent?.("fullscreenFailed", () => markFullscreen(false));

  // Older clients expose these methods but throw WebAppMethodUnsupported when
  // called. A browser preview loads the same SDK at version 6.0, so every
  // optional chrome call must fail quietly instead of aborting the boot.
  const attempt = (call: () => void) => {
    try {
      call();
    } catch {
      // Older clients: keep the fallback layout.
    }
  };

  attempt(() => webApp.requestFullscreen?.());
  // Telegram Android otherwise swallows vertical drags to minimise the app.
  attempt(() => webApp.disableVerticalSwipes?.());
  attempt(() => webApp.setHeaderColor?.("#0b0f19"));
  attempt(() => webApp.setBackgroundColor?.("#0b0f19"));
  window.dispatchEvent(new Event(TELEGRAM_READY_EVENT));
}
