import {
  getDrawingStrokes,
  getUserTelegramId,
  isPhotoActive,
  saveDrawingStrokes,
} from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";
import { sanitiseStrokes } from "@/lib/draw";
import { paintAccessEnabled } from "@/lib/paint-access";

/**
 * The private drawing canvas for one photo. There is no route that returns
 * somebody else's strokes: the session user is the only key.
 */
async function authorise(context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return { error: "unauthorized", status: 401 } as const;

  if (!paintAccessEnabled(await getUserTelegramId(userId))) {
    return { error: "forbidden", status: 403 } as const;
  }

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId)) return { error: "bad_photo", status: 400 } as const;
  if (!(await isPhotoActive(photoId))) {
    return { error: "photo_not_found", status: 404 } as const;
  }

  return { userId, photoId } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await authorise(context);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    strokes: await getDrawingStrokes(result.photoId, result.userId),
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await authorise(context);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const body = (await request.json().catch(() => null)) as { strokes?: unknown } | null;
  if (!body || !Array.isArray(body.strokes)) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  return Response.json({
    strokes: await saveDrawingStrokes(
      result.photoId,
      result.userId,
      sanitiseStrokes(body.strokes),
    ),
  });
}
