import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ListingForm } from "../listing-form";

export const metadata: Metadata = {
  title: "Sell an item — Mélange",
};

export default async function NewListingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app/marketplace"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <span className="font-display text-lg font-semibold text-green-deep">Sell an item</span>
          <div className="w-6" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">List something</h1>
        <p className="mt-2 text-muted">Add a photo, set your price (or 0 for free), and choose how buyers can receive it.</p>
        <div className="mt-8">
          <ListingForm />
        </div>
      </main>
    </div>
  );
}
