import { StyleSheet, Text, View } from 'react-native';

import { palette, radii, textStyles } from '@/theme/tokens';

export type StatusTone = 'positive' | 'warning' | 'critical' | 'info' | 'neutral';

const TONE_COLORS: Record<StatusTone, string> = {
  positive: palette.signalGreen,
  warning: palette.signalAmber,
  critical: palette.signalRed,
  info: palette.signalBlue,
  neutral: palette.outline,
};

/**
 * Status is never colour alone — the chip always carries the word, and the dot
 * only reinforces it.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  active: 'positive',
  paid: 'positive',
  allowed: 'positive',
  pending: 'warning',
  duplicate: 'warning',
  overdue: 'critical',
  expired: 'critical',
  denied: 'critical',
  cancelled: 'neutral',
  unpaid: 'neutral',
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONES[status.toLowerCase()] ?? 'neutral';
}

export type StatusChipProps = {
  status: string;
  label?: string;
  tone?: StatusTone;
};

export function StatusChip({ status, label, tone }: StatusChipProps) {
  const resolved = tone ?? toneForStatus(status);
  const color = TONE_COLORS[resolved];

  return (
    <View
      style={[styles.chip, { backgroundColor: `${color}29` }]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label ?? status}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...textStyles.labelMd,
    textTransform: 'capitalize',
  },
});
