import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  createNotification: vi.fn(async () => undefined),
  rankAvailableRunners: vi.fn(),
  generateMatchRun: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({ getServiceClient: mocks.getServiceClient }));
vi.mock("../notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("../matching", () => ({
  rankAvailableRunners: mocks.rankAvailableRunners,
  generateMatchRun: mocks.generateMatchRun,
}));

import {
  enqueueOrPairErrand,
  generateShareMatchRun,
  processDueShareWindows,
} from "../errand-share";

const NOW = new Date("2026-08-16T12:00:00.000Z");

function point(northKm: number, eastKm: number) {
  return { lat: 5.56 + northKm / 111.32, lng: -0.2 + eastKm / 110.8 };
}

function task(id: string, buyerId: string, offset = 0) {
  return {
    id,
    buyer_id: buyerId,
    title: `Task ${id}`,
    category: id === "new" ? "pharmacy" : "groceries",
    urgency: id === "new" ? ("normal" as const) : ("low" as const),
    pickup_lat: point(offset, 0).lat,
    pickup_lng: point(offset, 0).lng,
    dropoff_lat: point(offset, 2).lat,
    dropoff_lng: point(offset, 2).lng,
    stops: [],
    created_at: new Date(NOW.getTime() - 60_000).toISOString(),
    status: "posted",
    selected_runner_id: null,
    share_state: "waiting",
    share_window_ends_at: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    delivery_deadline_at: new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString(),
  };
}

function query(result: { data: unknown; error: unknown }) {
  const value: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "neq",
    "in",
    "is",
    "gt",
    "order",
    "limit",
    "insert",
    "update",
  ]) {
    value[method] = vi.fn(() => value);
  }
  value.maybeSingle = vi.fn(async () => result);
  value.single = vi.fn(async () => result);
  value.returns = vi.fn(async () => result);
  value.then = (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return value;
}

function queuedDb(
  tables: Record<string, { data: unknown; error: unknown }[]>,
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
) {
  return {
    from: vi.fn((table: string) => {
      const next = tables[table]?.shift();
      if (!next) throw new Error(`Unexpected table query: ${table}`);
      return query(next);
    }),
    rpc: vi.fn(rpc),
  };
}

describe("Errand-Share orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["Express", { urgency: "express", share_state: "ineligible" }],
    ["manual runner", { status: "matched", selected_runner_id: "runner-manual" }],
  ])("bypasses sharing for %s errands", async (_label, overrides) => {
    const bypassed = { ...task("new", "buyer-new"), ...overrides };
    const db = queuedDb(
      { tasks: [{ data: bypassed, error: null }] },
      async () => {
        throw new Error("sharing RPC must not run");
      },
    );
    mocks.getServiceClient.mockReturnValue(db);

    await expect(enqueueOrPairErrand("new", NOW)).resolves.toEqual({
      status: "released",
      groupId: null,
    });
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("persists every decision and falls back after a pairing conflict", async () => {
    const newTask = task("new", "buyer-new");
    const candidateA = task("candidate-a", "buyer-a", 0.05);
    const candidateB = task("candidate-b", "buyer-b", 0.1);
    let createAttempts = 0;
    const db = queuedDb(
      {
        tasks: [
          { data: newTask, error: null },
          { data: [candidateA, candidateB], error: null },
        ],
        errand_share_decisions: [{ data: null, error: null }],
      },
      async (name) => {
        expect(name).toBe("create_errand_share_group");
        createAttempts += 1;
        return {
          data: [{
            status: createAttempts === 1 ? "conflict" : "created",
            group_id: createAttempts === 1 ? null : "group-2",
          }],
          error: null,
        };
      },
    );
    mocks.getServiceClient.mockReturnValue(db);

    await expect(enqueueOrPairErrand("new", NOW)).resolves.toEqual({
      status: "paired",
      groupId: "group-2",
    });
    expect(db.rpc).toHaveBeenCalledTimes(2);
    for (const [, args] of db.rpc.mock.calls) {
      const route = (args.p_decision as { route: Record<string, unknown>[] }).route;
      for (const stop of route) {
        expect(Object.keys(stop).sort()).toEqual(["kind", "taskId"]);
      }
    }
    const decisionInsert = db.from.mock.results[2].value.insert;
    expect(decisionInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ task_a_id: "new", task_b_id: "candidate-a" }),
        expect.objectContaining({ task_a_id: "new", task_b_id: "candidate-b" }),
      ]),
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "buyer-new",
      expect.any(String),
      { task_id: "new", share_group_id: "group-2" },
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "buyer-b",
      expect.any(String),
      { task_id: "candidate-b", share_group_id: "group-2" },
    );
  });

  it("matches a pair with capability union, two load units and stricter urgency", async () => {
    const group = {
      id: "group-1",
      status: "posted",
      ordered_route: [
        { taskId: "new", kind: "pickup" },
        { taskId: "other", kind: "pickup" },
      ],
    };
    const members = [task("new", "buyer-new"), task("other", "buyer-other", 0.1)];
    const ranked = [{ runnerId: "runner-1", rank: 1, matchScore: 0.8, components: {} }];
    mocks.rankAvailableRunners.mockResolvedValue(ranked);
    const db = queuedDb(
      {
        errand_share_groups: [{ data: group, error: null }],
        tasks: [{ data: members, error: null }],
      },
      async (name, args) => {
        expect(name).toBe("finalize_share_match_run");
        expect(args.p_candidates).toBe(ranked);
        return { data: [{ status: "matched", run_id: "share-run" }], error: null };
      },
    );
    mocks.getServiceClient.mockReturnValue(db);

    await expect(generateShareMatchRun("group-1")).resolves.toEqual({
      status: "matched",
      runId: "share-run",
      results: ranked,
    });
    expect(mocks.rankAvailableRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerIds: ["buyer-new", "buyer-other"],
        pickup: point(0, 0),
        urgency: "normal",
        requiredCapabilities: ["groceries", "pharmacy"],
        loadUnits: 2,
      }),
    );
  });

  it("records a no-candidate group run without changing it in application code", async () => {
    const group = {
      id: "group-empty",
      status: "posted",
      ordered_route: [{ taskId: "new", kind: "pickup" }],
    };
    mocks.rankAvailableRunners.mockResolvedValue([]);
    const db = queuedDb(
      {
        errand_share_groups: [{ data: group, error: null }],
        tasks: [{ data: [task("new", "buyer-new"), task("other", "buyer-other", 0.1)], error: null }],
      },
      async (_name, args) => {
        expect(args.p_candidates).toEqual([]);
        return { data: [{ status: "no_candidates", run_id: "empty-run" }], error: null };
      },
    );
    mocks.getServiceClient.mockReturnValue(db);

    await expect(generateShareMatchRun("group-empty")).resolves.toEqual({
      status: "no_candidates",
      runId: "empty-run",
      results: [],
    });
  });

  it("releases due work in a bounded, failure-isolated batch", async () => {
    const rpcResults: Record<string, unknown> = {
      expire_due_errand_share_groups: [
        { group_id: "expired", task_ids: ["still-waiting", "released-a"], task_share_states: ["waiting", "released"] },
      ],
      claim_due_errand_share_tasks: [{ task_id: "released-b" }],
    };
    const db = queuedDb({
      tasks: [{
        data: [
          { id: "still-waiting", buyer_id: "buyer-waiting" },
          { id: "released-a", buyer_id: "buyer-released" },
        ],
        error: null,
      }],
    }, async (name, args) => {
      expect(args.p_limit).toBe(25);
      return { data: rpcResults[name], error: null };
    });
    mocks.getServiceClient.mockReturnValue(db);
    mocks.generateMatchRun
      .mockResolvedValueOnce({ status: "matched", runId: "run-a", results: [] })
      .mockRejectedValueOnce(new Error("temporary failure"));

    await expect(processDueShareWindows(99, NOW)).resolves.toEqual({
      claimed: 2,
      matched: 1,
      failed: 1,
    });
    expect(mocks.generateMatchRun).toHaveBeenCalledWith("released-a", "automatic");
    expect(mocks.generateMatchRun).toHaveBeenCalledWith("released-b", "automatic");
    expect(mocks.generateMatchRun).not.toHaveBeenCalledWith("still-waiting", expect.anything());
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "buyer-released",
      expect.any(String),
      { task_id: "released-a" },
    );
  });
});
