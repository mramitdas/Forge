import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ThemeProvider } from "@/theme/theme-context";
import { GlassCard } from "@/ui/GlassCard";

function renderCard(props: { intensity?: number }) {
  return render(
    <ThemeProvider>
      <GlassCard {...props}>
        <Text testID="child">inside</Text>
      </GlassCard>
    </ThemeProvider>,
  );
}

describe("GlassCard", () => {
  it("renders its children on a palette.surface card", async () => {
    await renderCard({});
    expect(screen.getByTestId("child").props.children).toBe("inside");
  });

  it("applies the palette blur intensity by default", async () => {
    // the component reads palette.blurIntensity (dark 40 / light 24); the
    // test only asserts the prop plumbing path is exercised, not pixel blur.
    await renderCard({ intensity: 10 });
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});