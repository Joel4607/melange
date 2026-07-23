import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  validateInitData,
  verifyTelegramLinkToken,
} from "@/lib/telegram/init-data";

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Telegram bot not configured" }, { status: 500 });
  }

  let body: { initData?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { initData } = body ?? {};
  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ ok: false, error: "Missing initData" }, { status: 400 });
  }

  const data = validateInitData(initData, botToken);
  if (!data) {
    return NextResponse.json({ ok: false, error: "Invalid initData" }, { status: 401 });
  }

  const db = getServiceClient();
  const telegramId = String(data.user.id);

  // If a link token is present, associate this Telegram account with the profile.
  if (data.startParam) {
    const token = await verifyTelegramLinkToken(data.startParam);
    if (token) {
      const { data: profile } = await db
        .from("profiles")
        .select("id, is_admin")
        .eq("id", token.profileId)
        .maybeSingle<{ id: string; is_admin: boolean }>();
      if (profile) {
        await db.from("profiles").update({ telegram_user_id: telegramId }).eq("id", profile.id);
        if (profile.is_admin) {
          return NextResponse.json({
            ok: true,
            admin: { id: profile.id, name: data.user.first_name, telegramId },
          });
        }
      }
    }
  }

  const { data: profile } = await db
    .from("profiles")
    .select("id, name, is_admin")
    .eq("telegram_user_id", telegramId)
    .maybeSingle<{ id: string; name: string | null; is_admin: boolean }>();

  if (!profile || !profile.is_admin) {
    return NextResponse.json({ ok: false, error: "not_admin" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    admin: { id: profile.id, name: profile.name ?? data.user.first_name, telegramId },
  });
}
