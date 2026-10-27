"use client";

import { useSyncExternalStore } from "react";
import { cloudGet, cloudSet } from "@/lib/cloud-storage";
import { isReactionEmoji } from "./catalog";

/** CloudStorage keys are limited to A-Z a-z 0-9 _ -, so no colons. */
const KEY = "retpap_recent_emojis";
/** One full grid row; enough to surface a habit without pushing the defaults out. */
const CAP = 8;
/** Only the head of the list reaches the quick row. */
export const QUICK_RECENT_LIMIT = 3;

const EMPTY: string[] = [];
/** null until the cloud value has been read. */
let cached: string[] | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Catalog-only, deduped, capped; a corrupt value degrades to an empty list. */
function parse(raw: string | null): string[] {
  if (!raw) return [];

  try {
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

function hydrate(): void {
  if (cached !== null || hydrating) return;
  hydrating = true;

  void cloudGet(KEY).then((value) => {
    hydrating = false;
    // A pick that happened while reading wins over the stored list.
    if (cached !== null) return;
    cached = parse(value);
    emit();
  });
}

/** Most recent first, catalog-only, SSR-safe (empty until the cloud answers). */
export function readRecentEmojis(): string[] {
  return cached ?? EMPTY;
}

/** Move-to-front, dedupe, cap. Best effort: storage failures never block a reaction. */
export function pushRecentEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecentEmojis().filter((entry) => entry !== emoji)].slice(0, CAP);
  cached = next;
  emit();
  void cloudSet(KEY, JSON.stringify(next));
  return next;
}

export function subscribeRecentEmojis(listener: () => void): () => void {
  listeners.add(listener);
  hydrate();

  return () => {
    listeners.delete(listener);
  };
}

const serverSnapshot = () => EMPTY;

/** Shared recents, hydrated once per page load. */
export function useRecentEmojis(): string[] {
  return useSyncExternalStore(subscribeRecentEmojis, readRecentEmojis, serverSnapshot);
}
