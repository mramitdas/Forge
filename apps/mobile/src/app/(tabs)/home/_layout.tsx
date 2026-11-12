import { Stack } from "expo-router";
import { useTheme } from "@/theme/theme-context";
import { largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function HomeLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={stackScreenOptions(palette)}>
      <Stack.Screen name="index" options={{ title: "Summary", ...largeTitleOptions }} />
    </Stack>
  );
}