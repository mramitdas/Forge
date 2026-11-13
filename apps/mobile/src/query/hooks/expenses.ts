import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addExpense, listExpenses } from '@/fixtures/expenses';
import type { ExpenseCategory, PaymentMethod } from '@/lib/types';
import { useCan } from '@/permissions/useCan';

export function useExpenses() {
  const canView = useCan('expenses.view');
  return useQuery({
    queryKey: ['expenses'],
    queryFn: listExpenses,
    enabled: canView,
  });
}

export function useAddExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      category: ExpenseCategory;
      description: string | null;
      amountMinor: number;
      method: PaymentMethod;
    }) => addExpense(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
