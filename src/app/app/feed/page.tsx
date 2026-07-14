import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin, PackageCheck, Clock, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { haversineKm } from "@/lib/algorithm";
import { isRunnerAvailable } from "@/lib/availability";
import { claimTask } from "../actions";
import { RealtimeStatus } from "../realtime-status";
import { MapView, MapMarker } from "../map-view";

export const metadata: Metadata = {
  title: "Open errands — Mélange",
};

interface OpenTask {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  urgency: string;
  price: string;
  fee: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  created_at: string;
}

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role === "runner" ? "runner" : "buyer";
  if (role !== "runner") redirect("/app");

  const db = getServiceClient();
  const { data: profile } = await db
    .from("runner_profile")
    .select("current_lat, current_lng, capabilities, available_manual, scheduled_hours, verified")
    .eq("user_id", user.id)
    .maybeSingle<{
      current_lat: number | null;
      current_lng: number | null;
      capabilities: string[] | null;
      available_manual: boolean | null;
      scheduled_hours: { day: number; start: string; end: string }[] | null;
      verified: boolean;
    }>();

  const available = profile ? isRunnerAvailable(profile.available_manual, profile.scheduled_hours) : false;

  const { data: tasks } = await db
    .from("tasks")
    .select(
      "id, title, description, category, urgency, price, fee, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, created_at",
    )
    .eq("status", "posted")
    .is("selected_runner_id", null)
    .neq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .returns<OpenTask[]>();

  const runnerLocation =
    profile?.current_lat != null && profile?.current_lng != null
      ? { lat: profile.current_lat, lng: profile.current_lng }
      : null;

  const capabilities = new Set(profile?.capabilities ?? []);

  const tasksWithDistance = (tasks ?? []).map((task) => {
    const distance =
      runnerLocation && task.pickup_lat != null && task.pickup_lng != null
        ? haversineKm(runnerLocation, { lat: task.pickup_lat, lng: task.pickup_lng })
        : null;
    return { ...task, distance };
  });

  tasksWithDistance.sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });

  const mapCenter = runnerLocation ?? { lat: tasksWithDistance[0]?.pickup_lat ?? 0, lng: tasksWithDistance[0]?.pickup_lng ?? 0 };
  const mapMarkers: MapMarker[] = [
    ...(runnerLocation ? [{ lat: runnerLocation.lat, lng: runnerLocation.lng, label: "You", kind: "runner" as const }] : []),
    ...tasksWithDistance.map((task) => ({
      lat: task.pickup_lat,
      lng: task.pickup_lng,
      label: task.title,
      kind: "pickup" as const,
    })),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Open errands</h1>
        <p className="mt-2 text-muted">
          Browse posted errands near you and claim one to start.
        </p>

        {!profile?.verified ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange/15 bg-orange/5 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-deep" aria-hidden />
            <p className="text-orange-deep">
              Identity verification is required before you can claim errands.
              Submit your Ghana Card in{" "}
              <Link href="/app/verify" className="underline">
                verification
              </Link>{" "}
              and wait for admin approval.
            </p>
          </div>
        ) : !available ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange/15 bg-orange/5 p-4 text-sm">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-deep" aria-hidden />
            <p className="text-orange-deep">
              You are currently unavailable. Set your availability in{" "}
              <Link href="/app/settings" className="underline">
                settings
              </Link>{" "}
              to claim errands.
            </p>
          </div>
        ) : null}

        {tasksWithDistance.length > 0 && (
          <div className="mt-6">
            <MapView center={mapCenter} markers={mapMarkers} className="h-96" />
          </div>
        )}

        {tasksWithDistance.length === 0 ? (
          <div className="mt-8 rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
            <PackageCheck className="mx-auto h-8 w-8 text-orange-deep" aria-hidden />
            <p className="mt-3 font-medium text-green-deep">No open errands right now</p>
            <p className="mt-1 text-sm text-muted">Check back soon or make sure you are available.</p>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {tasksWithDistance.map((task) => {
              const capable =
                !task.category ||
                capabilities.size === 0 ||
                capabilities.has(task.category);
              const payout = (Number(task.price) - Number(task.fee)).toFixed(2);
              return (
                <li
                  key={task.id}
                  className="rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg font-semibold text-green-deep">
                        {task.title}
                      </p>
                      <p className="text-sm text-muted">
                        {task.category ?? "Errand"} · {task.urgency} · Payout GHS {payout}
                      </p>
                      {task.distance != null ? (
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                          <MapPin className="h-4 w-4" aria-hidden />
                          {task.distance.toFixed(1)} km away
                        </p>
                      ) : null}
                    </div>
                    {capable && available && profile?.verified ? (
                      <form action={claimTask.bind(null, task.id)}>
                        <button
                          type="submit"
                          className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
                        >
                          Claim
                        </button>
                      </form>
                    ) : (
                      <span className="rounded-full border border-cream-deep bg-cream/40 px-4 py-2 text-sm text-muted">
                        {!profile?.verified
                          ? "Verification required"
                          : !available
                            ? "Unavailable"
                            : "Not in your capabilities"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <RealtimeStatus userId={user.id} />
      </main>
    </div>
  );
}
