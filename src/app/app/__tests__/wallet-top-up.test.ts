import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "../actions";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/service", () => ({ getServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "signed-in-buyer" } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "consume_rate_limit" ? true : null, error: null,
  }));
});

function form(amount: string) {
  const data = new FormData();
  data.set("amount", amount);
  data.set("user_id", "another-person");
  return data;
}

describe("simulated wallet top-ups", () => {
  it("credits only the authenticated wallet, using exact cents and refreshing its views", async () => {
    expect(actions).toHaveProperty("topUpWallet");
    const result = await actions.topUpWallet({ error: null }, form("50.25"));
    expect(result.error).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("top_up_wallet", {
      p_user_id: "signed-in-buyer", p_amount_cents: 5025,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/wallet");
  });

  it.each(["", "0", "-1", "1.001", "NaN", "Infinity", "1e5", "10000000000"])(
    "rejects invalid or unrepresentable amount %s without crediting", async (value) => {
      expect(actions).toHaveProperty("topUpWallet");
      expect((await actions.topUpWallet({ error: null }, form(value))).error).toBeTruthy();
      expect(mocks.rpc.mock.calls.some(([name]) => name === "top_up_wallet")).toBe(false);
    },
  );

  it("rejects an unsigned request before accessing the privileged database", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(actions).toHaveProperty("topUpWallet");
    await expect(actions.topUpWallet({ error: null }, form("50"))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the rate limiter cannot allow a request", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(actions).toHaveProperty("topUpWallet");
    expect((await actions.topUpWallet({ error: null }, form("50"))).error).toBeTruthy();
    expect(mocks.rpc.mock.calls.some(([name]) => name === "top_up_wallet")).toBe(false);
  });

  it("does not expose database details or claim success when crediting fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "consume_rate_limit"
      ? { data: true, error: null }
      : { data: null, error: { message: "private database detail" } });
    expect(actions).toHaveProperty("topUpWallet");
    const result = await actions.topUpWallet({ error: null }, form("50"));
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("private database detail");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
