import { palette } from './tokens';

/** Every stack paints the canvas colour — the app is dark-first. */
export const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: palette.surface },
};
