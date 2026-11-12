import { Stack } from "expo-router";
import { inlineTitleOptions, largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function MoreLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "More", ...largeTitleOptions }} />
      <Stack.Screen name="checkin" options={{ title: "Check In", ...inlineTitleOptions }} />
      <Stack.Screen name="billing/index" options={{ title: "Billing", ...largeTitleOptions }} />
      <Stack.Screen name="billing/[id]" options={{ title: "Invoice", ...inlineTitleOptions }} />
      <Stack.Screen name="expenses" options={{ title: "Expenses", ...largeTitleOptions }} />
      <Stack.Screen
        name="expense-add"
        options={{ title: "Add Expense", ...inlineTitleOptions, presentation: "modal" }}
      />
      <Stack.Screen name="notifications" options={{ title: "Notifications", ...largeTitleOptions }} />
      <Stack.Screen name="settings" options={{ title: "Settings", ...largeTitleOptions }} />
      <Stack.Screen name="settings-password" options={{ title: "Password", ...inlineTitleOptions }} />
      <Stack.Screen name="settings-appearance" options={{ title: "Appearance", ...inlineTitleOptions }} />
    </Stack>
  );
}
