import { jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as RN from "react-native";
import { Text } from "react-native";
import { ThemeProvider, useTheme } from "@/theme/theme-context";

const mockStore = new Map<string, string>();

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

function Probe({ id }: { id: string }) {
  const { mode, scheme, palette, accent, setTheme, setHomeTier } = useTheme();
  return (
    <>
      <Text testID={id}>
        {JSON.stringify({ mode, scheme, accent: palette.accent, tier: accent })}
      </Text>
      <Text
        testID={`setter-${id}`}
        onPress={() => {
          setTheme("light");
          setHomeTier("watch");
        }}
      >
        set
      </Text>
    </>
  );
}

async function renderProbe(id: string) {
  render(
    <ThemeProvider>
      <Probe id={id} />
    </ThemeProvider>,
  );
  // storage load effect resolves asynchronously; the long timeout tolerates
  // slow act flushes on a loaded machine (cold transform, parallel workers)
  await waitFor(() => expect(screen.getByTestId(id)).toBeTruthy(), {
    timeout: 5000,
  });
}

function state(id: string): {
  mode: string;
  scheme: string;
  accent: string;
  tier: string | null;
} {
  return JSON.parse(screen.getByTestId(id).props.children);
}

describe("ThemeProvider", () => {
  it("defaults to dark on first run (key absent) — normative G1", async () => {
    await renderProbe("first-run");
    expect(state("first-run")).toMatchObject({
      mode: "dark",
      scheme: "dark",
      accent: "#30D158",
      tier: null,
    });
  });

  it("resolves the light palette when mode is light", async () => {
    mockStore.set("forge.theme", "light");
    await renderProbe("light-run");
    expect(state("light-run")).toMatchObject({
      mode: "light",
      scheme: "light",
      accent: "#1E6B31",
    });
  });

  it("system mode follows the system color scheme", async () => {
    mockStore.set("forge.theme", "system");
    const spy = jest.spyOn(RN, "useColorScheme");
    try {
      spy.mockReturnValue("light");
      await renderProbe("system-light");
      expect(state("system-light").scheme).toBe("light");

      spy.mockReturnValue("dark");
      await renderProbe("system-dark");
      expect(state("system-dark").scheme).toBe("dark");
    } finally {
      // a failure here must not leak the mock into other tests
      spy.mockRestore();
    }
  });

  it("setTheme persists to forge.theme immediately; setHomeTier propagates", async () => {
    await renderProbe("persist");
    fireEvent.press(screen.getByTestId("setter-persist"));
    expect(mockStore.get("forge.theme")).toBe("light");
    await waitFor(
      () => expect(state("persist")).toMatchObject({ mode: "light", tier: "watch" }),
      { timeout: 5000 },
    );
  });
});
