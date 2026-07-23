import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { signedMarketplaceUrls } from "@/lib/server/marketplace";
import type { ListingRow, ProfileRow } from "@/lib/server/rows";
import { MapView } from "../../map-view";
import { OrderForm } from "../order-form";
import { suspendListing } from "../actions";
import { PackageCheck, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Listing — Mélange",
};

export default async function ListingDetailPage({
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
  const { data: listing } = await db
    .from("listings")
    .select(
      "id, seller_id, title, description, category, condition, price, stock, photos, contact_info, location_lat, location_lng, delivery_options, seller_delivery_fee, status, created_at",
    )
    .eq("id", id)
    .maybeSingle<ListingRow>();

  if (!listing) notFound();

  const { data: seller } = await db
    .from("profiles")
    .select("id, name, verified")
    .eq("id", listing.seller_id)
    .maybeSingle<ProfileRow>();

  const isOwner = listing.seller_id === user.id;
  const isActive = listing.status === "active" && listing.stock > 0;

  const photoUrls = await signedMarketplaceUrls(listing.photos);

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app/marketplace"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to marketplace
          </Link>
          <span className="font-display text-lg font-semibold text-green-deep">Listing</span>
          <div className="w-6" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[1.5rem] border border-cream-deep bg-white shadow-sm">
              {photoUrls[0] ? (
                <img src={photoUrls[0]} alt={listing.title} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-sm text-muted">
                  No photo
                </div>
              )}
            </div>
            {photoUrls.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {photoUrls.slice(1).map((url, i) => (
                  <div key={i} className="aspect-square overflow-hidden rounded-xl border border-cream-deep">
                    <img src={url} alt={`${listing.title} ${i + 2}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <div>
              <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">{listing.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {listing.category} · {listing.condition.replace(/_/g, " ")} ·{" "}
                {Number(listing.price) === 0 ? "Free" : `GHS ${Number(listing.price).toFixed(2)}`}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-ink">{listing.description ?? "No description"}</p>
            </div>

            <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
              <p className="font-display font-semibold text-green-deep">Seller</p>
              <p className="mt-1 text-sm text-muted">
                {seller?.name ?? "Unknown"} {seller?.verified ? "· Verified" : null}
              </p>
              <p className="mt-2 text-sm text-ink">
                <span className="font-medium">Contact:</span> {listing.contact_info ?? "Not provided"}
              </p>
            </div>

            <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
              <p className="font-display font-semibold text-green-deep">Location</p>
              <MapView
                center={{ lat: listing.location_lat, lng: listing.location_lng }}
                markers={[
                  {
                    lat: listing.location_lat,
                    lng: listing.location_lng,
                    label: "Seller location",
                    kind: "pickup",
                  },
                ]}
                className="mt-3 h-64"
              />
            </div>

            {isOwner ? (
              <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
                <p className="font-display font-semibold text-green-deep">Your listing</p>
                <p className="mt-1 text-sm text-muted">Stock: {listing.stock}</p>
                <p className="text-sm text-muted">Status: {listing.status}</p>
                {isActive ? (
                  <form action={suspendListing.bind(null, listing.id)} className="mt-3">
                    <button
                      type="submit"
                      className="w-full rounded-2xl border border-cream-deep bg-white py-2.5 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
                    >
                      Pause listing
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-muted">This listing cannot be edited.</p>
                )}
              </div>
            ) : isActive ? (
              <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
                <p className="font-display font-semibold text-green-deep">Buy this item</p>
                <div className="mt-3">
                  <OrderForm listing={listing} />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-medium text-orange-deep">
                  <PackageCheck className="h-4 w-4" aria-hidden /> This item is no longer available.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
