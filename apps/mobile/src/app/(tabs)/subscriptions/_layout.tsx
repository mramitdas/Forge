import { Stack } from "expo-router";
import { inlineTitleOptions, largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function SubscriptionsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Subscriptions", ...largeTitleOptions }} />
      <Stack.Screen name="[id]" options={{ title: "Subscription", ...inlineTitleOptions }} />
    </Stack>
  );
}
