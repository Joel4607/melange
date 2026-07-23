"use client";

import { useEffect, useState } from "react";
import { VerificationList } from "./verification-list";
import { DisputeList } from "./dispute-list";

type Tab = "verifications" | "disputes";
type AuthResponse = { ok: boolean; admin?: { id: string; name: string }; error?: string };

function getWebApp() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; initData: string } } }).Telegram?.WebApp ?? null;
}

export default function TelegramAdminPage() {
  const [admin, setAdmin] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const tg = getWebApp();
    return tg?.initData ? null : "Open this page inside Telegram.";
  });
  const [tab, setTab] = useState<Tab>("verifications");

  useEffect(() => {
    const tg = getWebApp();
    if (!tg?.initData) return;
    tg.ready();
    tg.expand();

    fetch("/api/telegram/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then((res) => res.json())
      .then((json: AuthResponse) => {
        if (json.ok && json.admin) {
          setAdmin(json.admin);
        } else {
          setError(
            json.error === "not_admin"
              ? "This Telegram account is not linked to a Mélange admin."
              : (json.error ?? "Authentication failed"),
          );
        }
      })
      .catch(() => setError("Network error. Please try again."));
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl font-semibold text-green-deep">Mélange Admin</p>
        <p className="mt-3 text-sm text-muted">{error}</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl font-semibold text-green-deep">Mélange Admin</p>
        <p className="mt-3 text-sm text-muted">Verifying your Telegram session…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-green-deep">Mélange Admin</h1>
        <span className="text-xs text-muted">{admin.name}</span>
      </header>

      <div className="flex rounded-full border border-cream-deep bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("verifications")}
          className={`flex-1 rounded-full py-2 text-xs font-semibold transition ${
            tab === "verifications" ? "bg-green text-cream" : "text-green-deep"
          }`}
        >
          Verifications
        </button>
        <button
          type="button"
          onClick={() => setTab("disputes")}
          className={`flex-1 rounded-full py-2 text-xs font-semibold transition ${
            tab === "disputes" ? "bg-green text-cream" : "text-green-deep"
          }`}
        >
          Disputes
        </button>
      </div>

      <div className="mt-4">
        {tab === "verifications" ? <VerificationList /> : <DisputeList />}
      </div>
    </main>
  );
}
