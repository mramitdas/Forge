import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listCheckIns, recordCheckIn } from '@/fixtures/attendance';
import type { MemberStatus } from '@/lib/types';
import { useCan } from '@/permissions/useCan';

export function useRecentCheckIns(limit = 5) {
  const canView = useCan('attendance.view');
  return useQuery({
    queryKey: ['check-ins', limit],
    queryFn: () => listCheckIns(limit),
    enabled: canView,
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; memberName: string; status: MemberStatus }) =>
      recordCheckIn(input.memberId, input.memberName, input.status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['check-ins'] }),
  });
}
