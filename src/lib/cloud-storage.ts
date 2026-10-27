import { getTelegramWebApp } from "./telegram";

/**
 * Small string values kept in Telegram CloudStorage, so a preference follows
 * the user to another device. Outside Telegram (browser preview, older client)
 * it falls back to localStorage and the value stays device-scoped.
 *
 * CloudStorage keys allow only A-Z a-z 0-9 _ - and values are capped at 4096
 * characters, so callers must keep both short.
 */

function fallbackKey(key: string): string {
  return "retpap:cloud:" + key;
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(fallbackKey(key));
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(fallbackKey(key));
    else window.localStorage.setItem(fallbackKey(key), value);
  } catch {
    // Private mode: the in-memory value still applies for this session.
  }
}

export function cloudGet(key: string): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const storage = getTelegramWebApp()?.CloudStorage;
  if (!storage) return Promise.resolve(readLocal(key));

  return new Promise((resolve) => {
    try {
      storage.getItem(key, (error, value) => {
        resolve(error ? readLocal(key) : (value ?? null));
      });
    } catch {
      resolve(readLocal(key));
    }
  });
}

export function cloudSet(key: string, value: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const storage = getTelegramWebApp()?.CloudStorage;
  if (!storage) {
    writeLocal(key, value);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      storage.setItem(key, value, () => resolve());
    } catch {
      writeLocal(key, value);
      resolve();
    }
  });
}
