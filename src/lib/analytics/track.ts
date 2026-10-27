import { EVENT_NAMES, type AnalyticsEvent, type EventName } from "./events";

const SESSION_KEY = "retpap_analytics_session";
const SEEN_KEY = "retpap_analytics_seen";
const FLUSH_SIZE = 10;
const FLUSH_DELAY_MS = 5000;
const SEEN_LIMIT = 300;

let queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
let seen: Set<string> | null = null;

/** Older Android WebViews ship without randomUUID. */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/** One id per app launch: sessionStorage, so closing the app starts a new one. */
function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = randomId();
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    // Private mode or a locked-down WebView: keep working, just not persist.
    return randomId();
  }
}

/**
 * Keys already sent this session, so a swipe back and forth does not count the
 * same photo twice. Stored next to the session id to survive a reload.
 */
function seenKeys(): Set<string> {
  if (seen) return seen;
  seen = new Set();
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      for (const key of list) {
        if (typeof key === "string") seen.add(key);
      }
    }
  } catch {
    // Ignore a corrupt value; the set simply starts empty.
  }
  return seen;
}

function rememberKey(key: string): boolean {
  const keys = seenKeys();
  if (keys.has(key)) return false;
  keys.add(key);

  // Keep the stored list bounded; the oldest entries stop deduping, which is
  // harmless because impressions are already counted for them.
  const list = Array.from(keys);
  const trimmed = list.slice(Math.max(0, list.length - SEEN_LIMIT));
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota or private mode: in-memory dedupe still applies.
  }
  return true;
}

function send(body: string, beacon: boolean): void {
  if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/events", blob)) return;
  }

  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function schedule(): void {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

/** Drops the queue on the floor: analytics never retries in a loop. */
export function flush(beacon = false): void {
  if (queue.length === 0) return;

  const batch = queue;
  queue = [];
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  send(JSON.stringify({ sessionId: sessionId(), events: batch }), beacon);
}

function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  // pagehide is the only event that reliably fires when a Mini App is closed.
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}

export function track(name: EventName, options: Omit<AnalyticsEvent, "name"> = {}): void {
  if (typeof window === "undefined") return;
  if (!EVENT_NAMES.includes(name)) return;

  listen();
  queue.push({ name, photoId: options.photoId, meta: options.meta });

  if (queue.length >= FLUSH_SIZE) flush();
  else schedule();
}

/**
 * Same as `track`, but only the first call with a given key is sent. Used for
 * impressions and one-per-launch events.
 */
export function trackOnce(
  key: string,
  name: EventName,
  options: Omit<AnalyticsEvent, "name"> = {},
): void {
  if (typeof window === "undefined") return;
  if (!rememberKey(key)) return;
  track(name, options);
}
