import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

const protectedValues = {
  userId: "user-12345678",
  endpoint: "https://push.example/subscription-id",
  p256dh: "public-encryption-key",
  auth: "authentication-secret",
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: vi.fn(() => ({ from: mocks.from })),
}));

import { POST as subscribe } from "../subscribe/route";
import { POST as unsubscribe } from "../unsubscribe/route";

interface DatabaseError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

const internalError: DatabaseError = {
  code: "42P01",
  message: `write failed for user ${protectedValues.userId}`,
  details: `endpoint=${protectedValues.endpoint} p256dh=${protectedValues.p256dh}`,
  hint: `auth=${protectedValues.auth}`,
};

function subscribeRequest() {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: protectedValues.endpoint,
      p256dh: protectedValues.p256dh,
      auth: protectedValues.auth,
    }),
  });
}

function unsubscribeRequest() {
  return new NextRequest("http://localhost/api/push/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: protectedValues.endpoint,
    }),
  });
}

function configureSubscribeDatabase({
  existing = false,
  lookupError = null,
  updateError = null,
  insertError = null,
}: {
  existing?: boolean;
  lookupError?: DatabaseError | null;
  updateError?: DatabaseError | null;
  insertError?: DatabaseError | null;
}) {
  const lookupQuery = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: existing ? { id: "subscription-1" } : null,
      error: lookupError,
    }),
  };
  lookupQuery.eq.mockReturnValue(lookupQuery);

  const updateQuery = {
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  };

  const insert = vi.fn().mockResolvedValue({ error: insertError });
  mocks.from.mockReturnValue({
    select: vi.fn(() => lookupQuery),
    update: vi.fn(() => updateQuery),
    insert,
  });

  return { insert };
}

function configureUnsubscribeDatabase(deleteError: DatabaseError | null) {
  const result = Promise.resolve({ error: deleteError });
  const deleteQuery = {
    eq: vi.fn(),
    then: result.then.bind(result),
  };
  deleteQuery.eq.mockReturnValue(deleteQuery);

  mocks.from.mockReturnValue({
    delete: vi.fn(() => deleteQuery),
  });
}

async function expectSafeDatabaseFailure(
  response: Response,
  operation: "lookup" | "update" | "insert" | "delete",
  errorLog: ReturnType<typeof vi.spyOn>,
) {
  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toEqual({
    error: "Push subscription request failed",
  });
  expect(errorLog).toHaveBeenCalledWith(
    "push_subscription_database_error",
    { operation, code: internalError.code },
  );
  const serializedLog = JSON.stringify(errorLog.mock.calls);
  for (const protectedValue of Object.values(protectedValues)) {
    expect(serializedLog).not.toContain(protectedValue);
  }
}

describe("push subscription database failures", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorLog.mockRestore();
  });

  it.each([
    {
      operation: "lookup" as const,
      database: { lookupError: internalError },
    },
    {
      operation: "update" as const,
      database: { existing: true, updateError: internalError },
    },
    {
      operation: "insert" as const,
      database: { insertError: internalError },
    },
  ])(
    "returns a stable public error when subscribe $operation fails",
    async ({ operation, database }) => {
      const query = configureSubscribeDatabase(database);

      const response = await subscribe(subscribeRequest());

      await expectSafeDatabaseFailure(response, operation, errorLog);
      if (operation === "lookup") {
        expect(query.insert).not.toHaveBeenCalled();
      }
    },
  );

  it("treats a duplicate insert race as an idempotent success", async () => {
    configureSubscribeDatabase({
      insertError: { ...internalError, code: "23505" },
    });

    const response = await subscribe(subscribeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("returns a stable public error when unsubscribe delete fails", async () => {
    configureUnsubscribeDatabase(internalError);

    const response = await unsubscribe(unsubscribeRequest());

    await expectSafeDatabaseFailure(response, "delete", errorLog);
  });
});
