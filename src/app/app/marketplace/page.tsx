import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Search, Plus, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { signedMarketplaceUrls } from "@/lib/server/marketplace";
import type { ListingRow } from "@/lib/server/rows";
import { Logo } from "@/components/brand";
import { MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

export const metadata: Metadata = {
  title: "Marketplace — Mélange",
};

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { category, q } = await searchParams;
  const db = getServiceClient();

  let query = db
    .from("listings")
    .select("id, seller_id, title, description, category, condition, price, stock, photos, contact_info, location_lat, location_lng, delivery_options, seller_delivery_fee, status, created_at")
    .eq("status", "active")
    .gt("stock", 0);

  if (category && (MARKETPLACE_CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq("category", category);
  }

  const { data: listings } = await query
    .order("created_at", { ascending: false })
    .returns<ListingRow[]>();

  const search = q?.toLowerCase().trim();
  const filtered = search
    ? (listings ?? []).filter(
        (l) =>
          l.title.toLowerCase().includes(search) ||
          (l.description?.toLowerCase().includes(search) ?? false),
      )
    : (listings ?? []);

  const listingsWithUrls = await Promise.all(
    filtered.map(async (l) => ({
      ...l,
      photoUrls: await signedMarketplaceUrls(l.photos.slice(0, 1)),
    })),
  );

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            Back
          </Link>
          <Logo />
          <Link
            href="/app/marketplace/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            <Plus className="h-4 w-4" aria-hidden /> Sell
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Marketplace</h1>
        <p className="mt-2 text-muted">Buy, sell, or give away items from people nearby.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/marketplace"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              !category ? "bg-green text-cream" : "border border-cream-deep bg-white text-green-deep hover:bg-cream/40"
            }`}
          >
            All
          </Link>
          {MARKETPLACE_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/app/marketplace?category=${encodeURIComponent(c)}`}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                category === c ? "bg-green text-cream" : "border border-cream-deep bg-white text-green-deep hover:bg-cream/40"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>

        <form action="/app/marketplace" method="get" className="mt-6 flex gap-3">
          <input type="hidden" name="category" value={category ?? ""} />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search items..."
              className="w-full rounded-2xl border border-cream-deep bg-white py-2.5 pl-10 pr-4 text-sm text-ink outline-none focus:border-green"
            />
          </div>
          <button
            type="submit"
            className="rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Search
          </button>
        </form>

        {listingsWithUrls.length === 0 ? (
          <div className="mt-10 rounded-[1.5rem] border border-cream-deep bg-white p-8 text-center shadow-sm">
            <Store className="mx-auto h-8 w-8 text-orange-deep" aria-hidden />
            <p className="mt-3 font-medium text-green-deep">No listings yet</p>
            <p className="mt-1 text-sm text-muted">Be the first to sell or give away an item.</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listingsWithUrls.map((l) => {
              const isFree = Number(l.price) === 0;
              return (
                <li key={l.id}>
                  <Link
                    href={`/app/marketplace/${l.id}`}
                    className="group block overflow-hidden rounded-[1.5rem] border border-cream-deep bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="aspect-[4/3] bg-cream-deep">
                      {l.photoUrls[0] ? (
                        <img
                          src={l.photoUrls[0]}
                          alt={l.title}
                          className="h-full w-full object-cover transition group-hover:opacity-95"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-muted">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="font-display font-semibold text-green-deep">{l.title}</p>
                      <p className="text-sm text-muted">
                        {l.category} · {l.condition.replace(/_/g, " ")}
                      </p>
                      <p className="mt-2 font-display text-xl font-semibold text-ink">
                        {isFree ? "Free" : `GHS ${Number(l.price).toFixed(2)}`}
                        {l.delivery_options.includes("seller_delivery") && Number(l.seller_delivery_fee) > 0 ? (
                          <span className="ml-2 text-sm font-normal text-muted">
                            + GHS {Number(l.seller_delivery_fee).toFixed(2)} delivery
                          </span>
                        ) : null}
                      </p>
                    </div>
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
