import type { PostgrestError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type PushSubscriptionDatabaseOperation =
  | "lookup"
  | "update"
  | "insert"
  | "delete";

export function pushSubscriptionDatabaseFailure(
  operation: PushSubscriptionDatabaseOperation,
  error: PostgrestError,
) {
  console.error("push_subscription_database_error", {
    operation,
    code: error.code,
  });

  return NextResponse.json(
    { error: "Push subscription request failed" },
    { status: 500 },
  );
}
