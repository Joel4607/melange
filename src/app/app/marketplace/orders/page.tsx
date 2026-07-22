import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import type { ListingOrderRow } from "@/lib/server/rows";

export const metadata: Metadata = {
  title: "Marketplace orders — Mélange",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending payment",
  paid: "Paid",
  ready_for_pickup: "Ready for pickup",
  in_delivery: "In delivery",
  delivered: "Delivered",
  completed: "Completed",
  disputed: "In dispute",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default async function MarketplaceOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getServiceClient();
  const { data: orders } = await db
    .from("listing_orders")
    .select("*")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .returns<ListingOrderRow[]>();

  const listingIds = new Set<string>();
  const userIds = new Set<string>();
  for (const o of orders ?? []) {
    listingIds.add(o.listing_id);
    userIds.add(o.buyer_id);
    userIds.add(o.seller_id);
  }

  const { data: listings } = await db
    .from("listings")
    .select("id, title, photos")
    .in("id", Array.from(listingIds))
    .returns<{ id: string; title: string; photos: string[] }[]>();

  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", Array.from(userIds))
    .returns<{ id: string; name: string | null }[]>();

  const listingById = new Map(listings?.map((l) => [l.id, l]));
  const nameById = new Map(profiles?.map((p) => [p.id, p.name]));

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app/marketplace"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <span className="font-display text-lg font-semibold text-green-deep">Orders</span>
          <div className="w-6" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Marketplace orders</h1>

        {(orders ?? []).length === 0 ? (
          <div className="mt-10 rounded-[1.5rem] border border-cream-deep bg-white p-8 text-center shadow-sm">
            <ShoppingBag className="mx-auto h-8 w-8 text-orange-deep" aria-hidden />
            <p className="mt-3 font-medium text-green-deep">No orders yet</p>
            <p className="mt-1 text-sm text-muted">Start buying or selling in the marketplace.</p>
            <Link
              href="/app/marketplace"
              className="mt-4 inline-block rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
            >
              Browse marketplace
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-cream-deep rounded-[1.5rem] border border-cream-deep bg-white shadow-sm">
            {(orders ?? []).map((o) => {
              const listing = listingById.get(o.listing_id);
              const otherName =
                o.buyer_id === user.id ? nameById.get(o.seller_id) : nameById.get(o.buyer_id);
              const total = Number(o.price) + Number(o.delivery_fee);
              return (
                <li key={o.id}>
                  <Link
                    href={`/app/marketplace/orders/${o.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-cream/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{listing?.title ?? "Listing"}</span>
                      <span className="text-sm text-muted">
                        {o.buyer_id === user.id ? "Bought from" : "Sold to"} {otherName ?? "Unknown"} ·{" "}
                        GHS {total.toFixed(2)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        ["completed", "refunded"].includes(o.status)
                          ? "bg-green/10 text-green-deep"
                          : ["cancelled", "disputed"].includes(o.status)
                            ? "bg-orange/10 text-orange-deep"
                            : "bg-cream-deep text-muted"
                      }`}
                    >
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
