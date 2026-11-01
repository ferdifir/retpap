import {
  getUserTelegramId,
  isPhotoActive,
  setDrawingShare,
} from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";
import { feedShareEnabled } from "@/lib/paint-access";

/** Publishes or hides the session user's own canvas for one photo. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (userId === null) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!feedShareEnabled(await getUserTelegramId(userId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId)) {
    return Response.json({ error: "bad_photo" }, { status: 400 });
  }
  if (!(await isPhotoActive(photoId))) {
    return Response.json({ error: "photo_not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    shared?: unknown;
    anonymous?: unknown;
  } | null;
  if (typeof body?.shared !== "boolean") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  // Sharing defaults to anonymous; unsharing keeps whatever label it had.
  const anonymous = typeof body.anonymous === "boolean" ? body.anonymous : true;

  const result = await setDrawingShare(photoId, userId, body.shared, anonymous);
  if (!result) {
    return Response.json({ error: "drawing_not_found" }, { status: 404 });
  }

  return Response.json(result);
}
