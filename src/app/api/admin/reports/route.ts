import type { NextRequest } from "next/server";
import { listReportsForAdmin } from "@/db/reports";
import { forbidden, requireAdmin } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
  return Response.json({ rows: await listReportsForAdmin(limit) });
}
