"use client";

import { isReactionEmoji } from "./catalog";

const STORAGE_KEY = "retpap:reactions:recent:v1";
/** One full grid row; enough to surface a habit without pushing the defaults out. */
const CAP = 8;
/** Only the head of the list reaches the quick row. */
export const QUICK_RECENT_LIMIT = 3;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Telegram WebView in private mode can throw on access.
    return null;
  }
}

/** Most recent first, catalog-only, SSR-safe (returns an empty list on the server). */
export function readRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = safeStorage()?.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of parsed) {
      if (typeof value !== "string" || !isReactionEmoji(value) || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
      if (result.length === CAP) break;
    }
    return result;
  } catch {
    return [];
  }
}

/** Move-to-front, dedupe, cap. Best effort: storage failures never block a reaction. */
export function pushRecentEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecentEmojis().filter((entry) => entry !== emoji)].slice(0, CAP);

  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or disabled storage: recents are a nicety, not state.
  }

  return next;
}
