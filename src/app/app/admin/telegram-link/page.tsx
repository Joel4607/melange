import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand";
import { generateTelegramLink } from "../actions";
import { TelegramLinkForm } from "./telegram-link-form";

export const metadata: Metadata = {
  title: "Link Telegram — Mélange Admin",
};

export default async function TelegramLinkPage() {
  const initial = await generateTelegramLink();

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link
            href="/app/admin"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
          Link Telegram
        </h1>
        <p className="mt-2 text-muted">
          Open the generated link inside Telegram to connect this admin account to your Telegram
          user. Once linked, you can open the Mélange Admin Mini App from Telegram.
        </p>

        <TelegramLinkForm initial={initial} />
      </main>
    </div>
  );
}
