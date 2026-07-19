import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { PostForm } from "./post-form";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const metadata: Metadata = {
  title: "Post an errand — Mélange",
};

export default async function PostErrandPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawRunnerId = typeof params.runner === "string" ? params.runner : undefined;
  const runnerId = rawRunnerId && isUuid(rawRunnerId) ? rawRunnerId : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;

  const supabase = await createClient();
  const db = getServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [preselectedRunner, buyer] = await Promise.all([
    runnerId ? loadRunner(runnerId) : Promise.resolve(undefined),
    db.from("profiles").select("verified").eq("id", user.id).maybeSingle<{ verified: boolean }>(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href={runnerId ? "/app/runners" : "/app"}
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
          {preselectedRunner ? `Request ${preselectedRunner.name ?? "this runner"}` : "Post an errand"}
        </h1>
        <p className="mt-2 text-muted">
          {preselectedRunner
            ? "Fill in the errand details and we’ll send the request directly to them."
            : "Tell us what you need run. We’ll match a trusted runner near you by distance, rating & availability."}
        </p>

        <div className="mt-7 rounded-[1.75rem] border border-cream-deep bg-white p-6 shadow-sm sm:p-7">
          <PostForm
            preselectedRunner={preselectedRunner}
            defaultCategory={category}
            verified={buyer?.data?.verified ?? false}
          />
        </div>
      </main>
    </div>
  );
}

async function loadRunner(runnerId: string) {
  const db = getServiceClient();
  const [{ data: profile }, { data: runner }] = await Promise.all([
    db.from("profiles").select("name, verified").eq("id", runnerId).maybeSingle<{ name: string | null; verified: boolean }>(),
    db
      .from("runner_profile")
      .select("user_id, trust_score, verified, capabilities, is_available, status")
      .eq("user_id", runnerId)
      .maybeSingle<{ user_id: string; trust_score: number; verified: boolean; capabilities: string[] | null; is_available: boolean; status: string }>(),
  ]);

  if (!runner || runner.status !== "active" || !runner.is_available || !runner.verified) {
    return undefined;
  }

  return {
    id: runner.user_id,
    name: profile?.name ?? null,
    trustScore: runner.trust_score,
    capabilities: runner.capabilities,
  };
}
