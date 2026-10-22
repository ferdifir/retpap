import Image from "next/image";

/**
 * App identity, pinned inside the fullscreen top strip — centred between
 * Telegram's close and menu buttons. Hidden when fullscreen is unavailable:
 * the fallback layout simply has no brand row.
 */
export function BrandBar() {
  return (
    <div className="brand-strip" aria-hidden="true">
      <Image src="/logo.png" alt="" width={20} height={20} priority className="size-5 rounded-md" />
      <span className="text-[13px] font-black tracking-tight text-slate-100">RetPAP</span>
    </div>
  );
}
