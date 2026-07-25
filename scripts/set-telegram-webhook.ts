import { getTelegramBotToken, getWebhookSecret } from "@/lib/telegram/env";

async function main() {
  const token = getTelegramBotToken();
  if (!token) {
    console.error("No Telegram bot token found. Set TELEGRAM_BOT_TOKEN or MELANGE_TELEGRAM_BOT_TOKEN.");
    process.exit(1);
  }

  const secret = getWebhookSecret();
  if (!secret) {
    console.error("Could not derive a webhook secret.");
    process.exit(1);
  }

  const url =
    process.argv[2] ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/telegram/webhook`
      : "https://melange-liard.vercel.app/api/telegram/webhook");

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });

  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) {
    console.error("setWebhook failed:", json.description ?? "Unknown error");
    process.exit(1);
  }

  console.log("Webhook set:", url);
}

void main();
