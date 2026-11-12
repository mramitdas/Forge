import { jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { AuthProvider, useAuth } from "@/auth/auth-context";

const mockStore = new Map<string, string>();

// jsdom polyfills fetch; keep the original so the swap in test 2 is undone
const originalFetch = global.fetch;

jest.mock("@/lib/storage", () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  // test 2 swaps global.fetch; restoring keeps suite order-independent
  global.fetch = originalFetch;
});

function Probe() {
  const { me, loading } = useAuth();
  return (
    <View>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="name">{me?.user?.full_name ?? "none"}</Text>
    </View>
  );
}

describe("AuthProvider", () => {
  it("resolves to unauthenticated when there is no stored token", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").props.children).toBe("false"));
    expect(screen.getByTestId("name").props.children).toBe("none");
  });

  it("loads the profile when a token is present", async () => {
    mockStore.set("gym_access_token", "token-1");
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: "u1",
          email: "a@b.c",
          full_name: "Demo Owner",
          first_name: "Demo",
          permissions: [],
        },
        tenant_id: "t1",
        tenant_name: "Demo Fitness",
        role_name: "Gym Owner",
        is_platform: false,
        permissions: [],
        branches: [{ id: "b1", name: "Main Branch", timezone: "UTC" }],
        must_change: false,
      }),
    })) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("name").props.children).toBe("Demo Owner"));
  });
});
