import { StyleSheet, View } from 'react-native';

import { elevation, radii } from '@/theme/tokens';

export type SkeletonProps = {
  height?: number;
  width?: number | string;
  radius?: number;
};

/** A placeholder block shown while data loads. */
export function Skeleton({ height = 16, width = '100%', radius = radii.sm }: SkeletonProps) {
  return <View style={[styles.block, { height, width, borderRadius: radius }]} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: elevation.elevated.background,
    opacity: 0.6,
  },
});
