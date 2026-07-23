import crypto from "crypto";

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

export function createTelegramLinkToken(profileId: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ profileId, exp: Date.now() + 10 * 60 * 1000 }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTelegramLinkToken(
  token: string,
  secret: string,
): { profileId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;

  let data: { profileId: string; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
      profileId: string;
      exp: number;
    };
  } catch {
    return null;
  }
  if (Date.now() > data.exp) return null;
  return { profileId: data.profileId };
}

export function getBotUsernameFromToken(botToken: string): Promise<string | null> {
  return fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    .then((res) => res.json())
    .then((json: { ok: boolean; result?: { username?: string } }) => {
      return json.ok && json.result?.username ? json.result.username : null;
    })
    .catch(() => null);
}
