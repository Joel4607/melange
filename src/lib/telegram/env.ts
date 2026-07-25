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
