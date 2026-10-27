/**
 * Whether this Mini App session has pushed a page onto its own history.
 *
 * Telegram falls through to closing the Mini App when a back gesture has
 * nowhere to go, so a page that can be entered cold (a deeplink or a reload)
 * must navigate to its fallback instead of popping. Kept in memory on purpose:
 * a cold start has no in-app page underneath it.
 */
let pushedPage = false;

export function markPushedPage(): void {
  pushedPage = true;
}

export function hasPushedPage(): boolean {
  return pushedPage;
}
