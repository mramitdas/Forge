import { useQuery } from '@tanstack/react-query';

import { getMember, listMembers } from '@/fixtures/members';
import { useCan } from '@/permissions/useCan';

export function useMembers(query = '') {
  const canView = useCan('members.view');
  return useQuery({
    queryKey: ['members', query],
    queryFn: () => listMembers(query),
    enabled: canView,
  });
}

export function useMember(id: string) {
  const canView = useCan('members.view');
  return useQuery({
    queryKey: ['member', id],
    queryFn: () => getMember(id),
    enabled: canView && id.length > 0,
  });
}
