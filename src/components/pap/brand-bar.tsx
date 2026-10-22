import Image from "next/image";

/** App identity pinned at the top of the safe area. */
export function BrandBar() {
  return (
    <div className="flex shrink-0 items-center gap-2 px-1">
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
  );
}
