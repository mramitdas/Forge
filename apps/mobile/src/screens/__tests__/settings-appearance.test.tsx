import { render, screen, userEvent } from '@testing-library/react-native';

import { AppearanceScreen } from '@/screens/settings-appearance';
import { ThemeProvider } from '@/theme/theme-context';

async function renderScreen() {
  return render(
    <ThemeProvider>
      <AppearanceScreen />
    </ThemeProvider>
  );
}

describe('AppearanceScreen', () => {
  it('offers system, light and dark', async () => {
    await renderScreen();
    expect(screen.getByText('System')).toBeOnTheScreen();
    expect(screen.getByText('Light')).toBeOnTheScreen();
    expect(screen.getByText('Dark')).toBeOnTheScreen();
  });

  it('ticks the chosen option', async () => {
    await renderScreen();
    expect(screen.getByTestId('appearance-system').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('appearance-dark').props.accessibilityState.selected).toBe(false);
  });

  it('changes the choice when tapped', async () => {
    await renderScreen();
    await userEvent.press(screen.getByTestId('appearance-dark'));
    expect(screen.getByTestId('appearance-dark').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('appearance-system').props.accessibilityState.selected).toBe(false);
  });
});
