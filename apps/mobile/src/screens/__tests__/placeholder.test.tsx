import { render, screen } from '@testing-library/react-native';

import { PlaceholderScreen } from '@/screens/placeholder';

describe('PlaceholderScreen', () => {
  it('renders the screen name', async () => {
    await render(<PlaceholderScreen name="Home" />);
    expect(screen.getByText('Home')).toBeOnTheScreen();
  });
});
