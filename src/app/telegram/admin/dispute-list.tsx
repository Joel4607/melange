"use client";

import { useEffect, useState } from "react";

type Dispute = {
  id: string;
  taskId: string;
  title: string;
  reason: string;
  createdAt: string;
  buyer: string;
  runner: string;
  amount: string;
  runnerPayout: string;
};

type DisputesResponse = { disputes: Dispute[]; error?: string };

function getInitData() {
  if (typeof window === "undefined") return "";
  return (window as unknown as { Telegram?: { WebApp?: { initData: string; HapticFeedback?: { notificationOccurred: (type: string) => void } } } }).Telegram?.WebApp?.initData ?? "";
}

export function DisputeList() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const initData = getInitData();
    if (!initData) return;

    fetch("/api/telegram/admin/disputes", {
      headers: { "x-telegram-init-data": initData },
    })
      .then(async (res) => {
        const json = (await res.json()) as DisputesResponse;
        if (res.ok) {
          setDisputes(json.disputes);
        } else {
          setError(json.error ?? "Failed to load");
        }
      })
      .catch(() => setError("Network error. Please try again."));
  }, []);

  async function resolve(id: string, resolution: "release" | "refund" | "partial") {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData: string; HapticFeedback?: { notificationOccurred: (type: string) => void } } } }).Telegram?.WebApp;
    const initData = tg?.initData ?? "";
    setBusy(id);
    const res = await fetch(`/api/telegram/admin/disputes/${id}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": initData,
      },
      body: JSON.stringify({ resolution }),
    });
    if (res.ok) {
      tg?.HapticFeedback?.notificationOccurred("success");
      window.location.reload();
    } else {
      tg?.HapticFeedback?.notificationOccurred("error");
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Action failed");
    }
    setBusy(null);
  }

  if (error) return <p className="text-sm text-orange-deep">{error}</p>;
  if (disputes === null) return <p className="text-sm text-muted">Loading…</p>;
  if (disputes.length === 0) {
    return <p className="text-sm text-muted">No escalated disputes.</p>;
  }

  return (
    <div className="space-y-3">
      {disputes.map((d) => (
        <div key={d.id} className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
          <p className="font-medium text-ink">{d.title}</p>
          <p className="mt-1 text-xs text-muted">{d.reason}</p>
          <div className="mt-2 space-y-0.5 text-xs text-muted">
            <p>Buyer: {d.buyer}</p>
            <p>Runner: {d.runner}</p>
            <p>Total: GHS {d.amount} · Runner payout: GHS {d.runnerPayout}</p>
            <p>{new Date(d.createdAt).toLocaleString()}</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={busy === d.id}
              onClick={() => resolve(d.id, "release")}
              className="rounded-full bg-green py-2 text-xs font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
            >
              Release
            </button>
            <button
              type="button"
              disabled={busy === d.id}
              onClick={() => resolve(d.id, "refund")}
              className="rounded-full border border-cream-deep bg-white py-2 text-xs font-semibold text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
            >
              Refund
            </button>
            <button
              type="button"
              disabled={busy === d.id}
              onClick={() => resolve(d.id, "partial")}
              className="rounded-full border border-cream-deep bg-white py-2 text-xs font-semibold text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
            >
              Partial
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
