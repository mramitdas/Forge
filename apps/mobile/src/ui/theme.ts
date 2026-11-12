// Pure data, no React. Palettes are the FitWoody redesign tokens (design doc
// §5.2, AA-verified); the scale below is theme-invariant and migrated from
// tokens.ts so screens can import layout constants from here after #150.

export type AccentTone = "strong" | "watch" | "atrisk" | null;

export interface Palette {
  canvas: string;
  /** Accent color at the theme's wash alpha — compose with a tier color. */
  washAlpha: number;
  surface: string;
  surfaceStrong: string;
  separator: string;
  label: string;
  secondary: string;
  tertiary: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  searchFill: string;
  blurIntensity: number;
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const palettes: Record<"dark" | "light", Palette> = {
  dark: {
    canvas: "#0E1014",
    washAlpha: 0.08,
    surface: "rgba(255,255,255,0.07)",
    surfaceStrong: "rgba(255,255,255,0.12)",
    separator: "rgba(255,255,255,0.14)",
    label: "#F2F4F8",
    secondary: "rgba(235,238,245,0.62)",
    tertiary: "rgba(235,238,245,0.38)",
    accent: "#30D158",
    accentSoft: "rgba(48,209,88,0.18)",
    onAccent: "#06210D",
    success: "#30D158",
    warning: "#FFD60A",
    danger: "#FF453A",
    searchFill: "rgba(255,255,255,0.08)",
    blurIntensity: 40,
  },
  light: {
    canvas: "#F2F2F7",
    washAlpha: 0.06,
    surface: "#FFFFFF",
    surfaceStrong: "#E9E9EF",
    separator: "rgba(60,60,67,0.18)",
    label: "#0B0C10",
    secondary: "rgba(60,60,67,0.76)",
    tertiary: "rgba(60,60,67,0.34)",
    accent: "#1E6B31",
    accentSoft: "rgba(30,107,49,0.14)",
    onAccent: "#FFFFFF",
    success: "#1E6B31",
    warning: "#B25000",
    danger: "#9E2B15",
    searchFill: "#E3E3E8",
    blurIntensity: 24,
  },
};

/** Optional Home-only wash: accent tier color over the canvas at palette alpha. */
export function accentWash(palette: Palette, tierColor: string): string {
  return rgba(tierColor, palette.washAlpha);
}

export const type = {
  largeTitle: { fontSize: 34, fontWeight: "700" as const },
  title: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 17, fontWeight: "400" as const },
  subhead: { fontSize: 15, fontWeight: "400" as const },
  footnote: { fontSize: 13, fontWeight: "400" as const },
  caption: { fontSize: 12, fontWeight: "400" as const },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const radius = { sm: 8, md: 10, lg: 12, full: 999 };
export const rowMinHeight = 44;

/** The type scale with theme-correct colors resolved. */
export function textStyles(p: Palette) {
  return {
    largeTitle: { ...type.largeTitle, color: p.label },
    title: { ...type.title, color: p.label },
    body: { ...type.body, color: p.label },
    subhead: { ...type.subhead, color: p.secondary },
    footnote: { ...type.footnote, color: p.secondary },
    caption: { ...type.caption, color: p.secondary },
  };
}
export type TextStyles = ReturnType<typeof textStyles>;
