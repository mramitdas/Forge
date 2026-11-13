import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { billingSummary, getInvoice, listInvoices, payInvoice } from '@/fixtures/billing';
import type { InvoiceStatus } from '@/lib/types';
import { useCan } from '@/permissions/useCan';

export type InvoiceFilter = InvoiceStatus | 'all';

export function useInvoices(filter: InvoiceFilter = 'all') {
  const canView = useCan('billing.view');
  return useQuery({
    queryKey: ['invoices', filter],
    queryFn: () => listInvoices(filter),
    enabled: canView,
  });
}

export function useInvoice(id: string) {
  const canView = useCan('billing.view');
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id),
    enabled: canView && id.length > 0,
  });
}

export function useBillingSummary() {
  const canView = useCan('billing.view');
  return useQuery({
    queryKey: ['billing-summary'],
    queryFn: billingSummary,
    enabled: canView,
  });
}

export function usePayInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => payInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    },
  });
}
