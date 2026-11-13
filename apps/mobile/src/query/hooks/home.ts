import { useQuery } from '@tanstack/react-query';

import { countMembers } from '@/fixtures/members';
import { useCan } from '@/permissions/useCan';

/**
 * The Home screen's cards are independent: each one is gated by its own
 * capability, so a person without `billing.view` never triggers a billing
 * fetch at all.
 */
export function useMemberCount() {
  const canView = useCan('members.view');
  return useQuery({
    queryKey: ['member-count'],
    queryFn: countMembers,
    enabled: canView,
  });
}
