"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import * as Storage from "@/lib/storage";
import {
  type AccentTone,
  type Palette,
  palettes,
} from "@/ui/theme";

export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "forge.theme";

interface ThemeContextValue {
  mode: ThemeMode;
  scheme: "light" | "dark";
  palette: Palette;
  accent: AccentTone;
  setTheme: (mode: ThemeMode) => void;
  setHomeTier: (tier: AccentTone) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [tier, setTier] = useState<AccentTone>(null);
  const systemScheme = useColorScheme();

  useEffect(() => {
    void (async () => {
      const raw = await Storage.getItem(THEME_KEY);
      // First run (key absent) is dark by default — normative per G1.
      if (raw === "light" || raw === "dark" || raw === "system") {
        setMode(raw);
      }
    })();
  }, []);

  const scheme: "light" | "dark" =
    mode === "system" ? (systemScheme ?? "dark") : mode;

  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next);
    void Storage.setItem(THEME_KEY, next);
  }, []);

  // Home propagation: home.tsx sets the tier on score change and clears it on
  // unmount so a stale tier never leaks into other screens.
  const setHomeTier = useCallback((next: AccentTone) => {
    setTier(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      palette: palettes[scheme],
      accent: tier,
      setTheme,
      setHomeTier,
    }),
    [mode, scheme, tier, setTheme, setHomeTier],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
