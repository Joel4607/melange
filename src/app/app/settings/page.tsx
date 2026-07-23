import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, User, ShieldCheck, Shield, Bike, PackageCheck, Star, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { updateProfile } from "../actions";
import { AvailabilityToggle } from "../availability-toggle";
import { CapabilitiesEditor } from "../capabilities-editor";
import { ScheduleEditor } from "../schedule-editor";
import { VerificationCard } from "../verification-card";

export const metadata: Metadata = {
  title: "Settings — Mélange",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role === "runner" ? "runner" : "buyer";

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, phone, verified, is_admin")
    .eq("id", user.id)
    .single();

  const { data: runnerProfile } = await getServiceClient()
    .from("runner_profile")
    .select("is_available, available_manual, scheduled_hours, current_lat, current_lng, trust_score, verified, capabilities")
    .eq("user_id", user.id)
    .maybeSingle<{
      is_available: boolean;
      available_manual: boolean | null;
      scheduled_hours: { day: number; start: string; end: string }[] | null;
      current_lat: number | null;
      current_lng: number | null;
      trust_score: number;
      verified: boolean;
      capabilities: string[] | null;
    }>();

  const [{ data: runnerRatings }, { data: completedTasks }] = await Promise.all([
    getServiceClient().from("ratings").select("stars").eq("ratee_id", user.id).returns<{ stars: number }[]>(),
    getServiceClient()
      .from("tasks")
      .select("id, price, fee")
      .eq("selected_runner_id", user.id)
      .in("status", ["completed", "resolved"])
      .returns<{ id: string; price: string; fee: string }[]>(),
  ]);

  const averageRating =
    runnerRatings && runnerRatings.length > 0
      ? runnerRatings.reduce((sum, r) => sum + r.stars, 0) / runnerRatings.length
      : 0;
  const totalEarned = (completedTasks ?? []).reduce(
    (sum, t) => sum + Math.max(0, Number(t.price) - Number(t.fee)),
    0,
  );

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

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Settings</h1>

        <div className="mt-6">
          <VerificationCard verified={profile?.verified ?? false} request={null} />
        </div>

        <section className="mt-5 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
            <User className="h-5 w-5 text-orange-deep" aria-hidden /> Profile
          </p>
          <form action={updateProfile} className="mt-4 space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-ink">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={profile?.name ?? ""}
                className="mt-1 w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition focus:border-green-soft focus:bg-white"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-ink">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile?.phone ?? ""}
                className="mt-1 w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition focus:border-green-soft focus:bg-white"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
            >
              Save changes
            </button>
          </form>
        </section>

        <section className="mt-5 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
            <Shield className="h-5 w-5 text-orange-deep" aria-hidden /> Account
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Email</span>
              <span className="font-medium text-ink">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Role</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-xs font-medium text-green-deep">
                {role === "runner" ? <Bike className="h-3.5 w-3.5" aria-hidden /> : <PackageCheck className="h-3.5 w-3.5" aria-hidden />}
                {role === "runner" ? "Runner" : "Customer"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Verification</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                {profile?.verified ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-green-deep" aria-hidden /> Verified
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 text-muted" aria-hidden /> Not verified
                  </>
                )}
              </span>
            </div>
            {profile?.is_admin ? (
              <div className="flex items-center justify-between">
                <span className="text-muted">Admin</span>
                <span className="font-medium text-ink">Yes</span>
              </div>
            ) : null}
          </div>
        </section>

        {role === "runner" ? (
          <section className="mt-5 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
            <p className="font-display text-lg font-semibold text-green-deep">My public profile</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Trust score</span>
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <Star className="h-4 w-4 fill-orange text-orange" aria-hidden />
                  {((runnerProfile?.trust_score ?? 0.5) * 5).toFixed(1)} / 5
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Buyer rating</span>
                <span className="font-medium text-ink">
                  {averageRating > 0 ? `${averageRating.toFixed(1)} / 5` : "No ratings yet"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Total earned</span>
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <Wallet className="h-4 w-4" aria-hidden />
                  GHS {totalEarned.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Capabilities</span>
                <span className="font-medium text-ink">
                  {runnerProfile?.capabilities?.length
                    ? runnerProfile.capabilities.join(", ")
                    : "Any Other Errand"}
                </span>
              </div>
            </div>
            <Link
              href="/app/earnings"
              className="mt-4 inline-block text-sm font-medium text-green-deep underline transition hover:text-green"
            >
              View earnings history
            </Link>
          </section>
        ) : null}

        {role === "runner" ? (
          <section className="mt-5 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
            <p className="font-display text-lg font-semibold text-green-deep">Runner settings</p>
            <p className="mt-1 text-sm text-muted">Set your availability and the errands you want to match for.</p>
            <div className="mt-4 space-y-5">
              <AvailabilityToggle
                availableManual={runnerProfile?.available_manual ?? null}
                scheduledHours={runnerProfile?.scheduled_hours ?? null}
                lat={runnerProfile?.current_lat ?? null}
                lng={runnerProfile?.current_lng ?? null}
                verified={runnerProfile?.verified ?? profile?.verified ?? false}
              />
              <ScheduleEditor initialSchedule={runnerProfile?.scheduled_hours ?? null} />
              <CapabilitiesEditor capabilities={runnerProfile?.capabilities ?? null} />
            </div>
          </section>
        ) : null}

        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="w-full rounded-full border border-cream-deep bg-white px-5 py-3 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
          >
            Sign out
          </button>
        </form>
      </main>
    </div>
  );
}
