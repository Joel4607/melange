import crypto from "crypto";
import { getServiceClient } from "@/lib/supabase/service";

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramInitData {
  user: TelegramWebAppUser;
  startParam?: string;
  chatInstance?: string;
  chatType?: string;
  authDate: number;
}

export function validateInitData(
  initData: string,
  botToken: string,
): TelegramInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const pairs: string[] = [];
  params.forEach((value, key) => pairs.push(`${key}=${value}`));
  const dataCheckString = pairs.sort().join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))) {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) return null;

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    return null;
  }

  const startParam = params.get("start_param") ?? undefined;
  const chatInstance = params.get("chat_instance") ?? undefined;
  const chatType = params.get("chat_type") ?? undefined;
  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : 0;

  // Reject initData older than 24 hours to limit replay risk.
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 24 * 60 * 60) return null;

  return {
    user,
    startParam,
    chatInstance,
    chatType,
    authDate,
  };
}

export async function createTelegramLinkToken(profileId: string): Promise<string> {
  const db = getServiceClient();
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await db.from("telegram_link_tokens").insert({
    token,
    profile_id: profileId,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`createTelegramLinkToken: ${error.message}`);
  return token;
}

export async function verifyTelegramLinkToken(
  token: string,
): Promise<{ profileId: string } | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("telegram_link_tokens")
    .select("profile_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle<{ profile_id: string; expires_at: string; used_at: string | null }>();
  if (error || !data) return null;
  if (data.used_at) return null;
  if (new Date() > new Date(data.expires_at)) return null;

  await db.from("telegram_link_tokens").update({ used_at: new Date().toISOString() }).eq("token", token);
  return { profileId: data.profile_id };
}

export function getBotUsernameFromToken(botToken: string): Promise<string | null> {
  return fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    .then((res) => res.json())
    .then((json: { ok: boolean; result?: { username?: string } }) => {
      return json.ok && json.result?.username ? json.result.username : null;
    })
    .catch(() => null);
}
