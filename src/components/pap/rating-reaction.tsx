import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type RatingReactionProps = {
  level: number;
  visible: boolean;
  settled: boolean;
};

export function RatingReaction({ level, visible, settled }: RatingReactionProps) {
  const rank = Math.min(10, Math.max(1, Math.round(level)));
  const bounce = 0.8 + rank * 0.48;
  const duration = Math.max(0.72, 1.8 - rank * 0.1);
  const src = rank === 10 ? "/rating-mascot.webp" : `/rating-reaction-${rank}.webp`;

  return (
    <div
      className={cn(
        "rating-reaction",
        visible && "rating-reaction-active",
        settled && "rating-reaction-settled",
      )}
      data-level={rank}
      style={{
        "--reaction-bounce": `${bounce}px`,
        "--reaction-duration": `${duration}s`,
      } as CSSProperties}
    >
      <Image
        key={rank}
        src={src}
        alt=""
        width={160}
        height={160}
        className="rating-reaction-image"
      />
      <span className="rating-reaction-spark rating-reaction-spark-left" />
      <span className="rating-reaction-spark rating-reaction-spark-right" />
    </div>
  );
}
