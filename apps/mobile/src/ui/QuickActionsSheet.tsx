import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useCan } from '@/permissions/useCan';
import { elevation, palette, radii, spacing, textStyles } from '@/theme/tokens';

type QuickAction = {
  key: string;
  label: string;
  glyph: string;
  href: string;
  capability: 'attendance.manage' | 'expenses.manage' | 'membership.view' | 'billing.view';
};

const ACTIONS: QuickAction[] = [
  { key: 'checkin', label: 'Check In', glyph: '✓', href: '/(tabs)/checkin', capability: 'attendance.manage' },
  { key: 'expense', label: 'Add Expense', glyph: '₹', href: '/(tabs)/expenses/add', capability: 'expenses.manage' },
  { key: 'subscriptions', label: 'Subscriptions', glyph: '◇', href: '/(tabs)/subscriptions', capability: 'membership.view' },
  { key: 'billing', label: 'Billing', glyph: '◈', href: '/(tabs)/billing', capability: 'billing.view' },
];

export type QuickActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The sheet behind the centre trigger. It only lists what the person can
 * actually do — a row that leads to a "Restricted area" is never shown.
 */
export function QuickActionsSheet({ visible, onClose }: QuickActionsSheetProps) {
  const router = useRouter();
  const canCheckIn = useCan('attendance.manage');
  const canAddExpense = useCan('expenses.manage');
  const canSeeSubscriptions = useCan('membership.view');
  const canSeeBilling = useCan('billing.view');

  const allowed: Record<QuickAction['capability'], boolean> = {
    'attendance.manage': canCheckIn,
    'expenses.manage': canAddExpense,
    'membership.view': canSeeSubscriptions,
    'billing.view': canSeeBilling,
  };

  const actions = ACTIONS.filter((action) => allowed[action.capability]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} testID="quick-actions">
          <Text style={styles.kicker}>QUICK ACTIONS</Text>
          <ScrollView>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                testID={`quick-action-${action.key}`}
                accessibilityRole="button"
                style={styles.row}
                onPress={() => {
                  onClose();
                  router.push(action.href as never);
                }}
              >
                <Text style={styles.glyph}>{action.glyph}</Text>
                <Text style={styles.label}>{action.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: elevation.elevated.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    borderColor: elevation.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  kicker: {
    ...textStyles.labelSm,
    color: palette.inkFaint,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  glyph: {
    ...textStyles.titleMd,
    color: palette.primaryContainer,
    width: 20,
  },
  label: {
    ...textStyles.bodyLg,
    color: palette.inkPrimary,
  },
});
