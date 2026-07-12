"use client";

import { useFormStatus } from "react-dom";
import { updateCapabilities } from "./actions";

const CAPABILITIES = [
  "Market Runs",
  "Grocery Shopping",
  "Pharmacy Pickup",
  "Clothes & Apparel",
  "Pickup & Delivery",
  "Household Items",
  "Gifts & Occasions",
  "Any Other Errand",
] as const;

export function CapabilitiesEditor({
  capabilities,
}: {
  capabilities: string[] | null;
}) {
  const selected = new Set(capabilities ?? []);

  return (
    <form action={updateCapabilities} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CAPABILITIES.map((c) => {
          const id = `cap-${c}`;
          return (
            <label
              key={c}
              htmlFor={id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${
                selected.has(c)
                  ? "border-green bg-green text-cream"
                  : "border-cream-deep bg-cream/40 text-green-deep hover:bg-white"
              }`}
            >
              <input
                id={id}
                type="checkbox"
                name="capabilities"
                value={c}
                defaultChecked={selected.has(c)}
                className="sr-only"
              />
              {c}
            </label>
          );
        })}
      </div>
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
      className="rounded-full border border-green-soft px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-cream disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save capabilities"}
    </button>
  );
}
