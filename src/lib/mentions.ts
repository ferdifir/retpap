export type CaptionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; username: string }
  | { type: "censored"; value: string };

/** Telegram usernames: a letter first, then letters, digits or underscores. */
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TOKEN = /@([A-Za-z0-9_]+)/g;

/**
 * Splits a caption into plain text and @mentions.
 *
 * Bot usernames are masked instead of linked: a mention whose name contains
 * "bot" is not readable and not clickable. Anything that does not look like a
 * real username stays as ordinary text.
 */
export function parseCaption(caption: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  let cursor = 0;

  for (const match of caption.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    const name = match[1];

    // "user@name" is an email, not a mention.
    const previous = start > 0 ? caption[start - 1] : "";
    if (previous && /[A-Za-z0-9_]/.test(previous)) continue;

    const end = start + match[0].length;
    if (start > cursor) segments.push({ type: "text", value: caption.slice(cursor, start) });

    if (/bot/i.test(name)) {
      segments.push({ type: "censored", value: "@***" });
    } else if (USERNAME.test(name)) {
      segments.push({ type: "mention", value: "@" + name, username: name });
    } else {
      segments.push({ type: "text", value: match[0] });
    }

    cursor = end;
  }

  if (cursor < caption.length) segments.push({ type: "text", value: caption.slice(cursor) });
  return segments;
}
