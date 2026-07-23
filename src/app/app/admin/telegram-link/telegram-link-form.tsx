"use client";

import { useState } from "react";
import { generateTelegramLink } from "../actions";

export function TelegramLinkForm({
  initial,
}: {
  initial: { ok: boolean; link?: string; error?: string };
}) {
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    const next = await generateTelegramLink();
    setResult(next);
    setLoading(false);
  }

  return (
    <div className="mt-8 rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
      {result.ok && result.link ? (
        <>
          <p className="text-sm font-medium text-green-deep">Your Telegram link</p>
          <p className="mt-2 break-all rounded-xl bg-cream/40 p-3 text-xs text-ink">
            {result.link}
          </p>
          <a
            href={result.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Open in Telegram
          </a>
        </>
      ) : (
        <p className="text-sm text-orange-deep">{result.error ?? "Could not generate link"}</p>
      )}

      <button
        type="button"
        onClick={regenerate}
        disabled={loading}
        className="mt-4 text-sm font-medium text-green-deep underline transition hover:text-green disabled:opacity-60"
      >
        {loading ? "Generating…" : "Regenerate link"}
      </button>
    </div>
  );
}
