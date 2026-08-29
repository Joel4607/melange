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

export function getSiteUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be configured with the canonical application origin.",
    );
  }

  let siteUrl: URL;
  try {
    siteUrl = new URL(configuredUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  if (!/^[a-z][a-z\d+.-]*:\/\/[^/?#\\\s@]+\/?$/i.test(configuredUrl)) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must contain only an origin, without a path, query, or fragment.",
    );
  }

  const isLoopback =
    siteUrl.hostname === "localhost" ||
    siteUrl.hostname === "127.0.0.1" ||
    siteUrl.hostname === "[::1]";
  const hasAllowedProtocol =
    siteUrl.protocol === "https:" ||
    (siteUrl.protocol === "http:" && isLoopback);

  if (!hasAllowedProtocol) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must use HTTPS (HTTP is allowed only for loopback development).",
    );
  }

  if (siteUrl.username || siteUrl.password) {
    throw new Error("NEXT_PUBLIC_SITE_URL must not include credentials.");
  }

  if (siteUrl.pathname !== "/" || siteUrl.search || siteUrl.hash) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must contain only an origin, without a path, query, or fragment.",
    );
  }

  return siteUrl.origin;
}

export function resolveTelegramWebhookUrl(explicitUrl?: string): string {
  return explicitUrl || `${getSiteUrl()}/api/telegram/webhook`;
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
