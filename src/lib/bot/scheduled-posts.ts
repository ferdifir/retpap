import { claimDueScheduledPhoto, retryScheduledChannelPost } from "@/db/queries";
import { channelConfigured } from "@/lib/bot/channel";
import { readMedia } from "@/lib/bot/media";

let activeRun: Promise<void> | null = null;

async function processOneDuePost(): Promise<void> {
  if (!channelConfigured()) return;

  const photo = await claimDueScheduledPhoto();
  if (!photo) return;

  try {
    const { postToChannel } = await import("@/lib/bot/flow");
    const extension = photo.mediaType === "video" ? "mp4" : "jpg";
    const bytes = await readMedia(photo.slug, extension);
    if (!bytes) throw new Error("scheduled media object is missing");

    const sent = await postToChannel(
      photo.id,
      {
        mediaType: photo.mediaType === "video" ? "video" : "photo",
        slug: photo.slug,
        bytes,
        poster: null,
      },
      photo.caption,
      photo.isNsfw,
    );

    if (!sent) {
      await retryScheduledChannelPost(photo.id, "Telegram channel post failed");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-post] failed for photo", photo.id, error);
    await retryScheduledChannelPost(photo.id, detail).catch((retryError) => {
      console.error("[scheduled-post] could not release photo claim", photo.id, retryError);
    });
  }
}

/** Process at most one due item per authenticated request to bound request latency. */
export function processDueScheduledPost(): Promise<void> {
  if (activeRun) return activeRun;

  activeRun = processOneDuePost()
    .catch((error) => console.error("[scheduled-post] request trigger failed", error))
    .finally(() => {
      activeRun = null;
    });

  return activeRun;
}
