import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider, useTheme } from '@/theme/theme-context';

function Probe() {
  const { appearance, isDark, setAppearance } = useTheme();
  return (
    <>
      <Text testID="appearance">{appearance}</Text>
      <Text testID="isDark">{String(isDark)}</Text>
      <Text testID="set-dark" onPress={() => setAppearance('dark')}>
        dark
      </Text>
      <Text testID="set-light" onPress={() => setAppearance('light')}>
        light
      </Text>
    </>
  );
}

async function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
}

describe('ThemeProvider', () => {
  it('starts on the system appearance', async () => {
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('appearance')).toHaveTextContent('system'));
  });

  it('applies an appearance change immediately', async () => {
    await renderProbe();
    await userEvent.press(screen.getByTestId('set-dark'));
    await waitFor(() => expect(screen.getByTestId('appearance')).toHaveTextContent('dark'));
    expect(screen.getByTestId('isDark')).toHaveTextContent('true');
  });

  it('remembers the choice', async () => {
    await renderProbe();
    await userEvent.press(screen.getByTestId('set-light'));
    await waitFor(() => expect(screen.getByTestId('appearance')).toHaveTextContent('light'));
    expect(screen.getByTestId('isDark')).toHaveTextContent('false');
  });
});
