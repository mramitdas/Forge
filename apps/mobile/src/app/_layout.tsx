import { Stack, usePathname } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-context';
import { QueryProvider } from '@/query/provider';
import { useAppFonts } from '@/theme/fonts';
import { stackScreenOptions } from '@/theme/stack-options';
import { ThemeProvider } from '@/theme/theme-context';
import { palette } from '@/theme/tokens';
import { TabBar } from '@/ui/TabBar';

export default function RootLayout() {
  const { loaded } = useAppFonts();
  const pathname = usePathname();

  if (!loaded) return null;

  const signedIn = pathname !== '/login';

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <View style={{ flex: 1, backgroundColor: palette.surface }}>
              <Stack screenOptions={stackScreenOptions}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="notifications" />
              </Stack>
              {signedIn ? <TabBar /> : null}
            </View>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
