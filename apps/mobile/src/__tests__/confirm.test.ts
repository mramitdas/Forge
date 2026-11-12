import { jest } from "@jest/globals";
import { Alert, Platform } from "react-native";
import { confirmAction } from "@/ui/confirm";

function setPlatformOS(os: string) {
  Object.defineProperty(Platform, "OS", {
    value: os,
    configurable: true,
    writable: true,
  });
}

function setWindowConfirm(value: boolean) {
  Object.defineProperty(window, "confirm", {
    value: jest.fn(() => value),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setPlatformOS("ios");
  setWindowConfirm(true);
});

describe("confirmAction", () => {
  it("resolves to the browser answer on web (G8 defect D1)", async () => {
    setPlatformOS("web");
    setWindowConfirm(true);
    await expect(
      confirmAction({ title: "Record cash payment?", confirm: "Pay" }),
    ).resolves.toBe(true);
    expect((window.confirm as jest.Mock).mock.calls[0][0]).toBe("Record cash payment?");
  });

  it("returns false when the browser dialog is dismissed on web", async () => {
    setPlatformOS("web");
    setWindowConfirm(false);
    await expect(
      confirmAction({ title: "Sign out?", confirm: "Log Out" }),
    ).resolves.toBe(false);
  });

  it("never calls Alert.alert on web (it is a no-op there)", async () => {
    setPlatformOS("web");
    setWindowConfirm(true);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await confirmAction({ title: "x", confirm: "y" });
    expect((window.confirm as jest.Mock)).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});