"use client";

import { useFormStatus } from "react-dom";
import { submitVerification } from "../actions";

export function VerifyForm() {
  return (
    <form action={submitVerification} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-ink">ID photo URL</span>
        <input
          name="id_photo_url"
          type="url"
          required
          placeholder="https://example.com/my-id.jpg"
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
      {pending ? "Submitting..." : "Submit for verification"}
    </button>
  );
}
