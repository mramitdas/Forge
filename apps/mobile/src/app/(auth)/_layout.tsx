import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/theme/stack-options';

export default function AuthLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
