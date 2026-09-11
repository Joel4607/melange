"use client";

import { useActionState } from "react";
import { topUpWallet } from "../actions";

export function TopUpForm() {
  const [state, action, pending] = useActionState(topUpWallet, { error: null });
  return (
    <form id="top-up" action={action} className="mt-5 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="text-sm font-medium text-ink">Top up demo credits (GHS)</span>
          <input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01"
            required defaultValue={50} disabled={pending}
            className="mt-1 w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none focus:border-green-soft focus:bg-white" />
        </label>
        <button type="submit" disabled={pending}
          className="rounded-full bg-green px-5 py-3 text-sm font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60">
          {pending ? "Adding…" : "Add demo credits"}
        </button>
      </div>
      {state.error ? <p role="alert" className="text-sm text-orange-deep">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-green-deep">{state.success}</p> : null}
    </form>
  );
}
