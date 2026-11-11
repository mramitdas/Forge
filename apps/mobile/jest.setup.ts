import { jest } from "@jest/globals";

// React 19 requires this flag before state updates outside act() are allowed.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Native modules have no implementation in the jest environment; stub the
// ones the app touches so imports resolve.
jest.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "http://localhost:8000" } } },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
