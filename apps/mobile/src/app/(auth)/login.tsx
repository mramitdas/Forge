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
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space } from "@/ui/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { me, login } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);

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
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      <View style={styles.header}>
        <Text style={[t.largeTitle, styles.title]}>Forge</Text>
        <Text style={[t.footnote, styles.subtitle]}>Sign in to your gym</Text>
      </View>

      <GroupedList>
        <View style={[styles.field, { borderBottomColor: palette.separator }]}>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholderTextColor={palette.tertiary}
            style={[t.body, styles.input, { color: palette.label }]}
            accessibilityLabel="Email"
          />
        </View>
        <View style={[styles.field, styles.fieldLast, { borderBottomWidth: 0 }]}>
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor={palette.tertiary}
            style={[t.body, styles.input, { color: palette.label }]}
            accessibilityLabel="Password"
          />
        </View>
      </GroupedList>

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        style={[styles.button, { backgroundColor: palette.accent }, loading && styles.buttonDisabled]}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color={palette.onAccent} />
        ) : (
          <Text style={[styles.buttonText, { color: palette.onAccent }]}>Sign In</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 120,
  },
  header: {
    paddingHorizontal: space.lg,
    marginBottom: space.xxl,
  },
  title: {},
  subtitle: { marginTop: space.xs },
  field: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLast: { borderBottomWidth: 0 },
  input: { paddingVertical: 10 },
  button: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    height: 50,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: "600", fontSize: 17 },
});