import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { liveRunnerLocations } from "@/lib/server/presence";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Return the current live location of the runner assigned to a task.
 * Uses Redis presence when available, falling back to the durable Postgres
 * runner_profile row. Only the task buyer can query this while the errand is
 * accepted or in_progress.
 */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId || !isUuid(taskId)) {
    return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select("buyer_id, selected_runner_id, status")
    .eq("id", taskId)
    .maybeSingle<{ buyer_id: string; selected_runner_id: string | null; status: string }>();
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (task.buyer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!task.selected_runner_id || (task.status !== "accepted" && task.status !== "in_progress")) {
    return NextResponse.json({ error: "Not live" }, { status: 409 });
  }

  const runnerId = task.selected_runner_id;

  const live = await liveRunnerLocations([runnerId]);
  const redisLoc = live.get(runnerId);
  if (redisLoc) {
    return NextResponse.json({ lat: redisLoc.lat, lng: redisLoc.lng, source: "redis" });
  }

  const { data: profile } = await db
    .from("runner_profile")
    .select("current_lat, current_lng")
    .eq("user_id", runnerId)
    .maybeSingle<{ current_lat: number | null; current_lng: number | null }>();

  if (profile?.current_lat != null && profile?.current_lng != null) {
    return NextResponse.json({ lat: profile.current_lat, lng: profile.current_lng, source: "db" });
  }

  return NextResponse.json(null, { status: 200 });
}
