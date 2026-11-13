import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { elevation, palette, radii, spacing, textStyles } from '@/theme/tokens';

export type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** The confirmation step before anything irreversible — paying, activating, logging out. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={onCancel} accessibilityRole="button">
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.action, styles.confirm, destructive && styles.destructive]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: elevation.elevated.background,
    borderWidth: 1,
    borderColor: elevation.borderStrong,
  },
  title: {
    ...textStyles.headlineSm,
    color: palette.inkPrimary,
  },
  message: {
    ...textStyles.bodyMd,
    color: palette.inkSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: elevation.borderStrong,
  },
  confirm: {
    backgroundColor: palette.primaryContainer,
    borderColor: palette.primaryContainer,
  },
  destructive: {
    backgroundColor: palette.signalRed,
    borderColor: palette.signalRed,
  },
  cancelLabel: {
    ...textStyles.labelLg,
    color: palette.inkPrimary,
  },
  confirmLabel: {
    ...textStyles.labelLg,
    color: palette.accentInk,
  },
});
