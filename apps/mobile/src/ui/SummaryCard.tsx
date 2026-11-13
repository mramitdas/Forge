import { StyleSheet, Text, View } from 'react-native';

import { palette, textStyles } from '@/theme/tokens';
import { GlassCard } from './GlassCard';

export type SummaryCardProps = {
  kicker: string;
  value: string;
  trend?: string;
};

/** A metric tile: kicker, headline readout, optional micro-trend pill. */
export function SummaryCard({ kicker, value, trend }: SummaryCardProps) {
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.kicker}>{kicker.toUpperCase()}</Text>
      <View style={styles.row}>
        <Text style={styles.value} accessibilityRole="header">
          {value}
        </Text>
        {trend ? (
          <View style={styles.trend}>
            <Text style={styles.trendLabel}>{trend}</Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 150,
  },
  kicker: {
    ...textStyles.labelSm,
    color: palette.inkFaint,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  value: {
    ...textStyles.headlineLg,
    color: palette.inkPrimary,
  },
  trend: {
    paddingHorizontal: 8,
    height: 20,
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: palette.accentSoft,
  },
  trendLabel: {
    ...textStyles.labelMd,
    color: palette.primaryContainer,
  },
});
