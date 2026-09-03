"use client";

import { useActionState, type ReactNode } from "react";
import type { DemoActionState } from "@/lib/demo-money";

interface FundingFormProps {
  action: (
    state: DemoActionState,
    formData: FormData,
  ) => Promise<DemoActionState>;
  children: ReactNode;
}

export function FundingForm({ action, children }: FundingFormProps) {
  const [state, dispatch, pending] = useActionState(action, { error: null });

  return (
    <form action={dispatch} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-orange-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Processing demo credits…" : children}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-orange-deep">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
