import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { signedMarketplaceUrls } from "@/lib/server/marketplace";
import type { ListingOrderRow, ListingRow, ProfileRow } from "@/lib/server/rows";
import { MapView } from "../../../map-view";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = {
  title: "Order — Mélange",
};

const STATUS_LABELS: Record<string, string> = {
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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getServiceClient();
  const { data: order } = await db
    .from("listing_orders")
    .select("*")
    .eq("id", id)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .maybeSingle<ListingOrderRow>();

  if (!order) notFound();

  const { data: listing } = await db
    .from("listings")
    .select("id, title, description, photos, location_lat, location_lng, contact_info")
    .eq("id", order.listing_id)
    .maybeSingle<ListingRow>();

  const [{ data: buyer }, { data: seller }] = await Promise.all([
    db.from("profiles").select("id, name, verified").eq("id", order.buyer_id).maybeSingle<ProfileRow>(),
    db.from("profiles").select("id, name, verified").eq("id", order.seller_id).maybeSingle<ProfileRow>(),
  ]);

  const photoUrls = await signedMarketplaceUrls(listing?.photos.slice(0, 1) ?? []);

  const isBuyer = order.buyer_id === user.id;
  const isSeller = order.seller_id === user.id;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app/marketplace/orders"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Orders
          </Link>
          <span className="font-display text-lg font-semibold text-green-deep">Order</span>
          <div className="w-6" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
                {listing?.title ?? "Listing"}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {isBuyer ? `Seller: ${seller?.name ?? "Unknown"}` : `Buyer: ${buyer?.name ?? "Unknown"}`}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                ["completed", "refunded"].includes(order.status)
                  ? "bg-green/10 text-green-deep"
                  : ["cancelled", "disputed"].includes(order.status)
                    ? "bg-orange/10 text-orange-deep"
                    : "bg-cream-deep text-muted"
              }`}
            >
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          {photoUrls[0] ? (
            <img
              src={photoUrls[0]}
              alt={listing?.title ?? ""}
              className="mt-5 aspect-video w-full rounded-2xl object-cover"
            />
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-cream-deep bg-cream/40 p-4">
              <p className="text-sm text-muted">Item price</p>
              <p className="font-display text-xl font-semibold text-ink">GHS {Number(order.price).toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-cream-deep bg-cream/40 p-4">
              <p className="text-sm text-muted">Delivery fee</p>
              <p className="font-display text-xl font-semibold text-ink">GHS {Number(order.delivery_fee).toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-cream-deep bg-cream/40 p-4">
              <p className="text-sm text-muted">Total paid</p>
              <p className="font-display text-xl font-semibold text-green-deep">
                GHS {(Number(order.price) + Number(order.delivery_fee)).toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-cream-deep bg-cream/40 p-4">
              <p className="text-sm text-muted">Delivery option</p>
              <p className="font-display text-xl font-semibold text-ink">
                {order.delivery_option === "pickup" ? "Pickup" : "Seller delivery"}
              </p>
            </div>
          </div>

          {order.delivery_option === "pickup" && order.pickup_code ? (
            <div className="mt-5 rounded-2xl border border-cream-deep bg-cream/40 p-4">
              <p className="text-sm text-muted">Pickup code</p>
              <p className="font-display text-2xl font-semibold tracking-widest text-green-deep">
                {order.pickup_code}
              </p>
              <p className="mt-1 text-xs text-muted">Share this with the seller when collecting the item.</p>
            </div>
          ) : null}

          {order.delivery_option === "seller_delivery" && order.delivery_lat != null && order.delivery_lng != null ? (
            <div className="mt-5">
              <p className="font-display font-semibold text-green-deep">Delivery location</p>
              <MapView
                center={{ lat: order.delivery_lat, lng: order.delivery_lng }}
                markers={[
                  {
                    lat: listing?.location_lat ?? order.delivery_lat,
                    lng: listing?.location_lng ?? order.delivery_lng,
                    label: "Seller",
                    kind: "pickup",
                  },
                  { lat: order.delivery_lat, lng: order.delivery_lng, label: "Delivery", kind: "dropoff" },
                ]}
                className="mt-3 h-64"
              />
            </div>
          ) : null}

          <div className="mt-6">
            <OrderActions order={order} isBuyer={isBuyer} isSeller={isSeller} />
          </div>

          {listing?.contact_info ? (
            <div className="mt-5 rounded-2xl border border-cream-deep bg-cream/40 p-4">
              <p className="text-sm text-muted">Seller contact</p>
              <p className="font-medium text-ink">{listing.contact_info}</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
