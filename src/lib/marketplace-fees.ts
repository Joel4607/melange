export interface MarketplaceFeeEstimate {
  price: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  sellerPayout: number;
}

const PLATFORM_FEE_RATE = 0.05;
const PLATFORM_FEE_MIN = 1.0;

export function computeMarketplaceFees(
  price: number,
  deliveryFee: number,
  deliveryOption: "pickup" | "seller_delivery" | "runner_delivery",
): MarketplaceFeeEstimate {
  let platformFee = 0;
  if (price > 0) {
    platformFee = Math.max(PLATFORM_FEE_MIN, price * PLATFORM_FEE_RATE);
    platformFee = Math.round(platformFee * 100) / 100;
  }
  const total = Math.round((price + deliveryFee) * 100) / 100;
  let sellerPayout = Math.max(0, price - platformFee);
  if (deliveryOption === "seller_delivery") {
    sellerPayout += deliveryFee;
  }
  sellerPayout = Math.round(sellerPayout * 100) / 100;
  return {
    price,
    deliveryFee,
    platformFee,
    total,
    sellerPayout,
  };
}
