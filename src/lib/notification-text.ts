export interface NotificationSummary {
  id: string;
  type: string;
  payload: {
    task_title?: string;
    task_id?: string;
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
};

export function formatNotification(notification: NotificationSummary): string {
  const base = TEXT_BY_TYPE[notification.type] ?? notification.type;
  const title = notification.payload?.task_title
    ? ` · ${notification.payload.task_title}`
    : "";
  const resolution =
    notification.type === "dispute_resolved" && notification.payload.resolution
      ? ` (${notification.payload.resolution})`
      : "";
  return `${base}${title}${resolution}`;
}
