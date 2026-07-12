import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Verify your account — Mélange",
};

export default async function VerifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("verified")
    .eq("id", user.id)
    .maybeSingle<{ verified: boolean }>();

  const { data: request } = await supabase
    .from("verification_requests")
    .select("status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ status: "pending" | "approved" | "rejected"; created_at: string }>();

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep bg-white/50 px-6 py-4">
        <Link
          href="/app"
          className="inline-flex items-center gap-2 text-sm font-medium text-green-deep transition hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
        </Link>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <h1 className="font-display text-3xl font-semibold text-green-deep">
          Verify your account
        </h1>
        <p className="mt-2 text-muted">
          Upload a link to a clear photo of your ID. An admin will review it.
        </p>

        {profile?.verified ? (
          <div className="mt-8 rounded-[1.5rem] border border-green/30 bg-green/5 p-6 text-center">
            <CheckCircle className="mx-auto h-8 w-8 text-green-deep" aria-hidden />
            <p className="mt-3 font-medium text-green-deep">Your account is verified</p>
            <Link
              href="/app"
              className="mt-4 inline-block rounded-full border border-green-soft px-5 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
            >
              Back to dashboard
            </Link>
          </div>
        ) : request?.status === "pending" ? (
          <div className="mt-8 rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
            <Clock className="mx-auto h-8 w-8 text-orange-deep" aria-hidden />
            <p className="mt-3 font-medium text-green-deep">Verification pending</p>
            <p className="mt-1 text-sm text-muted">
              Submitted {new Date(request.created_at).toLocaleDateString()}. We&apos;ll notify you when
              it&apos;s reviewed.
            </p>
          </div>
        ) : request?.status === "rejected" ? (
          <div className="mt-8 space-y-6">
            <div className="rounded-[1.5rem] border border-orange/15 bg-orange/5 p-6 text-center">
              <XCircle className="mx-auto h-8 w-8 text-orange-deep" aria-hidden />
              <p className="mt-3 font-medium text-green-deep">Verification rejected</p>
              <p className="mt-1 text-sm text-muted">
                You can submit a new, clearer ID photo.
              </p>
            </div>
            <VerifyForm />
          </div>
        ) : (
          <div className="mt-8">
            <VerifyForm />
          </div>
        )}
      </main>
    </div>
  );
}
