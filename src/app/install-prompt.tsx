"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    "standalone" in window.navigator &&
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isDismissed() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem("install-prompt-dismissed") === "1";
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint] = useState(() => isIos() && !isStandalone());
  const [dismissed, setDismissed] = useState(() => isDismissed());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  const inAppShell = pathname === "/" || pathname?.startsWith("/app");
  if (!inAppShell) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    sessionStorage.setItem("install-prompt-dismissed", "1");
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-green text-cream shadow-lg"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {deferredPrompt
              ? "Install Mélange on your home screen"
              : "Add Mélange to your home screen"}
          </p>
          {showIosHint && !deferredPrompt && (
            <p className="mt-0.5 text-xs text-cream/80">
              Tap the share button, then choose &quot;Add to Home Screen&quot;.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-green hover:bg-cream-deep"
              type="button"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="rounded-full px-3 py-2 text-sm font-medium text-cream/90 hover:bg-white/10"
            type="button"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
