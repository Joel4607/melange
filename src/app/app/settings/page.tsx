import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, User, Shield, Bike, PackageCheck, Star, Wallet, ShieldCheck, Clock, XCircle, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { updateNotificationPreferences, updateProfile } from "../actions";
import { AvailabilityToggle } from "../availability-toggle";
import { CapabilitiesEditor } from "../capabilities-editor";
import { ScheduleEditor } from "../schedule-editor";

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
    .select(
      "name, phone, verified, is_admin, notify_in_app, notify_push, notify_email, notify_telegram",
    )
    .eq("id", user.id)
    .maybeSingle<{
      name: string | null;
      phone: string | null;
      verified: boolean;
      is_admin: boolean;
      notify_in_app: boolean;
      notify_push: boolean;
      notify_email: boolean;
      notify_telegram: boolean;
    }>();

  const { data: latestVerification } =
    role === "runner"
      ? await supabase
          .from("verification_requests")
          .select("id, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; status: "pending" | "approved" | "rejected"; created_at: string }>()
      : { data: null };

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

  const [{ data: runnerRatings }, { data: completedTasks }, { data: trustEvents }] = await Promise.all([
    getServiceClient().from("ratings").select("stars").eq("ratee_id", user.id).returns<{ stars: number }[]>(),
    getServiceClient()
      .from("tasks")
      .select("id, price, fee")
      .eq("selected_runner_id", user.id)
      .in("status", ["completed", "resolved"])
      .returns<{ id: string; price: string; fee: string }[]>(),
    getServiceClient()
      .from("trust_events")
      .select("type, value, created_at")
      .eq("runner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<{ type: string; value: number; created_at: string }[]>(),
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
            {role === "runner" ? (
              <div className="flex items-center justify-between">
                <span className="text-muted">Verification</span>
                {profile?.verified ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-xs font-medium text-green-deep">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified
                  </span>
                ) : latestVerification?.status === "pending" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-orange/10 px-2.5 py-1 text-xs font-medium text-orange-deep">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> Pending
                  </span>
                ) : latestVerification?.status === "rejected" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-orange/10 px-2.5 py-1 text-xs font-medium text-orange-deep">
                    <XCircle className="h-3.5 w-3.5" aria-hidden /> Rejected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/40 px-2.5 py-1 text-xs font-medium text-muted">
                    <Shield className="h-3.5 w-3.5" aria-hidden /> Not verified
                  </span>
                )}
              </div>
            ) : null}
            {profile?.is_admin ? (
              <div className="flex items-center justify-between">
                <span className="text-muted">Admin</span>
                <span className="font-medium text-ink">Yes</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* Identity Verification — runners only */}
        {role === "runner" ? (
          <section className="mt-5 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
              <ShieldCheck className="h-5 w-5 text-orange-deep" aria-hidden /> Identity verification
            </p>

            {profile?.verified ? (
              /* ✅ Verified */
              <div className="mt-4">
                <div className="flex items-center gap-3 rounded-2xl bg-green/10 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green text-cream">
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-green-deep">Identity verified</p>
                    <p className="text-sm text-muted">Your Ghana Card has been reviewed and approved.</p>
                  </div>
                </div>
              </div>
            ) : latestVerification?.status === "pending" ? (
              /* 🕐 Pending review */
              <div className="mt-4">
                <div className="flex items-center gap-3 rounded-2xl bg-orange/10 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange/20 text-orange-deep">
                    <Clock className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-ink">Under review</p>
                    <p className="text-sm text-muted">
                      Submitted {new Date(latestVerification.created_at).toLocaleDateString()}. We&apos;ll notify you once approved.
                    </p>
                  </div>
                </div>
              </div>
            ) : latestVerification?.status === "rejected" ? (
              /* ❌ Rejected — invite to re-submit */
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3 rounded-2xl bg-orange/10 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange/20 text-orange-deep">
                    <XCircle className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-ink">Submission rejected</p>
                    <p className="text-sm text-muted">Your last submission wasn&apos;t accepted. Submit a clearer ID photo.</p>
                  </div>
                </div>
                <Link
                  href="/app/verify"
                  className="inline-flex items-center gap-2 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Re-submit ID
                </Link>
              </div>
            ) : (
              /* 🔓 Not yet started */
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted">
                  Verify your identity to go live and start receiving errands. You&apos;ll need your Ghana Card and a selfie — takes about 2 minutes.
                </p>
                <ul className="space-y-2 text-sm text-ink">
                  {[
                    "Upload your Ghana Card (front & back)",
                    "Take a quick selfie to match your ID",
                    "An admin reviews it — usually within 24 hours",
                  ].map((step) => (
                    <li key={step} className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green text-cream">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/app/verify"
                  className="inline-flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-deep"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Start verification
                </Link>
              </div>
            )}
          </section>
        ) : null}

        <section className="mt-5 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
            <Bell className="h-5 w-5 text-orange-deep" aria-hidden /> Notifications
          </p>
          <p className="mt-1 text-sm text-muted">Choose how we contact you.</p>
          <form action={updateNotificationPreferences} className="mt-4 space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">In-app</span>
              <input
                type="checkbox"
                name="notify_in_app"
                value="on"
                defaultChecked={profile?.notify_in_app ?? true}
                className="h-5 w-5 accent-green-deep"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">Push</span>
              <input
                type="checkbox"
                name="notify_push"
                value="on"
                defaultChecked={profile?.notify_push ?? true}
                className="h-5 w-5 accent-green-deep"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">Email</span>
              <input
                type="checkbox"
                name="notify_email"
                value="on"
                defaultChecked={profile?.notify_email ?? true}
                className="h-5 w-5 accent-green-deep"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">Telegram</span>
              <input
                type="checkbox"
                name="notify_telegram"
                value="on"
                defaultChecked={profile?.notify_telegram ?? true}
                className="h-5 w-5 accent-green-deep"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
            >
              Save preferences
            </button>
          </form>
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
            <div className="mt-5 border-t border-cream-deep pt-4">
              <p className="text-sm font-medium text-green-deep">Trust history</p>
              {trustEvents?.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {trustEvents.map((e, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-ink">
                        {e.type === "completed"
                          ? "Task completed"
                          : e.type === "cancelled"
                            ? "Task cancelled"
                            : e.type === "dispute_lost"
                              ? "Dispute lost"
                              : e.type === "rating"
                                ? `Rated ${e.value} / 5`
                                : e.type === "responsiveness"
                                  ? `Responsiveness ${(e.value * 100).toFixed(0)}%`
                                  : e.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(e.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">No trust events yet.</p>
              )}
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
