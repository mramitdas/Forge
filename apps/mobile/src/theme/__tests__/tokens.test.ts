import { kickerStyle, numericFigures, palette, radii, spacing, textStyles } from '@/theme/tokens';

describe('design tokens', () => {
  it('carries the signal palette from design.md', () => {
    expect(palette.signalGreen).toBe('#4FD7A0');
    expect(palette.signalAmber).toBe('#FFB54A');
    expect(palette.signalRed).toBe('#FF7A70');
    expect(palette.signalBlue).toBe('#7AB0FF');
  });

  it('uses the periwinkle accent as the action colour', () => {
    expect(palette.primaryContainer).toBe('#aab2ff');
    expect(palette.accentInk).toBe('#0F1224');
  });

  it('uses the prose radii (6/8/12/16), not the rem values', () => {
    expect(radii).toEqual({ sm: 6, md: 8, lg: 12, xl: 16, pill: 9999 });
  });

  it('uses the 4-point spacing scale', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 });
  });

  it('keeps Space Grotesk to the headline styles', () => {
    const grotesk = ['headlineXl', 'headlineLg', 'headlineMd', 'headlineSm'];
    for (const [name, style] of Object.entries(textStyles)) {
      if (grotesk.includes(name)) expect(style.fontFamily).toMatch(/^SpaceGrotesk_/);
      else expect(style.fontFamily).toMatch(/^Inter_/);
    }
  });

  it('gives figures tabular lining numbers', () => {
    expect(numericFigures.fontVariant).toContain('tabular-nums');
  });

  it('renders kickers uppercase', () => {
    expect(kickerStyle.textTransform).toBe('uppercase');
    expect(kickerStyle.letterSpacing).toBe(1.5);
  });
});
