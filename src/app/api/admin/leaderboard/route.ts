import { adminResendDailyRecap } from "@/lib/admin/actions";
import { forbidden, requireAdmin } from "@/lib/admin/auth";

export async function POST() {
  const actor = await requireAdmin();
  if (!actor) return forbidden();

  const result = await adminResendDailyRecap({
    actorTelegramId: actor.telegramId,
  });

  return Response.json(result);
}
