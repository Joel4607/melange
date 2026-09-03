export const DEMO_CREDIT_ALLOCATION = 1000;
export const DEMO_CURRENCY_LABEL = "Demo GHS";
export const DEMO_MONEY_NOTICE =
  "Simulation only—no real funds can be deposited, withdrawn, or redeemed.";

export interface DemoActionState {
  error: string | null;
}

const DEMO_TIP_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;
const DEMO_TIP_ERROR =
  "Enter a demo tip from GHS 0 to GHS 1,000 with no more than two decimal places.";

export function formatDemoMoney(amount: number | string): string {
  return `${DEMO_CURRENCY_LABEL} ${Number(amount).toFixed(2)}`;
}

export function demoMoneyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("demo_wallet_insufficient_credits")
    ? "You do not have enough demo credits for this transaction."
    : "The demo transaction could not be completed. Please try again.";
}

export function parseDemoTip(raw: FormDataEntryValue | null): number {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return 0;
  if (!DEMO_TIP_PATTERN.test(value)) throw new Error(DEMO_TIP_ERROR);

  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 100_000) throw new Error(DEMO_TIP_ERROR);
  return cents;
}
