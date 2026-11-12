import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import type { ExpenseOut } from "@/lib/types";
import { GroupedList, GroupedRow, Screen } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles, space } from "@/ui/theme";

const CATEGORIES = ["operations", "maintenance", "utilities", "supplies", "other"];
const METHODS = ["cash", "card", "upi", "netbanking", "credit", "wallet"];

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ExpenseAddScreen() {
  const { me } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const router = useRouter();
  const qc = useQueryClient();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState(METHODS[0]);

  const amountValid = parseFloat(amount || "0") > 0;

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ExpenseOut>("/expenses", {
        method: "POST",
        body: JSON.stringify({
          category,
          description: description || null,
          amount_minor: Math.round(parseFloat(amount || "0") * 100),
          method,
          branch_id: me?.branches?.[0]?.id ?? null,
          paid_at: new Date().toISOString(),
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      router.back();
    },
    onError: (error: any) => {
      Alert.alert("Could not save", error?.detail?.error ?? error?.message ?? "Request failed");
    },
  });

  const canSave = amountValid && !create.isPending;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Add Expense",
          headerRight: () => (
            <Text
              onPress={() => {
                if (canSave) create.mutate();
              }}
              style={[t.title, styles.save, { color: palette.accent, fontWeight: "600" as const }, !canSave && { color: palette.tertiary }]}
              accessibilityRole="button"
            >
              Save
            </Text>
          ),
        }}
      />
      <Screen title="Add Expense">
        <GroupedList header="CATEGORY">
          {CATEGORIES.map((c, i) => (
            <GroupedRow
              key={c}
              title={titleCase(c)}
              trailing={
                category === c ? <Ionicons name="checkmark" size={20} color={palette.accent} /> : undefined
              }
              onPress={() => setCategory(c)}
              last={i === CATEGORIES.length - 1}
            />
          ))}
        </GroupedList>
        <GroupedList header="AMOUNT">
          <TextInput
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholderTextColor={palette.tertiary}
            style={[t.body, styles.input, { color: palette.label }]}
            accessibilityLabel="Amount"
          />
        </GroupedList>
        <GroupedList header="METHOD">
          {METHODS.map((m, i) => (
            <GroupedRow
              key={m}
              title={titleCase(m)}
              trailing={
                method === m ? <Ionicons name="checkmark" size={20} color={palette.accent} /> : undefined
              }
              onPress={() => setMethod(m)}
              last={i === METHODS.length - 1}
            />
          ))}
        </GroupedList>
        <GroupedList header="DESCRIPTION">
          <TextInput
            placeholder="Optional"
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={palette.tertiary}
            style={[t.body, styles.input, { color: palette.label }]}
            accessibilityLabel="Description"
          />
        </GroupedList>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  save: {},
  input: {
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
});