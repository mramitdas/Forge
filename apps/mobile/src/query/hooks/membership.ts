import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { activateSubscription, getSubscription, listSubscriptions } from '@/fixtures/membership';
import type { SubscriptionStatus } from '@/lib/types';
import { useCan } from '@/permissions/useCan';

export type SubscriptionFilter = SubscriptionStatus | 'all';

export function useSubscriptions(filter: SubscriptionFilter = 'all') {
  const canView = useCan('membership.view');
  return useQuery({
    queryKey: ['subscriptions', filter],
    queryFn: () => listSubscriptions(filter),
    enabled: canView,
  });
}

export function useSubscription(id: string) {
  const canView = useCan('membership.view');
  return useQuery({
    queryKey: ['subscription', id],
    queryFn: () => getSubscription(id),
    enabled: canView && id.length > 0,
  });
}

export function useActivateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => activateSubscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });
}
