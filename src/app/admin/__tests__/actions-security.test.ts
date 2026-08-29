import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "11111111-1111-1111-1111-111111111111",
  isAdmin: false,
  approveVerificationCore: vi.fn(),
  rejectVerificationCore: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mocks.userId } } }),
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { is_admin: mocks.isAdmin } }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/admin-verification", () => ({
  approveVerificationCore: mocks.approveVerificationCore,
  rejectVerificationCore: mocks.rejectVerificationCore,
}));

import * as adminActions from "../actions";

describe("admin verification action boundary", () => {
  beforeEach(() => {
    mocks.isAdmin = false;
    mocks.approveVerificationCore.mockReset().mockResolvedValue(true);
    mocks.rejectVerificationCore.mockReset().mockResolvedValue(true);
    mocks.revalidatePath.mockReset();
  });

  it("does not expose helpers that accept a caller-supplied admin identity", () => {
    expect(adminActions).toHaveProperty("approveVerification");
    expect(adminActions).toHaveProperty("rejectVerification");
    expect(adminActions).not.toHaveProperty("approveVerificationAsAdmin");
    expect(adminActions).not.toHaveProperty("rejectVerificationAsAdmin");
  });

  it.each([
    ["approve", adminActions.approveVerification, mocks.approveVerificationCore],
    ["reject", adminActions.rejectVerification, mocks.rejectVerificationCore],
  ])("blocks a non-admin before attempting to %s a verification", async (_name, action, core) => {
    await expect(action("22222222-2222-2222-2222-222222222222")).rejects.toThrow(
      "redirect:/admin/login",
    );
    expect(core).not.toHaveBeenCalled();
  });

  it.each([
    ["approve", adminActions.approveVerification, mocks.approveVerificationCore],
    ["reject", adminActions.rejectVerification, mocks.rejectVerificationCore],
  ])("derives the admin identity from the session when asked to %s", async (_name, action, core) => {
    mocks.isAdmin = true;

    await action("22222222-2222-2222-2222-222222222222");

    expect(core).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222",
      mocks.userId,
    );
  });
});
