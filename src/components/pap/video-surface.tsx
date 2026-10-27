"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { PlayIcon, VolumeOffIcon, VolumeOnIcon } from "@/components/icons";

type VideoSurfaceProps = {
  src: string;
  poster: string | null;
  durationSeconds: number | null;
  /** The card currently on top of the deck. */
  active: boolean;
  /** A comment panel or a rating drag is open. */
  suspended: boolean;
  /** Reports the real video size, used to correct rotated uploads. */
  onIntrinsicSize?: (width: number, height: number) => void;
};

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

export function VideoSurface({
  src,
  poster,
  durationSeconds,
  active,
  suspended,
  onIntrinsicSize,
}: VideoSurfaceProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  // Remaining-time badge: the countdown only needs one render per second, so
  // `timeupdate` (≈4 Hz) is filtered through `lastSecond`.
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState<number | null>(null);
  const lastSecond = useRef(0);
  // Leaving the card resets sound, so the next video never starts unmuted.
  // Adjusting state during render is React's recommended prop-change pattern.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setMuted(true);
  }

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (!active || suspended) {
      video.pause();
      return;
    }

    void video
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, [active, suspended]);

  const startPlayback = useCallback(() => {
    void ref.current
      ?.play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, []);

  // A new source starts from zero; the old progress must not leak into it.
  // Adjusting state during render is React's recommended prop-change pattern.
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    setCurrentTime(0);
    setLoadedDuration(null);
  }

  const totalSeconds = loadedDuration ?? durationSeconds;
  const remainingSeconds =
    totalSeconds === null ? null : Math.max(0, totalSeconds - currentTime);

  const stopGesture = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        preload={active ? "metadata" : "none"}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          lastSecond.current = 0;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            onIntrinsicSize?.(video.videoWidth, video.videoHeight);
          }
          // The DB stores whole seconds; the element knows the exact length.
          if (Number.isFinite(video.duration) && video.duration > 0) {
            setLoadedDuration(video.duration);
          }
        }}
        onTimeUpdate={(event) => {
          const second = Math.floor(event.currentTarget.currentTime);
          if (second === lastSecond.current) return;
          lastSecond.current = second;
          setCurrentTime(event.currentTarget.currentTime);
        }}
        className="pointer-events-none absolute inset-0 size-full select-none object-contain"
      />

      {active ? (
        <div className="absolute bottom-2 left-2 z-30 flex items-center gap-1.5">
          {blocked ? (
            <button
              type="button"
              aria-label="Putar video"
              onPointerDown={stopGesture}
              onTouchStart={stopGesture}
              onClick={(event) => {
                event.stopPropagation();
                startPlayback();
              }}
              className="flex size-8 items-center justify-center rounded-full border border-cyan-400/60 bg-slate-900/85 text-cyan-300 shadow-lg backdrop-blur-sm active:scale-95"
            >
              <PlayIcon className="ml-0.5 size-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
            onPointerDown={stopGesture}
            onTouchStart={stopGesture}
            onClick={(event) => {
              event.stopPropagation();
              setMuted((current) => !current);
            }}
            className="flex size-8 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/85 text-slate-200 shadow-lg backdrop-blur-sm active:scale-95"
          >
            {muted ? <VolumeOffIcon className="size-3.5" /> : <VolumeOnIcon className="size-3.5" />}
          </button>
        </div>
      ) : null}

      {remainingSeconds !== null && active ? (
        <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-100 backdrop-blur-sm">
          {formatDuration(Math.ceil(remainingSeconds))}
        </span>
      ) : null}
    </>
  );
}
