import { Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeMode } from "@/theme/theme-context";
import { GroupedList, GroupedRow, Screen } from "@/ui";
import { textStyles } from "@/ui/theme";

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

export function SettingsAppearanceScreen() {
  const { mode, palette, setTheme } = useTheme();
  const t = textStyles(palette);

  return (
    <Screen title="Appearance">
      <GroupedList header="THEME">
        {OPTIONS.map((option, i) => (
          <GroupedRow
            key={option.mode}
            title={option.label}
            onPress={() => setTheme(option.mode)}
            trailing={
              <Text style={[t.body, { color: palette.secondary }]}>
                {option.label === "System"
                  ? "Automatic"
                  : option.label === "Light"
                    ? "Porcelain"
                    : "Liquid dark"}
              </Text>
            }
            leading={
              mode === option.mode ? (
                <Ionicons name="checkmark" size={18} color={palette.accent} />
              ) : (
                <Ionicons name="checkmark" size={18} color="transparent" />
              )
            }
            last={i === OPTIONS.length - 1}
          />
        ))}
      </GroupedList>
    </Screen>
  );
}