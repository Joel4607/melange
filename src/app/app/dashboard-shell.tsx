"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Users, PlusCircle, Wallet, ShieldCheck, Settings, LogOut, Bike, PackageCheck, Store } from "lucide-react";
import { Logo } from "@/components/brand";
import { NotificationsPopover } from "./notifications-popover";
import { RealtimeStatus } from "./realtime-status";
import type { NotificationSummary } from "@/lib/notification-text";

type Role = "buyer" | "runner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function navItems(role: Role): NavItem[] {
  if (role === "runner") {
    return [
      { href: "/app", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
      { href: "/app/feed", label: "Open errands", icon: <PackageCheck className="h-5 w-5" /> },
      { href: "/app/earnings", label: "Earnings", icon: <Wallet className="h-5 w-5" /> },
      { href: "/app/verify", label: "Verify", icon: <ShieldCheck className="h-5 w-5" /> },
      { href: "/app/settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
    ];
  }
  return [
    { href: "/app", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: "/app/runners", label: "Browse runners", icon: <Users className="h-5 w-5" /> },
    { href: "/app/post", label: "Post errand", icon: <PlusCircle className="h-5 w-5" /> },
    { href: "/app/marketplace", label: "Marketplace", icon: <Store className="h-5 w-5" /> },
    { href: "/app/wallet", label: "Wallet", icon: <Wallet className="h-5 w-5" /> },
    { href: "/app/verify", label: "Verify", icon: <ShieldCheck className="h-5 w-5" /> },
    { href: "/app/settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
  ];
}

export function DashboardShell({
  user,
  role,
  firstName,
  isAdmin,
  notifications,
  children,
}: {
  user: { id: string };
  role: Role;
  firstName: string;
  isAdmin: boolean;
  notifications: NotificationSummary[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items = navItems(role);

  return (
    <div className="flex min-h-dvh bg-cream">
      {/* Mobile overlay */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-cream-deep bg-white p-6 shadow-lg transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <Logo asLink={false} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-2 text-muted hover:bg-cream/40 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="mt-8 space-y-1">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          {isAdmin ? (
            <NavLink
              item={{
                href: "/app/admin",
                label: "Admin",
                icon: <ShieldCheck className="h-5 w-5" />,
              }}
            />
          ) : null}
        </nav>

        <div className="absolute bottom-0 left-0 w-full border-t border-cream-deep p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-green text-cream">
              {role === "runner" ? (
                <Bike className="h-5 w-5" aria-hidden />
              ) : (
                <PackageCheck className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{firstName}</p>
              <p className="truncate text-xs capitalize text-muted">{role}</p>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-cream/40"
            >
              <LogOut className="h-5 w-5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-cream-deep/70 bg-cream/90 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-full border border-cream-deep p-2.5 text-green-deep transition hover:bg-white lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
              <div>
                <h1 className="font-display text-xl font-semibold text-green-deep">
                  Welcome, {firstName}
                </h1>
                <p className="text-xs text-muted">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationsPopover notifications={notifications} />
              <Link
                href="/app/settings"
                className="grid h-10 w-10 place-items-center rounded-full border border-cream-deep text-green-deep transition hover:bg-white"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" aria-hidden />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6">
          {children}
          <RealtimeStatus userId={user.id} />
        </main>
      </div>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-green text-cream"
          : "text-muted hover:bg-cream/40 hover:text-green-deep"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
