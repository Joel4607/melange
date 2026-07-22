import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  Camera,
  CircleCheck,
  Clock,
  MapPin,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { hasLedgerEntry } from "@/lib/server/escrow";
import { haversineKm } from "@/lib/algorithm";
import { Logo } from "@/components/brand";
import { RealtimeStatus } from "../../realtime-status";
import { MapView, MapMarker, type LiveRunner } from "../../map-view";
import {
  cancelErrand,
  payIntoEscrow,
  raiseDispute,
  rateRunner,
  rematch,
} from "../../actions";
import { TaskActions } from "../../dashboard-widgets";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const metadata: Metadata = {
  title: "Track your errand — Mélange",
};

type TaskStatus =
  | "posted"
  | "matched"
  | "accepted"
  | "in_progress"
  | "completed"
  | "disputed"
  | "resolved"
  | "cancelled";

const STEPS = ["Posted", "Matched", "Paid", "Delivered"] as const;

function stepIndex(status: TaskStatus, selectedRunnerId: string | null): number {
  switch (status) {
    case "posted":
      return 0;
    case "matched":
      return selectedRunnerId ? 2 : 1;
    case "accepted":
    case "in_progress":
      return 2;
    case "completed":
    case "resolved":
    case "disputed":
      return 3;
    case "cancelled":
      return -1;
  }
}

export default async function ErrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select(
      "id, buyer_id, title, description, category, urgency, price, fee, payment_reference, status, selected_runner_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, created_at, accepted_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      description: string | null;
      category: string | null;
      urgency: string;
      price: string;
      fee: string;
      payment_reference: string | null;
      status: TaskStatus;
      selected_runner_id: string | null;
      pickup_lat: number;
      pickup_lng: number;
      dropoff_lat: number | null;
      dropoff_lng: number | null;
      created_at: string;
      accepted_at: string | null;
      completed_at: string | null;
    }>();

  if (!task) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle<{ is_admin: boolean }>();

  const isBuyer = task.buyer_id === user.id;
  const isRunner = task.selected_runner_id === user.id;
  const isAdmin = profile?.is_admin ?? false;

  if (!isBuyer && !isRunner && !isAdmin) notFound();

  // Top-ranked candidate from the latest match run.
  const { data: run } = await db
    .from("match_runs")
    .select("id")
    .eq("task_id", task.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let candidate: {
    runner_id: string;
    match_score: number;
    trust: number;
    distance_km: number;
  } | null = null;
  if (run) {
    const { data } = await db
      .from("match_candidates")
      .select("runner_id, match_score, trust, distance_km")
      .eq("match_run_id", run.id)
      .order("rank", { ascending: true })
      .limit(1)
      .maybeSingle<{
        runner_id: string;
        match_score: number;
        trust: number;
        distance_km: number;
      }>();
    candidate = data ?? null;
  }

  const runnerId = task.selected_runner_id ?? candidate?.runner_id ?? null;
  let runnerName = "A trusted runner";
  let runnerLocation: { lat: number; lng: number } | null = null;
  let runnerTrust = candidate?.trust ?? 0;
  if (runnerId) {
    const [{ data: rp }, { data: rprofile }] = await Promise.all([
      db.from("profiles").select("name").eq("id", runnerId).maybeSingle<{ name: string | null }>(),
      db
        .from("runner_profile")
        .select("current_lat, current_lng, trust_score")
        .eq("user_id", runnerId)
        .maybeSingle<{ current_lat: number | null; current_lng: number | null; trust_score: number }>(),
    ]);
    if (rp?.name) runnerName = rp.name;
    if (rprofile?.current_lat != null && rprofile?.current_lng != null) {
      runnerLocation = { lat: rprofile.current_lat, lng: rprofile.current_lng };
    }
    if (rprofile?.trust_score != null) {
      runnerTrust = rprofile.trust_score;
    }
  }

  const { data: proof } = await db
    .from("proofs")
    .select("photo_path, gps_lat, gps_lng, captured_at")
    .eq("task_id", task.id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      photo_path: string;
      gps_lat: number | null;
      gps_lng: number | null;
      captured_at: string;
    }>();
  let proofPhotoUrl: string | null = null;
  if (proof) {
    const { data: signed } = await db.storage
      .from("proofs")
      .createSignedUrl(proof.photo_path, 60 * 5);
    proofPhotoUrl = signed?.signedUrl ?? null;
  }

  const { data: existingRating } = await db
    .from("ratings")
    .select("stars")
    .eq("task_id", task.id)
    .eq("rater_id", user.id)
    .maybeSingle<{ stars: number }>();

  const [held, released, refunded] = await Promise.all([
    hasLedgerEntry(db, task.id, ["hold"]),
    hasLedgerEntry(db, task.id, ["release", "payout"]),
    hasLedgerEntry(db, task.id, ["refund"]),
  ]);

  const step = stepIndex(task.status, task.selected_runner_id);
  const price = Number(task.price).toFixed(2);
  const fee = Number(task.fee).toFixed(2);
  const runnerPayout = Number(Number(task.price) - Number(task.fee)).toFixed(2);
  const trustStars = runnerId ? (runnerTrust * 5).toFixed(1) : null;
  const runnerDistanceKm =
    candidate?.distance_km ??
    (runnerLocation
      ? haversineKm({ lat: task.pickup_lat, lng: task.pickup_lng }, runnerLocation)
      : null);

  const mapCenter = { lat: task.pickup_lat, lng: task.pickup_lng };
  const mapMarkers: MapMarker[] = [
    { lat: task.pickup_lat, lng: task.pickup_lng, label: "Pickup", kind: "pickup" },
  ];
  if (task.dropoff_lat != null && task.dropoff_lng != null) {
    mapMarkers.push({
      lat: task.dropoff_lat,
      lng: task.dropoff_lng,
      label: "Dropoff",
      kind: "dropoff",
    });
  }
  if (runnerLocation) {
    mapMarkers.push({
      lat: runnerLocation.lat,
      lng: runnerLocation.lng,
      label: runnerName,
      kind: "runner",
    });
  }

  const liveRunner: LiveRunner | null =
    runnerId && (task.status === "accepted" || task.status === "in_progress")
      ? {
          id: runnerId,
          name: runnerName,
          taskId: task.id,
          lat: runnerLocation?.lat ?? null,
          lng: runnerLocation?.lng ?? null,
        }
      : null;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Errands
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:py-10">
        <div className="flex flex-wrap items-center gap-2">
          {task.category ? (
            <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-medium text-green-deep">
              {task.category}
            </span>
          ) : null}
          <span className="rounded-full bg-orange/15 px-3 py-1 text-xs font-medium text-orange-deep capitalize">
            {task.urgency}
          </span>
        </div>

        <h1 className="mt-3 font-display text-fluid-h2 font-semibold text-green-deep">
          {task.title}
        </h1>
        {task.description ? (
          <p className="mt-2 text-muted">{task.description}</p>
        ) : null}

        <Stepper current={step} status={task.status} />

        {/* Matched runner */}
        {runnerId ? (
          <section className="mt-6 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {task.status === "posted" || task.status === "matched"
                ? "Best match"
                : "Your runner"}
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-green text-cream">
                  <Bike className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-green-deep">
                    {runnerName}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted">
                    {trustStars ? (
                      <span className="inline-flex items-center gap-1 text-green-soft">
                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                        {trustStars}
                      </span>
                    ) : null}
                    {runnerDistanceKm != null ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {runnerDistanceKm.toFixed(1)} km away
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-3 py-1 text-xs font-medium text-green-deep">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified
              </span>
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
            <Clock className="mx-auto h-6 w-6 text-orange-deep" aria-hidden />
            <p className="mt-2 font-medium text-green-deep">Finding a runner…</p>
            <p className="mt-1 text-sm text-muted">
              No runners were available just now. Try again in a moment.
            </p>
            <form action={rematch.bind(null, task.id)} className="mt-4">
              <button
                type="submit"
                className="rounded-full border border-green-soft px-5 py-2.5 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
              >
                Try matching again
              </button>
            </form>
          </section>
        )}

        {/* Escrow + price */}
        <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-green-deep">
              <Wallet className="h-5 w-5 text-orange-deep" aria-hidden /> Budget
            </span>
            <span className="font-display text-2xl font-semibold text-green-deep">
              GHS {price}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {refunded
              ? "Refunded to your wallet — the errand was cancelled or the dispute was resolved in your favour."
              : released
                ? `Released to ${runnerName}.`
                : held
                  ? `GHS ${price} held in escrow. ${task.status === "completed" ? "Rate to release or raise a dispute." : "Released when you confirm delivery."}`
                  : "You'll pay into escrow when you confirm the match. Funds are only released on delivery."}
          </p>
          <div className="mt-3 rounded-xl border border-cream-deep bg-cream/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Total</span>
              <span className="font-medium text-ink">GHS {price}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted">Platform fee</span>
              <span className="font-medium text-ink">GHS {fee}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-cream-deep pt-1">
              <span className="text-muted">Runner payout</span>
              <span className="font-medium text-ink">GHS {runnerPayout}</span>
            </div>
            {task.payment_reference ? (
              <div className="mt-1 flex justify-between border-t border-cream-deep pt-1">
                <span className="text-muted">Mobile money ref</span>
                <span className="font-medium text-ink">{task.payment_reference}</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* Locations */}
        <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-medium text-green-deep">
            <MapPin className="h-5 w-5 text-orange-deep" aria-hidden /> Locations
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted">
              <span className="font-medium text-ink">Pickup:</span>{" "}
              {task.pickup_lat.toFixed(5)}, {task.pickup_lng.toFixed(5)}
            </p>
            {task.dropoff_lat != null && task.dropoff_lng != null ? (
              <p className="text-muted">
                <span className="font-medium text-ink">Dropoff:</span>{" "}
                {task.dropoff_lat.toFixed(5)}, {task.dropoff_lng.toFixed(5)}
              </p>
            ) : (
              <p className="text-muted">Dropoff: same as pickup</p>
            )}
          </div>
        </section>

        {/* Map */}
        <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-medium text-green-deep">
            <MapPin className="h-5 w-5 text-orange-deep" aria-hidden /> Map
          </p>
          <div className="mt-3">
            <MapView center={mapCenter} markers={mapMarkers} liveRunner={liveRunner} />
          </div>
        </section>

        {/* Delivery proof */}
        {proof ? (
          <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
            <p className="flex items-center gap-2 font-medium text-green-deep">
              <Camera className="h-5 w-5 text-orange-deep" aria-hidden /> Delivery proof
            </p>
            {proofPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image can't optimize it
              <img
                src={proofPhotoUrl}
                alt={`Delivery proof from ${runnerName}`}
                className="mt-3 max-h-96 w-full rounded-xl border border-cream-deep object-contain"
              />
            ) : (
              <p className="mt-2 text-sm text-muted">Photo unavailable.</p>
            )}
            <p className="mt-2 text-sm text-muted">
              {proof.gps_lat != null && proof.gps_lng != null ? (
                <>
                  Tagged at {proof.gps_lat.toFixed(5)}, {proof.gps_lng.toFixed(5)} ·{" "}
                </>
              ) : null}
              {new Date(proof.captured_at).toLocaleString()}
            </p>
          </section>
        ) : null}

        {/* Action */}
        {isBuyer ? (
          <div className="mt-6 space-y-4">
            {(task.status === "posted" || task.status === "matched") && (
              <div className="flex flex-col gap-3">
                {task.status === "matched" && !task.selected_runner_id && candidate ? (
                  <form action={payIntoEscrow.bind(null, task.id)}>
                    <PrimaryButton>
                      Confirm &amp; pay GHS {price} into escrow
                    </PrimaryButton>
                  </form>
                ) : null}
                <form action={cancelErrand.bind(null, task.id)}>
                  <SecondaryButton>Cancel errand</SecondaryButton>
                </form>
              </div>
            )}

            {task.status === "matched" && task.selected_runner_id ? (
              <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
                <p className="font-medium text-green-deep">
                  Paid — waiting for {runnerName} to accept
                </p>
              </div>
            ) : null}

            {task.status === "accepted" ? (
              <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
                <p className="font-medium text-green-deep">
                  {runnerName} accepted — heading to pickup
                </p>
              </div>
            ) : null}

            {task.status === "in_progress" ? (
              <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
                <p className="font-medium text-green-deep">
                  {runnerName} is out for delivery
                </p>
              </div>
            ) : null}

            {task.status === "completed" ? (
              <div className="rounded-[1.5rem] border border-green/30 bg-green/5 p-6 text-center">
                <CircleCheck className="mx-auto h-7 w-7 text-green-soft" aria-hidden />
                <p className="mt-2 font-display text-lg font-semibold text-green-deep">
                  Delivered
                </p>
                {existingRating ? (
                  <p className="mt-1 text-sm text-muted">
                    You rated {runnerName} {existingRating.stars}★. Thanks!
                  </p>
                ) : released ? (
                  <p className="mt-1 text-sm text-muted">
                    Payment released. How did {runnerName} do?
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">
                    Rate to release payment, or raise a dispute if something is wrong.
                  </p>
                )}
                {!existingRating && (
                  <form className="mt-3 space-y-3">
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="submit"
                          formAction={rateRunner.bind(null, task.id, n)}
                          aria-label={`Rate ${n} stars`}
                          className="grid h-10 w-10 place-items-center rounded-full border border-cream-deep text-orange-deep transition hover:bg-orange/10"
                        >
                          <Star className="h-5 w-5" aria-hidden />
                        </button>
                      ))}
                    </div>
                    <textarea
                      name="comment"
                      placeholder="Add a comment (optional)"
                      rows={2}
                      className="mx-auto w-full max-w-xs rounded-xl border border-cream-deep bg-white px-4 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft"
                    />
                  </form>
                )}
                {!existingRating && !released && (
                  <form action={raiseDispute.bind(null, task.id)} className="mt-4">
                    <div className="flex flex-col gap-2">
                      <textarea
                        name="reason"
                        required
                        placeholder="What went wrong?"
                        className="mx-auto w-full max-w-xs rounded-xl border border-cream-deep bg-white px-4 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft"
                        rows={2}
                      />
                      <button
                        type="submit"
                        className="mx-auto inline-flex items-center gap-2 rounded-full border border-orange-deep px-5 py-2 text-sm font-semibold text-orange-deep transition hover:bg-orange/10"
                      >
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                        Raise dispute
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : null}

            {task.status === "resolved" ? (
              <div className="rounded-[1.5rem] border border-green/30 bg-green/5 p-6 text-center">
                <CircleCheck className="mx-auto h-7 w-7 text-green-soft" aria-hidden />
                <p className="mt-2 font-display text-lg font-semibold text-green-deep">
                  Resolved
                </p>
                <p className="mt-1 text-sm text-muted">
                  {refunded
                    ? "Dispute resolved with a refund to your wallet."
                    : `Payment released to ${runnerName}.`}
                </p>
                {existingRating ? (
                  <p className="mt-1 text-sm text-muted">
                    You rated {runnerName} {existingRating.stars}★.
                  </p>
                ) : !refunded ? (
                  <>
                    <p className="mt-1 text-sm text-muted">
                      How did {runnerName} do?
                    </p>
                    <form className="mt-3 space-y-3">
                      <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="submit"
                            formAction={rateRunner.bind(null, task.id, n)}
                            aria-label={`Rate ${n} stars`}
                            className="grid h-10 w-10 place-items-center rounded-full border border-cream-deep text-orange-deep transition hover:bg-orange/10"
                          >
                            <Star className="h-5 w-5" aria-hidden />
                          </button>
                        ))}
                      </div>
                      <textarea
                        name="comment"
                        placeholder="Add a comment (optional)"
                        rows={2}
                        className="mx-auto w-full max-w-xs rounded-xl border border-cream-deep bg-white px-4 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft"
                      />
                    </form>
                  </>
                ) : null}
              </div>
            ) : null}

            {task.status === "disputed" ? (
              <div className="rounded-[1.5rem] border border-orange/15 bg-orange/5 p-6 text-center">
                <AlertTriangle className="mx-auto h-7 w-7 text-orange-deep" aria-hidden />
                <p className="mt-2 font-display text-lg font-semibold text-green-deep">
                  In dispute
                </p>
                <p className="mt-1 text-sm text-muted">
                  Your dispute is under review. Funds stay in escrow until a decision is made.
                </p>
              </div>
            ) : null}

            {task.status === "cancelled" ? (
              <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
                <p className="font-display text-lg font-semibold text-green-deep">
                  Cancelled
                </p>
                <p className="mt-1 text-sm text-muted">
                  {refunded
                    ? "Your wallet has been refunded."
                    : "This errand was cancelled."}
                </p>
              </div>
            ) : null}
          </div>
        ) : isRunner ? (
          <section className="mt-6 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Runner actions
            </p>
            <div className="mt-3">
              <TaskActions taskId={task.id} status={task.status} />
            </div>
          </section>
        ) : null}
        <RealtimeStatus userId={user.id} taskId={task.id} />
      </main>
    </div>
  );
}

function Stepper({
  current,
  status,
}: {
  current: number;
  status: TaskStatus;
}) {
  return (
    <ol className="mt-7 flex items-center">
      {STEPS.map((label, i) => {
        const done = i <= current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition ${
                  done
                    ? "bg-green text-cream"
                    : "border border-cream-deep bg-white text-muted"
                }`}
              >
                {done ? <CircleCheck className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span
                className={`mt-1.5 text-xs ${done ? "font-medium text-green-deep" : "text-muted"}`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <span
                className={`mx-1.5 h-0.5 flex-1 rounded ${
                  i < current ? "bg-green" : "bg-cream-deep"
                }`}
              />
            ) : null}
          </li>
        );
      })}
      {status === "disputed" ? (
        <span className="ml-3 rounded-full bg-orange/15 px-3 py-1 text-xs font-medium text-orange-deep">
          In dispute
        </span>
      ) : null}
      {status === "cancelled" ? (
        <span className="ml-3 rounded-full bg-cream-deep px-3 py-1 text-xs font-medium text-muted">
          Cancelled
        </span>
      ) : null}
    </ol>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-orange-deep"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-2 rounded-full border border-cream-deep bg-white px-6 py-3.5 font-semibold text-green-deep transition hover:bg-cream/40"
    >
      {children}
    </button>
  );
}
