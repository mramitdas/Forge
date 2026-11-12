import { type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { radius, space } from "@/ui/theme";

let BlurView: React.ComponentType<any> | undefined;
if (Platform.OS !== "web") {
  // expo-blur has no DOM implementation; web is handled by the no-blur branch
  // below (§5.3 — mandatory, not optional).
  BlurView = require("expo-blur").BlurView as React.ComponentType<any>;
}

type GlassCardProps = {
  children: ReactNode;
  intensity?: number;
  style?: object;
  padding?: number;
};

export function GlassCard({
  children,
  intensity,
  style,
  padding = space.lg,
}: GlassCardProps) {
  const { palette } = useTheme();
  const cardStyle = [
    styles.card,
    { backgroundColor: palette.surface, borderRadius: radius.lg, padding },
    style,
  ];

  if (Platform.OS === "web" || BlurView == null) {
    return <View style={cardStyle}>{children}</View>;
  }

  return (
    <BlurView
      tint="default"
      intensity={intensity ?? palette.blurIntensity}
      style={[styles.blur, { borderRadius: radius.lg }]}
    >
      <View style={cardStyle}>{children}</View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {},
  blur: { overflow: "hidden" },
});