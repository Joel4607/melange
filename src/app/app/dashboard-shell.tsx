"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bike,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PlusCircle,
  Settings,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { NotificationsPopover } from "./notifications-popover";
import { RealtimeStatus } from "./realtime-status";
import type { NotificationSummary } from "@/lib/notification-text";

type Role = "buyer" | "runner";

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}

function navItems(role: Role): NavItem[] {
  if (role === "runner") {
    return [
      { href: "/app", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
      { href: "/app/feed", label: "Find work", icon: PackageCheck },
      { href: "/app/earnings", label: "Demo earnings", icon: Wallet },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ];
  }
  return [
    { href: "/app", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { href: "/app/post", label: "Post errand", shortLabel: "Post", icon: PlusCircle },
    { href: "/app/runners", label: "Runners", icon: Users },
    { href: "/app/wallet", label: "Demo wallet", icon: Wallet },
    { href: "/app/settings", label: "Settings", icon: Settings },
  ];
}

export function DashboardShell({
  user,
  role,
  firstName,
  notifications,
  children,
}: {
  user: { id: string };
  role: Role;
  firstName: string;
  notifications: NotificationSummary[];
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items = navItems(role);

  return (
    <div className="flex h-dvh overflow-hidden bg-cream">
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
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 transform border-r border-cream-deep bg-white p-6 shadow-lg transition-transform lg:relative lg:translate-x-0 ${
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

        <nav aria-label="Main navigation" className="mt-8 space-y-1">
          {items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
          ))}
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

      {/* Main area — scrolls independently of the sidebar */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 border-b border-cream-deep/70 bg-cream/90 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
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
                <h1 className="font-display text-lg font-semibold text-green-deep sm:text-xl">
                  Hi, {firstName}
                </h1>
                <p className="text-xs capitalize text-muted">{role} dashboard</p>
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

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:pb-8">
          {children}
          <RealtimeStatus userId={user.id} />
        </main>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-deep bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(28,26,23,0.08)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {items.slice(0, 4).map((item) => (
            <MobileNavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-green text-cream"
          : "text-muted hover:bg-cream/40 hover:text-green-deep"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {item.label}
    </Link>
  );
}

function MobileNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green ${
        active ? "text-green-deep" : "text-muted hover:bg-cream/50 hover:text-green-deep"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={`grid h-7 w-9 place-items-center rounded-xl transition ${active ? "bg-green/10" : ""}`}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span>{item.shortLabel ?? item.label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`));
}
