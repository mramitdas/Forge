import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { me, login } = useAuth();
  const router = useRouter();

  if (me) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login(email, password);
    } catch (error: any) {
      if (error.status === 401) {
        Alert.alert("Login Failed", "Invalid email or password. Please try again.");
      } else {
        Alert.alert("Error", error.detail?.error ?? error.message ?? "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Forge</Text>
        <Text style={styles.subtitle}>Sign in to your gym</Text>
      </View>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholderTextColor="#9ca3af"
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor="#9ca3af"
        style={styles.input}
      />

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        style={[styles.button, loading && styles.buttonDisabled]}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, justifyContent: "center" },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 15, color: "#6b7280", marginTop: 4 },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#fff",
  },
  button: {
    width: "100%",
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});