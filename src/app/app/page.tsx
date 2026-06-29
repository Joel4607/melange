import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bike,
  CircleCheck,
  Clock,
  PackageCheck,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Your dashboard — Mélange",
};

type Role = "buyer" | "runner";

export default async function AppHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware guards this route, but never trust that alone.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, phone, verified")
    .eq("id", user.id)
    .single();

  // Backfill the phone captured at sign-up into the profile if the trigger
  // (which only sets the name) left it empty.
  const metaPhone = (user.user_metadata?.phone as string | undefined) ?? "";
  if (profile && !profile.phone && metaPhone) {
    await supabase.from("profiles").update({ phone: metaPhone }).eq("id", user.id);
  }

  const role: Role = user.user_metadata?.role === "runner" ? "runner" : "buyer";
  const firstName = (profile?.name ?? "there").split(" ")[0];

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Logo />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-green/10 px-4 py-1.5 text-sm font-medium text-green-deep">
          {role === "runner" ? (
            <Bike className="h-4 w-4" aria-hidden />
          ) : (
            <PackageCheck className="h-4 w-4" aria-hidden />
          )}
          {role === "runner" ? "Runner" : "Customer"}
        </span>

        <h1 className="mt-4 font-display text-fluid-h2 font-semibold text-green-deep">
          Welcome, {firstName} 👋
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          {role === "runner"
            ? "You're all set. Errands near you will show up here once we open the runner feed."
            : "You're all set. Post an errand and a trusted runner will pick it up."}
        </p>

        {role === "buyer" ? <BuyerStub /> : <RunnerStub />}

        <p className="mt-10 text-sm text-muted">
          Signed in as {user.email}
          {profile?.verified ? "" : " · verification pending"}
        </p>
      </main>
    </div>
  );
}

function BuyerStub() {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2">
      <button
        type="button"
        disabled
        className="flex items-center justify-between rounded-[1.5rem] bg-green p-6 text-left text-cream shadow-sm disabled:opacity-90"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-xl font-semibold">
            <Plus className="h-5 w-5" aria-hidden /> Post an errand
          </span>
          <span className="mt-1 block text-sm text-cream/80">
            Coming next — wired to matching & escrow.
          </span>
        </span>
        <ArrowRight className="h-5 w-5" aria-hidden />
      </button>

      <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
          <Clock className="h-5 w-5 text-orange-deep" aria-hidden /> Your errands
        </p>
        <p className="mt-2 text-sm text-muted">
          No errands yet. Once you post one, you&apos;ll track it here from
          matched → delivered.
        </p>
      </div>
    </div>
  );
}

function RunnerStub() {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2">
      <div className="rounded-[1.5rem] bg-green p-6 text-cream shadow-sm">
        <p className="flex items-center gap-2 font-display text-xl font-semibold">
          <CircleCheck className="h-5 w-5" aria-hidden /> Go available
        </p>
        <p className="mt-1 text-sm text-cream/80">
          Coming next — toggle availability to receive nearby errands.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
          <Clock className="h-5 w-5 text-orange-deep" aria-hidden /> Nearby errands
        </p>
        <p className="mt-2 text-sm text-muted">
          No errands yet. Open jobs ranked by distance & your trust score will
          appear here.
        </p>
      </div>
    </div>
  );
}
