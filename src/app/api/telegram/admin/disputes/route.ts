import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireTelegramAdmin } from "@/lib/telegram/admin-auth";

export async function GET(request: Request) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) {
    return NextResponse.json({ error: "Missing initData" }, { status: 400 });
  }

  const admin = await requireTelegramAdmin(initData);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: disputes, error } = await db
    .from("disputes")
    .select("id, task_id, reason, status, created_at")
    .eq("status", "escalated")
    .order("created_at", { ascending: false })
    .returns<
      { id: string; task_id: string; reason: string; status: string; created_at: string }[]
    >();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const taskIds = [...new Set((disputes ?? []).map((d) => d.task_id))];
  const { data: tasks } = await db
    .from("tasks")
    .select("id, title, buyer_id, selected_runner_id, price, fee")
    .in("id", taskIds)
    .returns<
      {
        id: string;
        title: string;
        buyer_id: string;
        selected_runner_id: string | null;
        price: string;
        fee: string;
      }[]
    >();
  const taskById = new Map(tasks?.map((t) => [t.id, t]) ?? []);

  const userIds = new Set<string>();
  for (const t of tasks ?? []) {
    userIds.add(t.buyer_id);
    if (t.selected_runner_id) userIds.add(t.selected_runner_id);
  }
  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", Array.from(userIds))
    .returns<{ id: string; name: string }[]>();
  const nameById = new Map(profiles?.map((p) => [p.id, p.name]) ?? []);

  const result = (disputes ?? []).map((d) => {
    const t = taskById.get(d.task_id);
    return {
      id: d.id,
      taskId: d.task_id,
      title: t?.title ?? "Unknown",
      reason: d.reason,
      createdAt: d.created_at,
      buyer: nameById.get(t?.buyer_id ?? "") ?? "Unknown",
      runner: nameById.get(t?.selected_runner_id ?? "") ?? "Unknown",
      amount: t ? Number(t.price).toFixed(2) : "0.00",
      runnerPayout: t ? Math.max(0, Number(t.price) - Number(t.fee)).toFixed(2) : "0.00",
    };
  });

  return NextResponse.json({ disputes: result });
}
