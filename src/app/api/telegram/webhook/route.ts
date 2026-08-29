import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/telegram/env";
import { handleTelegramUpdate } from "@/lib/telegram/webhook";

function hasValidSecret(request: Request, expectedSecret: string): boolean {
  const providedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!providedSecret) return false;

  const provided = Buffer.from(providedSecret, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  const expectedSecret = getWebhookSecret();
  if (!expectedSecret) {
    return new NextResponse("Telegram webhook is not configured", { status: 503 });
  }
  if (!hasValidSecret(request, expectedSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    console.error("Telegram webhook handler failed:", err);
  }

  return NextResponse.json({ ok: true });
}
