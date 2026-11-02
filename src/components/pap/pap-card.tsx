"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { useImageBox } from "@/hooks/use-image-box";
import { usePinchZoom } from "@/hooks/use-pinch-zoom";
import { track } from "@/lib/analytics/track";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { setNsfwReveal, useNsfwReveal } from "@/lib/nsfw";
import type { DrawStroke } from "@/lib/draw";
import { findSpotAt } from "@/lib/reaction-rules";
import { QUICK_REACTION_EMOJIS } from "@/lib/reactions/catalog";
import { pushRecentEmoji, useRecentEmojis } from "@/lib/reactions/recent";
import { haptic, openTelegramUrl } from "@/lib/telegram";
import { consumeDrawingSlideTarget, reportUrl } from "@/lib/share";
import type {
  FeedComment,
  FeedDrawingSlide,
  FeedPhoto,
  FeedSpot,
} from "@/lib/feed-types";
import type { CardPosition, DragAxis, InputSource, ReactionResult, SpotTarget } from "@/lib/types";
import { CaptionText } from "./caption-text";
import {
  DEFAULT_DRAW_TOOL,
  DrawCanvas,
  DrawingOverlay,
  DrawToolbar,
  type DrawTool,
} from "./draw-canvas";
import { RatingSlider } from "./rating-slider";
import { ReactionBar } from "./reaction-bar";
import { ReactionSheet } from "./reaction-sheet";
import { SpotMarker } from "./spot-marker";
import { SpotPanel, type PanelMode } from "./spot-panel";
import { VideoSurface } from "./video-surface";

type RippleState = { key: number; x: number; y: number };

type Interaction = {
  xPct: number;
  yPct: number;
  spotId: number | null;
  /** "emoji" renders the reaction bar, the rest render the comment panel. */
  mode: PanelMode | "emoji";
  /** Opened by the automatic preview, not by the user. */
  auto?: boolean;
};

type PapCardProps = {
  item: FeedPhoto;
  position: CardPosition;
  /** Hidden by default so a photo is seen without the reaction layer. */
  showReactions: boolean;
  priority: boolean;
  rating: number;
  ratingDragging: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onReact: (target: SpotTarget, emoji: string) => Promise<ReactionResult>;
  onComment: (
    target: SpotTarget,
    body: string,
  ) => Promise<{ spotId: number; comments: FeedComment[] } | null>;
  onLoadComments: (spotId: number) => Promise<FeedComment[]>;
  onDeleteComment: () => Promise<boolean>;
  onRatingStart: (position: number, source: InputSource, axis: DragAxis) => void;
  onRatingKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRatingBlur: () => void;
  onPrevious: () => void;
  onNext: () => void;
  /** Lets the deck lock swiping while a pinch is in progress. */
  onZoomChange?: (zoomed: boolean) => void;
  /** Staged rollout: the private drawing canvas is only offered to some users. */
  paintEnabled: boolean;
  /** The card claimed a horizontal drag, so the deck must not flip. */
  onHorizontalClaim?: () => void;
  /** Staged rollout: the user may publish their drawing to the feed carousel. */
  drawShareEnabled: boolean;
};

const TRANSFORMS: Record<CardPosition, string> = {
  previous: "translateY(-120%) rotateX(65deg) scale(0.85)",
  active: "translateY(0%) rotateX(0deg) scale(1)",
  next: "translateY(120%) rotateX(-65deg) scale(0.85)",
};

const LONG_PRESS_MS = 420;
const TAP_SLOP_PX = 12;
/** Auto comment preview: one photo per app session, shown briefly. */
const PREVIEW_DELAY_MS = 700;
const PREVIEW_SLIDE_MS = 2000;
const PREVIEW_MAX_MS = 10_000;
const PREVIEW_SESSION_KEY = "retpap:comment-preview";
/** Horizontal drag must clear this to become a carousel swipe. */
const SLIDE_ACTIVATION_PX = 12;
const SLIDE_THRESHOLD_PX = 60;
/** Telegram and iOS own the first pixels of the left edge for back swipes. */
const SLIDE_EDGE_PX = 24;
/** px/ms; a quick flick changes slide even under the distance threshold. */
const SLIDE_FLICK_VELOCITY = 0.3;

export function PapCard({
  item,
  position,
  showReactions,
  priority,
  rating,
  ratingDragging,
  canGoPrevious,
  canGoNext,
  onReact,
  onComment,
  onLoadComments,
  onDeleteComment,
  onRatingStart,
  onRatingKeyDown,
  onRatingBlur,
  onPrevious,
  onNext,
  onZoomChange,
  paintEnabled,
  onHorizontalClaim,
  drawShareEnabled,
}: PapCardProps) {
  const isActive = position === "active";
  const [ripple, setRipple] = useState<RippleState | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);
  // null until the user's own canvas has been fetched.
  const [strokes, setStrokes] = useState<DrawStroke[] | null>(null);
  const [painting, setPainting] = useState(false);
  const [tool, setTool] = useState<DrawTool>(DEFAULT_DRAW_TOOL);
  /** Canvas as it was when the user entered drawing mode, restored by Batal. */
  const entryStrokes = useRef<DrawStroke[]>([]);
  const recent = useRecentEmojis();
  const nsfwGlobal = useNsfwReveal();
  const [nsfwHere, setNsfwHere] = useState(false);
  // Telegram can report a pre-rotation size for videos; the real video size
  // wins once metadata is available so markers stay on the frame.
  const [mediaSize, setMediaSize] = useState({
    width: item.imageWidth,
    height: item.imageHeight,
  });

  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const touchTapStart = useRef<{ x: number; y: number } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const commentRequest = useRef(0);
  const previewTimer = useRef<number | null>(null);
  const previewHide = useRef<number | null>(null);
  const previewStarted = useRef(false);
  // Mirrors `interaction` for timers, which must not re-run the effect below.
  const interactionRef = useRef<Interaction | null>(null);
  // A pinch just happened: the touch fallback must not treat its release as a tap.
  const pinched = useRef(false);
  const photoRef = useRef<HTMLDivElement>(null);
  const box = useImageBox(photoRef, mediaSize.width, mediaSize.height);

  const nsfwHidden = item.isNsfw && !nsfwGlobal && !nsfwHere;

  // Zoom is a magnifier: it only exists while two fingers are down, so the
  // reaction layer comes back the moment they lift.
  const pinch = usePinchZoom({
    maxScale: item.mediaType === "video" ? 3 : 4,
    // A rating drag already owns the pointer; pinching mid-drag would commit a
    // stray score when the first finger lifts.
    enabled: isActive && !nsfwHidden && !ratingDragging && !painting,
    onZoomChange,
  });

  const reactionsVisible = showReactions && !nsfwHidden && !pinch.zoomed;

  // The canvas is private, so it is fetched once per card and only for the
  // signed-in user. `hasDrawing` comes from the feed, which keeps the request
  // off every photo the user never drew on.
  useEffect(() => {
    if (!isActive || strokes !== null) return;

    let cancelled = false;
    void (async () => {
      if (!item.hasDrawing) {
        setStrokes([]);
        return;
      }

      try {
        const response = await fetch("/api/photos/" + item.id + "/drawing", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("drawing");
        const body = (await response.json()) as { strokes: DrawStroke[] };
        if (!cancelled) setStrokes(body.strokes);
      } catch {
        if (!cancelled) setStrokes([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, item.hasDrawing, item.id, strokes]);

  // Carousel slides: shared drawings, plus the viewer's own canvas. Fetched
  // only when the feed says there is at least one, and only on the active card.
  const [slides, setSlides] = useState<FeedDrawingSlide[] | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDrag, setSlideDrag] = useState(0);
  const [slideDragging, setSlideDragging] = useState(false);
  // Asked once after Selesai; the drawing stays private until this is answered.
  const [sharePrompt, setSharePrompt] = useState(false);
  const [shareAnonymous, setShareAnonymous] = useState(true);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const slideIndexRef = useRef(0);
  const slideDragRef = useRef(0);
  const slideAxis = useRef<"x" | "y" | null>(null);
  const slideOrigin = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const slidePointers = useRef(new Set<number>());

  useEffect(() => {
    if (!isActive || slides !== null || item.drawingSlides <= 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/photos/" + item.id + "/drawings", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("slides");
        const body = (await response.json()) as { slides: FeedDrawingSlide[] };
        if (!cancelled) setSlides(body.slides);
      } catch {
        if (!cancelled) setSlides([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, item.drawingSlides, item.id, slides]);

  // The owner's slide follows the live canvas: clearing every stroke must not
  // leave the previous snapshot on screen until a reload.
  const strokesFor = (entry: FeedDrawingSlide) =>
    entry.mine ? (strokes ?? entry.strokes) : entry.strokes;

  // One slide per drawing, plus the original photo at index 0.
  const visibleSlides = slides?.filter((entry) => strokesFor(entry).length > 0) ?? null;
  const slideTotal = visibleSlides ? visibleSlides.length + 1 : item.drawingSlides + 1;
  const mySlide = slides?.find((entry) => entry.mine) ?? null;

  // A new photo always opens on its original frame.
  useEffect(() => {
    slideIndexRef.current = 0;
    slideDragRef.current = 0;
    slideAxis.current = null;
    slideOrigin.current = null;
    setSlideIndex(0);
    setSlideDrag(0);
    setSlideDragging(false);
  }, [item.id, isActive, nsfwHidden]);

  // A `startapp=draw-...` launch opens straight on that drawing's slide.
  useEffect(() => {
    if (!isActive || !visibleSlides) return;

    const target = consumeDrawingSlideTarget(item.slug);
    if (target === null) return;

    const index = visibleSlides.findIndex((entry) => entry.id === target);
    if (index < 0) return;

    slideIndexRef.current = index + 1;
    setSlideIndex(index + 1);
  }, [isActive, item.slug, visibleSlides]);

  // Clearing the canvas can remove the slide the user is standing on.
  useEffect(() => {
    if (slideIndexRef.current <= slideTotal - 1) return;
    slideIndexRef.current = 0;
    slideDragRef.current = 0;
    setSlideIndex(0);
    setSlideDrag(0);
  }, [slideTotal]);

  /** Re-reads the carousel after a share change, so the slide appears at once. */
  const refreshSlides = async () => {
    try {
      const response = await fetch("/api/photos/" + item.id + "/drawings", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as { slides: FeedDrawingSlide[] };
      setSlides(body.slides);
      // The slide the user was on may have just been unpublished.
      if (slideIndexRef.current > body.slides.length) {
        slideIndexRef.current = 0;
        setSlideIndex(0);
      }
    } catch {
      // Keep the current list; the next open will refetch.
    }
  };

  const setShare = async (shared: boolean, anonymous: boolean): Promise<boolean> => {
    if (!drawShareEnabled || shareBusy) return false;

    setShareBusy(true);
    setShareFailed(false);

    // Optimistic: the label flips on tap, the refetch only confirms it. Without
    // this a slow round trip looks like the button did nothing.
    const before = slides;
    setSlides((current) =>
      current
        ? current.map((entry) =>
            entry.mine ? { ...entry, shared, isAnonymous: anonymous } : entry,
          )
        : current,
    );

    try {
      const response = await fetch("/api/photos/" + item.id + "/drawing/share", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shared, anonymous }),
        cache: "no-store",
      });
      if (!response.ok) {
        setSlides(before);
        setShareFailed(true);
        return false;
      }

      track(shared ? "draw_share" : "draw_unshare", {
        photoId: item.id,
        meta: shared ? { anonymous } : undefined,
      });
      await refreshSlides();
      return true;
    } catch {
      setSlides(before);
      setShareFailed(true);
      return false;
    } finally {
      setShareBusy(false);
    }
  };

  const beginSlide = (x: number, y: number) => {
    if (!isActive || painting || nsfwHidden || slideTotal < 2) return;
    if (pinch.zoomed || interaction !== null) return;

    const frame = photoRef.current;
    if (!frame) return;
    // Leave the left edge to Telegram: that strip is a back swipe.
    if (x - frame.getBoundingClientRect().left < SLIDE_EDGE_PX) return;

    slideOrigin.current = {
      x,
      y,
      lastX: x,
      lastT: performance.now(),
      velocity: 0,
    };
    slideAxis.current = null;
  };

  const moveSlide = (x: number, y: number) => {
    const origin = slideOrigin.current;
    if (!origin) return;

    const dx = x - origin.x;
    const dy = y - origin.y;

    if (slideAxis.current === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLIDE_ACTIVATION_PX) return;
      // Vertical wins ties: flipping photos is the primary gesture.
      slideAxis.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";

      if (slideAxis.current === "x") {
        onHorizontalClaim?.();
        closePanel();
        clearPress();
        setSlideDragging(true);
      }
    }

    if (slideAxis.current !== "x") return;

    const now = performance.now();
    const elapsed = now - origin.lastT;
    if (elapsed > 0) origin.velocity = (x - origin.lastX) / elapsed;
    origin.lastX = x;
    origin.lastT = now;

    let next = dx;
    const atStart = slideIndexRef.current === 0 && next > 0;
    const atEnd = slideIndexRef.current === slideTotal - 1 && next < 0;
    if (atStart || atEnd) next *= 0.35;

    slideDragRef.current = next;
    setSlideDrag(next);
  };

  const cancelSlide = () => {
    slideOrigin.current = null;
    slideAxis.current = null;
    slideDragRef.current = 0;
    setSlideDrag(0);
    setSlideDragging(false);
  };

  const endSlide = () => {
    const origin = slideOrigin.current;
    const axis = slideAxis.current;
    slideOrigin.current = null;
    slideAxis.current = null;

    if (!origin || axis !== "x") {
      cancelSlide();
      return;
    }

    const width = photoRef.current?.clientWidth ?? 360;
    const delta = slideDragRef.current;
    const threshold = Math.min(SLIDE_THRESHOLD_PX, width * 0.18);
    const flick = Math.abs(delta) > SLIDE_ACTIVATION_PX && Math.abs(origin.velocity) > SLIDE_FLICK_VELOCITY;

    let next = slideIndexRef.current;
    if (delta < 0 && (delta < -threshold || flick)) next += 1;
    else if (delta > 0 && (delta > threshold || flick)) next -= 1;
    next = Math.max(0, Math.min(slideTotal - 1, next));

    slideDragRef.current = 0;
    setSlideDrag(0);
    setSlideDragging(false);

    if (next === slideIndexRef.current) return;

    slideIndexRef.current = next;
    setSlideIndex(next);
    closePanel();
    setSheetOpen(false);
    setRipple(null);
    if (next > 0) {
      track("draw_slide_view", { photoId: item.id, meta: { index: next } });
    }
  };

  const handleSlidePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    slidePointers.current.add(event.pointerId);
    if (slidePointers.current.size !== 1) {
      cancelSlide();
      return;
    }
    beginSlide(event.clientX, event.clientY);
  };

  const handleSlidePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!slidePointers.current.has(event.pointerId)) return;
    moveSlide(event.clientX, event.clientY);
  };

  const handleSlidePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    slidePointers.current.delete(event.pointerId);
    if (slidePointers.current.size === 0) endSlide();
  };

  const handleSlideTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho() || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch) beginSlide(touch.clientX, touch.clientY);
  };

  const handleSlideTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho()) return;
    const touch = event.touches[0];
    if (touch) moveSlide(touch.clientX, touch.clientY);
  };

  const handleSlideTouchEnd = () => {
    if (isTouchEcho()) return;
    endSlide();
  };

  const handleIntrinsicSize = useCallback((width: number, height: number) => {
    setMediaSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const blurSrc = item.mediaType === "video" ? item.posterUrl : item.imageUrl;
  const aspect = mediaSize.height / mediaSize.width;
  // Landscape media leaves the bottom edge free; portrait keeps the right rail.
  const landscape = mediaSize.width > mediaSize.height * 1.15;
  const spot = interaction?.spotId ? (item.spots.find((entry) => entry.id === interaction.spotId) ?? null) : null;

  const toPct = useCallback((clientX: number, clientY: number) => {
    const element = photoRef.current;
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const scaleX = element.clientWidth > 0 ? rect.width / element.clientWidth : 1;
    const scaleY = element.clientHeight > 0 ? rect.height / element.clientHeight : 1;
    const containerX = (clientX - rect.left) / scaleX;
    const containerY = (clientY - rect.top) / scaleY;

    return {
      x: (containerX - box.left) / box.width,
      y: (containerY - box.top) / box.height,
      containerX,
      containerY,
    };
  }, [box.left, box.top, box.width, box.height]);

  const loadComments = useCallback(
    async (spotId: number) => {
      const token = ++commentRequest.current;
      setComments(null);
      const list = await onLoadComments(spotId);
      if (token === commentRequest.current) setComments(list);
    },
    [onLoadComments],
  );

  const openForSpot = useCallback(
    (target: FeedSpot, mode?: PanelMode) => {
      // A spot is either a reaction spot or a comment spot.
      const next: PanelMode | "emoji" = mode ?? (target.comments > 0 ? "comments" : "emoji");

      setInteraction({ xPct: target.x, yPct: target.y, spotId: target.id, mode: next });
      if (next === "comments") void loadComments(target.id);
      haptic("selection");
    },
    [loadComments],
  );

  const openPoint = useCallback(
    (xPct: number, yPct: number, mode: "emoji" | "comments") => {
      if (mode === "emoji") {
        // Tapping a comment spot opens its thread instead of starting a
        // reaction on top of it.
        const snapped = findSpotAt(item.spots, xPct, yPct, aspect);
        const target = snapped === null ? null : (item.spots.find((entry) => entry.id === snapped) ?? null);

        if (target && target.comments > 0) {
          setInteraction({ xPct: target.x, yPct: target.y, spotId: target.id, mode: "comments" });
          void loadComments(target.id);
          haptic("selection");
          return;
        }

        setInteraction({ xPct, yPct, spotId: target?.id ?? null, mode: "emoji" });
        haptic("selection");
        return;
      }

      // A hold only reuses comment spots; landing on a reaction spot would
      // break the one-kind-per-spot rule.
      const commentSpots = item.spots.filter((entry) => entry.comments > 0);
      const snapped = findSpotAt(commentSpots, xPct, yPct, aspect);
      const target = snapped === null ? null : (commentSpots.find((entry) => entry.id === snapped) ?? null);

      setInteraction({ xPct, yPct, spotId: target?.id ?? null, mode: target ? "comments" : "composer" });
      if (target) void loadComments(target.id);
      haptic("impact");
    },
    [aspect, item.spots, loadComments],
  );

  const clearPreviewTimers = useCallback(() => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
    if (previewHide.current !== null) {
      window.clearTimeout(previewHide.current);
      previewHide.current = null;
    }
  }, []);

  const closePanel = useCallback(() => {
    clearPreviewTimers();
    setInteraction(null);
    setComments(null);
    setSheetOpen(false);
    setReactError(null);
  }, [clearPreviewTimers]);

  const activeRef = useRef(false);
  const ratingRef = useRef(false);

  useEffect(() => {
    interactionRef.current = interaction;
    activeRef.current = isActive;
    ratingRef.current = ratingDragging;
  }, [interaction, isActive, ratingDragging]);

  /**
   * One automatic comment preview per app session: the first active photo that
   * has a comment spot opens its thread for a few seconds. The session flag is
   * claimed before the fetch, so a failure never turns into a retry loop.
   */
  useEffect(() => {
    if (!isActive || nsfwHidden || ratingDragging) return;
    // A re-render (new spots array after a reaction, say) must not restart or
    // cancel a preview that is already scheduled.
    if (previewStarted.current) return;

    try {
      if (window.sessionStorage.getItem(PREVIEW_SESSION_KEY)) return;
    } catch {
      return;
    }

    const spots = item.spots.filter((entry) => entry.comments > 0);
    if (spots.length === 0) return;

    previewStarted.current = true;
    try {
      window.sessionStorage.setItem(PREVIEW_SESSION_KEY, "1");
    } catch {
      // Private mode without storage: the ref above still keeps it to one run.
    }
    const target = spots[Math.floor(Math.random() * spots.length)];

    previewTimer.current = window.setTimeout(async () => {
      previewTimer.current = null;
      if (!activeRef.current || ratingRef.current || interactionRef.current !== null) return;

      const list = await onLoadComments(target.id).catch(() => [] as FeedComment[]);
      if (list.length === 0) return;
      // The user may have opened something, or swiped away, while the request
      // was in flight.
      if (!activeRef.current || ratingRef.current || interactionRef.current !== null) return;

      setInteraction({
        xPct: target.x,
        yPct: target.y,
        spotId: target.id,
        mode: "comments",
        auto: true,
      });
      setComments(list);

      const duration = Math.min(list.length * PREVIEW_SLIDE_MS + 1500, PREVIEW_MAX_MS);
      previewHide.current = window.setTimeout(() => {
        previewHide.current = null;
        closePanel();
      }, duration);
    }, PREVIEW_DELAY_MS);
  }, [closePanel, isActive, item.spots, nsfwHidden, onLoadComments, ratingDragging]);

  // A manual panel replaces the preview: its own hide timer must not fire.
  useEffect(() => {
    if (interaction !== null && interaction.auto !== true) clearPreviewTimers();
  }, [clearPreviewTimers, interaction]);

  useEffect(() => clearPreviewTimers, [clearPreviewTimers]);

  // One Escape owner: the sheet closes first, then the panel. Two document
  // listeners would close both at once.
  useEffect(() => {
    if (!isActive) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sheetOpen) {
        setSheetOpen(false);
        return;
      }
      if (interaction) closePanel();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closePanel, interaction, isActive, sheetOpen]);

  const handleEmoji = useCallback(
    async (emoji: string) => {
      if (!interaction || busy) return;
      setBusy(true);
      setReactError(null);
      const result = await onReact(
        { spotId: interaction.spotId, xPct: interaction.xPct, yPct: interaction.yPct },
        emoji,
      );
      setBusy(false);

      if (!result.ok) {
        setReactError(
          result.code === "unknown_emoji"
            ? "Emoji ini tidak dikenal. Perbarui aplikasi."
            : "Gagal menyimpan reaksi.",
        );
        haptic("warning");
        return;
      }

      pushRecentEmoji(emoji);
      // Picking an emoji is the whole interaction: the panel gets out of the
      // way instead of turning into a counter view.
      closePanel();
    },
    [busy, closePanel, interaction, onReact],
  );

  const handleComment = useCallback(
    async (body: string) => {
      if (!interaction || busy) return;
      setBusy(true);
      const result = await onComment(
        { spotId: interaction.spotId, xPct: interaction.xPct, yPct: interaction.yPct },
        body,
      );
      setBusy(false);
      if (!result) return;

      // One comment per photo: nothing left to type here.
      commentRequest.current += 1;
      closePanel();
    },
    [busy, closePanel, interaction, onComment],
  );

  const handleDeleteComment = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const removed = await onDeleteComment();
    setBusy(false);
    if (removed) closePanel();
  }, [busy, closePanel, onDeleteComment]);

  /* ---- gestures on the photo surface ---- */

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = (clientX: number, clientY: number) => {
    clearPress();
    longFired.current = false;
    pressOrigin.current = { x: clientX, y: clientY };

    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longFired.current = true;
      const at = toPct(clientX, clientY);
      if (!at || at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) return;
      // Hold is the heavier gesture: it always means "write a comment".
      openPoint(at.x, at.y, "comments");
    }, LONG_PRESS_MS);
  };

  const movePress = (clientX: number, clientY: number) => {
    const origin = pressOrigin.current;
    if (!origin) return;
    if (Math.hypot(clientX - origin.x, clientY - origin.y) > 10) clearPress();
  };

  const finishPress = (clientX: number, clientY: number) => {
    clearPress();
    pressOrigin.current = null;

    if (longFired.current) {
      longFired.current = false;
      return;
    }

    // Any open panel: the first tap outside just dismisses it.
    if (interaction) {
      closePanel();
      return;
    }

    const at = toPct(clientX, clientY);
    if (!at || at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) return;

    setRipple({ key: Date.now(), x: at.containerX, y: at.containerY });
    openPoint(at.x, at.y, "emoji");
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    notePointerInput();

    if (pinch.handlers.onPointerDown(event)) {
      // Second finger: drop the tap/long-press gesture for the pinch.
      pinched.current = true;
      tapStart.current = null;
      touchTapStart.current = null;
      clearPress();
      closePanel();
      return;
    }

    pinched.current = false;
    tapStart.current = { x: event.clientX, y: event.clientY };
    startPress(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    pinch.handlers.onPointerMove(event);
    movePress(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const wasZoomed = pinch.zoomed;
    pinch.handlers.onPointerUp(event);
    if (wasZoomed) {
      tapStart.current = null;
      clearPress();
      return;
    }

    const start = tapStart.current;
    tapStart.current = null;
    if (!start) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > TAP_SLOP_PX && !longFired.current) {
      clearPress();
      return;
    }

    finishPress(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho() || pinched.current || event.touches.length > 1) return;

    const touch = event.touches[0];
    if (!touch) return;

    touchTapStart.current = { x: touch.clientX, y: touch.clientY };
    startPress(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (pinched.current) return;
    const touch = event.touches[0];
    if (touch) movePress(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho() || pinched.current) return;

    const start = touchTapStart.current;
    touchTapStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) {
      clearPress();
      return;
    }

    finishPress(touch.clientX, touch.clientY);
  };

  const handleTapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const at = toPct(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!at) return;
    openPoint(at.x, at.y, "emoji");
  };

  const strokesRef = useRef<DrawStroke[]>([]);
  const saveTimer = useRef<number | null>(null);

  /** Only counts leave the device; the coordinates never enter analytics. */
  const strokeStats = (list: DrawStroke[]) => {
    let points = 0;
    for (const stroke of list) points += stroke.points.length;
    return { strokes: list.length, points };
  };

  const putStrokes = useCallback(
    (next: DrawStroke[]) =>
      fetch("/api/photos/" + item.id + "/drawing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strokes: next }),
        cache: "no-store",
      })
        .then(() => undefined)
        .catch(() => undefined),
    [item.id],
  );

  /** Debounced save: a stroke is one of many, so only the last one hits the API. */
  const commitStrokes = useCallback(
    (next: DrawStroke[]) => {
      strokesRef.current = next;
      setStrokes(next);

      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        putStrokes(next);
      }, 600);
    },
    [putStrokes],
  );

  /** Leaving the canvas must not drop the stroke that was still pending. */
  const flushStrokes = useCallback(() => {
    if (saveTimer.current === null) return Promise.resolve();
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    return putStrokes(strokesRef.current);
  }, [putStrokes]);

  const startPainting = () => {
    if (!paintEnabled) return;
    setSheetOpen(false);
    setInteraction(null);
    setSharePrompt(false);
    // Drawing always happens on the original frame, never on a shared slide.
    slideIndexRef.current = 0;
    setSlideIndex(0);
    // Drawing needs an unobstructed view, so the 18+ blur is lifted here and
    // stays lifted for this card.
    setNsfwHere(true);
    entryStrokes.current = strokes ?? [];
    track("draw_open", {
      photoId: item.id,
      meta: { existing: (strokes ?? []).length > 0 },
    });
    setPainting(true);
  };

  const stopPainting = () => {
    // A pending timer means this session actually changed something.
    const changed = saveTimer.current !== null;
    const final = strokesRef.current;
    if (changed && final.length > 0) {
      track("draw_save", { photoId: item.id, meta: strokeStats(final) });
    }

    setPainting(false);

    // The carousel keeps its own copy of the strokes, so re-read it once the
    // save lands: a cleared canvas must not keep showing the old drawing.
    // Sharing waits for the same save, otherwise a first-ever drawing can be
    // shared before its row exists and the PATCH answers 404.
    void flushStrokes()
      .then(() => refreshSlides())
      .then(() => {
        if (!drawShareEnabled || final.length === 0) return;
        setShareAnonymous(mySlide?.isAnonymous ?? true);
        setSharePrompt(true);
      });
  };

  /** Batal throws away this session: the server is put back to the entry state. */
  const cancelPainting = () => {
    setSharePrompt(false);
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const discarded = strokeStats(strokesRef.current);
    if (discarded.strokes > 0) {
      track("draw_cancel", {
        photoId: item.id,
        meta: { strokes: discarded.strokes },
      });
    }

    const previous = entryStrokes.current;
    strokesRef.current = previous;
    setStrokes(previous);
    void putStrokes(previous).then(() => refreshSlides());
    setPainting(false);
  };

  // Frame width without touching the ref during render: the image box is
  // centred, so frame = left + width + left.
  const frameWidth = box.width > 0 ? box.left * 2 + box.width : 360;
  const panelHalf = 118 + 8;
  const panelX = interaction
    ? Math.max(panelHalf, Math.min(frameWidth - panelHalf, box.left + interaction.xPct * box.width))
    : 0;
  const panelY = interaction ? box.top + interaction.yPct * box.height : 0;

  // The bar is anchored to the tapped point, not to the panel centre.
  const frameHeight = box.height > 0 ? box.top * 2 + box.height : 640;
  const anchorX = interaction ? box.left + interaction.xPct * box.width : 0;
  const anchorY = interaction ? box.top + interaction.yPct * box.height : 0;

  // Same clamp the bar uses, so the comment panel's tail keeps pointing at the
  // tap even when the panel is pushed away from the edge.
  const PANEL_WIDTH = 236;
  const panelTailX = Math.max(
    18,
    Math.min(anchorX - panelX + PANEL_WIDTH / 2, PANEL_WIDTH - 18),
  );

  // Reacted emoji first (already sorted by count), then recent picks, then the
  // defaults, so the five slots are always full.
  const reacted = spot?.reactions ?? [];
  const counts = new Map(reacted.map((reaction) => [reaction.emoji, reaction.count]));
  const barEmojis = (() => {
    const list = reacted.map((reaction) => reaction.emoji);
    const target = Math.max(5, list.length);
    for (const emoji of [...recent, ...QUICK_REACTION_EMOJIS]) {
      if (list.length >= target) break;
      if (!list.includes(emoji)) list.push(emoji);
    }
    return list.map((emoji) => ({
      emoji,
      count: counts.get(emoji) ?? 0,
      mine: spot?.myEmoji === emoji,
    }));
  })();

  // Scaling about the pinch midpoint keeps the point under the fingers fixed.
  // The container is untouched, so useImageBox and toPct stay valid.
  const mediaStyle =
    pinch.zoom.scale > 1
      ? {
          transform: "scale(" + pinch.zoom.scale + ")",
          transformOrigin: pinch.zoom.ox + "px " + pinch.zoom.oy + "px",
        }
      : undefined;

  return (
    <article
      aria-hidden={!isActive}
      inert={!isActive}
      className="card-face glass-panel border border-slate-700/60 p-2 sm:p-3"
      style={{
        transform: TRANSFORMS[position],
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 10 : 5,
        pointerEvents: isActive ? "auto" : "none",
      }}
    >
      <div className="flex h-full flex-col gap-2">
        <div
          ref={photoRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-inner"
        >
          <div
            className="absolute inset-0 flex touch-none"
            style={{
              transform:
                "translate3d(calc(" + -slideIndex * 100 + "% + " + slideDrag + "px), 0, 0)",
              transition: slideDragging
                ? "none"
                : "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            }}
            onPointerDown={handleSlidePointerDown}
            onPointerMove={handleSlidePointerMove}
            onPointerUp={handleSlidePointerEnd}
            onPointerCancel={handleSlidePointerEnd}
            onTouchStart={handleSlideTouchStart}
            onTouchMove={handleSlideTouchMove}
            onTouchEnd={handleSlideTouchEnd}
            onTouchCancel={handleSlideTouchEnd}
          >
          <div className="relative h-full w-full shrink-0">
          {nsfwHidden ? (
            blurSrc ? (
              <Image
                src={blurSrc}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 448px"
                preload={priority}
                className="pointer-events-none select-none object-contain"
                style={{ filter: "blur(36px) brightness(0.48)", transform: "scale(1.14)" }}
              />
            ) : (
              <div className="absolute inset-0 bg-slate-900" />
            )
          ) : item.mediaType === "video" ? (
            <VideoSurface
              src={item.imageUrl}
              poster={item.posterUrl}
              durationSeconds={item.durationSeconds}
              active={isActive}
              suspended={interaction !== null || ratingDragging}
              onIntrinsicSize={handleIntrinsicSize}
              mediaStyle={mediaStyle}
            />
          ) : (
            <Image
              src={item.imageUrl}
              alt={item.caption}
              fill
              sizes="(max-width: 640px) 100vw, 448px"
              preload={priority}
              className="pointer-events-none select-none object-contain"
              style={mediaStyle}
            />
          )}

          {!nsfwHidden && !painting && strokes && strokes.length > 0 ? (
            <DrawingOverlay box={box} strokes={strokes} />
          ) : null}

          {item.isNsfw ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (nsfwHidden) return;
                setNsfwHere(false);
                setInteraction(null);
                setComments(null);
                setSheetOpen(false);
                setNsfwReveal(false);
              }}
              aria-label={nsfwHidden ? "Konten 18+" : "Sembunyikan konten 18+"}
              tabIndex={nsfwHidden ? -1 : 0}
              className={
                "absolute top-2 right-2 z-40 rounded-md border border-white/25 bg-red-600 px-1.5 py-0.5 text-[10px] leading-none font-black text-white shadow-lg " +
                (nsfwHidden ? "pointer-events-none" : "")
              }
            >
              18+
            </button>
          ) : null}

          {nsfwHidden ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-950/55 px-6 text-center backdrop-blur-[1px]">
              <span className="rounded-xl border border-red-400/35 bg-red-500/15 px-3 py-1.5 text-sm font-black text-red-200">
                18+
              </span>
              <div className="space-y-1">
                <p className="text-sm font-black text-slate-100">Konten 18+</p>
                <p className="max-w-[240px] text-[11px] leading-relaxed text-slate-400">
                  Konten ini ditandai 18+ oleh uploader. Buka untuk melihat tanpa blur.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  track("nsfw_reveal", { photoId: item.id, meta: { always: false } });
                  setNsfwHere(true);
                }}
                className="w-full max-w-[220px] rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg shadow-cyan-500/25 active:scale-95"
              >
                Tampilkan
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={nsfwGlobal}
                onClick={() => {
                  track("nsfw_reveal", { photoId: item.id, meta: { always: true } });
                  setNsfwReveal(true);
                }}
                className="flex w-full max-w-[220px] items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/75 px-3 py-2 text-left active:scale-[0.99]"
              >
                <span className="text-[10.5px] leading-tight font-semibold text-slate-200">
                  Selalu tampilkan konten 18+
                </span>
                <span
                  aria-hidden="true"
                  className={
                    "relative h-[18px] w-8 shrink-0 rounded-full transition-colors " +
                    (nsfwGlobal ? "bg-cyan-400" : "bg-slate-600")
                  }
                >
                  <span
                    className={
                      "absolute top-0.5 size-[14px] rounded-full bg-white transition-transform " +
                      (nsfwGlobal ? "translate-x-[15px]" : "translate-x-0.5")
                    }
                  />
                </span>
              </button>
            </div>
          ) : null}

          {!nsfwHidden && !painting ? (
            <div
              role="button"
              tabIndex={isActive ? 0 : -1}
              aria-label="Tap untuk reaksi emoji, tahan untuk komentar"
              className="absolute inset-0 z-10 cursor-pointer touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={() => {
                touchTapStart.current = null;
                clearPress();
              }}
              onKeyDown={handleTapKeyDown}
            >
              {ripple ? (
                <span
                  key={ripple.key}
                  className="tap-ripple"
                  style={{ left: ripple.x - 20, top: ripple.y - 20 }}
                />
              ) : null}
            </div>
          ) : null}

          {/* Markers live on the image box, not on the letterboxed container. */}
          {reactionsVisible && !painting ? (
            <div
              className="pointer-events-none absolute z-20"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            >
              {item.spots.map((entry) => (
                <div
                  key={entry.id}
                  className="absolute"
                  style={{
                    left: "clamp(2.75rem, " + entry.x * 100 + "%, calc(100% - 2.75rem))",
                    top: entry.y * 100 + "%",
                  }}
                >
                  <SpotMarker
                    spot={entry}
                    onOpen={() => openForSpot(entry)}
                    onOpenComments={() => openForSpot(entry, "comments")}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* Hidden together with the reaction layer: the slider is the drag
              handle, so keeping it invisible would still swallow taps there. */}
          {reactionsVisible && !painting ? (
            <RatingSlider
              value={rating}
              dragging={ratingDragging}
              disabled={!isActive}
              orientation={landscape ? "horizontal" : "vertical"}
              onDragStart={(position, source, axis) => {
                onRatingStart(position, source, axis);
              }}
              onKeyDown={onRatingKeyDown}
              onBlur={onRatingBlur}
            />
          ) : null}

          {!nsfwHidden && isActive && interaction ? (
            interaction.mode === "emoji" ? (
              <ReactionBar
                anchorX={anchorX}
                anchorY={anchorY}
                frameWidth={frameWidth}
                frameHeight={frameHeight}
                emojis={barEmojis}
                onEmoji={(emoji) => void handleEmoji(emoji)}
                onMore={() => setSheetOpen(true)}
              />
            ) : (
              <SpotPanel
                x={panelX}
                y={panelY}
                above={interaction.yPct > 0.36}
                tailX={panelTailX}
                mode={interaction.mode}
                comments={comments}
                autoPlay={interaction.auto === true}
                onInteract={() => {
                  // Touching the preview turns it into a normal panel: no more
                  // auto-slide, no auto-hide while the user types.
                  if (interaction.auto === true) {
                    setInteraction({ ...interaction, auto: false });
                  }
                }}
                busy={busy}
                onComment={(body) => void handleComment(body)}
                onDeleteComment={() => void handleDeleteComment()}
              />
            )
          ) : null}

          {!nsfwHidden && isActive && interaction && sheetOpen ? (
            <ReactionSheet
              spot={spot}
              error={reactError}
              paintEnabled={paintEnabled}
              onPaint={startPainting}
              onPick={(emoji) => {
                setSheetOpen(false);
                void handleEmoji(emoji);
              }}
              onClose={() => setSheetOpen(false)}
            />
          ) : null}

          {!nsfwHidden && isActive && painting ? (
            <DrawCanvas
              box={box}
              strokes={strokes ?? []}
              tool={tool}
              onCommit={commitStrokes}
            />
          ) : null}
          </div>

          {!nsfwHidden && !painting
            ? visibleSlides?.map((entry) => (
                <div
                  key={entry.id}
                  className="relative h-full w-full shrink-0 bg-slate-950"
                >
                  {blurSrc ? (
                    <Image
                      src={blurSrc}
                      alt={entry.mine ? "Gambarmu" : "Gambar di foto ini"}
                      fill
                      sizes="(max-width: 640px) 100vw, 448px"
                      className="pointer-events-none select-none object-contain"
                    />
                  ) : null}

                  <DrawingOverlay box={box} strokes={strokesFor(entry)} />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent px-3 pt-8 pb-2">
                    <span className="text-[11px] leading-tight font-semibold text-slate-200">
                      {entry.mine
                        ? entry.shared
                          ? "Gambarmu · dibagikan" + (entry.isAnonymous ? " anonim" : "")
                          : "Gambarmu · hanya kamu yang lihat"
                        : "Gambar oleh " + entry.author.firstName}
                      {entry.mine && shareFailed ? (
                        <span className="block text-[10px] font-semibold text-rose-300">
                          Gagal menyimpan, coba lagi
                        </span>
                      ) : null}
                    </span>
                    {entry.mine ? (
                      drawShareEnabled ? (
                        <button
                          type="button"
                          disabled={shareBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            // Keep the label this slide already had.
                            void setShare(!entry.shared, entry.isAnonymous);
                          }}
                          className="pointer-events-auto rounded-md border border-white/15 bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-slate-300 active:scale-95 disabled:opacity-50"
                        >
                          {entry.shared ? "Berhenti bagikan" : "Bagikan"}
                        </button>
                      ) : null
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openTelegramUrl(reportUrl(item.id));
                        }}
                        className="pointer-events-auto rounded-md border border-white/15 bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-slate-300 active:scale-95"
                      >
                        Laporkan
                      </button>
                    )}
                  </div>
                </div>
              ))
            : null}
          </div>

          {!nsfwHidden && !painting && slideTotal > 1 ? (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center">
              <div className="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 backdrop-blur-sm">
                {Array.from({ length: slideTotal }).map((_, index) => (
                  <span
                    key={index}
                    className={
                      "h-1.5 rounded-full transition-all " +
                      (index === slideIndex ? "w-4 bg-cyan-300" : "w-1.5 bg-white/40")
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative z-10 shrink-0 space-y-2">
          {painting ? (
            <DrawToolbar
              tool={tool}
              canUndo={(strokes?.length ?? 0) > 0}
              onTool={setTool}
              onUndo={() => commitStrokes((strokes ?? []).slice(0, -1))}
              onClear={() => {
                const removed = strokeStats(strokes ?? []).strokes;
                if (removed > 0) {
                  track("draw_clear", { photoId: item.id, meta: { removed } });
                }
                commitStrokes([]);
              }}
              onDone={stopPainting}
              onCancel={cancelPainting}
            />
          ) : sharePrompt ? (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2">
              <p className="text-center text-[11px] font-bold text-slate-100">
                Bagikan gambar ini ke feed?
              </p>
              <p className="text-center text-[10px] leading-snug text-slate-500">
                Orang lain bisa menggeser ke gambarmu di foto ini. Jangan tulis nama,
                nomor, atau akun di gambar.
              </p>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5">
                <span className="text-[10.5px] font-semibold text-slate-300">
                  Tampilkan nama saya
                </span>
                <input
                  type="checkbox"
                  checked={!shareAnonymous}
                  onChange={(event) => setShareAnonymous(!event.target.checked)}
                  className="size-4 accent-cyan-400"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={shareBusy}
                  onClick={() => {
                    setSharePrompt(false);
                    if (mySlide?.shared) void setShare(false, shareAnonymous);
                  }}
                  className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 py-2 text-[11px] font-bold text-slate-300 active:scale-95 disabled:opacity-50"
                >
                  Simpan privat
                </button>
                <button
                  type="button"
                  disabled={shareBusy}
                  onClick={async () => {
                    const ok = await setShare(true, shareAnonymous);
                    if (ok) setSharePrompt(false);
                  }}
                  className="flex-1 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 py-2 text-[11px] font-bold text-white shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  Bagikan
                </button>
              </div>
            </div>
          ) : (
            <>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-1.5">
            <p className="line-clamp-2 text-center text-xs font-medium text-slate-200">
              <CaptionText text={item.caption} />
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className="glass-panel flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-40"
            >
              <ChevronUpIcon className="size-2.5 text-cyan-400" />
              <span>Sebelumnya</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-40"
            >
              <span>PAP Berikutnya</span>
              <ChevronDownIcon className="size-2.5" />
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
