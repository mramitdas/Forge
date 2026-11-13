import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { readItem, writeItem } from '@/lib/storage';
import { palette, type Palette } from './tokens';

export type Appearance = 'system' | 'light' | 'dark';

const APPEARANCE_KEY = 'fitwoody.appearance';

type ThemeContextValue = {
  palette: Palette;
  isDark: boolean;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  useEffect(() => {
    readItem(APPEARANCE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') setAppearanceState(stored);
    });
  }, []);

  const setAppearance = (next: Appearance) => {
    setAppearanceState(next);
    writeItem(APPEARANCE_KEY, next);
  };

  const isDark = appearance === 'system' ? systemScheme !== 'light' : appearance === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      // The light palette is not designed yet — light mode resolves to dark.
      palette,
      isDark,
      appearance,
      setAppearance,
    }),
    [isDark, appearance]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
