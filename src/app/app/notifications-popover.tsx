"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import { formatNotification, NotificationSummary } from "@/lib/notification-text";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

export function NotificationsPopover({
  notifications,
}: {
  notifications: NotificationSummary[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-cream-deep p-2.5 text-green-deep transition hover:bg-white"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange text-xs font-semibold text-white">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-cream-deep bg-white p-4 shadow-xl sm:w-96">
          <div className="flex items-center justify-between">
            <p className="font-display font-semibold text-green-deep">Notifications</p>
            {notifications.length > 0 ? (
              <form action={markAllNotificationsRead}>
                <button
                  type="submit"
                  className="flex items-center gap-1 text-xs font-medium text-green-deep hover:text-green"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden /> Mark all read
                </button>
              </form>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted hover:bg-cream/40"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {notifications.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No notifications yet.</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start justify-between gap-3 rounded-xl border border-cream-deep p-3 ${
                    n.read ? "bg-cream/30" : "bg-cream/60"
                  }`}
                >
                  <span className={`text-sm ${n.read ? "text-muted" : "text-ink"}`}>
                    {formatNotification(n)}
                  </span>
                  {!n.read ? (
                    <form action={markNotificationRead.bind(null, n.id)}>
                      <button
                        type="submit"
                        className="shrink-0 rounded-full border border-green-soft px-2.5 py-1 text-xs font-medium text-green-deep transition hover:bg-cream"
                      >
                        Mark read
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/app/notifications"
            className="mt-3 block rounded-xl py-2 text-center text-sm font-medium text-green-deep hover:bg-cream/40"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
