import { readFile } from "node:fs/promises";
import {
  getSharedDrawingContext,
  setDrawingChannelMessage,
} from "@/db/queries";
import { drawingStartUrl, uploadUrl } from "@/lib/share";
import { deleteMessage, sendPhotoFile } from "./api";
import { channelConfigured, channelId } from "./channel";
import { renderDrawingTeaser } from "./drawing-image";
import { DRAWING_CHANNEL_CAPTION } from "./format";
import { mediaPath } from "./media";

/**
 * Posts a shared drawing to the channel. Runs after the response, so a slow
 * render or a Telegram error never blocks the share itself. A drawing is only
 * posted once; the stored message id is what makes that true.
 */
export async function publishDrawingToChannel(
  photoId: number,
  userId: number,
): Promise<void> {
  if (!channelConfigured()) return;

  const context = await getSharedDrawingContext(photoId, userId);
  if (!context || context.strokes.length === 0) return;
  if (context.channelMessageId) return;

  const file = mediaPath(context.slug, "jpg");
  if (!file) return;

  // Photos use their own jpg; videos use the poster saved under the same slug.
  const photo = await readFile(file).catch(() => null);
  if (!photo) return;

  const teaser = await renderDrawingTeaser(photo, context.strokes);
  const message = await sendPhotoFile(channelId(), teaser, {
    caption: DRAWING_CHANNEL_CAPTION,
    keyboard: {
      inline_keyboard: [
        [
          {
            text: "Lihat coretan",
            url: drawingStartUrl(context.drawingId, context.slug),
          },
          { text: "Upload", url: uploadUrl() },
        ],
      ],
    },
  });

  await setDrawingChannelMessage(photoId, userId, message.message_id);
}

/**
 * Deletes the channel post when the author stops sharing. Telegram only allows
 * a bot to delete messages younger than 48 hours; an older post is left as is
 * and the slide still disappears from the feed.
 */
export async function removeDrawingFromChannel(
  photoId: number,
  userId: number,
): Promise<void> {
  if (!channelConfigured()) return;

  const context = await getSharedDrawingContext(photoId, userId);
  if (!context?.channelMessageId) return;

  await deleteMessage(channelId(), context.channelMessageId);
  await setDrawingChannelMessage(photoId, userId, null);
}
