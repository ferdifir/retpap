"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { useTelegram } from "@/hooks/use-telegram";
import { useTelegramUser } from "@/hooks/use-telegram-user";
import { useTouchGuard } from "@/hooks/use-touch-guard";
import { track, trackOnce } from "@/lib/analytics/track";
import { readDeckPosition, rememberDeckPosition, restoreDeckIndex } from "@/lib/deck-position";
import type { FeedComment, FeedPhoto, FeedSpot } from "@/lib/feed-types";
import { START_BOT_GATE_ENABLED } from "@/lib/gates";
import { markPushedPage } from "@/lib/navigation";
import { useNsfwReveal } from "@/lib/nsfw";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { DEFAULT_RATING, PIXELS_PER_POINT, clampRating, roundRating } from "@/lib/rating";
import {
  leaderboardPath,
  markStartTargetHandled,
  orderForSharedPhoto,
  pendingLeaderboardPeriod,
  readSharedSlug,
  readStartTarget,
  telegramShareLink,
} from "@/lib/share";
import { getTelegramWebApp, haptic } from "@/lib/telegram";
import type { DragAxis, InputSource, ReactionResult, SpotTarget } from "@/lib/types";
import { AppHeader } from "./app-header";
import { EmptyState } from "./empty-state";
import { GenderPicker, type GenderPreference } from "./gender-picker";
import { StartGate, type GateKind } from "./start-gate";
import { PapCard } from "./pap-card";
import { RatingOverlay } from "./rating-overlay";

const FLIP_DURATION_MS = 600;
const SWIPE_THRESHOLD_PX = 60;
const SWIPE_ACTIVATION_PX = 12;
const KEYBOARD_STEP = 0.5;

type LoadState = "loading" | "ready" | "error";

function optimisticRating(
  rating: FeedPhoto["rating"],
  score: number,
): FeedPhoto["rating"] {
  if (rating.mine === null) {
    const votes = rating.votes + 1;
    const avg = (rating.avg * rating.votes + score) / votes;
    return { avg: Math.round(avg * 10) / 10, votes, mine: score };
  }

  const sum = rating.avg * rating.votes - rating.mine + score;
  return {
    avg: Math.round((sum / rating.votes) * 10) / 10,
    votes: rating.votes,
    mine: score,
  };
}

export function PapRater() {
  const router = useRouter();
  const [photos, setPhotos] = useState<FeedPhoto[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [rating, setRating] = useState(DEFAULT_RATING);
  const [isRating, setIsRating] = useState(false);
  const [justRated, setJustRated] = useState(false);
  // Photos open clean: reactions stay hidden until the toggle is used.
  const [reactionsVisible, setReactionsVisible] = useState(true);
  const [gate, setGate] = useState<GateKind | null>(null);
  const [channelUrl, setChannelUrl] = useState("");
  const [bootKey, setBootKey] = useState(0);
  const gateRef = useRef<GateKind | null>(null);
  // null means the user has not picked a feed filter yet; the picker is shown
  // once and the choice is stored on the user row, not in the browser.
  const [preference, setPreference] = useState<GenderPreference | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const ratingRef = useRef(DEFAULT_RATING);
  const isRatingRef = useRef(false);
  const ratingSource = useRef<InputSource>("pointer");
  const dragOrigin = useRef<{ position: number; rating: number; axis: DragAxis }>({
    position: 0,
    rating: DEFAULT_RATING,
    axis: "y",
  });
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipe = useRef({ startY: 0, active: false, moved: false });
  const photosRef = useRef<FeedPhoto[] | null>(null);
  const sharedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useTelegram();
  useTouchGuard();

  const identity = useTelegramUser();

  useEffect(() => {
    if (!identity) return;

    let cancelled = false;

    const boot = async () => {
      try {
        const session = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            initData: identity.initData || undefined,
            devUserId: identity.userId,
          }),
        });
        if (!session.ok) throw new Error("session");

        const sessionBody = (await session.json()) as {
          started: boolean;
          subscribed: boolean;
          channelUrl: string;
          preference: GenderPreference | null;
          owner: boolean;
        };

        // Bot first, then the channel; the start gate can be hidden by config.
        const nextGate: GateKind | null =
          START_BOT_GATE_ENABLED && !sessionBody.started
            ? "start"
            : !sessionBody.subscribed
              ? "channel"
              : null;

        gateRef.current = nextGate;
        // Once per app launch: a remount must not double the open count.
        trackOnce("app_open", "app_open", {
          meta: {
            startParam:
              getTelegramWebApp()?.initDataUnsafe?.start_param ?? null,
            gate: nextGate,
          },
        });
        if (!cancelled) {
          setGate(nextGate);
          setChannelUrl(sessionBody.channelUrl);
          setPreference(sessionBody.preference ?? null);
        }

        if (nextGate) {
          if (!cancelled) setLoadState("ready");
          return;
        }

        // Owner analytics: the page checks the session again, so the same link
        // opened by someone else just lands on the feed.
        if (sessionBody.owner && readStartTarget()?.type === "stats") {
          markStartTargetHandled();
          markPushedPage();
          router.push("/stats");
          return;
        }

        // A `startapp=leaderboard*` link still passes the gates on the feed
        // first. Push the leaderboard on top of it so the native back button
        // returns to the feed inside the Mini App instead of closing it.
        const leaderboardPeriod = pendingLeaderboardPeriod();
        if (!cancelled && leaderboardPeriod) {
          markStartTargetHandled();
          markPushedPage();
          router.push(leaderboardPath(leaderboardPeriod));
          return;
        }

        // First visit: the filter has to be picked before the deck makes
        // sense, so skip the feed fetch until the user chooses.
        if (!sessionBody.preference) {
          if (!cancelled) setLoadState("ready");
          return;
        }

        const response = await fetch("/api/feed");
        if (!response.ok) throw new Error("feed");

        const body = (await response.json()) as { photos: FeedPhoto[] };
        if (cancelled) return;

        track("feed_loaded", {
          meta: { count: body.photos.length, pref: sessionBody.preference },
        });

        // A share link pins its photo first; the rest keeps the normal order
        // and the pinned photo is dropped from its original position.
        const sharedSlug = readSharedSlug();
        const saved = readDeckPosition();
        // A different share link wins over the previous session; otherwise a
        // reload resumes the deck it was already showing.
        const restored =
          saved && (sharedSlug === null || saved.sharedSlug === sharedSlug) ? saved : null;
        // Reuse the old pin on a reload, even if the client drops start_param,
        // so the deck keeps the same order around the restored card.
        const pinSlug = sharedSlug ?? restored?.sharedSlug ?? null;
        const deck = orderForSharedPhoto(body.photos, pinSlug);
        sharedSlugRef.current = pinSlug;

        // Slugs survive new uploads at the top; the stored index is only a
        // fallback for when the current media was deleted while away.
        const initialIndex = restored ? restoreDeckIndex(deck, restored) : 0;

        setPhotos(deck);
        setCurrentIndex(initialIndex);
        setLoadState("ready");

        const initial = deck[initialIndex]?.rating.mine ?? DEFAULT_RATING;
        ratingRef.current = initial;
        setRating(initial);

        const initialPhoto = deck[initialIndex];
        if (initialPhoto) {
          rememberDeckPosition({
            slug: initialPhoto.slug,
            index: initialIndex,
            sharedSlug: pinSlug,
          });
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };

    void boot();

    // Coming back from the bot chat: re-check instead of making the user
    // reopen the Mini App by hand.
    const onVisible = () => {
      if (document.visibilityState === "visible" && gateRef.current) void boot();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [identity, bootKey, router]);

  const recheckChannel = useCallback(async () => {
    const response = await fetch("/api/subscription/check", { method: "POST" });
    if (!response.ok) return false;

    const body = (await response.json()) as { subscribed: boolean };
    if (!body.subscribed) return false;

    track("gate_pass", { meta: { kind: "channel" } });
    setBootKey((key) => key + 1);
    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (flipTimer.current) clearTimeout(flipTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const activeItem = photos?.[currentIndex];
  const nsfwGlobal = useNsfwReveal();

  // An impression is a card that stays on screen, not one that is prefetched
  // while the user swipes past it.
  useEffect(() => {
    if (!photos || photos.length === 0) return;
    if (gate || preference === null || pickerOpen) return;

    const photo = photos[currentIndex];
    if (!photo) return;

    const timer = setTimeout(() => {
      trackOnce("photo_view:" + photo.id, "photo_view", {
        photoId: photo.id,
        meta: {
          index: currentIndex,
          media: photo.mediaType,
          nsfw: photo.isNsfw,
          blurred: photo.isNsfw && !nsfwGlobal,
        },
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [photos, currentIndex, gate, preference, pickerOpen, nsfwGlobal]);

  useEffect(() => {
    if (!gate) return;
    trackOnce("gate_shown:" + gate, "gate_shown", { meta: { kind: gate } });
  }, [gate]);

  const setRatingValue = useCallback((next: number) => {
    if (next === ratingRef.current) return;
    ratingRef.current = next;
    setRating(next);
    haptic("selection");
  }, []);

  const flipTo = useCallback(
    (nextIndex: number) => {
      const list = photosRef.current;
      if (isFlipping || !list) return;
      if (nextIndex < 0 || nextIndex >= list.length) return;

      setIsFlipping(true);
      setCurrentIndex(nextIndex);

      const nextPhoto = list[nextIndex];
      const next = nextPhoto?.rating.mine ?? DEFAULT_RATING;
      ratingRef.current = next;
      setRating(next);
      isRatingRef.current = false;
      setIsRating(false);
      setJustRated(false);
      haptic("impact");

      if (nextPhoto) {
        rememberDeckPosition({
          slug: nextPhoto.slug,
          index: nextIndex,
          sharedSlug: sharedSlugRef.current,
        });
      }

      if (flipTimer.current) clearTimeout(flipTimer.current);
      flipTimer.current = setTimeout(() => setIsFlipping(false), FLIP_DURATION_MS);
    },
    [isFlipping],
  );

  const beginRating = useCallback((position: number, source: InputSource, axis: DragAxis) => {
    ratingSource.current = source;
    isRatingRef.current = true;
    dragOrigin.current = { position, rating: ratingRef.current, axis };
    setIsRating(true);
    setJustRated(false);
    haptic("impact");
  }, []);

  const moveRating = useCallback(
    (position: number) => {
      const origin = dragOrigin.current;
      // Up and right raise the score; down and left lower it.
      const delta =
        origin.axis === "x" ? position - origin.position : origin.position - position;
      setRatingValue(roundRating(clampRating(origin.rating + delta / PIXELS_PER_POINT)));
    },
    [setRatingValue],
  );

  const commitRating = useCallback(() => {
    if (!isRatingRef.current) return;

    isRatingRef.current = false;
    setIsRating(false);
    setJustRated(true);
    haptic("success");

    const photo = photosRef.current?.[currentIndex];
    const score = ratingRef.current;

    if (photo) {
      setPhotos((previous) =>
        previous?.map((entry, index) =>
          index === currentIndex ? { ...entry, rating: optimisticRating(entry.rating, score) } : entry,
        ) ?? null,
      );

      void fetch(`/api/photos/${photo.id}/rating`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((serverRating: FeedPhoto["rating"] | null) => {
          if (!serverRating) return;
          setPhotos((previous) =>
            previous?.map((entry, index) =>
              index === currentIndex ? { ...entry, rating: serverRating } : entry,
            ) ?? null,
          );
        })
        .catch(() => {
          // The optimistic value stays; the next refresh reconciles it.
        });
    }

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setJustRated(false), 500);
  }, [currentIndex]);

  const cancelRating = useCallback(() => {
    if (!isRatingRef.current) return;

    isRatingRef.current = false;
    setIsRating(false);
    const stored = photosRef.current?.[currentIndex]?.rating.mine ?? DEFAULT_RATING;
    setRating(stored);
    ratingRef.current = stored;
  }, [currentIndex]);

  const nudgeRating = useCallback(
    (delta: number) => {
      if (!isRatingRef.current) {
        isRatingRef.current = true;
        setIsRating(true);
        setJustRated(false);
      }

      setRatingValue(roundRating(clampRating(ratingRef.current + delta)));
    },
    [setRatingValue],
  );

  const handleRatingKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowUp":
        case "ArrowRight":
          event.preventDefault();
          nudgeRating(KEYBOARD_STEP);
          break;
        case "ArrowDown":
        case "ArrowLeft":
          event.preventDefault();
          nudgeRating(-KEYBOARD_STEP);
          break;
        case "Home":
          event.preventDefault();
          nudgeRating(1 - ratingRef.current);
          break;
        case "End":
          event.preventDefault();
          nudgeRating(10 - ratingRef.current);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          commitRating();
          break;
        case "Escape":
          event.preventDefault();
          cancelRating();
          break;
      }
    },
    [cancelRating, commitRating, nudgeRating],
  );

  useEffect(() => {
    if (!isRating) return;

    if (ratingSource.current === "pointer") {
      const handleMove = (event: globalThis.PointerEvent) =>
        moveRating(dragOrigin.current.axis === "x" ? event.clientX : event.clientY);
      const handleUp = () => commitRating();
      const handleCancel = () => cancelRating();

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);

      return () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleCancel);
      };
    }

    const handleMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (touch) moveRating(dragOrigin.current.axis === "x" ? touch.clientX : touch.clientY);
    };
    const handleUp = () => commitRating();
    const handleCancel = () => cancelRating();

    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    window.addEventListener("touchcancel", handleCancel);

    return () => {
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
      window.removeEventListener("touchcancel", handleCancel);
    };
  }, [isRating, moveRating, commitRating, cancelRating]);

  const reactTo = useCallback(
    async (index: number, target: SpotTarget, emoji: string): Promise<ReactionResult> => {
      const photo = photosRef.current?.[index];
      if (!photo) return { ok: false, code: "no_photo" };

      // Reacting means you want to see reactions; otherwise the tap looks ignored.
      setReactionsVisible(true);

      try {
        const response = await fetch("/api/photos/" + photo.id + "/reactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            spotId: target.spotId ?? undefined,
            x: target.spotId === null ? target.xPct : undefined,
            y: target.spotId === null ? target.yPct : undefined,
            emoji,
          }),
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { error?: unknown };
          return {
            ok: false,
            code: typeof errorBody.error === "string" ? errorBody.error : "request_failed",
          };
        }

        const body = (await response.json()) as { spots: FeedSpot[]; removed: boolean; spotId: number };
        setPhotos((previous) =>
          previous?.map((entry, entryIndex) =>
            entryIndex === index ? { ...entry, spots: body.spots } : entry,
          ) ?? null,
        );
        haptic(body.removed ? "warning" : "success");
        return { ok: true, spotId: body.spotId };
      } catch {
        return { ok: false, code: "network" };
      }
    },
    [],
  );

  const addComment = useCallback(
    async (
      index: number,
      target: SpotTarget,
      body: string,
    ): Promise<{ spotId: number; comments: FeedComment[] } | null> => {
      const photo = photosRef.current?.[index];
      if (!photo) return null;


      try {
        const response = await fetch("/api/photos/" + photo.id + "/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            spotId: target.spotId ?? undefined,
            x: target.spotId === null ? target.xPct : undefined,
            y: target.spotId === null ? target.yPct : undefined,
            body,
          }),
        });

        if (!response.ok) return null;

        const payload = (await response.json()) as {
          spotId: number;
          comments: FeedComment[];
          spots: FeedSpot[];
        };

        setPhotos((previous) =>
          previous?.map((entry, entryIndex) =>
            entryIndex === index ? { ...entry, spots: payload.spots } : entry,
          ) ?? null,
        );
        haptic("success");
        return { spotId: payload.spotId, comments: payload.comments };
      } catch {
        return null;
      }
    },
    [],
  );

  const removeComment = useCallback(async (index: number): Promise<boolean> => {
    const photo = photosRef.current?.[index];
    if (!photo) return false;

    try {
      const response = await fetch("/api/photos/" + photo.id + "/comments", {
        method: "DELETE",
      });
      if (!response.ok) return false;

      const payload = (await response.json()) as { spots: FeedSpot[] };
      setPhotos((previous) =>
        previous?.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, spots: payload.spots } : entry,
        ) ?? null,
      );
      haptic("warning");
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadComments = useCallback(async (index: number, spotId: number): Promise<FeedComment[]> => {
    const photo = photosRef.current?.[index];
    if (!photo) return [];

    try {
      const response = await fetch(
        "/api/photos/" + photo.id + "/comments?spotId=" + spotId,
      );
      if (!response.ok) return [];
      const body = (await response.json()) as { comments: FeedComment[] };
      return body.comments;
    } catch {
      return [];
    }
  }, []);

  const handleSwipeStart = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    notePointerInput();
    swipe.current = { startY: event.clientY, active: true, moved: false };
  };

  const handleSwipeMove = (event: PointerEvent<HTMLElement>) => {
    if (!swipe.current.active) return;
    if (Math.abs(event.clientY - swipe.current.startY) > SWIPE_ACTIVATION_PX) {
      swipe.current.moved = true;
    }
  };

  const handleSwipeEnd = (event: PointerEvent<HTMLElement>) => {
    const state = swipe.current;
    if (!state.active) return;

    swipe.current.active = false;
    if (!state.moved) return;

    const delta = state.startY - event.clientY;
    if (delta > SWIPE_THRESHOLD_PX) flipTo(currentIndex + 1);
    else if (delta < -SWIPE_THRESHOLD_PX) flipTo(currentIndex - 1);
  };

  const handleTouchSwipeStart = (event: TouchEvent<HTMLElement>) => {
    if (isTouchEcho()) return;

    const touch = event.touches[0];
    if (!touch || event.touches.length > 1) return;

    swipe.current = { startY: touch.clientY, active: true, moved: false };
  };

  const handleTouchSwipeMove = (event: TouchEvent<HTMLElement>) => {
    if (!swipe.current.active) return;

    const touch = event.touches[0];
    if (!touch) return;

    if (Math.abs(touch.clientY - swipe.current.startY) > SWIPE_ACTIVATION_PX) {
      swipe.current.moved = true;
    }
  };

  const handleTouchSwipeEnd = (event: TouchEvent<HTMLElement>) => {
    const state = swipe.current;
    if (!state.active) return;

    swipe.current.active = false;
    if (!state.moved) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const delta = state.startY - touch.clientY;
    if (delta > SWIPE_THRESHOLD_PX) flipTo(currentIndex + 1);
    else if (delta < -SWIPE_THRESHOLD_PX) flipTo(currentIndex - 1);
  };

  const handleSwipeCancel = () => {
    swipe.current.active = false;
  };

  /** Stores the pick, then rebuilds the deck for the new filter. */
  const choosePreference = useCallback(async (value: GenderPreference) => {
    setSavingPreference(true);
    setPreferenceError(null);

    try {
      const response = await fetch("/api/preferences/gender", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preference: value }),
      });
      if (!response.ok) throw new Error("preference");

      setPreference(value);
      setPickerOpen(false);
      track("pref_change", { meta: { pref: value } });

      // Old deck positions mean nothing once the filter changes.
      const feed = await fetch("/api/feed");
      if (!feed.ok) throw new Error("feed");

      const body = (await feed.json()) as { photos: FeedPhoto[] };
      track("feed_loaded", {
        meta: { count: body.photos.length, pref: value },
      });
      const deck = orderForSharedPhoto(body.photos, sharedSlugRef.current);
      setPhotos(deck);
      setCurrentIndex(0);

      const initial = deck[0]?.rating.mine ?? DEFAULT_RATING;
      ratingRef.current = initial;
      setRating(initial);

      if (deck[0]) {
        rememberDeckPosition({
          slug: deck[0].slug,
          index: 0,
          sharedSlug: sharedSlugRef.current,
        });
      }
    } catch {
      setPreferenceError("Gagal menyimpan pilihan. Coba lagi.");
    } finally {
      setSavingPreference(false);
    }
  }, []);

  const shareCurrentPhoto = useCallback(() => {
    const photo = photosRef.current?.[currentIndex];
    if (!photo) return;

    haptic("impact");
    track("share", { photoId: photo.id, meta: { channel: "telegram" } });
    const link = telegramShareLink(photo.slug, photo.caption);

    const webApp = getTelegramWebApp();
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(link);
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  }, [currentIndex]);

  if (loadState === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Image
          src="/logo.png"
          alt="RetPAP"
          width={104}
          height={104}
          priority
          className="size-[104px] animate-pulse rounded-3xl shadow-2xl shadow-cyan-500/20"
        />
        <p className="text-[11px] font-medium tracking-wide text-slate-500">Memuat…</p>
      </div>
    );
  }

  if (gate) {
    return <StartGate kind={gate} channelUrl={channelUrl} onRecheck={recheckChannel} />;
  }

  if (preference === null || pickerOpen) {
    return (
      <GenderPicker
        value={preference}
        busy={savingPreference}
        error={preferenceError}
        onPick={(value) => void choosePreference(value)}
        onClose={preference === null ? undefined : () => setPickerOpen(false)}
      />
    );
  }

  if (photos && photos.length === 0) {
    return (
      <EmptyState
        filtered={preference !== "all"}
        onShowAll={() => void choosePreference("all")}
      />
    );
  }

  if (loadState === "error" || !photos) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-center text-xs font-medium text-slate-400">
          Gagal memuat data. Buka ulang aplikasi dari Telegram.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <AppHeader
        avgRating={activeItem?.rating.avg ?? 0}
        votes={activeItem?.rating.votes ?? 0}
        reactionsVisible={reactionsVisible}
        onToggleReactions={() => {
          // The slider disappears with the layer, so a drag in progress must be
          // stored instead of being abandoned mid-gesture.
          if (reactionsVisible && isRatingRef.current) commitRating();
          setReactionsVisible((visible) => !visible);
        }}
        onShare={shareCurrentPhoto}
        onLeaderboardClick={() => {
          markPushedPage();
          router.push("/leaderboard");
        }}
        preference={preference}
        onPreferenceClick={() => {
          setPreferenceError(null);
          setPickerOpen(true);
        }}
      />

      <section
        aria-label="Tumpukan foto untuk di-rating"
        className="scene relative min-h-0 flex-1 touch-none overflow-hidden rounded-3xl"
        onPointerDown={handleSwipeStart}
        onPointerMove={handleSwipeMove}
        onPointerUp={handleSwipeEnd}
        onPointerCancel={handleSwipeCancel}
        onTouchStart={handleTouchSwipeStart}
        onTouchMove={handleTouchSwipeMove}
        onTouchEnd={handleTouchSwipeEnd}
        onTouchCancel={handleSwipeCancel}
      >
        <div className="card-container">
          {photos.map((item, index) => (
            <PapCard
              key={item.id}
              item={item}
              position={
                index === currentIndex ? "active" : index < currentIndex ? "previous" : "next"
              }
              priority={index === currentIndex}
              showReactions={reactionsVisible}
              rating={index === currentIndex ? rating : (item.rating.mine ?? DEFAULT_RATING)}
              ratingDragging={index === currentIndex && isRating}
              canGoPrevious={index === currentIndex && currentIndex > 0}
              canGoNext={index === currentIndex && currentIndex < photos.length - 1}
              onReact={(target, emoji) => reactTo(index, target, emoji)}
              onComment={(target, body) => addComment(index, target, body)}
              onLoadComments={(spotId) => loadComments(index, spotId)}
              onDeleteComment={() => removeComment(index)}
              onRatingStart={beginRating}
              onRatingKeyDown={handleRatingKeyDown}
              onRatingBlur={commitRating}
              onPrevious={() => flipTo(currentIndex - 1)}
              onNext={() => flipTo(currentIndex + 1)}
            />
          ))}
        </div>

        <RatingOverlay rating={rating} visible={isRating || justRated} settled={justRated} />
      </section>
    </div>
  );
}
