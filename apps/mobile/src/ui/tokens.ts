export const colors = {
  canvas: "#F2F2F7",
  surface: "#FFFFFF",
  separator: "#C6C6C8",
  label: "#000000",
  secondary: "rgba(60,60,67,0.6)",
  tertiary: "rgba(60,60,67,0.3)",
  tint: "#007AFF",
  green: "#34C759",
  amber: "#FF9500",
  red: "#FF3B30",
  searchFill: "#E3E3E8",
  gray5: "#E5E5EA",
};

export const type = {
  largeTitle: { fontSize: 34, fontWeight: "700" as const, color: colors.label },
  title: { fontSize: 17, fontWeight: "600" as const, color: colors.label },
  body: { fontSize: 17, fontWeight: "400" as const, color: colors.label },
  subhead: { fontSize: 15, fontWeight: "400" as const, color: colors.secondary },
  footnote: { fontSize: 13, fontWeight: "400" as const, color: colors.secondary },
  caption: { fontSize: 12, fontWeight: "400" as const, color: colors.secondary },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const radius = { sm: 8, md: 10, lg: 12, full: 999 };
export const rowMinHeight = 44;
