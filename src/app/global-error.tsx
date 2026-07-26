"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-cream text-ink">
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
          <h2 className="font-display text-2xl font-semibold text-green-deep">
            Something went wrong
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            We&apos;re looking into it. Please try again.
          </p>
          <button
            onClick={() => unstable_retry()}
            className="mt-6 rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
