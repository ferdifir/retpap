import { BrandBar } from "@/components/pap/brand-bar";
import { PapRater } from "@/components/pap/pap-rater";

export default function Home() {
  return (
    <div className="safe-shell mx-auto flex h-dvh w-full max-w-md flex-col gap-2">
      <div className="min-h-0 flex-1">
        <PapRater />
      </div>
      <BrandBar />
    </div>
  );
}
