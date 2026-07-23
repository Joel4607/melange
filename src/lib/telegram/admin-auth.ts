import { getServiceClient } from "@/lib/supabase/service";
import {
  validateInitData,
  type TelegramInitData,
  type TelegramWebAppUser,
} from "./init-data";

export interface TelegramAdmin {
  profileId: string;
  name: string | null;
  telegramUser: TelegramWebAppUser;
}

export async function requireTelegramAdmin(
  initData: string,
): Promise<TelegramAdmin | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;

  const data = validateInitData(initData, botToken);
  if (!data) return null;

  const db = getServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, name")
    .eq("telegram_user_id", String(data.user.id))
    .eq("is_admin", true)
    .maybeSingle<{ id: string; name: string | null }>();

  if (!profile) return null;

  return {
    profileId: profile.id,
    name: profile.name,
    telegramUser: data.user,
  };
}

export { type TelegramInitData };
