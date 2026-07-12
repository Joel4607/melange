import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatNotification, NotificationSummary } from "@/lib/notification-text";
import { Logo } from "@/components/brand";
import { markAllNotificationsRead, markNotificationRead } from "../actions";

export const metadata: Metadata = {
  title: "Notifications — Mélange",
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, payload, read, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .returns<NotificationSummary[]>();

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Notifications</h1>
          {(notifications?.length ?? 0) > 0 ? (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-cream/40"
              >
                <Check className="h-4 w-4" aria-hidden /> Mark all read
              </button>
            </form>
          ) : null}
        </div>

        {notifications?.length ? (
          <ul className="mt-6 space-y-3">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`flex items-start justify-between gap-4 rounded-2xl border border-cream-deep p-4 shadow-sm ${
                  n.read ? "bg-cream/30" : "bg-white"
                }`}
              >
                <div>
                  <p className={`text-sm ${n.read ? "text-muted" : "text-ink"}`}>
                    {formatNotification(n)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read ? (
                  <form action={markNotificationRead.bind(null, n.id)}>
                    <button
                      type="submit"
                      className="shrink-0 rounded-full border border-green-soft px-3 py-1 text-xs font-medium text-green-deep transition hover:bg-cream"
                    >
                      Mark read
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-muted">No notifications yet.</p>
        )}
      </main>
    </div>
  );
}
