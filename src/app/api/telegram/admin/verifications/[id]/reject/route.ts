import { NextResponse } from "next/server";
import { requireTelegramAdmin } from "@/lib/telegram/admin-auth";
import { rejectVerificationAsAdmin } from "@/app/admin/actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) {
    return NextResponse.json({ error: "Missing initData" }, { status: 400 });
  }

  const admin = await requireTelegramAdmin(initData);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ok = await rejectVerificationAsAdmin(id, admin.profileId);
  if (!ok) {
    return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
