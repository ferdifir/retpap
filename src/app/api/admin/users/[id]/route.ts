import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminPurgeUserPhotos } from "@/lib/admin/actions";
import { forbidden, requireAdmin } from "@/lib/admin/auth";
import { logAdminAction, setUploadBlocked } from "@/lib/admin/queries";

const patchSchema = z.object({
  uploadBlocked: z.boolean(),
  reason: z.string().max(200).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();

  const userId = Number((await context.params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return Response.json({ error: "bad_user" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const reason = parsed.data.reason?.trim() || null;
  await setUploadBlocked(userId, parsed.data.uploadBlocked, reason);
  await logAdminAction({
    actorTelegramId: actor.telegramId,
    action: parsed.data.uploadBlocked ? "user.block" : "user.unblock",
    targetType: "user",
    targetId: userId,
    payload: { reason },
  });

  return Response.json({ ok: true });
}

const purgeSchema = z.object({
  mode: z.enum(["soft", "hard"]).default("soft"),
  notify: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();

  const userId = Number((await context.params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return Response.json({ error: "bad_user" }, { status: 400 });
  }

  const parsed = purgeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await adminPurgeUserPhotos({
    userId,
    mode: parsed.data.mode,
    notify: parsed.data.notify,
    actorTelegramId: actor.telegramId,
  });

  return Response.json(result);
}
