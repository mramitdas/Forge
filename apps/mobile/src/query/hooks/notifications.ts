import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listNotifications, markAllRead, markRead } from '@/fixtures/notifications';
import { useCan } from '@/permissions/useCan';

export function useNotifications() {
  const canView = useCan('notifications.view');
  return useQuery({
    queryKey: ['notifications'],
    queryFn: listNotifications,
    enabled: canView,
    refetchInterval: canView ? 30_000 : false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
