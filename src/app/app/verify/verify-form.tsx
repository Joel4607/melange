"use client";

import { useFormStatus } from "react-dom";
import { submitVerification } from "../actions";

interface VerifyFormProps {
  initial?: {
    legal_name?: string | null;
    date_of_birth?: string | null;
    ghana_card_number?: string | null;
    residential_address?: string | null;
    phone?: string | null;
    email?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    next_of_kin_name?: string | null;
    next_of_kin_phone?: string | null;
  };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white";

export function VerifyForm({ initial }: VerifyFormProps) {
  return (
    <form action={submitVerification} encType="multipart/form-data" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Full legal name</span>
          <input
            name="legal_name"
            type="text"
            required
            defaultValue={initial?.legal_name ?? ""}
            placeholder="As shown on Ghana Card"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Date of birth</span>
          <input
            name="date_of_birth"
            type="date"
            required
            defaultValue={initial?.date_of_birth ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Ghana Card number</span>
          <input
            name="ghana_card_number"
            type="text"
            required
            defaultValue={initial?.ghana_card_number ?? ""}
            placeholder="GHA-..."
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Phone number</span>
          <input
            name="phone"
            type="tel"
            required
            defaultValue={initial?.phone ?? ""}
            placeholder="+233 20 000 0000"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ink">Residential address</span>
        <textarea
          name="residential_address"
          required
          defaultValue={initial?.residential_address ?? ""}
          placeholder="Current home address"
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">Email (optional)</span>
        <input
          name="email"
          type="email"
          defaultValue={initial?.email ?? ""}
          placeholder="you@example.com"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Emergency contact name</span>
          <input
            name="emergency_contact_name"
            type="text"
            required
            defaultValue={initial?.emergency_contact_name ?? ""}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Emergency contact phone</span>
          <input
            name="emergency_contact_phone"
            type="tel"
            required
            defaultValue={initial?.emergency_contact_phone ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Next of kin name</span>
          <input
            name="next_of_kin_name"
            type="text"
            required
            defaultValue={initial?.next_of_kin_name ?? ""}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Next of kin phone</span>
          <input
            name="next_of_kin_phone"
            type="tel"
            required
            defaultValue={initial?.next_of_kin_phone ?? ""}
            className={inputClass}
          />
        </label>
      </div>

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
        <span className="text-sm font-medium text-ink">Selfie / liveness photo</span>
        <input
          name="selfie"
          type="file"
          accept="image/*"
          capture="user"
          required
          className="mt-1 block w-full text-sm text-ink file:rounded-full file:border-0 file:bg-cream-deep file:px-4 file:py-2 file:font-medium file:text-green-deep hover:file:bg-cream/60"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">Vehicle / bike license (optional)</span>
        <input
          name="vehicle_license"
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-sm text-ink file:rounded-full file:border-0 file:bg-cream-deep file:px-4 file:py-2 file:font-medium file:text-green-deep hover:file:bg-cream/60"
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
