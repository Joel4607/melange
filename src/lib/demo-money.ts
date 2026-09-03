export const DEMO_CREDIT_ALLOCATION = 1000;
export const DEMO_CURRENCY_LABEL = "Demo GHS";
export const DEMO_MONEY_NOTICE =
  "Simulation only—no real funds can be deposited, withdrawn, or redeemed.";

export function formatDemoMoney(amount: number | string): string {
  return `${DEMO_CURRENCY_LABEL} ${Number(amount).toFixed(2)}`;
}
