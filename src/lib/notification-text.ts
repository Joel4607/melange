export interface NotificationSummary {
  id: string;
  type: string;
  payload: {
    task_title?: string;
    task_id?: string;
    listing_title?: string;
    listing_order_id?: string;
    resolution?: string;
  };
  read: boolean;
  created_at: string;
}

const TEXT_BY_TYPE: Record<string, string> = {
  offer: "New errand offer",
  offer_accepted: "Runner accepted your errand",
  picked_up: "Runner picked up your errand",
  delivered: "Your errand was delivered",
  rated: "Buyer rated you",
  buyer_cancelled: "Buyer cancelled the errand",
  runner_cancelled: "Runner cancelled the errand",
  dispute_raised: "A dispute was raised",
  dispute_resolved: "Dispute resolved",
  listing_sold: "Your listing sold",
  listing_purchased: "You bought a listing",
  marketplace_ready: "Marketplace order is ready",
  marketplace_delivered: "Marketplace order delivered",
  marketplace_completed: "Marketplace order completed",
  marketplace_cancelled: "Marketplace order cancelled",
  marketplace_dispute_raised: "Marketplace dispute raised",
  marketplace_dispute_resolved: "Marketplace dispute resolved",
};

export function formatNotification(notification: NotificationSummary): string {
  const base = TEXT_BY_TYPE[notification.type] ?? notification.type;
  const title = notification.payload?.task_title
    ? ` · ${notification.payload.task_title}`
    : notification.payload?.listing_title
      ? ` · ${notification.payload.listing_title}`
      : "";
  const resolution =
    (notification.type === "dispute_resolved" || notification.type === "marketplace_dispute_resolved") &&
    notification.payload.resolution
      ? ` (${notification.payload.resolution})`
      : "";
  return `${base}${title}${resolution}`;
}
