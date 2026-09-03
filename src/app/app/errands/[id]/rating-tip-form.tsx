"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import {
  DEMO_MONEY_NOTICE,
  type DemoActionState,
} from "@/lib/demo-money";

type TipChoice = "0" | "5" | "10" | "20" | "custom";

interface RatingTipFormProps {
  runnerName: string;
  action: (
    state: DemoActionState,
    formData: FormData,
  ) => Promise<DemoActionState>;
}

const TIP_CHOICES: { value: TipChoice; label: string }[] = [
  { value: "0", label: "No tip" },
  { value: "5", label: "GHS 5" },
  { value: "10", label: "GHS 10" },
  { value: "20", label: "GHS 20" },
  { value: "custom", label: "Custom" },
];

export function RatingTipForm({ runnerName, action }: RatingTipFormProps) {
  const [state, dispatch, pending] = useActionState(action, { error: null });
  const [stars, setStars] = useState<number | null>(null);
  const [tipChoice, setTipChoice] = useState<TipChoice>("0");
  const [customTip, setCustomTip] = useState("");
  const tip = tipChoice === "custom" ? customTip : tipChoice;

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="stars" value={stars ?? ""} />
      <input type="hidden" name="tip" value={tip} />

      <fieldset>
        <legend className="sr-only">Rate {runnerName}</legend>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
              aria-pressed={stars === rating}
              onClick={() => setStars(rating)}
              className={`grid h-10 w-10 place-items-center rounded-full border transition ${
                stars != null && rating <= stars
                  ? "border-orange bg-orange/10 text-orange-deep"
                  : "border-cream-deep text-muted hover:bg-orange/10 hover:text-orange-deep"
              }`}
            >
              <Star className="h-5 w-5" aria-hidden />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-green-deep">
          Optional demo tip
        </legend>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {TIP_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={tipChoice === choice.value}
              onClick={() => setTipChoice(choice.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                tipChoice === choice.value
                  ? "border-green bg-green text-cream"
                  : "border-cream-deep bg-white text-green-deep hover:bg-cream/40"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      {tipChoice === "custom" ? (
        <label className="mx-auto block max-w-xs text-left text-sm text-muted">
          Custom demo tip (GHS)
          <input
            type="text"
            inputMode="decimal"
            value={customTip}
            onChange={(event) => setCustomTip(event.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded-xl border border-cream-deep bg-white px-4 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft"
          />
        </label>
      ) : null}

      <textarea
        name="comment"
        placeholder="Add a comment (optional)"
        rows={2}
        className="mx-auto w-full max-w-xs rounded-xl border border-cream-deep bg-white px-4 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft"
      />

      <p className="text-xs text-muted">{DEMO_MONEY_NOTICE}</p>
      <button
        type="submit"
        disabled={stars == null || pending}
        className="mx-auto inline-flex items-center justify-center rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit rating and demo tip"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-orange-deep">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
