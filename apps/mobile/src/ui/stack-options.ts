import { type Palette } from "@/ui/theme";

export function stackScreenOptions(p: Palette) {
  return {
    headerTintColor: p.accent,
    headerBackTitle: "Back",
    contentStyle: { backgroundColor: p.canvas },
  };
}

export const largeTitleOptions = {
  headerLargeTitleEnabled: true,
};

export const inlineTitleOptions = {
  headerLargeTitleEnabled: false,
};

export type { Palette };