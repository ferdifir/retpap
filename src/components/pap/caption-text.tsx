"use client";

import { parseCaption } from "@/lib/mentions";
import { openTelegramProfile } from "@/lib/telegram";

/** Caption text with tappable @mentions; bot usernames are masked. */
export function CaptionText({ text }: { text: string }) {
  return (
    <>
      {parseCaption(text).map((segment, index) => {
        if (segment.type === "mention") {
          return (
            <button
              key={index}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openTelegramProfile(segment.username);
              }}
              className="font-semibold text-cyan-300 underline decoration-cyan-400/40 underline-offset-2"
            >
              {segment.value}
            </button>
          );
        }

        return <span key={index}>{segment.value}</span>;
      })}
    </>
  );
}
