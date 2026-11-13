import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';

export default function LoginRoute() {
  const { signIn } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Login</Text>
      <Text style={styles.note}>Placeholder — the real login screen lands in its own issue.</Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          signIn({ email: 'dev@example.com', name: 'Dev User', role: 'gym_owner' });
          router.replace('/(tabs)/home');
        }}
      >
        <Text style={styles.buttonLabel}>Sign in (fixture)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  note: { fontSize: 13, opacity: 0.7, textAlign: 'center' },
  button: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  buttonLabel: { fontSize: 14, fontWeight: '600' },
});
