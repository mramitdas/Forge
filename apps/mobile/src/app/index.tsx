import { Redirect } from "expo-router";
import { useAuth } from "@/auth/auth-context";

export default function Index() {
  const { me, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (me) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/(auth)/login" />;
}