"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration is best-effort.
      });
    }
  }, []);

  return null;
}
