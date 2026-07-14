import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { haversineKm } from "@/lib/algorithm";
import { Logo } from "@/components/brand";
import { CATEGORIES } from "../post/post-form";
import { RunnerFilters } from "./runner-filters";
import { RunnerCard } from "./runner-card";

export const metadata: Metadata = {
  title: "Browse runners — Mélange",
};

interface RunnerListItem {
  user_id: string;
  current_lat: number | null;
  current_lng: number | null;
  trust_score: number;
  verified: boolean;
  capabilities: string[] | null;
  profiles: { name: string | null; verified: boolean } | null;
  completed: number;
  distanceKm: number | null;
}

export default async function RunnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getServiceClient();

  const category = typeof params.category === "string" ? params.category : undefined;
  const minTrust = Number(params.minTrust);
  const sort = typeof params.sort === "string" ? params.sort : "trust";
  const lat = Number(params.lat);
  const lng = Number(params.lng);

  let query = db
    .from("runner_profile")
    .select(
      "user_id, current_lat, current_lng, trust_score, capabilities, verified, profiles(name, verified)",
    )
    .eq("is_available", true)
    .eq("status", "active")
    .eq("verified", true)
    .neq("user_id", user.id);

  if (category) {
    query = query.contains("capabilities", [category]);
  }
  if (!Number.isNaN(minTrust) && minTrust > 0) {
    query = query.gte("trust_score", minTrust / 5);
  }

  const { data: rows, error } = await query.returns<{
    user_id: string;
    current_lat: number | null;
    current_lng: number | null;
    trust_score: number;
    verified: boolean;
    capabilities: string[] | null;
    profiles: { name: string | null; verified: boolean } | null;
  }[]>();

  if (error) throw new Error(error.message);

  const runnerIds = (rows ?? []).map((r) => r.user_id);
  const completedByRunner = new Map<string, number>();
  if (runnerIds.length) {
    const { data: tasks } = await db
      .from("tasks")
      .select("selected_runner_id")
      .in("selected_runner_id", runnerIds)
      .in("status", ["completed", "resolved"])
      .returns<{ selected_runner_id: string }[]>();
    for (const t of tasks ?? []) {
      completedByRunner.set(
        t.selected_runner_id,
        (completedByRunner.get(t.selected_runner_id) ?? 0) + 1,
      );
    }
  }

  const buyerHasLocation = !Number.isNaN(lat) && !Number.isNaN(lng);
  const buyerLocation = buyerHasLocation ? { lat, lng } : null;

  const runners: RunnerListItem[] = (rows ?? []).map((r) => {
    const distanceKm =
      buyerLocation && r.current_lat != null && r.current_lng != null
        ? haversineKm(buyerLocation, { lat: r.current_lat, lng: r.current_lng })
        : null;
    return {
      ...r,
      completed: completedByRunner.get(r.user_id) ?? 0,
      distanceKm,
    };
  });

  runners.sort((a, b) => {
    if (sort === "distance") {
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    }
    return b.trust_score - a.trust_score;
  });

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
          Browse runners
        </h1>
        <p className="mt-2 text-muted">
          Filter by category, rating, and distance. Pick someone you trust and request them
          directly.
        </p>

        <RunnerFilters
          categories={CATEGORIES as unknown as string[]}
          buyerLocation={buyerLocation}
        />

        {runners.length === 0 ? (
          <p className="mt-8 text-center text-muted">
            No runners match your filters right now.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {runners.map((runner) => (
              <RunnerCard key={runner.user_id} runner={runner} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
