import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { GlassCard } from '@/ui/GlassCard';

describe('GlassCard', () => {
  it('renders its children', async () => {
    await render(
      <GlassCard>
        <Text>Members</Text>
      </GlassCard>
    );
    expect(screen.getByText('Members')).toBeOnTheScreen();
  });

  it('paints a translucent surface with a hairline border', async () => {
    const view = await render(
      <GlassCard>
        <Text>Members</Text>
      </GlassCard>
    );
    const style = view.toJSON();
    expect(JSON.stringify(style)).toContain('rgba(28, 29, 38, 0.72)');
  });

  it('uses an opaque surface for the elevated variant', async () => {
    const view = await render(
      <GlassCard variant="elevated">
        <Text>Members</Text>
      </GlassCard>
    );
    expect(JSON.stringify(view.toJSON())).toContain('#1D1E27');
  });
});
