import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand";
import { PostForm } from "./post-form";

export const metadata: Metadata = {
  title: "Post an errand — Mélange",
};

export default function PostErrandPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
          Post an errand
        </h1>
        <p className="mt-2 text-muted">
          Tell us what you need run. We&apos;ll match a trusted runner near you by
          distance, rating &amp; availability.
        </p>

        <div className="mt-7 rounded-[1.75rem] border border-cream-deep bg-white p-6 shadow-sm sm:p-7">
          <PostForm />
        </div>
      </main>
    </div>
  );
}
