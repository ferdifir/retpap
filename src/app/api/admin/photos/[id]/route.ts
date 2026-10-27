import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  adminDeletePhoto,
  adminRestorePhoto,
  adminSetGender,
  adminSetNsfw,
} from "@/lib/admin/actions";
import { forbidden, requireAdmin } from "@/lib/admin/auth";

const patchSchema = z.object({
  isNsfw: z.boolean().optional(),
  gender: z.enum(["female", "male"]).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return Response.json({ error: "bad_photo" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const body = parsed.data;
  const results = [];

  if (body.isNsfw !== undefined) {
    results.push(
      await adminSetNsfw({
        photoId,
        isNsfw: body.isNsfw,
        actorTelegramId: actor.telegramId,
      }),
    );
  }

  if (body.gender !== undefined) {
    results.push(
      await adminSetGender({
        photoId,
        gender: body.gender,
        actorTelegramId: actor.telegramId,
      }),
    );
  }

  if (body.isActive === true) {
    results.push(
      await adminRestorePhoto({ photoId, actorTelegramId: actor.telegramId }),
    );
  } else if (body.isActive === false) {
    results.push(
      await adminDeletePhoto({
        photoId,
        mode: "soft",
        actorTelegramId: actor.telegramId,
        notify: false,
      }),
    );
  }

  if (results.length === 0) {
    return Response.json({ error: "nothing_to_do" }, { status: 400 });
  }

  const failed = results.find((result) => !result.ok);
  return Response.json({ ok: !failed, results });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return Response.json({ error: "bad_photo" }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") === "hard" ? "hard" : "soft";
  const result = await adminDeletePhoto({
    photoId,
    mode,
    actorTelegramId: actor.telegramId,
    notify: params.get("notify") === "1",
  });

  return Response.json(result, { status: result.ok ? 200 : 404 });
}
