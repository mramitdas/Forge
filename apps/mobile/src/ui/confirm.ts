import { ActionSheetIOS, Alert, Platform } from "react-native";

export function confirmAction(opts: {
  title: string;
  message?: string;
  confirm: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirm, destructive } = opts;

  // react-native-web stubs Alert.alert to a no-op, so Pay Cash and Log Out
  // silently resolve to "no" on the web preview. The browser dialog is the
  // only thing that actually blocks for a user answer here.
  if (Platform.OS === "web") {
    const text = [title, message].filter(Boolean).join("\n\n");
    return Promise.resolve(window.confirm(text));
  }

  if (Platform.OS === "ios") {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: ["Cancel", confirm],
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructive ? 1 : undefined,
        },
        (index) => resolve(index === 1),
      );
    });
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      {
        text: confirm,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}