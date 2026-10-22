"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { useTelegram } from "@/hooks/use-telegram";
import { useTelegramUser } from "@/hooks/use-telegram-user";
import { useTouchGuard } from "@/hooks/use-touch-guard";
import type { FeedComment, FeedPhoto, FeedSpot, FeedUser } from "@/lib/feed-types";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { DEFAULT_RATING, PIXELS_PER_POINT, clampRating, roundRating } from "@/lib/rating";
import { orderForSharedPhoto, readSharedSlug, telegramShareLink } from "@/lib/share";
import { getTelegramWebApp, haptic } from "@/lib/telegram";
import type { InputSource, SpotTarget } from "@/lib/types";
import { AppHeader } from "./app-header";
import { GestureHint } from "./gesture-hint";
import { InfoModal } from "./info-modal";
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
  const [photos, setPhotos] = useState<FeedPhoto[] | null>(null);
  const [user, setUser] = useState<FeedUser | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [rating, setRating] = useState(DEFAULT_RATING);
  const [isRating, setIsRating] = useState(false);
  const [justRated, setJustRated] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  // Photos open clean: reactions stay hidden until the toggle is used.
  const [reactionsVisible, setReactionsVisible] = useState(true);

  const ratingRef = useRef(DEFAULT_RATING);
  const isRatingRef = useRef(false);
  const ratingSource = useRef<InputSource>("pointer");
  const dragOrigin = useRef({ y: 0, rating: DEFAULT_RATING });
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipe = useRef({ startY: 0, active: false, moved: false });
  const photosRef = useRef<FeedPhoto[] | null>(null);

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

        const sessionBody = (await session.json()) as { user: FeedUser };

        const response = await fetch("/api/feed");
        if (!response.ok) throw new Error("feed");

        const body = (await response.json()) as { photos: FeedPhoto[] };
        if (cancelled) return;

        // A share link pins its photo first; the rest keeps the normal order
        // and the pinned photo is dropped from its original position.
        const deck = orderForSharedPhoto(body.photos, readSharedSlug());

        setUser(sessionBody.user);
        setPhotos(deck);
        setLoadState("ready");

        const initial = deck[0]?.rating.mine ?? DEFAULT_RATING;
        ratingRef.current = initial;
        setRating(initial);
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [identity]);

  useEffect(() => {
    return () => {
      if (flipTimer.current) clearTimeout(flipTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const activeItem = photos?.[currentIndex];

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

      const next = list[nextIndex]?.rating.mine ?? DEFAULT_RATING;
      ratingRef.current = next;
      setRating(next);
      isRatingRef.current = false;
      setIsRating(false);
      setJustRated(false);
      haptic("impact");

      if (flipTimer.current) clearTimeout(flipTimer.current);
      flipTimer.current = setTimeout(() => setIsFlipping(false), FLIP_DURATION_MS);
    },
    [isFlipping],
  );

  const beginRating = useCallback((clientY: number, source: InputSource) => {
    ratingSource.current = source;
    isRatingRef.current = true;
    dragOrigin.current = { y: clientY, rating: ratingRef.current };
    setIsRating(true);
    setJustRated(false);
    setHasInteracted(true);
    haptic("impact");
  }, []);

  const moveRating = useCallback(
    (clientY: number) => {
      const delta = dragOrigin.current.y - clientY;
      setRatingValue(
        roundRating(clampRating(dragOrigin.current.rating + delta / PIXELS_PER_POINT)),
      );
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
        setHasInteracted(true);
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
      const handleMove = (event: globalThis.PointerEvent) => moveRating(event.clientY);
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
      if (touch) moveRating(touch.clientY);
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
    async (index: number, target: SpotTarget, emoji: string): Promise<number | null> => {
      const photo = photosRef.current?.[index];
      if (!photo) return null;

      setHasInteracted(true);
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

        if (!response.ok) return null;

        const body = (await response.json()) as { spots: FeedSpot[]; removed: boolean; spotId: number };
        setPhotos((previous) =>
          previous?.map((entry, entryIndex) =>
            entryIndex === index ? { ...entry, spots: body.spots } : entry,
          ) ?? null,
        );
        haptic(body.removed ? "warning" : "success");
        return body.spotId;
      } catch {
        return null;
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

      setHasInteracted(true);

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

  const handleInteraction = useCallback(() => setHasInteracted(true), []);

  const shareCurrentPhoto = useCallback(() => {
    const photo = photosRef.current?.[currentIndex];
    if (!photo) return;

    haptic("impact");
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
      <div className="flex h-full items-center justify-center">
        <p className="animate-pulse text-xs font-medium text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (loadState === "error" || !photos || photos.length === 0) {
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
        onInfoClick={() => setIsInfoOpen(true)}
      />

      <section
        aria-label="Tumpukan foto untuk dinilai"
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
              onInteraction={handleInteraction}
            />
          ))}
        </div>

        <GestureHint visible={!hasInteracted} />
        <RatingOverlay rating={rating} visible={isRating || justRated} settled={justRated} />
      </section>

      <InfoModal open={isInfoOpen} user={user} onClose={() => setIsInfoOpen(false)} />
    </div>
  );
}
