import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';

export default function Index() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/(auth)/login" />;
  if (session.mustResetPassword) return <Redirect href="/(tabs)/settings/password" />;
  return <Redirect href="/(tabs)/home" />;
}
