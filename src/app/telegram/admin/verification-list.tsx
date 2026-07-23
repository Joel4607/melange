"use client";

import { useEffect, useState } from "react";

type VerificationRequest = {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  frontUrl: string | null;
  backUrl: string | null;
  createdAt: string;
};

type VerificationResponse = { requests: VerificationRequest[]; error?: string };

function getInitData() {
  if (typeof window === "undefined") return "";
  return (window as unknown as { Telegram?: { WebApp?: { initData: string; HapticFeedback?: { notificationOccurred: (type: string) => void } } } }).Telegram?.WebApp?.initData ?? "";
}

export function VerificationList() {
  const [requests, setRequests] = useState<VerificationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const initData = getInitData();
    if (!initData) return;

    fetch("/api/telegram/admin/verifications", {
      headers: { "x-telegram-init-data": initData },
    })
      .then(async (res) => {
        const json = (await res.json()) as VerificationResponse;
        if (res.ok) {
          setRequests(json.requests);
        } else {
          setError(json.error ?? "Failed to load");
        }
      })
      .catch(() => setError("Network error. Please try again."));
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData: string; HapticFeedback?: { notificationOccurred: (type: string) => void } } } }).Telegram?.WebApp;
    const initData = tg?.initData ?? "";
    setBusy(id);
    const res = await fetch(`/api/telegram/admin/verifications/${id}/${action}`, {
      method: "POST",
      headers: { "x-telegram-init-data": initData },
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
  if (requests === null) return <p className="text-sm text-muted">Loading…</p>;
  if (requests.length === 0) {
    return <p className="text-sm text-muted">No pending verification requests.</p>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
          <p className="font-medium text-ink">{r.name}</p>
          <div className="mt-1 space-y-0.5 text-xs text-muted">
            {r.phone ? <p>Phone: {r.phone}</p> : null}
            {r.email ? <p>Email: {r.email}</p> : null}
            <p>{new Date(r.createdAt).toLocaleString()}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.frontUrl ? (
              <a
                href={r.frontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-cream-deep px-3 py-1.5 text-xs font-medium text-green-deep"
              >
                Front
              </a>
            ) : null}
            {r.backUrl ? (
              <a
                href={r.backUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-cream-deep px-3 py-1.5 text-xs font-medium text-green-deep"
              >
                Back
              </a>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => act(r.id, "approve")}
              className="flex-1 rounded-full bg-green py-2 text-xs font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => act(r.id, "reject")}
              className="flex-1 rounded-full border border-cream-deep bg-white py-2 text-xs font-semibold text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
