import { getServiceClient } from "@/lib/supabase/service";
import { getTelegramBotToken, getSiteUrl } from "./env";
import { getBotUsernameFromToken } from "./init-data";

export interface TelegramBotStatus {
  botUsername: string | null;
  webhookUrl: string | null;
  webhookActive: boolean;
  linkedAdminCount: number;
  thisAdminLinked: boolean;
}

export async function getTelegramBotStatus(adminId: string): Promise<TelegramBotStatus> {
  const botToken = getTelegramBotToken();
  const db = getServiceClient();

  const [username, { data: profile }, { data: linkedAdmins, error }] = await Promise.all([
    botToken ? getBotUsernameFromToken(botToken) : Promise.resolve(null),
    db.from("profiles").select("telegram_user_id").eq("id", adminId).maybeSingle<{ telegram_user_id: string | null }>(),
    db
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("is_admin", true)
      .not("telegram_user_id", "is", null),
  ]);

  let webhookUrl: string | null = null;
  if (botToken) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const json = (await res.json()) as { ok: boolean; result?: { url?: string } };
      if (json.ok && json.result?.url) webhookUrl = json.result.url;
    } catch {
      // ignore network errors; status will show as inactive
    }
  }

  const expectedUrl = `${getSiteUrl()}/api/telegram/webhook`;
  const webhookActive = webhookUrl === expectedUrl;

  return {
    botUsername: username,
    webhookUrl,
    webhookActive,
    linkedAdminCount: error ? 0 : (linkedAdmins?.length ?? 0),
    thisAdminLinked: !!profile?.telegram_user_id,
  };
}
