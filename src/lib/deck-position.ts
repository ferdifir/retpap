const STORAGE_KEY = "retpap:deck-position";

/**
 * Where the deck was left. `slug` is the source of truth; `index` is only a
 * fallback for when that media has since been removed. Stored in
 * sessionStorage so a refresh resumes the session, while opening the Mini App
 * fresh still starts from the top.
 */
export type DeckPosition = {
  slug: string;
  index: number;
  /** Share context the deck was built for, used to ignore stale positions. */
  sharedSlug: string | null;
};

export function readDeckPosition(): DeckPosition | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const { slug, index, sharedSlug } = parsed as Record<string, unknown>;
    if (typeof slug !== "string" || slug.length === 0) return null;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return null;
    if (sharedSlug !== null && typeof sharedSlug !== "string") return null;

    return { slug, index, sharedSlug };
  } catch {
    return null;
  }
}

export function rememberDeckPosition(position: DeckPosition): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Private mode and full quota can reject writes; resuming is best-effort.
  }
}

/**
 * Finds the saved card in the freshly loaded deck. Falls back to the old
 * position when that media has been deleted, clamped to the current length.
 */
export function restoreDeckIndex(deck: { slug: string }[], saved: DeckPosition): number {
  if (deck.length === 0) return 0;

  const found = deck.findIndex((item) => item.slug === saved.slug);
  return found >= 0 ? found : Math.min(saved.index, deck.length - 1);
}
