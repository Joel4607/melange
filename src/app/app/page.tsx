import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import type { NotificationSummary } from "@/lib/notification-text";
import { DashboardShell } from "./dashboard-shell";
import { BuyerDashboard } from "./buyer-dashboard";
import { RunnerDashboard } from "./runner-dashboard";

export const metadata: Metadata = {
  title: "Your dashboard — Mélange",
};

type Role = "buyer" | "runner";

interface ErrandSummary {
  id: string;
  title: string;
  status: string;
  price: string;
  category: string | null;
  created_at: string;
}

interface RunnerProfileSummary {
  is_available: boolean;
  trust_score: number;
  capabilities: string[] | null;
}

interface RunnerTaskSummary {
  id: string;
  title: string;
  status: string;
  price: string;
  fee: string;
  category: string | null;
  completed_at: string | null;
  created_at: string;
}

export default async function AppHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, phone, is_admin")
    .eq("id", user.id)
    .maybeSingle<{ name: string | null; phone: string | null; is_admin: boolean }>();

  if (profile?.is_admin) redirect("/admin");

  const metaPhone = (user.user_metadata?.phone as string | undefined) ?? "";
  if (profile && !profile.phone && metaPhone) {
    await supabase.from("profiles").update({ phone: metaPhone }).eq("id", user.id);
  }

  const role: Role = user.user_metadata?.role === "runner" ? "runner" : "buyer";
  const firstName = (profile?.name ?? "there").split(" ")[0];

  const { data: errands } =
    role === "buyer"
      ? await supabase
          .from("tasks")
          .select("id, title, status, price, category, created_at")
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false })
          .returns<ErrandSummary[]>()
      : { data: null };

  let runnerProfile: RunnerProfileSummary | null = null;
  let runnerTasks: RunnerTaskSummary[] | null = null;
  let runnerRatings: { stars: number; tip_amount: string }[] | null = null;

  if (role === "runner") {
    const db = getServiceClient();
    const [{ data: rp }, { data: rt }, { data: rr }] = await Promise.all([
      db
        .from("runner_profile")
        .select("is_available, trust_score, capabilities")
        .eq("user_id", user.id)
        .maybeSingle<RunnerProfileSummary>(),
      db
        .from("tasks")
        .select("id, title, status, price, fee, category, completed_at, created_at")
        .eq("selected_runner_id", user.id)
        .order("created_at", { ascending: false })
        .returns<RunnerTaskSummary[]>(),
      db
        .from("ratings")
        .select("stars, tip_amount")
        .eq("ratee_id", user.id)
        .returns<{ stars: number; tip_amount: string }[]>(),
    ]);
    runnerProfile = rp ?? null;
    runnerTasks = rt ?? null;
    runnerRatings = rr ?? null;
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, payload, read, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<NotificationSummary[]>();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, held")
    .eq("user_id", user.id)
    .maybeSingle<{ balance: string; held: string }>();

  const completedTasks =
    runnerTasks?.filter((t) => t.status === "completed" || t.status === "resolved") ?? [];
  const totalTips = (runnerRatings ?? []).reduce(
    (sum, r) => sum + Number(r.tip_amount ?? 0),
    0,
  );
  const totalEarned = completedTasks.reduce(
    (sum, t) => sum + Math.max(0, Number(t.price) - Number(t.fee)),
    0,
  ) + totalTips;
  const avgRating =
    runnerRatings && runnerRatings.length > 0
      ? runnerRatings.reduce((sum, r) => sum + r.stars, 0) / runnerRatings.length
      : 0;

  return (
    <DashboardShell
      user={{ id: user.id }}
      role={role}
      firstName={firstName}

      notifications={notifications ?? []}
    >
      {role === "buyer" ? (
        <BuyerDashboard
          errands={errands ?? []}
          wallet={wallet ?? null}
          name={profile?.name ?? null}
        />
      ) : (
        <RunnerDashboard
          profile={runnerProfile ?? null}
          tasks={runnerTasks ?? []}
          avgRating={avgRating}
          totalEarned={totalEarned}
          completedCount={completedTasks.length}
          name={profile?.name ?? null}
          wallet={wallet ?? null}
        />
      )}
    </DashboardShell>
  );
}
