"use client";

import { useState } from "react";
import { generateTelegramLink, unlinkTelegram } from "../actions";

interface TelegramLinkFormProps {
  initial: { ok: boolean; link?: string; error?: string };
  linkedTelegramId: string | null;
}

export function TelegramLinkForm({ initial, linkedTelegramId }: TelegramLinkFormProps) {
  const [result, setResult] = useState(initial);
  const [linked, setLinked] = useState(linkedTelegramId);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    const next = await generateTelegramLink();
    setResult(next);
    setLoading(false);
  }

  async function unlink() {
    if (!confirm("Unlink this Telegram account from the admin panel?")) return;
    setLoading(true);
    const res = await unlinkTelegram();
    if (res.ok) {
      setLinked(null);
      setResult({ ok: true });
    } else {
      setResult({ ok: false, error: res.error ?? "Could not unlink" });
    }
    setLoading(false);
  }

  return (
    <div className="mt-8 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
      {linked ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-green-deep">Telegram linked</p>
          <p className="text-sm text-muted">
            This admin account is linked to Telegram user <span className="font-mono text-ink">{linked}</span>.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={regenerate}
              disabled={loading}
              className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
            >
              {loading ? "Generating…" : "Generate new link"}
            </button>
            <button
              type="button"
              onClick={unlink}
              disabled={loading}
              className="rounded-full border border-orange px-5 py-2.5 text-sm font-semibold text-orange-deep transition hover:bg-orange/10 disabled:opacity-60"
            >
              Unlink Telegram
            </button>
          </div>
        </div>
      ) : result.ok && result.link ? (
        <>
          <p className="text-sm font-medium text-green-deep">Your Telegram link</p>
          <p className="mt-2 break-all rounded-xl bg-cream/40 p-3 text-xs text-ink">{result.link}</p>
          <a
            href={result.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Open in Telegram
          </a>
          <button
            type="button"
            onClick={regenerate}
            disabled={loading}
            className="mt-4 block text-sm font-medium text-green-deep underline transition hover:text-green disabled:opacity-60"
          >
            {loading ? "Generating…" : "Regenerate link"}
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-orange-deep">{result.error ?? "Could not generate link"}</p>
          <button
            type="button"
            onClick={regenerate}
            disabled={loading}
            className="text-sm font-medium text-green-deep underline transition hover:text-green disabled:opacity-60"
          >
            {loading ? "Generating…" : "Try again"}
          </button>
        </div>
      )}
    </div>
  );
}
