import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/theme/stack-options';

export default function WorkspaceLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
