import { ActionSheetIOS, Alert, Platform } from "react-native";

export function confirmAction(opts: {
  title: string;
  message?: string;
  confirm: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirm, destructive } = opts;
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
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
      return;
    }
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
