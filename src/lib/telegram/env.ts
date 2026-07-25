import crypto from "crypto";

/**
 * Telegram bot token loader.
 *
 * `MELANGE_TELEGRAM_BOT_TOKEN` is checked first so Devin sessions can override
 * any stale `TELEGRAM_BOT_TOKEN` without needing to delete it. Vercel continues
 * to use the standard `TELEGRAM_BOT_TOKEN` env var.
 */
export function getTelegramBotToken(): string | undefined {
  return process.env.MELANGE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
}

/**
 * Webhook secret used to validate Telegram update payloads.
 *
 * If `TELEGRAM_WEBHOOK_SECRET` is not set, a deterministic HMAC of the bot token
 * is used so the route and the set-webhook script agree without extra config.
 */
export function getWebhookSecret(): string | undefined {
  const override = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (override) return override;

  const botToken = getTelegramBotToken();
  if (!botToken) return undefined;

  return crypto
    .createHmac("sha256", botToken)
    .update("melange-telegram-webhook")
    .digest("hex");
}
