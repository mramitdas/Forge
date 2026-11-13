import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function writeItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
