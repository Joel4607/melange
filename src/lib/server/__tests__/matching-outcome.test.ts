import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  liveRunnerLocations: vi.fn(),
  isRunnerAvailable: vi.fn(() => true),
  loadCancellationCounts: vi.fn(async () => new Map()),
  loadPairDisputeCounts: vi.fn(async () => new Map()),
  loadActiveFraudFlags: vi.fn(async () => new Set()),
  createNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/service", () => ({ getServiceClient: mocks.getServiceClient }));
vi.mock("@/lib/algorithm", async () => ({
  ...(await import("../../algorithm/trust")),
  ...(await import("../../algorithm/fraud")),
  ...(await import("../../algorithm/matching")),
}));
vi.mock("@/lib/availability", () => ({ isRunnerAvailable: mocks.isRunnerAvailable }));
vi.mock("../presence", () => ({ liveRunnerLocations: mocks.liveRunnerLocations }));
vi.mock("../notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("../fraud", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    loadCancellationCounts: mocks.loadCancellationCounts,
    loadPairDisputeCounts: mocks.loadPairDisputeCounts,
    loadActiveFraudFlags: mocks.loadActiveFraudFlags,
  };
});

import {
  declineAndOfferNextCandidate,
  generateMatchRun,
  finalizeSelfClaim,
  offerToTopCandidate,
  recordMatchOutcomeEvent,
  toRunnerCandidate,
} from "../matching";

const task = {
  id: "task-1",
  buyer_id: "buyer-1",
  title: "Buy groceries",
  category: "shopping",
  pickup_lat: 5.56,
  pickup_lng: -0.2,
  dropoff_lat: null,
  dropoff_lng: null,
  urgency: "normal" as const,
  price: "20",
  fee: "2",
  status: "posted" as const,
  selected_runner_id: null,
  accepted_at: null,
  completed_at: null,
};

function chain<T>(terminal: T) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "is", "update"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => terminal);
  query.single = vi.fn(async () => terminal);
  query.returns = vi.fn(async () => terminal);
  return query;
}

function matchingDb(
  runners: unknown[],
  rpcResult: { status: string; run_id: string | null },
) {
  const taskQuery = chain({ data: task, error: null });
  const runnerQuery = chain({ data: runners, error: null });
  runnerQuery.upsert = vi.fn(async () => ({ error: null }));
  const trustQuery = chain({ data: [], error: null });
  const profileQuery = chain({
    data: runners.map((runner) => ({
      id: (runner as { user_id: string }).user_id,
      verified: true,
    })),
    error: null,
  });
  const outcomeQuery = { upsert: vi.fn(async () => ({ error: null })) };
  const db = {
    from: vi.fn((table: string) => {
      if (table === "tasks") return taskQuery;
      if (table === "runner_profile") return runnerQuery;
      if (table === "trust_events") return trustQuery;
      if (table === "profiles") return profileQuery;
      if (table === "match_outcomes") return outcomeQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: [rpcResult], error: null })),
    outcomeQuery,
  };
  return db;
}

describe("matching persistence outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.liveRunnerLocations.mockResolvedValue(new Map());
  });

  it("records no candidates without treating it as an error", async () => {
    const db = matchingDb([], { status: "no_candidates", run_id: "run-empty" });
    mocks.getServiceClient.mockReturnValue(db);

    await expect(generateMatchRun(task.id, "manual")).resolves.toEqual({
      status: "no_candidates",
      runId: "run-empty",
      results: [],
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "finalize_match_run",
      expect.objectContaining({ p_source: "manual", p_candidates: [] }),
    );
  });

  it("returns the database stale-state decision exactly", async () => {
    const db = matchingDb([], { status: "not_posted", run_id: null });
    mocks.getServiceClient.mockReturnValue(db);

    await expect(generateMatchRun(task.id)).resolves.toEqual({
      status: "not_posted",
      runId: null,
      results: [],
    });
  });

  it("constructs every raw eligibility field for the pure matcher", async () => {
    const runner = {
      user_id: "runner-1",
      current_lat: 5.57,
      current_lng: -0.21,
      is_available: true,
      active_load: 1,
      trust_score: 0.5,
      verified: true,
      status: "active" as const,
      capabilities: ["shopping"],
      available_manual: true,
      scheduled_hours: null,
    };
    expect(toRunnerCandidate(runner, 0.7, true, "clear")).toEqual({
      runnerId: runner.user_id,
      location: { lat: runner.current_lat, lng: runner.current_lng },
      trust: 0.7,
      activeLoad: runner.active_load,
      capabilities: runner.capabilities,
      active: true,
      verified: true,
      fraudAction: "clear",
      available: true,
    });
  });

  it("returns matched with the ranked candidates committed by the RPC", async () => {
    const runner = {
      user_id: "runner-1",
      current_lat: 5.57,
      current_lng: -0.21,
      is_available: true,
      active_load: 1,
      trust_score: 0.5,
      verified: true,
      status: "active" as const,
      capabilities: ["shopping"],
      available_manual: true,
      scheduled_hours: null,
    };
    const db = matchingDb([runner], { status: "matched", run_id: "run-1" });
    mocks.getServiceClient.mockReturnValue(db);

    const outcome = await generateMatchRun(task.id);
    expect(outcome.status).toBe("matched");
    expect(outcome.runId).toBe("run-1");
    expect(outcome.results).toHaveLength(1);
    expect(db.rpc).toHaveBeenCalledWith(
      "finalize_match_run",
      expect.objectContaining({
        p_candidates: [expect.objectContaining({ runnerId: runner.user_id, rank: 1 })],
      }),
    );
  });

  it("finalizes self-claim through the same task lock with one claimant", async () => {
    const runner = {
      user_id: "runner-1",
      current_lat: 5.57,
      current_lng: -0.21,
      is_available: true,
      active_load: 0,
      trust_score: 0.5,
      verified: true,
      status: "active" as const,
      capabilities: ["shopping"],
      available_manual: true,
      scheduled_hours: null,
    };
    const db = matchingDb([runner], { status: "matched", run_id: "claim-run" });
    mocks.getServiceClient.mockReturnValue(db);

    await expect(finalizeSelfClaim(task.id, runner.user_id)).resolves.toEqual(
      expect.objectContaining({ status: "matched", runId: "claim-run" }),
    );
    expect(db.rpc).toHaveBeenCalledWith(
      "finalize_match_run",
      expect.objectContaining({
        p_source: "self_claim",
        p_algorithm_version: "self-claim",
        p_self_claim_runner_id: runner.user_id,
        p_candidates: [expect.objectContaining({ runnerId: runner.user_id })],
      }),
    );
    expect(db.outcomeQuery.upsert).not.toHaveBeenCalled();
  });

  it("offers and records through the atomic exact-run RPC", async () => {
    const taskQuery = chain({ data: { id: task.id, title: task.title }, error: null });
    const db = {
      from: vi.fn(() => taskQuery),
      rpc: vi.fn(async () => ({
        data: [{ status: "offered", offered_runner_id: "runner-1", run_id: "active-run" }],
        error: null,
      })),
    };
    mocks.getServiceClient.mockReturnValue(db);

    await expect(offerToTopCandidate(task.id, true)).resolves.toBe("runner-1");
    expect(db.rpc).toHaveBeenCalledWith(
      "offer_next_match_candidate",
      { p_task_id: task.id, p_ensure_hold: true },
    );
    expect(mocks.createNotification).toHaveBeenCalledWith("runner-1", "offer", expect.anything());
  });

  it("reopens an errand when every candidate in the active run has declined", async () => {
    const taskQuery = chain({ data: { id: task.id, title: task.title }, error: null });
    const db = {
      from: vi.fn(() => taskQuery),
      rpc: vi.fn(async () => ({
        data: [{ status: "reopened", offered_runner_id: null, run_id: "active-run" }],
        error: null,
      })),
    };
    mocks.getServiceClient.mockReturnValue(db);

    await expect(offerToTopCandidate(task.id)).resolves.toBeNull();
    expect(db.rpc).toHaveBeenCalledWith(
      "offer_next_match_candidate",
      { p_task_id: task.id, p_ensure_hold: false },
    );
  });

  it("declines and advances or reopens through one atomic RPC", async () => {
    const taskQuery = chain({ data: { id: task.id, title: task.title }, error: null });
    const db = {
      from: vi.fn(() => taskQuery),
      rpc: vi.fn(async () => ({
        data: [{ status: "offered", offered_runner_id: "runner-2", run_id: "active-run" }],
        error: null,
      })),
    };
    mocks.getServiceClient.mockReturnValue(db);

    await expect(
      declineAndOfferNextCandidate(task.id, "runner-1"),
    ).resolves.toEqual(expect.objectContaining({
      status: "offered",
      offered_runner_id: "runner-2",
    }));
    expect(db.rpc).toHaveBeenCalledWith("decline_and_offer_next_candidate", {
      p_task_id: task.id,
      p_runner_id: "runner-1",
    });
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "runner-2",
      "offer",
      expect.anything(),
    );
  });

  it("records lifecycle timestamps against the exact offered runner", async () => {
    const taskQuery = chain({ data: { active_match_run_id: "active-run" }, error: null });
    const outcomeQuery = chain({
      data: { offered_at: "2026-08-14T10:00:00.000Z", picked_up_at: null },
      error: null,
    });
    const updateQuery = chain({ data: null, error: null });
    outcomeQuery.update = vi.fn(() => updateQuery);
    const db = {
      from: vi.fn((table: string) => table === "tasks" ? taskQuery : outcomeQuery),
    };
    mocks.getServiceClient.mockReturnValue(db);

    await recordMatchOutcomeEvent(
      task.id,
      "runner-1",
      "accepted",
      { occurredAt: new Date("2026-08-14T10:02:00.000Z") },
    );
    expect(outcomeQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      responded_at: "2026-08-14T10:02:00.000Z",
      accepted: true,
      declined: false,
    }));
    expect(updateQuery.eq).toHaveBeenCalledWith("match_run_id", "active-run");
    expect(updateQuery.eq).toHaveBeenCalledWith("runner_id", "runner-1");
  });

  it("repairs a missing offered row before recording a later outcome", async () => {
    const taskQuery = chain({ data: { active_match_run_id: "active-run" }, error: null });
    const outcomeQuery = chain({ data: null, error: null });
    outcomeQuery.upsert = vi.fn(async () => ({ error: null }));
    const updateQuery = chain({ data: null, error: null });
    outcomeQuery.update = vi.fn(() => updateQuery);
    const db = {
      from: vi.fn((table: string) => table === "tasks" ? taskQuery : outcomeQuery),
    };
    mocks.getServiceClient.mockReturnValue(db);

    await recordMatchOutcomeEvent(
      task.id,
      "runner-1",
      "accepted",
      { occurredAt: new Date("2026-08-14T10:02:00.000Z") },
    );
    expect(outcomeQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_run_id: "active-run",
        task_id: task.id,
        runner_id: "runner-1",
      }),
      { onConflict: "match_run_id,runner_id" },
    );
    expect(outcomeQuery.update).toHaveBeenCalled();
  });

  it("never lets telemetry failure reverse a completed state transition", async () => {
    const taskQuery = chain({ data: null, error: { message: "telemetry offline" } });
    mocks.getServiceClient.mockReturnValue({ from: vi.fn(() => taskQuery) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      recordMatchOutcomeEvent(task.id, "runner-1", "completed"),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "match_outcome_write_failed",
      expect.objectContaining({ event: "completed" }),
    );
    errorSpy.mockRestore();
  });
});
