import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/auth-context";
import { TAB_ITEMS } from "@/lib/tab-items";
import { colors } from "@/ui/tokens";

export { TAB_ITEMS };

export default function TabLayout() {
  const { me, loading } = useAuth();

  if (loading) return null;
  if (!me) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: { backgroundColor: "rgba(249,249,249,0.94)" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{
          title: "Subscriptions",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "albums" : "albums-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "ellipsis-horizontal-circle" : "ellipsis-horizontal-circle-outline"}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
    </Tabs>
  );
}
