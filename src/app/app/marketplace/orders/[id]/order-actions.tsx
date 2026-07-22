"use client";

import { useState, useTransition } from "react";
import {
  markReadyForPickup,
  markInDelivery,
  markDelivered,
  confirmPickup,
  confirmReceipt,
  rateBuyer,
  cancelMarketplaceOrder,
  raiseMarketplaceDispute,
} from "../../actions";
import type { ListingOrderRow } from "@/lib/server/rows";

function StarRating({ name }: { name: string }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((s) => (
        <label key={s} className="cursor-pointer text-2xl text-orange-deep">
          <input type="radio" name={name} value={s} className="sr-only peer" required />
          <span className="peer-checked:text-green-deep peer-focus:ring-2">★</span>
        </label>
      ))}
    </div>
  );
}

function useAction(handler: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function run() {
    setError(null);
    startTransition(async () => {
      try {
        await handler();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }
  return { error, isPending, run };
}

export function OrderActions({
  order,
  isBuyer,
  isSeller,
}: {
  order: ListingOrderRow;
  isBuyer: boolean;
  isSeller: boolean;
}) {
  const [cancelAction] = [useAction(() => cancelMarketplaceOrder(order.id))];
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [isDisputePending, startDispute] = useTransition();

  function handleDispute(formData: FormData) {
    setDisputeError(null);
    formData.set("reason", disputeReason);
    startDispute(async () => {
      try {
        await raiseMarketplaceDispute(order.id, formData);
      } catch (err) {
        setDisputeError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const canCancel =
    (["paid", "ready_for_pickup"].includes(order.status) && isBuyer) ||
    (["paid", "ready_for_pickup", "in_delivery"].includes(order.status) && isSeller);

  const canDispute = order.status === "delivered";

  return (
    <div className="space-y-5">
      {cancelAction.error ? (
        <p className="rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange-deep">{cancelAction.error}</p>
      ) : null}

      {isSeller && order.status === "paid" ? (
        <div className="flex flex-wrap gap-3">
          {order.delivery_option === "pickup" ? (
            <form action={() => markReadyForPickup(order.id)}>
              <button
                type="submit"
                className="rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
              >
                Mark ready for pickup
              </button>
            </form>
          ) : null}
          {order.delivery_option === "seller_delivery" ? (
            <form action={() => markInDelivery(order.id)}>
              <button
                type="submit"
                className="rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
              >
                Mark in delivery
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {isSeller && order.status === "ready_for_pickup" ? (
        <form action={confirmPickup.bind(null, order.id)} className="space-y-3">
          <p className="text-sm text-muted">Enter the pickup code the buyer gives you.</p>
          <input
            name="pickup_code"
            required
            maxLength={6}
            placeholder="000000"
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm tracking-widest outline-none focus:border-green"
          />
          <button
            type="submit"
            className="rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Confirm pickup
          </button>
        </form>
      ) : null}

      {isSeller && order.status === "in_delivery" ? (
        <form action={markDelivered.bind(null, order.id)} className="space-y-3">
          <textarea
            name="notes"
            rows={2}
            placeholder="Delivery notes (optional)"
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          />
          <button
            type="submit"
            className="rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Mark delivered
          </button>
        </form>
      ) : null}

      {isBuyer && order.status === "delivered" ? (
        <div className="rounded-2xl border border-cream-deep bg-cream/40 p-5">
          <p className="font-display font-semibold text-green-deep">Confirm receipt</p>
          <p className="text-sm text-muted">Rate the seller to complete the order and release payment.</p>
          <form action={confirmReceipt.bind(null, order.id)} className="mt-3 space-y-3">
            <StarRating name="stars" />
            <textarea
              name="comment"
              rows={2}
              placeholder="Comment (optional)"
              className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
            />
            <button
              type="submit"
              className="w-full rounded-2xl bg-green py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
            >
              Confirm & release payment
            </button>
          </form>
        </div>
      ) : null}

      {isSeller && order.status === "completed" && !order.seller_rated ? (
        <div className="rounded-2xl border border-cream-deep bg-cream/40 p-5">
          <p className="font-display font-semibold text-green-deep">Rate the buyer</p>
          <form action={rateBuyer.bind(null, order.id)} className="mt-3 space-y-3">
            <StarRating name="stars" />
            <textarea
              name="comment"
              rows={2}
              placeholder="Comment (optional)"
              className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
            />
            <button
              type="submit"
              className="rounded-2xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
            >
              Submit rating
            </button>
          </form>
        </div>
      ) : null}

      {canDispute ? (
        <div className="rounded-2xl border border-orange/20 bg-orange/5 p-5">
          <p className="font-display font-semibold text-orange-deep">Raise a dispute</p>
          {disputeError ? (
            <p className="mt-2 rounded-xl bg-orange/10 px-3 py-1.5 text-sm text-orange-deep">{disputeError}</p>
          ) : null}
          <form action={handleDispute} className="mt-3 space-y-3">
            <textarea
              name="reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={3}
              required
              placeholder="Explain what went wrong..."
              className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
            />
            <button
              type="submit"
              disabled={isDisputePending || !disputeReason.trim()}
              className="rounded-2xl border border-orange-deep bg-white px-5 py-2.5 text-sm font-semibold text-orange-deep transition hover:bg-orange/10 disabled:opacity-50"
            >
              {isDisputePending ? "Raising..." : "Raise dispute"}
            </button>
          </form>
        </div>
      ) : null}

      {canCancel ? (
        <form action={() => cancelAction.run()}>
          <button
            type="submit"
            disabled={cancelAction.isPending}
            className="w-full rounded-2xl border border-cream-deep bg-white py-2.5 text-sm font-semibold text-green-deep transition hover:bg-cream/40 disabled:opacity-50"
          >
            {cancelAction.isPending ? "Cancelling..." : "Cancel order"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
