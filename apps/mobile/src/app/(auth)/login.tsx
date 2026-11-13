import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { FIXTURE_PASSWORD } from '@/fixtures/session';

export default function LoginRoute() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('owner@gym-erp.dev');
  const [password, setPassword] = useState(FIXTURE_PASSWORD);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Login</Text>
      <Text style={styles.note}>Placeholder — the real login screen lands in its own issue.</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        placeholder="Email"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={styles.button}
        onPress={async () => {
          const result = await signIn(email, password);
          if (result.ok) router.replace('/(tabs)/home');
          else setError(result.error);
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
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#464650',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: { fontSize: 13, color: '#FF7A70' },
  button: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  buttonLabel: { fontSize: 14, fontWeight: '600' },
});
