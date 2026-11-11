import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { GroupedList } from "@/ui/GroupedList";
import { colors, radius, space, type } from "@/ui/tokens";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { me, login } = useAuth();

  if (me) {
    return <Redirect href="/(tabs)/home" />;
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

      <GroupedList>
        <View style={styles.field}>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            accessibilityLabel="Email"
          />
        </View>
        <View style={[styles.field, styles.fieldLast]}>
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            accessibilityLabel="Password"
          />
        </View>
      </GroupedList>

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        style={[styles.button, loading && styles.buttonDisabled]}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingTop: 120,
  },
  header: {
    paddingHorizontal: space.lg,
    marginBottom: space.xxl,
  },
  title: { ...type.largeTitle },
  subtitle: { ...type.footnote, marginTop: space.xs },
  field: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  fieldLast: { borderBottomWidth: 0 },
  input: { ...type.body, paddingVertical: 10 },
  button: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    height: 50,
    backgroundColor: colors.tint,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontWeight: "600", fontSize: 17 },
});
