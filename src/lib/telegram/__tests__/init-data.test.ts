import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServiceClientMock } = vi.hoisted(() => ({
  getServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: getServiceClientMock,
}));

import { consumeTelegramLinkToken } from "../init-data";

describe("consumeTelegramLinkToken", () => {
  beforeEach(() => {
    getServiceClientMock.mockReset();
  });

  it("delegates token consumption and account linking to one atomic RPC", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        linked_profile_id: "profile-1",
        linked_profile_name: "Admin",
        was_already_linked: false,
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    getServiceClientMock.mockReturnValue({ rpc });

    await expect(
      consumeTelegramLinkToken("single-use-token", "telegram-42"),
    ).resolves.toEqual({
      profileId: "profile-1",
      name: "Admin",
      alreadyLinked: false,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("link_telegram_from_token", {
      p_token: "single-use-token",
      p_telegram_user_id: "telegram-42",
    });
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "database failure" } },
  ])("returns the same generic failure for rejected tokens and RPC errors", async (response) => {
    const maybeSingle = vi.fn().mockResolvedValue(response);
    getServiceClientMock.mockReturnValue({
      rpc: vi.fn().mockReturnValue({ maybeSingle }),
    });

    await expect(
      consumeTelegramLinkToken("unusable-token", "telegram-42"),
    ).resolves.toBeNull();
  });
});
