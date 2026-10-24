import { cn } from "@/lib/cn";

/**
 * Rating crystal, ten energy levels from docs/rating-icons-spec.md.
 *
 * The crystal silhouette never changes; only the energy layer does. That is
 * what keeps the ten icons reading as one family instead of ten symbols.
 * Geometry, palette and stroke weights follow the spec document exactly.
 */

const HEX = "M50 13 L73 31 L73 65 L50 90 L27 65 L27 31 Z";

type RatingIconProps = {
  /** 1..10. Anything outside is clamped. */
  level: number;
  className?: string;
  /** Motion is opt-out so a static screenshot or print stays still. */
  animated?: boolean;
  /** Pixel size; omit and size it with a className instead. */
  size?: number;
};

function Crystal({ dim = false }: { dim?: boolean }) {
  return (
    <g opacity={dim ? 0.5 : 1}>
      <path d={HEX} fill="#0B1220" fillOpacity=".1" />
      <path d="M27 42 H73" stroke="#7FA8D4" strokeOpacity=".35" strokeWidth="2" />
      <path d="M50 42 V90" stroke="#7FA8D4" strokeOpacity=".35" strokeWidth="2" />
      <path d={HEX} fill="none" stroke="#EAF4FF" strokeWidth="4.5" strokeLinejoin="round" />
      <path d={HEX} fill="none" stroke="#9CC0E8" strokeWidth="1.6" strokeLinejoin="round" />
      {dim ? null : (
        <path d="M50 13 L27 31" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
      )}
    </g>
  );
}

export function RatingIcon({ level, className, animated = true, size }: RatingIconProps) {
  const lv = Math.min(10, Math.max(1, Math.round(level)));

  // Gradient ids are per level, not per instance: two icons of the same level
  // define identical gradients, so duplicate ids are harmless and this keeps
  // the component free of hooks (usable in a server component too).
  const ice = "ri-ice-" + lv;
  const fire = "ri-fire-" + lv;
  const fireCore = "ri-fire-core-" + lv;
  const elec = "ri-elec-" + lv;
  const glowWarm = "ri-glow-warm-" + lv;
  const glowCool = "ri-glow-cool-" + lv;
  const glowWhite = "ri-glow-white-" + lv;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("block", className)}
      data-level={lv}
      data-animated={animated ? "true" : "false"}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={ice} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#BFDBFE" />
          <stop offset="1" stopColor="#7DD3FC" />
        </linearGradient>
        <linearGradient id={fire} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#EA580C" />
          <stop offset="1" stopColor="#FB923C" />
        </linearGradient>
        <linearGradient id={fireCore} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FDBA74" />
          <stop offset="1" stopColor="#FEF3C7" />
        </linearGradient>
        <linearGradient id={elec} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#FACC15" />
        </linearGradient>
        <radialGradient id={glowWarm}>
          <stop offset="0" stopColor="#FB923C" stopOpacity=".42" />
          <stop offset="1" stopColor="#FB923C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowCool}>
          <stop offset="0" stopColor="#7DD3FC" stopOpacity=".28" />
          <stop offset="1" stopColor="#7DD3FC" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowWhite}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".55" />
          <stop offset=".55" stopColor="#FDE047" stopOpacity=".25" />
          <stop offset="1" stopColor="#FDE047" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1 — Frost: icicles, one crack, snow specks. No glow. */}
      {lv === 1 ? (
        <>
          <path className="ri-glint" d="M33 69 L30 91 L41 72 Z" fill={"url(#" + ice + ")"} />
          <path
            className="ri-glint"
            d="M62 71 L68 90 L56 73 Z"
            fill={"url(#" + ice + ")"}
            style={{ animationDelay: "1.4s" }}
          />
          <Crystal />
          <polyline
            className="ri-crack"
            points="41,36 46,45 42,53 47,60"
            fill="none"
            stroke="#DBEAFE"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle className="ri-speck" cx="78" cy="26" r="1.4" fill="#BFDBFE" opacity=".55" />
          <circle
            className="ri-speck"
            cx="20"
            cy="22"
            r="1.4"
            fill="#BFDBFE"
            opacity=".55"
            style={{ animationDelay: "2.2s" }}
          />
        </>
      ) : null}

      {/* 2 — Ice: needle clusters growing outward. */}
      {lv === 2 ? (
        <>
          <g className="ri-glint" stroke="#BFDBFE" strokeWidth="2.8" strokeLinecap="round">
            <path d="M29 29 L15 13" />
            <path d="M29 29 L14 27" />
            <path d="M29 29 L29 13" />
            <path d="M71 29 L85 13" />
            <path d="M71 29 L86 27" />
            <path d="M71 29 L71 13" />
            <path d="M74 58 L89 66" />
            <path d="M74 58 L77 71" />
          </g>
          <Crystal />
        </>
      ) : null}

      {/* 3 — Thaw: crack plus one falling droplet, very faint glow. */}
      {lv === 3 ? (
        <>
          <circle cx="50" cy="70" r="26" fill={"url(#" + glowCool + ")"} className="ri-glow" />
          <Crystal />
          <polyline
            className="ri-crack"
            points="50,13 44,30 55,40 47,52 52,62"
            fill="none"
            stroke="#7DD3FC"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g className="ri-drop">
            <path d="M82 76 C85 80 86 82 86 84 A4 4 0 1 1 78 84 C78 82 79 80 82 76 Z" fill={"url(#" + ice + ")"} />
            <circle cx="80.6" cy="82.4" r="1" fill="#FFFFFF" opacity=".8" />
          </g>
        </>
      ) : null}

      {/* 4 — Ember: heat inside the crystal, no flame yet. */}
      {lv === 4 ? (
        <>
          <Crystal />
          <circle cx="50" cy="62" r="19" fill={"url(#" + glowWarm + ")"} />
          <circle className="ri-core" cx="50" cy="62" r="6.5" fill="#F59E0B" />
          <circle cx="50" cy="62" r="2.6" fill="#FEF3C7" opacity=".9" />
          <path d="M29 64 L50 86" stroke="#FBBF24" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
          <path d="M71 64 L50 86" stroke="#FBBF24" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
          <circle className="ri-ember" cx="80" cy="28" r="2" fill="#FBBF24" />
          <circle className="ri-ember" cx="86" cy="20" r="1.4" fill="#FBBF24" style={{ animationDelay: "1.1s" }} />
        </>
      ) : null}

      {/* 5 — Spark: first flame, licking the upper right edge. */}
      {lv === 5 ? (
        <>
          <circle cx="68" cy="24" r="20" fill={"url(#" + glowWarm + ")"} className="ri-glow" />
          <Crystal />
          <g className="ri-flame">
            <path
              d="M66 36 C63 28 65 20 69 12 C69 18 71 20 73 18 C76 22 79 27 78 32 C77 35 73 37 70 37 C68 37 67 37 66 36 Z"
              fill={"url(#" + fire + ")"}
            />
            <path
              d="M68 34 C66 29 67 24 70 19 C70.5 23 72 24 73 23 C74.5 26 75 29 74 32 C73 34 70 35 68 34 Z"
              fill={"url(#" + fireCore + ")"}
              opacity=".95"
            />
          </g>
          <circle className="ri-ember" cx="84" cy="16" r="1.6" fill="#FBBF24" />
        </>
      ) : null}

      {/* 6 — Flame: three-tongue crown behind a still-bright crystal. */}
      {lv === 6 ? (
        <>
          <circle cx="50" cy="30" r="34" fill={"url(#" + glowWarm + ")"} className="ri-glow" />
          <g className="ri-flame">
            <path
              d="M34 46 C31 36 33 27 37 20 L41 8 L45 24 L50 2 L55 24 L59 9 L63 20 C67 28 68 37 65 46 Q50 52 34 46 Z"
              fill={"url(#" + fire + ")"}
            />
            <path
              d="M39 44 C37 36 39 30 42 24 L45 16 L48 28 L50 12 L53 28 L56 18 L59 26 C61 32 61 38 59 44 Q49 48 39 44 Z"
              fill={"url(#" + fireCore + ")"}
              opacity=".95"
            />
          </g>
          <Crystal />
        </>
      ) : null}

      {/* 7 — Blaze: the fire swallows the dimmed crystal. */}
      {lv === 7 ? (
        <>
          <circle cx="50" cy="38" r="44" fill={"url(#" + glowWarm + ")"} className="ri-glow" />
          <Crystal dim />
          <path
            className="ri-flame"
            d="M33 60 C30 51 31 43 34 36 L36 22 L40 36 L43 5 L46 28 L50 15 L53 30 L57 3 L60 30 L64 21 L67 40 C68 48 67 55 66 60 Q50 66 33 60 Z"
            fill={"url(#" + fire + ")"}
          />
          <path
            className="ri-flame-inner"
            d="M38 59 C36 51 37 45 39 39 L41 30 L44 40 L47 17 L50 35 L53 27 L55 37 L58 29 L60 41 C61 49 60 55 59 59 Q48 63 38 59 Z"
            fill={"url(#" + fireCore + ")"}
            opacity=".95"
          />
          <path
            className="ri-wisp"
            d="M18 32 Q12 24 18 11 Q24 24 18 32 Z"
            fill="#FB923C"
            opacity=".9"
            style={{ transformOrigin: "18px 32px" }}
          />
          <path
            className="ri-wisp"
            d="M84 28 Q78 20 84 7 Q90 20 84 28 Z"
            fill="#FB923C"
            opacity=".9"
            style={{ transformOrigin: "84px 28px", animationDelay: ".7s" }}
          />
          <circle className="ri-ember" cx="86" cy="32" r="2.4" fill="#FDBA74" />
          <circle className="ri-ember" cx="91" cy="22" r="1.8" fill="#FB923C" style={{ animationDelay: ".9s" }} />
          <circle className="ri-ember" cx="79" cy="8" r="1.6" fill="#FCD34D" style={{ animationDelay: "1.7s" }} />
          <path d="M27 65 L50 90 L73 65" fill="none" stroke="#EAF4FF" strokeWidth="4.5" strokeLinejoin="round" opacity=".8" />
          <path d="M27 65 L27 42 M73 65 L73 42" fill="none" stroke="#EAF4FF" strokeWidth="3" strokeLinecap="round" opacity=".35" />
        </>
      ) : null}

      {/* 8 — Bolt: one diagonal discharge through the dimmed crystal. */}
      {lv === 8 ? (
        <>
          <circle cx="50" cy="50" r="40" fill={"url(#" + glowWarm + ")"} className="ri-glow" />
          <g opacity=".45">
            <Crystal dim />
          </g>
          <g className="ri-bolt">
            <polyline
              points="72,10 56,40 66,42 46,72 54,74 30,90"
              fill="none"
              stroke={"url(#" + elec + ")"}
              strokeWidth="8"
              strokeLinejoin="miter"
              strokeLinecap="butt"
            />
            <polyline
              points="72,10 56,40 66,42 46,72 54,74 30,90"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3"
              strokeLinejoin="miter"
              strokeLinecap="butt"
            />
          </g>
          <circle className="ri-spark" cx="76" cy="8" r="2" fill="#FFFFFF" />
          <circle className="ri-spark" cx="20" cy="92" r="1.4" fill="#FFFFFF" style={{ animationDelay: ".8s" }} />
        </>
      ) : null}

      {/* 9 — Overcharge: vertical bolt plus two arcs, unstable. */}
      {lv === 9 ? (
        <>
          <circle cx="50" cy="48" r="42" fill={"url(#" + glowWarm + ")"} className="ri-glow" />
          <g opacity=".45">
            <Crystal dim />
          </g>
          <g stroke="#7FA8D4" strokeOpacity=".3" strokeWidth="2" fill="none">
            <path d="M40 22 L46 40 L42 56" />
            <path d="M60 30 L56 48 L62 64" />
          </g>
          <g className="ri-bolt">
            <polyline
              points="58,8 46,34 54,36 42,62 50,64 38,88"
              fill="none"
              stroke={"url(#" + elec + ")"}
              strokeWidth="7"
              strokeLinejoin="miter"
            />
            <polyline
              points="58,8 46,34 54,36 42,62 50,64 38,88"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.6"
              strokeLinejoin="miter"
            />
          </g>
          <g className="ri-arc" fill="none" stroke="#FDE047" strokeWidth="3" strokeLinecap="round">
            <path d="M18 32 Q8 50 18 68" />
            <path d="M82 32 Q92 50 82 68" />
          </g>
          <circle className="ri-spark" cx="10" cy="30" r="1.6" fill="#FDE047" />
          <circle className="ri-spark" cx="90" cy="70" r="1.6" fill="#FDE047" style={{ animationDelay: ".9s" }} />
        </>
      ) : null}

      {/* 10 — Supernova: the crystal is gone, only shards and rays. */}
      {lv === 10 ? (
        <>
          <circle cx="50" cy="52" r="45" fill={"url(#" + glowWhite + ")"} className="ri-glow" />
          <g fill="#EAF4FF" fillOpacity=".22" stroke="#EAF4FF" strokeOpacity=".7" strokeWidth="1.4">
            <path className="ri-shard" d="M30 8 L38 24 L22 22 Z" />
            <path className="ri-shard" d="M76 16 L86 30 L70 32 Z" style={{ animationDelay: "1.2s" }} />
            <path className="ri-shard" d="M34 76 L42 92 L26 90 Z" style={{ animationDelay: "2.1s" }} />
          </g>
          <g className="ri-rays" fill="#FFFFFF" stroke="#FDE047" strokeWidth="1">
            <g transform="rotate(0 50 52)"><path d="M48.5 52 L51.5 52 L50 24 Z" /></g>
            <g transform="rotate(90 50 52)"><path d="M48.5 52 L51.5 52 L50 24 Z" /></g>
            <g transform="rotate(180 50 52)"><path d="M48.5 52 L51.5 52 L50 24 Z" /></g>
            <g transform="rotate(270 50 52)"><path d="M48.5 52 L51.5 52 L50 24 Z" /></g>
            <g transform="rotate(45 50 52)"><path d="M48.5 52 L51.5 52 L50 34 Z" /></g>
            <g transform="rotate(135 50 52)"><path d="M48.5 52 L51.5 52 L50 34 Z" /></g>
            <g transform="rotate(225 50 52)"><path d="M48.5 52 L51.5 52 L50 34 Z" /></g>
            <g transform="rotate(315 50 52)"><path d="M48.5 52 L51.5 52 L50 34 Z" /></g>
          </g>
          <path
            className="ri-core"
            d="M50 39 C51 47 53 50 63 52 C53 54 51 57 50 65 C49 57 47 54 37 52 C47 50 49 47 50 39 Z"
            fill="#FFFFFF"
          />
          <circle className="ri-spark" cx="66" cy="30" r="1.6" fill="#FFFFFF" />
          <circle className="ri-spark" cx="34" cy="70" r="1.6" fill="#FFFFFF" style={{ animationDelay: ".8s" }} />
          <circle className="ri-spark" cx="62" cy="66" r="1.6" fill="#FDE047" style={{ animationDelay: "1.5s" }} />
        </>
      ) : null}
    </svg>
  );
}
