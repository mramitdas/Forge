import type { TextStyle } from 'react-native';

/**
 * Forge Operations — the token layer, from `design.md` at the repo root.
 *
 * Dark-first. The light palette is not designed yet, so light mode currently
 * resolves to the dark palette; a dedicated light pass replaces it.
 */

export const palette = {
  surface: '#12131a',
  surfaceDim: '#12131a',
  surfaceBright: '#383940',
  surfaceContainerLowest: '#0d0e15',
  surfaceContainerLow: '#1a1b22',
  surfaceContainer: '#1e1f26',
  surfaceContainerHigh: '#292931',
  surfaceContainerHighest: '#33343c',
  onSurface: '#e3e1eb',
  onSurfaceVariant: '#c6c5d2',
  inverseSurface: '#e3e1eb',
  inverseOnSurface: '#2f3038',
  outline: '#908f9b',
  outlineVariant: '#464650',
  surfaceTint: '#bdc2ff',
  primary: '#ccd0ff',
  onPrimary: '#21296d',
  primaryContainer: '#aab2ff',
  onPrimaryContainer: '#3a4287',
  inversePrimary: '#50589e',
  secondary: '#c6c5d2',
  onSecondary: '#2f3039',
  secondaryContainer: '#484852',
  onSecondaryContainer: '#b8b7c3',
  tertiary: '#bcd4ff',
  onTertiary: '#003060',
  tertiaryContainer: '#8bb9ff',
  onTertiaryContainer: '#00488a',
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  primaryFixed: '#dfe0ff',
  primaryFixedDim: '#bdc2ff',
  onPrimaryFixed: '#071058',
  onPrimaryFixedVariant: '#384085',
  secondaryFixed: '#e2e1ee',
  secondaryFixedDim: '#c6c5d2',
  onSecondaryFixed: '#1a1b24',
  onSecondaryFixedVariant: '#454650',
  tertiaryFixed: '#d5e3ff',
  tertiaryFixedDim: '#a6c8ff',
  onTertiaryFixed: '#001c3b',
  onTertiaryFixedVariant: '#004787',
  background: '#12131a',
  onBackground: '#e3e1eb',
  surfaceVariant: '#33343c',

  signalGreen: '#4FD7A0',
  signalAmber: '#FFB54A',
  signalRed: '#FF7A70',
  signalBlue: '#7AB0FF',

  accentInk: '#0F1224',
  accentHover: '#BCC3FF',
  accentSoft: 'rgba(170, 178, 255, 0.16)',

  panelGlass: 'rgba(28, 29, 38, 0.72)',
  surfaceBorder: 'rgba(255, 255, 255, 0.09)',
  surfaceBorderStrong: 'rgba(255, 255, 255, 0.15)',

  inkPrimary: '#F0F1F7',
  inkSecondary: '#B8BACB',
  inkFaint: '#8A8CA0',

  canvasLight: '#F2F3F8',
  surfaceLight: '#FFFFFF',
  inkLight: '#1F2130',
} as const;

export type Palette = typeof palette;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Elevation planes: canvas, glass, opaque elevated, active glow. */
export const elevation = {
  glass: { background: palette.panelGlass, blur: 20 },
  bar: { background: 'rgba(21, 22, 29, 0.85)', blur: 24 },
  elevated: { background: '#1D1E27', shadow: '0 20px 48px -8px rgba(0, 0, 0, 0.6)' },
  border: palette.surfaceBorder,
  borderStrong: palette.surfaceBorderStrong,
  glow: 'rgba(170, 178, 255, 0.35)',
  glowSoft: 'rgba(170, 178, 255, 0.30)',
  hairline: 'rgba(255, 255, 255, 0.06)',
  inputBorder: 'rgba(255, 255, 255, 0.10)',
  inputFocus: palette.primaryContainer,
} as const;

export const fonts = {
  spaceGrotesk: {
    300: 'SpaceGrotesk_300Light',
    400: 'SpaceGrotesk_400Regular',
    500: 'SpaceGrotesk_500Medium',
    600: 'SpaceGrotesk_600SemiBold',
    700: 'SpaceGrotesk_700Bold',
  },
  inter: {
    300: 'Inter_300Light',
    400: 'Inter_400Regular',
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
  },
} as const;

/**
 * Space Grotesk is reserved for screen anchors, metric readouts and section
 * titles. Everything operational is Inter.
 */
export const textStyles = {
  headlineXl: {
    fontFamily: fonts.spaceGrotesk[600],
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.75,
  },
  headlineLg: {
    fontFamily: fonts.spaceGrotesk[600],
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.44,
  },
  headlineMd: {
    fontFamily: fonts.spaceGrotesk[600],
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.27,
  },
  headlineSm: {
    fontFamily: fonts.spaceGrotesk[600],
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  titleMd: {
    fontFamily: fonts.inter[600],
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.075,
  },
  bodyLg: {
    fontFamily: fonts.inter[400],
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodyMd: {
    fontFamily: fonts.inter[400],
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.13,
  },
  bodySm: {
    fontFamily: fonts.inter[400],
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.12,
  },
  labelLg: {
    fontFamily: fonts.inter[600],
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.065,
  },
  labelMd: {
    fontFamily: fonts.inter[600],
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.22,
  },
  labelSm: {
    fontFamily: fonts.inter[700],
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.5,
  },
} satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;

/** Telemetry figures line up in columns only with tabular lining figures. */
export const numericFigures = {
  fontVariant: ['tabular-nums'],
} as const;

/** Section kickers — uppercase, widely tracked, for grouping. */
export const kickerStyle: TextStyle = {
  ...textStyles.labelSm,
  textTransform: 'uppercase',
};
