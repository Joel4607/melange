import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webhookSecret: undefined as string | undefined,
  handleTelegramUpdate: vi.fn(),
}));

vi.mock("@/lib/telegram/env", () => ({
  getWebhookSecret: () => mocks.webhookSecret,
}));
vi.mock("@/lib/telegram/webhook", () => ({
  handleTelegramUpdate: mocks.handleTelegramUpdate,
}));

import { POST } from "../route";

function telegramRequest(secret?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("X-Telegram-Bot-Api-Secret-Token", secret);
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify({ update_id: 123 }),
  });
}

describe("Telegram webhook authentication", () => {
  beforeEach(() => {
    mocks.webhookSecret = undefined;
    mocks.handleTelegramUpdate.mockReset().mockResolvedValue(undefined);
  });

  it("fails closed when no webhook secret can be configured", async () => {
    const response = await POST(telegramRequest());

    expect(response.status).toBe(503);
    expect(mocks.handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong", "correct-secreu", "correct-secret-with-extra-bytes"])(
    "rejects a missing or incorrect Telegram credential (%s)",
    async (secret) => {
      mocks.webhookSecret = "correct-secret";

      const response = await POST(telegramRequest(secret));

      expect(response.status).toBe(401);
      expect(mocks.handleTelegramUpdate).not.toHaveBeenCalled();
    },
  );

  it("processes an update only after successful authentication", async () => {
    mocks.webhookSecret = "correct-secret";

    const response = await POST(telegramRequest("correct-secret"));

    expect(response.status).toBe(200);
    expect(mocks.handleTelegramUpdate).toHaveBeenCalledWith({ update_id: 123 });
  });
});
