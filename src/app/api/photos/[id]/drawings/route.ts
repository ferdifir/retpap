import { getDrawingSlides, isPhotoActive } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";

/**
 * Slides for the feed carousel of one photo: drawings their authors shared to
 * the feed, plus the viewer's own private canvas. Nobody else's private row is
 * ever returned.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (userId === null) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId)) {
    return Response.json({ error: "bad_photo" }, { status: 400 });
  }
  if (!(await isPhotoActive(photoId))) {
    return Response.json({ error: "photo_not_found" }, { status: 404 });
  }

  return Response.json(
    { slides: await getDrawingSlides(photoId, userId) },
    // Never cached: the owner can unshare and must see it on the next read.
    { headers: { "cache-control": "private, no-store" } },
  );
}
