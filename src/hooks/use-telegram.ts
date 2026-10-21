"use client";

import { useEffect } from "react";
import { initTelegram } from "@/lib/telegram";

/** Boots the Telegram WebApp once the mini app is mounted. */
export function useTelegram(): void {
  useEffect(() => {
    initTelegram();
  }, []);
}
