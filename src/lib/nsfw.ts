import { useSyncExternalStore } from "react";
import { cloudGet, cloudSet } from "./cloud-storage";

/** CloudStorage keys are limited to A-Z a-z 0-9 _ -, so no colons. */
const KEY = "retpap_nsfw_reveal";

/** null until the cloud value has been read; the blurred state is the default. */
let cached: boolean | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function hydrate(): void {
  if (cached !== null || hydrating) return;
  hydrating = true;

  void cloudGet(KEY).then((value) => {
    hydrating = false;
    // A toggle that happened while reading wins over the stored value.
    if (cached !== null) return;
    cached = value === "1";
    emit();
  });
}

/** Global preference: show 18+ content without blur. Defaults to blurred. */
export function readNsfwReveal(): boolean {
  return cached === true;
}

export function setNsfwReveal(value: boolean): void {
  cached = value;
  emit();
  void cloudSet(KEY, value ? "1" : "0");
}

export function subscribeNsfwReveal(listener: () => void): () => void {
  listeners.add(listener);
  hydrate();

  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders every card when the shared preference changes. */
export function useNsfwReveal(): boolean {
  return useSyncExternalStore(subscribeNsfwReveal, readNsfwReveal, () => false);
}
