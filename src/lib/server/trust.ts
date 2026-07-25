import { computeTrust, DEFAULT_TRUST_CONFIG } from "@/lib/algorithm";
import type { TrustInputs } from "@/lib/algorithm";

export function getTrustBreakdown(
  inputs: Omit<TrustInputs, "now">,
) {
  return computeTrust({ ...inputs, now: Date.now() }, DEFAULT_TRUST_CONFIG);
}
