import { NextResponse } from "next/server";
import { requireTelegramAdmin } from "@/lib/telegram/admin-auth";
import { resolveDisputeAdmin } from "@/lib/server/disputes";

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

  let body: { resolution?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resolution = body.resolution;
  if (resolution !== "release" && resolution !== "refund" && resolution !== "partial") {
    return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
  }

  const { id } = await params;
  try {
    await resolveDisputeAdmin(id, resolution);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve dispute";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
