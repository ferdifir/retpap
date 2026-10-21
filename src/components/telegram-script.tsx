"use client";

import Script from "next/script";
import { initTelegram } from "@/lib/telegram";

/**
 * Loads the Telegram WebApp SDK after hydration. Loading it earlier lets the
 * SDK mutate <html> before React hydrates, which triggers a hydration
 * mismatch on the injected viewport CSS variables.
 */
export function TelegramScript() {
  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onLoad={initTelegram}
    />
  );
}
