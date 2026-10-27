import { cn } from "@/lib/cn";
import { getRatingTone, ratingLevel } from "@/lib/rating";
import { RatingIcon } from "./rating-icon";

type RatingOverlayProps = {
  rating: number;
  visible: boolean;
  settled: boolean;
};

export function RatingOverlay({ rating, visible, settled }: RatingOverlayProps) {
  const tone = getRatingTone(rating);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "glass-panel flex flex-col items-center justify-center rounded-3xl border-2 border-white/20 p-6 shadow-2xl transition-transform duration-150",
          settled ? "scale-110" : visible ? "scale-100" : "scale-75",
        )}
      >
        <span className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-300">
          Ratingmu
        </span>
        <span className="text-6xl font-black tracking-tight text-white drop-shadow-md tabular-nums">
          {rating.toFixed(1)}
        </span>
        <RatingIcon level={ratingLevel(rating)} className="mt-2 size-16" />
        <span className="mt-1 text-[11px] font-medium text-slate-300">{tone.label}</span>
      </div>
    </div>
  );
}
