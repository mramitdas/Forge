import { Stack } from "expo-router";
import { largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function HomeLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Summary", ...largeTitleOptions }} />
    </Stack>
  );
}
