import Image from "next/image";

/**
 * App identity. Inline at the top of the content, and — in fullscreen, where
 * Telegram draws its controls over a transparent header — pinned inside that
 * top strip, centred between the close and menu buttons.
 */
export function BrandBar() {
  return (
    <>
      <div className="brand-inline flex shrink-0 items-center gap-2 px-1">
        <Image
          src="/logo.png"
          alt=""
          width={26}
          height={26}
          priority
          className="size-[26px] rounded-lg"
        />
        <span className="text-sm font-black tracking-tight text-slate-100">RetPAP</span>
      </div>

      <div className="brand-strip" aria-hidden="true">
        <Image src="/logo.png" alt="" width={20} height={20} priority className="size-5 rounded-md" />
        <span className="text-[13px] font-black tracking-tight text-slate-100">RetPAP</span>
      </div>
    </>
  );
}
