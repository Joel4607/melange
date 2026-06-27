"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (production only) so the app is installable as a
 * PWA. Rendered once in the root layout.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal.
      });
    }
  }, []);

  return null;
}
