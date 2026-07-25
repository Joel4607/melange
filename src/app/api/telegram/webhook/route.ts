import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/telegram/env";
import { handleTelegramUpdate } from "@/lib/telegram/webhook";

export async function POST(request: Request) {
  const expectedSecret = getWebhookSecret();
  if (expectedSecret) {
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== expectedSecret) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
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
