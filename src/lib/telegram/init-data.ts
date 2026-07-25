import crypto from "crypto";
import { getServiceClient } from "@/lib/supabase/service";

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
