export const DEMO_CREDIT_ALLOCATION = 1000;
export const DEMO_CURRENCY_LABEL = "Demo GHS";
export const DEMO_MONEY_NOTICE =
  "Simulation only—no real funds can be deposited, withdrawn, or redeemed.";

export interface DemoActionState {
  error: string | null;
}

export function formatDemoMoney(amount: number | string): string {
  return `${DEMO_CURRENCY_LABEL} ${Number(amount).toFixed(2)}`;
}

export function demoMoneyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("demo_wallet_insufficient_credits")
    ? "You do not have enough demo credits for this transaction."
    : "The demo transaction could not be completed. Please try again.";
}
