"use client";

import { useFormStatus } from "react-dom";
import { topUpWallet } from "../actions";

export function TopUpForm() {
  return (
    <form action={topUpWallet} className="flex flex-wrap items-end gap-2">
      <label className="flex-1">
        <span className="text-sm font-medium text-ink">Top up (GHS)</span>
        <input
          name="amount"
          type="number"
          min={1}
          step="1"
          required
          defaultValue={50}
          className="mt-1 w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white"
        />
      </label>
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
    >
      {pending ? "Adding..." : "Add funds"}
    </button>
  );
}
