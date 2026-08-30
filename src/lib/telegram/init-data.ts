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

export async function consumeTelegramLinkToken(
  token: string,
  telegramUserId: string,
): Promise<{
  profileId: string;
  name: string | null;
  alreadyLinked: boolean;
} | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .rpc("link_telegram_from_token", {
      p_token: token,
      p_telegram_user_id: telegramUserId,
    })
    .maybeSingle<{
      linked_profile_id: string;
      linked_profile_name: string | null;
      was_already_linked: boolean;
    }>();

  if (error || !data) return null;

  return {
    profileId: data.linked_profile_id,
    name: data.linked_profile_name,
    alreadyLinked: data.was_already_linked,
  };
}

export function getBotUsernameFromToken(botToken: string): Promise<string | null> {
  return fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    .then((res) => res.json())
    .then((json: { ok: boolean; result?: { username?: string } }) => {
      return json.ok && json.result?.username ? json.result.username : null;
    })
    .catch(() => null);
}
