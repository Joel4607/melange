"use client";

import { useFormStatus } from "react-dom";
import { submitVerification } from "../actions";

export function VerifyForm() {
  return (
    <form action={submitVerification} encType="multipart/form-data" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Ghana card — front</span>
          <input
            name="front"
            type="file"
            accept="image/*"
            capture="environment"
            required
            className="mt-1 block w-full text-sm text-ink file:rounded-full file:border-0 file:bg-cream-deep file:px-4 file:py-2 file:font-medium file:text-green-deep hover:file:bg-cream/60"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Ghana card — back</span>
          <input
            name="back"
            type="file"
            accept="image/*"
            capture="environment"
            required
            className="mt-1 block w-full text-sm text-ink file:rounded-full file:border-0 file:bg-cream-deep file:px-4 file:py-2 file:font-medium file:text-green-deep hover:file:bg-cream/60"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ink">Phone number</span>
        <input
          name="phone"
          type="tel"
          required
          placeholder="+233 20 000 0000"
          className="mt-1 w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">Email (optional)</span>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
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
      {pending ? "Uploading..." : "Submit for verification"}
    </button>
  );
}
