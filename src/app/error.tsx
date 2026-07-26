"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message =
    process.env.NODE_ENV === "development"
      ? error.message
      : "Please try again or contact support if the problem persists.";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <AlertCircle className="h-12 w-12 text-orange-deep" aria-hidden="true" />
      <h2 className="mt-4 font-display text-2xl font-semibold text-green-deep">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
      <button
        onClick={() => unstable_retry()}
        className="mt-6 rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
      >
        Try again
      </button>
    </div>
  );
}
