import { Stack } from "expo-router";
import { useTheme } from "@/theme/theme-context";
import { inlineTitleOptions, largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function SubscriptionsLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={stackScreenOptions(palette)}>
      <Stack.Screen name="index" options={{ title: "Subscriptions", ...largeTitleOptions }} />
      <Stack.Screen name="[id]" options={{ title: "Subscription", ...inlineTitleOptions }} />
    </Stack>
  );
}