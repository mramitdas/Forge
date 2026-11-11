import { apiFetch } from "./api";
import type { PageOut, SubscriptionOut } from "./types";

export function fetchSubscriptions(status?: string) {
  const qs = new URLSearchParams({ page_size: "50" });
  if (status) qs.set("status", status);
  return apiFetch<PageOut<SubscriptionOut>>(`/plans/subscriptions?${qs.toString()}`);
}

export function activateSubscription(id: string) {
  return apiFetch<SubscriptionOut>(`/plans/subscriptions/${id}/activate`, { method: "POST" });
}
