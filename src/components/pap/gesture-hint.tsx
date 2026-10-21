import { cn } from "@/lib/cn";

type GestureHintProps = {
  visible: boolean;
};

export function GestureHint({ visible }: GestureHintProps) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 transition-opacity duration-500",
        visible ? "opacity-90" : "opacity-0",
      )}
    >
      <div className="glass-panel flex items-center gap-2 rounded-full border border-cyan-500/30 px-3 py-1.5 text-[11px] text-slate-300 shadow-xl">
        <span className="inline-block animate-bounce">👇</span>
        <span>Tap photo to react • Hold a reaction to switch emoji • Drag slider to rate</span>
      </div>
    </div>
  );
}
